import { path, fs, Colors } from "./deps.ts"

class Server {
    constructor(
        public id: string,
        public serverType: string,
        public name: string)
    {
        console.log("server with id ", this.id)
    }
}

class Starter {
    private servers: Server[] = []

    constructor(private dir: string) {
        console.log("astro-starter, work dir: ", dir)

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

        const config = Deno.readTextFileSync(configPath)
        console.log(Colors.red(config))
    }

    start() {
        console.log("start")
        console.log("servers: ", this.servers)

    }
}

const starter = new Starter(Deno.cwd())
starter.start()
