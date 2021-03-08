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

class Server {
    private serverAddr = "0.0.0.0:0"
    private consoleAddr = "0.0.0.0:0"

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
        public owner: string
    )
    {
        //console.log("server with id ", this.id)

        // TODO parse IP and get public
    }
}

class Starter {
    private servers: Server[] = []
    private webserverPort = 5000
    private owner = ""
    private latestVersion = ""

    constructor(private dir: string) {
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
                this.owner
            ))
        }
    }

    async start() {
        // ensure data dis exists
        fs.ensureDirSync(path.join(this.dir, "starter_data"))

        // check if any servers are configured
        if (this.servers.length === 0) {
            warn("No servers configured, exiting")
            Deno.exit(0)
        }

        // fetch latest server version
        this.latestVersion = (await (await fetch("https://servercheck.spycibot.com/stats")).json())["LatestVersion"]

        // only deal with local servers when there are any
        if (this.servers.filter(s => s.serverType === "local").length > 0) {
            await this.updateSteam()
        }
    }

    // download and run steamcmd to download server files
    async updateSteam() {
        // check steam dir
        const steamDir = path.join(this.dir, "starter_data", "steamcmd")
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
