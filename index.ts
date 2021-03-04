import { path, fs, unZipFromURL, io } from "./deps.ts"
import { info, warn, error } from "./logging.ts"

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
        public enableAstrochatIntegration: boolean
    )
    {
        //console.log("server with id ", this.id)

        // TODO parse IP and et public
    }
}

class Starter {
    private servers: Server[] = []
    private webserverPort = 5000
    private owner = ""

    constructor(private dir: string) {
        info("astro-starter, work dir: " + dir)

        this.readConfig()
    }

    readConfig() {
        const configPath = path.join(this.dir, "starter.json")

        // create default config
        if (!fs.existsSync(configPath)) {
            // create start.bat
            Deno.writeTextFileSync(path.join(this.dir, "start.bat"), '"./astro-starter.exe"\npause')

            // create config file
            Deno.writeTextFileSync(configPath, JSON.stringify({
                webserverPort: 5000, owner: "", servers: []
            }, null, "  "))

            Deno.exit(0)
        }

        const configJson = Deno.readTextFileSync(configPath)
        let config: ConfigFile = { servers: [] }
        try {
            config = JSON.parse(configJson)
        } catch (e) {
            console.error("parsing config file failed")
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
            ))
        }
    }

    async start() {
        console.log("start")
        // console.log("servers: ", this.servers)

        fs.ensureDirSync(path.join(this.dir, "starter_data"))

        await this.updateSteam()
    }

    async updateSteam() {
        // download and run steamcmd to download server files
        const steamDir = path.join(this.dir, "starter_data", "steamcmd")
        fs.ensureDirSync(steamDir)

        // check if steamcmd is already downlaoded, if not downlaod
        if (!fs.existsSync(path.join(steamDir, "steamcmd.exe"))) {
            info("Downlaoding steamcmd...")
            await unZipFromURL("https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip", steamDir)
        }

        info("Downlaoding server files from steam...")
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
