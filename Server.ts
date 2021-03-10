import { path, fs } from "./deps.ts"
import { Starter } from "./Starter.ts";
import { info, warn, error } from "./logging.ts"

interface ConfigAddr {
    configIP: string
    port: number
    consolePort: string
}

class Server {
    public serverAddr = "0.0.0.0:0"
    private consoleAddr = "0.0.0.0:0"
    private addrConfig: ConfigAddr = { configIP: "", port: 0, consolePort: "" }
    private serverDir = ""
    public running = false

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
        public owner: string,
        private starter: Starter
    )
    {
        this.addrConfig = { configIP, port, consolePort }
    }

    init() {
        // parse addresses from config file
        const { configIP, port, consolePort } = this.addrConfig
        const IP = configIP === "_public" ? this.starter.publicIP : configIP
        this.serverAddr = IP + ":" + port
        this.consoleAddr = IP + ":" + (consolePort === "_auto" ? port + 1 : consolePort)

        this.consolePassword = this.consolePassword === "_random"
            ? Math.random().toString(36).substring(2)
            : this.consolePassword

        // configure server dir
        this.serverDir = path.join(this.starter.dir, "starterData", "servers", this.id)
        fs.ensureDirSync(this.serverDir)
    }

    async start() {
        info("Starting server " + this.name)
        if (this.running) {
            warn("Tried to start server while it's already running, id: " + this.id)
            return
        }

        // only do some thinhs if the server is locally hosted
        if (this.serverType === "local") {
            fs.ensureDirSync(path.join(this.serverDir, "serverFiles"))

            // update
            await this.update()
            
            // write config
            await this.writeConfig()

        }

        // start rcon

        // load player data
    }

    async update() {
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
            path.join(this.starter.dir, "starterData", "steamcmd", "steamapps", "common", "ASTRONEER Dedicated Server"),
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
    }

    async writeConfig() {
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
HeartbeatInterval=55
        `
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
WebhookUrl="http://localhost:5001/api/rodata"
            `
        }

        await Deno.writeTextFile(path.join(configPath, "Engine.ini"), engineConfig)
    }

    stop() {
        if (!this.running) {
            warn("Tried to stop server while it's already running, id: " + this.id)
            return
        }

        // end server process

        // end rcon
    }
}

export { Server }