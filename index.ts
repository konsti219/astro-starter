import { path, fs, unZipFromURL, io, Colors } from "./deps.ts"
import { info, warn, error } from "./logging.ts"
import { defaultConfig } from "./defaultConfig.ts"

interface ConfigFileServer {
    id?: string
    type?: string
    name?: string
    IP?: string
    port?: number
    consolePort?: string
    consolePassword?: string
    whitelist?: boolean
    saveInterval?: number
    backupSaves?: boolean
    backupInterval?: number
    enableAstrochatIntegration?: boolean
}
interface ConfigFile {
    webserverPort?: number
    owner?: string
    servers: ConfigFileServer[]
}
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

            await this.update()
            // update
            // write config

            // 

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

    writeConfig() {
        // AstroServerSettings.ini
        // Engine.ini
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

class Starter {
    private servers: Server[] = []
    private webserverPort = 5000
    public owner = ""
    public latestVersion = ""
    public publicIP = ""

    constructor(public dir: string) {
        info("astro-starter, work dir: " + dir + "\n")

        this.readConfig()
    }

    readConfig() {
        const configPath = path.join(this.dir, "starter.json")

        // create default config
        if (!fs.existsSync(configPath)) {
            info("No config file found, creating new one")

            // create start.bat
            Deno.writeTextFileSync(path.join(this.dir, "start.bat"), '"./astro-starter.exe"\npause')

            // create config file
            Deno.writeTextFileSync(configPath, JSON.stringify(defaultConfig, null, "    "))

            info(Colors.brightBlue("Please edit starter.json"))
            Deno.exit(0)
        }

        const configJson = Deno.readTextFileSync(configPath)
        let config: ConfigFile = { servers: [] }
        try {
            config = JSON.parse(configJson)
        } catch (e) {
            console.error("Parsing config file failed")
        }

        this.webserverPort = config.webserverPort ?? 5000
        this.owner = config.owner ?? ""

        for (const i in (config.servers)) {
            const s = config.servers[i]

            this.servers.push(new Server(
                s.id ?? `server${i}`,
                s.type ?? "local",
                s.name ?? `My server ${i}`,
                s.IP ?? "_public",
                s.port ?? 8777,
                s.consolePort ?? "_auto",
                s.whitelist ?? false,
                s.saveInterval ?? 900,
                s.backupSaves ?? true,
                s.backupInterval ?? 3600,
                s.enableAstrochatIntegration ?? false,
                this.owner,
                this
            ))
        }
    }

    async start() {
        // ensure data and servers dir exists
        fs.ensureDirSync(path.join(this.dir, "starterData", "servers"))

        // check if any servers are configured
        if (this.servers.length === 0) {
            warn("No servers configured, exiting")
            Deno.exit(0)
        }

        info("Fetching data...")

        // fetch latest server version
        this.latestVersion = (await (await fetch("https://servercheck.spycibot.com/stats")).json())["LatestVersion"]
        info("Latest server version: " + this.latestVersion)

        // fetch Public IP
        this.publicIP = (await (await fetch("https://api.ipify.org/")).text())
        info("Public IP: " + this.publicIP)

        // only deal with local servers when there are any
        if (this.servers.filter(s => s.serverType === "local").length > 0) {
            await this.updateSteam()
        }

        // init servers (only called once)
        for (const server of this.servers) {
            await server.init()
        }

        // start servers
        for (const server of this.servers) {
            await server.start()
        }

        // not implemented on windows
        // wait for SIGINT to shutdown
        /*for await (const _ of Deno.signal(Deno.Signal.SIGINT)) {
            console.log("interrupted!");
            Deno.exit();
        }*/
    }

    // download and run steamcmd to download server files
    async updateSteam() {
        // check steam dir
        const steamDir = path.join(this.dir, "starterData", "steamcmd")
        fs.ensureDirSync(steamDir)

        // check if steamcmd is already downlaoded, if not downlaod
        if (!fs.existsSync(path.join(steamDir, "steamcmd.exe"))) {
            info("Downlaoding steamcmd...")
            await unZipFromURL("https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip", steamDir)
        }

        // check if server is already updated
        const versionPath = path.join(steamDir, "steamapps", "common", "ASTRONEER Dedicated Server", "build.version")
        if (fs.existsSync(versionPath)) {
            const version = (await Deno.readTextFile(versionPath)).split(" ")[0]
            if (version === this.latestVersion) return
        }

        info("Downlaoding server files from steam...")
        info(Colors.brightBlue("This will take a few minutes"))
        // run steamcmd
        const p = Deno.run({
            cmd: [
                path.join(steamDir, "steamcmd.exe"),
                "+login anonymous",
                "+app_update 728470 validate",
                "+quit"
            ],
            stdout: "piped",
            stderr: "piped",
        })

        // log steam output
        for await (const line of io.readLines(p.stdout)) {
            info(line)
        }

        // wait for steam to finish
        const { code } = await p.status()
        info("Steamcmd finished with code: " + code)
    }
}

const starter = new Starter(Deno.cwd())
await starter.start()
