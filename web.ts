import { Application, Router, Context, Status, isHttpError } from "./deps.ts"

import { Starter } from "./Starter.ts"

import { info, error } from "./logging.ts"

// not found 404
function notFound(ctx: Context) {
    ctx.response.status = Status.NotFound
    ctx.response.body =
        `<html><body><h1>404 - Not Found</h1><p>Path <code>${ctx.request.url}</code> not found.`
}

// static files
import { indexhtml, scriptjs } from "./static/static.ts";
const staticFiles = [
    { name: "index.html", content: indexhtml },
    { name: "script.js", content: scriptjs }
]

export class WebServer {
    private router = new Router()
    private app = new Application()

    constructor(private starter: Starter) {
        if (!this.starter.dir) return

        // ROUTER
        // home
        this.router.get("/", ctx => {
            ctx.response.body = indexhtml
        })
        // static
        staticFiles.forEach(file => {
            this.router.get(`/${file.name}`, ctx => {
                ctx.response.body = file.content
            })
        })

        // server data
        this.router.get("/api/servers", ctx => {
            ctx.response.body = {
                latestVersion: this.starter.latestVersion,
                onlineSince: this.starter.onlineSince,
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
                    playfabData: s.playfabData,
                    saves: s.rcon.saves
                }))
            }
            ctx.response.type = "json"
        })

        // TODO auth
        this.router.post<{ id: string, action: string }>("/api/servers/:id/:action", async ctx => {
            ctx.response.type = "json"

            const err = () => {
                ctx.response.body = { status: "NOT FOUND" }
                ctx.response.status = Status.NotFound
            }

            // Server actions
            if (ctx.params?.id && ctx.params?.action) {
                const server = this.starter.servers.find(s => s.id === ctx.params.id)
                if (server) {
                    switch (ctx.params.action) {
                        case "start": {
                            server.start()
                            break
                        }
                        case "stop": {
                            server.stop()
                            break
                        }
                        case "restart": {
                            server.restart()
                            break
                        }
                        case "rcon": {
                            const body = (await ctx.request.body())
                            const { command } = (await body.value)
                            server.rcon.run(command)
                            break
                        }
                        case "setcategory": {
                            const body = (await ctx.request.body({ type: "json" }))
                            const { guid, category } = (await body.value)
                            server.rcon.setPlayerCategory(guid, category)
                            break
                        }
                        case "kick": {
                            const body = (await ctx.request.body({ type: "json" }))
                            const { guid } = (await body.value)
                            server.rcon.kickPlayer(guid)
                            break
                        }
                        case "gamesave": {
                            server.rcon.saveGame()
                            break
                        }
                        case "gameload": {
                            const body = (await ctx.request.body({ type: "json" }))
                            const { name } = (await body.value)
                            server.rcon.loadGame(name)
                            break
                        }
                        case "gamenew": {
                            const body = (await ctx.request.body({ type: "json" }))
                            const { name } = (await body.value)
                            server.rcon.newGame(name)
                            break
                        }
                        case "astrochat": {
                            console.log("astrochat webhook")
                            console.log(ctx.params)
                            break
                        }
                        case "analytics": {
                            console.log("analytics webhook")
                            console.log(ctx.params)
                            break
                        }
                        default:
                            err()
                    }

                    ctx.response.body = { status: "OK" }

                    // TODO save management
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
        this.router.post("/api/silentshutdown", ctx => {
            this.starter.shutdown(true)
            ctx.response.body = { status: "OK" }
            ctx.response.type = "json"
        })


        // APP

        // Error handler
        this.app.use(async (ctx, next) => {
            try {
                await next()
            } catch (err) {
                if (isHttpError(err)) {
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

        this.app.addEventListener("listen", ({ port }) => {
            info(`Webserver listening on localhost:${port}`)
        });
    }

    async listen() {
        // listen
        await this.app.listen({ port: this.starter.webserverPort })
    }
}
