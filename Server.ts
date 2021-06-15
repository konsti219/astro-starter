import { path, fs } from "./deps.ts"

import { Starter } from "./Starter.ts";
import { PlayfabServer } from "./playfab.ts";
import { RconManager } from "./rcon.ts";
import { PlayerManager, PlayerCategory } from "./PlayerManager.ts";
import { checkNetwork } from "./network.ts";

import { info, infoWebhook, warn, error } from "./logging.ts"
import { getTimeStamp } from "./timespamp.ts";

interface ConfigAddr {
    configIP: string
    port: number
    consolePort: string
}

enum Command {
    Start = "start",
    Stop = "stop",
    Restart = "restart"
}
enum Status {
    Stopped = "stopped",
    Starting = "starting",
    Running = "running",
    Stopping = "stopping"
}

export class Server {
    public serverAddr = "0.0.0.0:0"
    private consoleAddr = "0.0.0.0:0"
    private addrConfig: ConfigAddr = { configIP: "", port: 0, consolePort: "" }

    public serverDir = ""
    private process?: Deno.Process

    private status_ = Status.Stopped
    private command = Command.Stop
    private running = false
    private updatingFiles = false
    private restartTimeout = 0
    private backupTimeout = 0

    public playfabData: PlayfabServer | undefined
    private lastHeartbeat = 0

    // placeholder managers (so that I don't to deal with them being undefined)
    public rcon = new RconManager("", "", this)
    public players = new PlayerManager(this)


    constructor(
        public id: string,
        public serverType: "local" | "remote" | "playfab",
        public name: string,
        configIP: string,
        port: number,
        consolePort: string,
        public consolePassword: string,
        private serverPassword: string,
        public whitelist: boolean,
        public maxPlayers: number,
        public afkTimeout: number,
        public saveInterval: number,
        public backupSaves: boolean,
        public backupInterval: number,
        public enableAstrochatIntegration: boolean,
        public customHeartbeat: boolean,
        public webhook: string,
        public restartAt: string,
        public makeBackupSaveAt: string,
        public backupIntervalHours: number,
        public restoreSaveName: string,
        public noShutdown: boolean,
        public owner: string,
        public starter: Starter
    ) {
        this.addrConfig = { configIP, port, consolePort }
    }

    // Initializese server config
    async init() {
        // parse addresses from config file (here because we need the public IP)
        const { configIP, port, consolePort } = this.addrConfig

        // get IP
        let IP = "0.0.0.0"
        if (configIP === "_public") {
            IP = this.starter.publicIP
        } else if (/^((25[0-5]|(2[0-4]|1[0-9]|[1-9]|)[0-9])(\.(?!$)|$)){4}$/.test(configIP)) {
            IP = configIP
        } else {
            // assume it's a URL
            IP = (await Deno.resolveDns(configIP, "A"))[0] ?? "0.0.0.0"
        }

        this.serverAddr = IP + ":" + port

        this.consoleAddr = (this.serverType === "local" ? "127.0.0.1" : IP) + ":"
            + (consolePort === "_auto" ? port + 1 : consolePort)
        if (this.serverType === "playfab") this.consoleAddr = ""

        // configure console password
        this.consolePassword = this.consolePassword === "_random"
            ? Math.random().toString(36).substring(2)
            : this.consolePassword

        // configure server dir
        this.serverDir = path.join(this.starter.dir, "starterData", "servers", this.id)
        fs.ensureDirSync(this.serverDir)

        // add to playfab server queries
        this.starter.playfab.add(this.serverAddr)

        // configure rcon
        if (this.serverType !== "playfab")
            this.rcon = new RconManager(this.consoleAddr, this.consolePassword, this)

        // only allow custom heartbeat for local servers
        if (this.serverType !== "local") this.customHeartbeat = false

        // configure player manager
        this.players = new PlayerManager(this, this.starter)
        await this.players.readFile()
    }

    // Public functions for other parts to interact with the server
    start() {
        this.command = Command.Start
    }
    stop() {
        this.command = Command.Stop
    }
    restart() {
        this.command = Command.Restart
    }
    get status() {
        return this.status_
    }

    // function that is regularly called and manages state
    async update() {
        /*
        Server state system
        - command: the state server is supposed to be in <stop|start|restart>
        - status: the state the server is currently in <stopped|starting|running|stopping>

        */

        // get playfab data
        this.playfabData = this.starter.playfab.get(this.serverAddr)


        // state stuff
        if (this.command === Command.Stop || this.command === Command.Restart) {
            if (this.status_ === Status.Running || this.status_ === Status.Starting) {
                this._stop()

                // write player data 
                if (this.status_ === Status.Running)
                    this.players.update(this.rcon.players.map(p => { p.inGame = false; return p }))

                this.status_ = Status.Stopping
            } else if (this.status_ === Status.Stopping) {
                if (!this.running) {
                    this.status_ = Status.Stopped

                    if (this.command === Command.Restart) this.command = Command.Start
                }
            }

        } else if (this.command === Command.Start) {
            if (this.status_ === Status.Stopped) {
                this._start()
                this.status_ = Status.Starting

            } else if (this.status_ === Status.Starting) {
                if (this.running && this.playfabData) {
                    // server is now running                   
                    info(`finished registering`, this.name)
                    this.status_ = Status.Running

                    // network check
                    if (await checkNetwork(this.serverAddr)) {
                        info("Network OK", this.name)
                    } else {
                        warn(`Could not validate your Network setup for ${this.serverAddr} UDP.\nMake sure to check your Firewall/port forwarding!`)
                    }

                    if (this.consoleAddr !== "") this.rcon.connect()
                }
            } else if (this.status_ === Status.Running) {
                // update rcon when it's running
                if (this.consoleAddr !== "") await this.rcon.update()

                // do player tracking
                this.players.update(this.rcon.players)

                // do custom heartbeat
                if (this.customHeartbeat) await this._heartbeat()

                // check if server has quit
                if (!this.running) {
                    warn("Server process has quit unexpectedly, maybe the server crashed?")
                    this.status_ = Status.Stopped
                    this.rcon.disconnect()
                }
            }

        } else {
            error("command " + this.command)
        }

        // make sure to not connect rcon when server isn't running
        if (this.status_ !== Status.Running) {
            this.rcon.disconnect()
        }
    }

    private async _start() {
        infoWebhook("Starting server ", this.name, this.webhook)
        if (this.status_ !== Status.Stopped) {
            warn("Tried to start server that is not stopped, id: " + this.id)
            return
        }

        // refetch public data
        await this.starter.fetchPublicData()

        // only do some things if the server is locally hosted
        if (this.serverType === "local") {
            fs.ensureDirSync(path.join(this.serverDir, "serverFiles"))

            // TODO: firewall

            // deregister servers
            if (this.playfabData) {
                this.starter.playfab.deregisterServer(this.serverAddr)
                this.playfabData = undefined
            }

            // update
            await this.updateFiles()

            // write config
            await this.writeConfig()

            // start server process
            info("Starting Server process", this.name)
            this.process = Deno.run({
                cmd: [path.join(this.serverDir, "serverFiles", "Astro", "Binaries", "Win64", "AstroServer-Win64-Shipping.exe")],
                stdout: "null",
                stderr: "null",
            });

            // async wait for process to quit
            (async () => {
                const { code } = await this.process?.status() ?? { code: 69 }
                info(`Server process has quit, code: ${code}`, this.name)

                this.running = false
                // deregister servers
                if (this.playfabData) {
                    this.starter.playfab.deregisterServer(this.serverAddr)
                    this.playfabData = undefined
                }
            })()

            // set restart timeout
            if (this.restartAt !== "") {
                const times = this.restartAt.split(":")
                const hour = parseInt(times[0]) ?? 0
                const minute = parseInt(times[1]) ?? 0
                const ms = (new Date(2030, 0, 0, hour, minute).getTime() - Date.now()) % (24 * 3600 * 1000)

                this.restartTimeout = setTimeout(() => {
                    this.restart()
                }, ms)
            }
        }

        this.setBackupTimeout()

        this.running = true
    }

    private _stop() {
        infoWebhook("Stopping server ", this.name, this.webhook)
        if (!this.running) {
            warn("Tried to stop server that is not running, id: " + this.id)
            return
        }

        // save game
        this.rcon.saveGame()

        // gave 8 seconds to save
        setTimeout(() => {
            // clean server shutdown with RCON
            if (!this.noShutdown) this.rcon.shutdown()

            // close rcon after 4s (it's probably fail before that /shrug)
            setTimeout(() => this.rcon.disconnect(), 4000)

            // end server process
            if (this.serverType === "local") {
                // for local server wait for RCON to end process, if it doesn't kill it manually
                setTimeout(() => {
                    if (this.running) this.process?.kill(Deno.Signal.SIGINT)
                }, 4000)
            } else {
                // for remote server just assume that RCON did the job
                this.running = false
            }
        }, 8000)

        // clear restart timeout
        clearTimeout(this.restartTimeout)
    }

    private async updateFiles() {
        if (this.updatingFiles) return
        this.updatingFiles = true

        // check if updated
        const versionPath = path.join(this.serverDir, "serverFiles", "build.version")
        if (fs.existsSync(versionPath)) {
            const version = (await Deno.readTextFile(versionPath)).split(" ")[0]
            if (version === this.starter.latestVersion) return
        }

        info("Updating server", this.name)

        await this.starter.updateSteam()

        // backup SaveGames/Paks
        const savedPath = path.join(this.serverDir, "serverFiles", "Astro", "Saved")
        const hasSaves = fs.existsSync(path.join(savedPath, "SaveGames"))
        const hasPaks = fs.existsSync(path.join(savedPath, "Paks"))

        info(`Making backups of old files, Saves: ${hasSaves}, Paks: ${hasPaks}`)

        try {
            Deno.mkdirSync(path.join(this.serverDir, "temp"))
            if (hasSaves) {
                await fs.copy(path.join(savedPath, "SaveGames"), path.join(this.serverDir, "temp", "SaveGames"))
            }
            if (hasPaks) {
                await fs.copy(path.join(savedPath, "Paks"), path.join(this.serverDir, "temp", "Paks"))
            }

            // remove folder
            if (fs.existsSync(path.join(this.serverDir, "serverFiles"))) {
                await Deno.remove(path.join(this.serverDir, "serverFiles"), { recursive: true });
            }
        } catch (e) {
            error("making backups failes")
            throw e
        }

        // copy fresh files from steam
        info("Copying files...", this.name)
        try {
            await fs.copy(
                path.join(this.starter.dir, "starterData", "serverfiles"),
                path.join(this.serverDir, "serverFiles"))
        } catch (e) {
            error("copying files failed")
            throw e
        }


        // restore SaveGames/Paks
        try {
            if (hasSaves) {
                await fs.copy(path.join(this.serverDir, "temp", "SaveGames"), path.join(savedPath, "SaveGames"))
            }
            if (hasPaks) {
                await fs.copy(path.join(this.serverDir, "temp", "Paks"), path.join(savedPath, "Paks"))
            }
            // remove temp folder
            await Deno.remove(path.join(this.serverDir, "temp"), { recursive: true });
        } catch (e) {
            error("restoring files failed")
            throw e
        }

        this.updatingFiles = false
    }

    private async writeConfig() {
        const configPath = path.join(this.serverDir, "serverFiles", "Astro", "Saved", "Config", "WindowsServer")
        fs.ensureDirSync(configPath)

        const owner = this.players.list().find(p => p.category === PlayerCategory.Owner)

        // AstroServerSettings.ini
        let astroConfig = `
[/Script/Astro.AstroServerSettings]
bLoadAutoSave=True
MaxServerFramerate=60
MaxServerIdleFramerate=3
bWaitForPlayersBeforeShutdown=False
PublicIP=${this.serverAddr.split(":")[0]}
ServerName=${this.id}
MaximumPlayerCount=${this.maxPlayers}
OwnerName=${this.owner}
OwnerGuid=${owner ? owner.guid : ""}
PlayerActivityTimeout=${this.afkTimeout}
ServerPassword=${this.serverPassword}
bDisableServerTravel=False
DenyUnlistedPlayers=${this.whitelist ? "True" : "False"}
VerbosePlayerProperties=True
AutoSaveGameInterval=${this.saveInterval}
BackupSaveGamesInterval=${this.backupInterval}
ServerGuid=
ActiveSaveFileDescriptiveName=SAVE_1
ServerAdvertisedName=${this.id}
ConsolePort=${this.consoleAddr.split(":")[1]}
ConsolePassword=${this.consolePassword}
HeartbeatInterval=${this.customHeartbeat ? "0" : "55"}
`

        // add players
        this.players.list().forEach(p => {
            astroConfig += `PlayerProperties=(PlayerFirstJoinName="${p.firstJoinName}",PlayerCategory=${p.category !== "Owner" ? p.category : "Admin"
                },PlayerGuid="${p.guid}",PlayerRecentJoinName="${p.name}")`
        })

        await Deno.writeTextFile(path.join(configPath, "AstroServerSettings.ini"), astroConfig)

        // Engine.ini
        let engineConfig = `
[URL]
Port=${this.serverAddr.split(":")[1]}
[/Script/OnlineSubsystemUtils.IpNetDriver]
MaxClientRate=1000000
MaxInternetClientRate=1000000
`

        if (this.enableAstrochatIntegration) {
            engineConfig += `
[/Game/ChatMod/ChatManager.ChatManager_C]
WebhookUrl="http://localhost:5001/api/astrochat/${this.id}"
`
        }

        await Deno.writeTextFile(path.join(configPath, "Engine.ini"), engineConfig)
    }

    private async _heartbeat() {
        // only heartbeat when we have registration
        if (!this.playfabData) return

        // only heartbeat every 55 seconds
        if (this.lastHeartbeat + 55000 < Date.now()) {

            // generate name with special data
            this.playfabData.Tags.serverName = `{\"customdata\": {\"ServerName\": \"${this.name}\", \"ServerType\": \"astro-starter v${this.starter.version}\", \"ServerPaks\": []}}`
            await this.starter.playfab.heartbeatServer(this.playfabData)

            this.lastHeartbeat = Date.now()
        }
    }

    private setBackupTimeout() {
        if (this.makeBackupSaveAt !== "") {
            clearTimeout(this.backupTimeout)

            const times = this.makeBackupSaveAt.split(":")
            const hour = parseInt(times[0]) ?? 0
            const minute = parseInt(times[1]) ?? 0
            const ms = (new Date(2030, 0, 0, hour, minute).getTime() - Date.now()) % (this.backupIntervalHours * 3600 * 1000)

            this.backupTimeout = setTimeout(() => {
                const saveName = this.rcon.stats.saveGameName.split("+")[0]
                this.rcon.saveGame(`${saveName}+${getTimeStamp()}`)

                this.setBackupTimeout()
            }, ms)
        }
    }
}
