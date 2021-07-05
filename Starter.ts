import { path, fs, io, Colors } from "./deps.ts"

import { Server } from "./Server.ts";
import { PlayfabManager } from "./playfab.ts";
import { parseConfig } from "./config.ts"
import { defaultConfig } from "./defaultConfig.ts"
import { WebServer } from "./web.ts";
import { PlayerCache } from "./PlayerCache.ts";

import { setLogDir, info, warn, critical } from "./logging.ts"


export class Starter {
    public version = "1.0.2"

    public servers: Server[] = []
    public playfab = new PlayfabManager()
    public playerCache = new PlayerCache(this)

    public webserverPort = 5000
    private webserver = new WebServer(this)

    public owner = ""
    public latestVersion = ""
    public publicIP = ""

    private loop = 0
    private lastPublucDataFetch = 0

    public onlineSince = Date.now()
    public rconErrorRestart = false

    constructor(public dir: string) {
        // ensure data and servers dir exists
        fs.ensureDirSync(path.join(this.dir, "starterData", "servers"))

        // set log path
        setLogDir(path.join(this.dir, "starterData", "logs"))

        console.log("")
        info(`astro-starter v${this.version}`)
        info("work dir: " + dir)

        this.readConfig()

        this.webserver = new WebServer(this)
        this.playerCache = new PlayerCache(this)
    }

    readConfig() {
        const configPath = path.join(this.dir, "starter.json")

        // create default config
        if (!fs.existsSync(configPath)) {
            info("No config file found, creating new one")

            // create start.bat
            if (Deno.build.os === "windows")
                Deno.writeTextFileSync(path.join(this.dir, "start.bat"), '"./astro-starter.exe"\npause')

            // create config file
            Deno.writeTextFileSync(configPath, JSON.stringify(defaultConfig, null, "    "))

            info(Colors.brightBlue("Please edit starter.json"))
            Deno.exit(0)
        }

        parseConfig(configPath, this)
    }

    async start() {
        // ensure data and servers dir exists
        fs.ensureDirSync(path.join(this.dir, "starterData", "servers"))

        // check if any servers are configured
        if (this.servers.length === 0) {
            warn("No servers configured, exiting")
            Deno.exit(0)
        }

        // fetch data
        await this.fetchPublicData()

        // init player cache
        await this.playerCache.readFile()

        // only deal with local servers when there are any
        if (this.servers.filter(s => s.serverType === "local").length > 0) {
            await this.updateSteam()
        }

        // init servers (only called once)
        for (const server of this.servers) {
            await server.init()
        }

        // start webserver (run async)
        this.webserver.listen()

        // start servers
        for (const server of this.servers) {
            server.start()
        }
        info("Server processes starting...")

        // main loop that regualarly checks data
        this.loop = setInterval(async () => {
            // query playfab
            await this.playfab.update()

            for (const server of this.servers) {
                server.update()
            }
        }, 4000)

        // disable silent after 1 min

        setTimeout(() => {
            if (fs.existsSync("./silent")) {
                Deno.removeSync("./silent")
            }
        }, 60000)



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

        // download/install steamcmd
        if (Deno.build.os === "windows") {
            // windows: download and unzip

            // check if steamcmd is already downlaoded, if not downlaod
            if (!fs.existsSync(path.join(steamDir, "steamcmd.exe"))) {
                info("Downlaoding steamcmd...")

                // download steamcmd.zip
                const blob = await (await fetch("https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip")).blob();
                const file = await Deno.create(path.join(steamDir, "steamcmd.zip"));
                await io.writeAll(file, new Uint8Array(await blob.arrayBuffer()));
                Deno.close(file.rid);

                // unzip file
                const unzipCommandProcess = Deno.run({
                    cmd: [
                        "PowerShell",
                        "Expand-Archive",
                        "-Path",
                        path.join(steamDir, "steamcmd.zip"),
                        "-DestinationPath",
                        steamDir,
                    ],
                    stdout: "piped",
                    stderr: "piped",
                });
                await unzipCommandProcess.status()
            }
        } else {
            // linux: just check if installed
            try {
                const p = Deno.run({
                    cmd: ["steamcmd", "+quit"],
                    stdout: "null",
                    stderr: "null",
                })
                await p.status()
            } catch (_) {
                critical("Steamcmd is not installed! Install it with 'sudo apt install steamcmd -y'")
                Deno.exit(1)
            }
        }

        // check if server is already updated
        const versionPath = path.join(this.dir, "starterData", "serverfiles", "build.version")
        if (fs.existsSync(versionPath)) {
            const version = (await Deno.readTextFile(versionPath)).split(" ")[0]
            if (version === this.latestVersion) return
        }

        info("Downlaoding server files from steam...")
        info(Colors.brightBlue("This will take a few minutes"))
        // run steamcmd
        const p = Deno.run({
            cmd: [
                Deno.build.os === "windows" ? path.join(steamDir, "steamcmd.exe") : "steamcmd",
                "+login anonymous",
                "+@sSteamCmdForcePlatformType windows",
                "+force_install_dir " + path.join(this.dir, "starterData", "serverfiles"),
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

        // cleanup steam stuff
        try {
            await Deno.remove(path.join(this.dir, "starterData", "serverfiles", "steamapps"), { recursive: true });
        } catch (e) {
            warn("Failed to cleanup steam, continouing...")
            console.error(e)
        }
    }

    async fetchPublicData() {
        // check if last fetch happend in last minute
        if (Date.now() - this.lastPublucDataFetch < 60000) return
        this.lastPublucDataFetch = Date.now()

        info("Fetching public data...")

        // fetch latest server version
        this.latestVersion = (await (await fetch("https://servercheck.spycibot.com/stats")).json())["LatestVersion"]
        info("Latest server version: " + this.latestVersion)

        // fetch Public IP
        this.publicIP = (await (await fetch("https://ip4.seeip.org/")).text())
        info("Public IP: " + this.publicIP)
    }

    shutdown(silent = false) {
        info("Shutting down servers and starter")

        if (silent) {
            Deno.writeFileSync("./silent", new Uint8Array([]))
        }

        this.servers.forEach(s => {
            if (s.serverType === "local") s.stop()
        })
        setTimeout(() => {
            clearInterval(this.loop)
            console.log("Bye! Thanks for using astro-starter")
            Deno.exit(0)
        }, 20000)
    }
}
