import { path, fs } from "./deps.ts"

import { Starter } from "./Starter.ts";
import { PlayfabServer } from "./playfab.ts";
import { RconManager } from "./rcon.ts";

import { info, warn, error } from "./logging.ts"

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

class Server {
    public serverAddr = "0.0.0.0:0"
    private consoleAddr = "0.0.0.0:0"
    private addrConfig: ConfigAddr = { configIP: "", port: 0, consolePort: "" }

    private serverDir = ""
    private process?: Deno.Process

    private status_ = Status.Stopped
    private command = Command.Stop
    private running = false
    private updatingFiles = false

    public playfabData: PlayfabServer | undefined
    private lastHeartbeat = 0

    public rcon = new RconManager("", "")
    

    constructor(
        public id: string,
        public serverType: string,
        public name: string,
        configIP: string,
        port: number,
        consolePort: string,
        public consolePassword: string,
        public whitelist: boolean,
        public saveInterval: number,
        public backupSaves: boolean,
        public backupInterval: number,
        public enableAstrochatIntegration: boolean,
        public customHeartbeat: boolean,
        public owner: string,
        private starter: Starter
    )
    {
        this.addrConfig = { configIP, port, consolePort }
    }

    // Initializese server config
    init() {
        // parse addresses from config file (here because we need the public IP)
        const { configIP, port, consolePort } = this.addrConfig
        const IP = configIP === "_public" ? this.starter.publicIP : configIP
        this.serverAddr = IP + ":" + port
        this.consoleAddr = (this.serverType === "local" ? "127.0.0.1" : IP) + ":"
            + (consolePort === "_auto" ? port + 1 : consolePort)

        this.consolePassword = this.consolePassword === "_random"
            ? Math.random().toString(36).substring(2)
            : this.consolePassword

        // configure server dir
        this.serverDir = path.join(this.starter.dir, "starterData", "servers", this.id)
        fs.ensureDirSync(this.serverDir)

        // add to playfab server queries
        this.starter.playfab.add(this.serverAddr)

        // configure rcon
        this.rcon = new RconManager(this.consoleAddr, this.consolePassword)

        // do not allow custom heartbeat for remote servers
        if (this.serverType === "remote") this.customHeartbeat = false
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

        // TODO: query rcon

        //console.log(this.status_, this.command)

        // state stuff
        if (this.command === Command.Stop) {
            if (this.status_ === Status.Running) {
                this._stop()
                this.status_ = Status.Stopping

            } else if (this.status_ === Status.Stopping) {
                if (!this.running) {
                    this.status_ = Status.Stopped
                }
            }
            
        } else if (this.command === Command.Start) {
            if (this.status_ === Status.Stopped) {
                this._start()
                this.status_ = Status.Starting

            } else if (this.status_ === Status.Starting) {
                if (this.running && this.playfabData) {
                    // server is now running
                    this.rcon.connect()

                    // TODO do network check
                    info(`Server ${this.name} has finished registering`)
                    this.status_ = Status.Running
                }
            } else if (this.status_ === Status.Running) {
                // update rcon when it's running
                await this.rcon.update()
                if (this.customHeartbeat) await this._heartbeat()

                if (!this.running) {
                    warn("Server process has quit unexpectedly, maybe the server crashed?")
                }
            }

        } else {
            error("command " + this.command)
        }
    }

    private async _start() {
        info("Starting server " + this.name)
        if (this.status !== "stopped") {
            warn("Tried to start server that is not stopped, id: " + this.id)
            return
        }

        // only do some things if the server is locally hosted
        if (this.serverType === "local") {
            fs.ensureDirSync(path.join(this.serverDir, "serverFiles"))

            // TODO: check network, firewall

            // deregister servers
            if (this.playfabData) {
                this.starter.playfab.deregisterServer(this.serverAddr)
            }

            // update
            await this._updateFiles()
            
            // write config
            await this._writeConfig()

            // start server process
            info("Starting Server process for " + this.name)
            this.process = Deno.run({
                cmd: [path.join(this.serverDir, "serverFiles", "Astro", "Binaries", "Win64", "AstroServer-Win64-Shipping.exe")],
                stdout: "null",
                stderr: "null",
            });

            (async () => {
                const { code } = await this.process?.status() ?? { code: 69 }
                info(`Server process has quit for ${this.name}, code: ${code}`)
                
                this.running = false
            })()
            
        }
        
        this.running = true

        // TODO: load player data
    }

    private _stop() {
        if (this.status !== "running") {
            warn("Tried to stop server that is not running, id: " + this.id)
            return
        }

        // end server process
        // TODO: clean shutdown with rcon
        if (this.serverType === "local") {
            this.process?.kill(Deno.Signal.SIGINT)

            // deregister servers
            if (this.playfabData) {
                this.starter.playfab.deregisterServer(this.serverAddr)
            }
        }

        this.running = false

        // close rcon
        this.rcon.close()
    }

    private async _updateFiles() {
        if (this.updatingFiles) return
        this.updatingFiles = true

        // check if updated
        const versionPath = path.join(this.serverDir, "serverFiles", "build.version")
        if (fs.existsSync(versionPath)) {
            const version = (await Deno.readTextFile(versionPath)).split(" ")[0]
            if (version === this.starter.latestVersion) return
        }

        info("Updating server " + this.name)

        // backup SaveGames/Paks
        const savedPath = path.join(this.serverDir, "serverFiles","Astro", "Saved")
        const hasSaves = fs.existsSync(path.join(savedPath, "SaveGames"))
        const hasPaks = fs.existsSync(path.join(savedPath, "Paks"))
        
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
        // copy fresh files from steam
        info("Copying files...")
        await fs.copy(
            path.join(this.starter.dir, "starterData", "serverfiles"),
            path.join(this.serverDir, "serverFiles"))
        

        // restore SaveGames/Paks
        if (hasSaves) {
            await fs.copy(path.join(this.serverDir, "temp", "SaveGames"), path.join(savedPath, "SaveGames"))
        }
        if (hasPaks) {
            await fs.copy(path.join(this.serverDir, "temp", "Paks"), path.join(savedPath, "Paks"))
        }
        // remove temp folder
        await Deno.remove(path.join(this.serverDir, "temp"), { recursive: true });

        this.updatingFiles = false
    }

    private async _writeConfig() {
        const configPath = path.join(this.serverDir, "serverFiles", "Astro", "Saved", "Config", "WindowsServer")
        fs.ensureDirSync(configPath)
        
        // AstroServerSettings.ini
        let astroConfig = `
[/Script/Astro.AstroServerSettings]
bLoadAutoSave=True
MaxServerFramerate=60
MaxServerIdleFramerate=3
bWaitForPlayersBeforeShutdown=False
PublicIP=${this.serverAddr.split(":")[0]}
ServerName=${this.name}
MaximumPlayerCount=8
OwnerName=${this.starter.owner}
OwnerGuid=
PlayerActivityTimeout=0
ServerPassword=
bDisableServerTravel=False
DenyUnlistedPlayers=${this.whitelist ? "True" : "False"}
VerbosePlayerProperties=True
AutoSaveGameInterval=${this.saveInterval}
BackupSaveGamesInterval=${this.backupInterval}
ServerGuid=
ActiveSaveFileDescriptiveName=SAVE_1
ServerAdvertisedName=${this.name}
ConsolePort=${this.consoleAddr.split(":")[1]}
ConsolePassword=${this.consolePassword}
HeartbeatInterval=${this.customHeartbeat ? "0" : "55"}
        `
        // TODO: add players
        for (const player of []) {
            astroConfig += `PlayerProperties=(PlayerFirstJoinName="",PlayerCategory=Pending,PlayerGuid="",PlayerRecentJoinName="")`
        }

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
            this.playfabData.Tags.serverName = `{\"customdata\": {\"ServerName\": \"${this.name}\", \"ServerType\": \"astro-starter v0.1.0\", \"ServerPaks\": []}}`
            await this.starter.playfab.heartbeatServer(this.playfabData)

            this.lastHeartbeat = Date.now()
        }
    }
}

export { Server }