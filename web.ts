import { oak, path, fs } from "./deps.ts"

import { Starter } from "./Starter.ts"

import { info, error } from "./logging.ts"


function notFound(ctx: oak.Context) {
  ctx.response.status = oak.Status.NotFound
  ctx.response.body =
    `<html><body><h1>404 - Not Found</h1><p>Path <code>${ctx.request.url}</code> not found.`
}

class WebServer {
    private router = new oak.Router()
    private app = new oak.Application()
    private staticPath = ""
    
    constructor(private starter: Starter) {
        this.staticPath = path.join(this.starter.dir, "starterData", "static")

        // ROUTER

        // home
        this.router.get("/", async ctx => {
            ctx.response.body = await Deno.readFile(path.join(this.staticPath, "index.html"))
        })
        this.router.get("/script.js", async ctx => {
            ctx.response.body = await Deno.readFile(path.join(this.staticPath, "script.js"))
        })

        // server data
        this.router.get("/api/servers", ctx => {
            ctx.response.body = {
                latestVersion: this.starter.latestVersion,
                servers: this.starter.servers.map(s => ({
                    id: s.id,
                    name: s.name,
                    serverAddr: s.serverAddr,
                    serverType: s.serverType,
                    owner: s.owner,
                    status: s.status,
                    stats: s.rcon.stats,
                    rconConnected: s.rcon.isConnected,
                    players: s.players.list(),
                    playfabData: s.playfabData
                }))
            }
            ctx.response.type = "json"
        })

        // TODO auth
        this.router.post<{ id: string, action: string }>("/api/servers/:id/:action", async ctx => {
            ctx.response.type = "json"

            const err = () => {
                ctx.response.body = { status: "NOT FOUND" }
                ctx.response.status = oak.Status.NotFound
            }

            // Server actions
            if (ctx.params?.id && ctx.params?.action) {
                const server = this.starter.servers.find(s => s.id === ctx.params.id)
                if (server) {
                    const act = ctx.params.action
                    if (act === "start") {
                        server.start()
                    } else if (act === "stop") {
                        server.stop()
                    } else if (act === "restart") {
                        server.restart()
                    } else if (act === "rcon") {
                        const body = (await ctx.request.body())
                        const { command } = (await body.value)
                        server.rcon.run(command)
                    } else if (act === "setcategory") {
                        const body = (await ctx.request.body())
                        const { guid, category } = (await body.value)
                        server.rcon.setPlayerCategory(guid, category)
                    } else if (act === "kick") {
                        const body = (await ctx.request.body())
                        const { guid } = (await body.value)
                        server.rcon.kickPlayer(guid)
                    } else {
                        err()
                    }

                    ctx.response.body = { status: "OK" }
                        
                    // TODO player management, save management
                } else {
                    err()
                }
            } else {
                err()
            }
        });

        // shutdown everything
        this.router.post("/api/shutdown", ctx => {
            this.starter.shutdown()
            ctx.response.body = { status: "OK" }
            ctx.response.type = "json"
        })


        // APP

        /*
        // Logger
        this.app.use(async (ctx, next) => {
            await next()
            const rt = ctx.response.headers.get("X-Response-Time")
            console.log(
                `${Colors.green(ctx.request.method)} ${
                    Colors.cyan(decodeURIComponent(ctx.request.url.pathname))
                } - ${Colors.bold(String(rt))}`,
            );
        });

        // Response Time
        this.app.use(async (ctx, next) => {
            const start = Date.now()
            await next()
            const ms = Date.now() - start
            ctx.response.headers.set("X-Response-Time", `${ms}ms`)
        });*/

        // Error handler
        this.app.use(async (ctx, next) => {
        try {
            await next()
        } catch (err) {
            if (oak.isHttpError(err)) {
                ctx.response.status = err.status
                const { message, status, stack } = err
                if (ctx.request.accepts("json")) {
                    ctx.response.body = { message, status, stack }
                    ctx.response.type = "json"
                } else {
                    ctx.response.body = `${status} ${message}\n\n${stack ?? ""}`
                    ctx.response.type = "text/plain"
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
            //{ path: path.join(Deno.cwd(), "static", "script.js"), name: "script.js" },
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