import { oak, path, fs } from "./deps.ts"

import { Starter } from "./Starter.ts"

import { info, warn, error } from "./logging.ts"


function notFound(context: oak.Context) {
  context.response.status = oak.Status.NotFound
  context.response.body =
    `<html><body><h1>404 - Not Found</h1><p>Path <code>${context.request.url}</code> not found.`
}

class WebServer {
    private router = new oak.Router()
    private app = new oak.Application()
    private staticPath = ""
    
    constructor(private starter: Starter) {
        this.staticPath = path.join(this.starter.dir, "starterData", "static")

        // ROUTER

        // home
        this.router.get("/", async context => {
            context.response.body = await Deno.readFile(path.join(this.staticPath, "index.html"))
        })
        this.router.get("/script.js", async context => {
            context.response.body = await Deno.readFile(path.join(this.staticPath, "script.js"))
        })

        // server data
        this.router.get("/api/servers", context => {
            context.response.body = {
                latestVersion: this.starter.latestVersion,
                servers: this.starter.servers.map(s => ({
                    id: s.id,
                    name: s.name,
                    serverAddr: s.serverAddr,
                    serverType: s.serverType,
                    owner: s.owner,
                    whitelist: s.whitelist,
                    status: s.status,
                    stats: s.rcon.stats,
                    players: s.players.list(),
                    playfabData: s.playfabData
                }))
            }
            context.response.type = "json"
        })

        // TODO stop, start, restart, player management, save management
        this.router.get<{ id: string }>("/book/:id", context => {
            if (context.params) { //&& books.has(context.params.id)) {
                context.response.body = "book " + context.params.id
            } else {
                return notFound(context)
            }
        });

        this.router.post("/api/shutdown", context => {
            this.starter.shutdown()
            context.response.body = { status: "OK" }
            context.response.type = "json"
        })


        // APP

        /*
        // Logger
        this.app.use(async (context, next) => {
            await next()
            const rt = context.response.headers.get("X-Response-Time")
            console.log(
                `${Colors.green(context.request.method)} ${
                    Colors.cyan(decodeURIComponent(context.request.url.pathname))
                } - ${Colors.bold(String(rt))}`,
            );
        });

        // Response Time
        this.app.use(async (context, next) => {
            const start = Date.now()
            await next()
            const ms = Date.now() - start
            context.response.headers.set("X-Response-Time", `${ms}ms`)
        });*/

        // Error handler
        this.app.use(async (context, next) => {
        try {
            await next()
        } catch (err) {
            if (oak.isHttpError(err)) {
                context.response.status = err.status
                const { message, status, stack } = err
                if (context.request.accepts("json")) {
                    context.response.body = { message, status, stack }
                    context.response.type = "json"
                } else {
                    context.response.body = `${status} ${message}\n\n${stack ?? ""}`
                    context.response.type = "text/plain"
                }
            } else {
                error(err)
                throw err
            }
        }
        });

        // Use the router
        this.app.use(this.router.routes())
        this.app.use(this.router.allowedMethods())

        // A basic 404 page
        this.app.use(notFound)

        this.app.addEventListener("listen", ({ hostname, port }) => {
            info(`Webserver listening on ${hostname}:${port}`)
        });
    }

    async listen() {
        fs.ensureDirSync(path.join(this.starter.dir, "starterData", "static"))

        // get static files
        const staticFiles = [
            { path: path.join(Deno.cwd(), "static", "index.html"), name: "index.html" },
            { path: path.join(Deno.cwd(), "static", "script.js"), name: "script.js" },
        ]
        staticFiles.forEach(async f => {
            let data
            if (f.path.startsWith("http")) {
                data = new Uint8Array(await (await fetch(f.path)).arrayBuffer())
            } else {
                data = await Deno.readFile(f.path)
            }
            await Deno.writeFile(path.join(this.starter.dir, "starterData", "static", f.name), data)
        })

        // listen
        await this.app.listen({ hostname: "127.0.0.1", port: this.starter.webserverPort })
    }
}


export { WebServer }