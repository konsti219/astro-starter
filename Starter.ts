import { path, fs, unZipFromURL, io, Colors, serve } from "./deps.ts"
import { Server } from "./Server.ts";
import { parseConfig } from "./config.ts"
import { info, warn, error } from "./logging.ts"
import { defaultConfig } from "./defaultConfig.ts"


class Starter {
    public servers: Server[] = []
    public webserverPort = 5000
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

        // start webserver (run async)
        const webServer = serve({ hostname: "0.0.0.0", port: this.webserverPort })
        info("Running web server on localhost:" + this.webserverPort);

        (async () => {
            for await (const req of webServer) {
                console.log(req.method, req.url)

                let bodyContent = "Your user-agent is:\n\n"
                bodyContent += req.headers.get("user-agent") || "Unknown"

                req.respond({ status: 200, body: bodyContent })
            }
        })()

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

export { Starter }