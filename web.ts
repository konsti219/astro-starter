import { oak } from "./deps.ts"

import { Starter } from "./Starter.ts"

import { info, error } from "./logging.ts"

// not found 404
function notFound(ctx: oak.Context) {
  ctx.response.status = oak.Status.NotFound
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
    private router = new oak.Router()
    private app = new oak.Application()
    
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
                        const body = (await ctx.request.body({ type: "json" }))
                        const { guid, category } = (await body.value)
                        server.rcon.setPlayerCategory(guid, category)
                    } else if (act === "kick") {
                        const body = (await ctx.request.body({ type: "json" }))
                        const { guid } = (await body.value)
                        server.rcon.kickPlayer(guid)
                    } else if (act === "gamesave") {
                        server.rcon.saveGame()
                    } else if (act === "gameload") {
                        const body = (await ctx.request.body({ type: "json" }))
                        const { name } = (await body.value)
                        server.rcon.loadGame(name)
                    } else if (act === "gamenew") {
                        const body = (await ctx.request.body({ type: "json" }))
                        const { name } = (await body.value)
                        server.rcon.newGame(name)
                    } else {
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


        // APP

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

        this.app.addEventListener("listen", ({ port }) => {
            info(`Webserver listening on localhost:${port}`)
        });
    }

    async listen() {
        // listen
        await this.app.listen({ port: this.starter.webserverPort })
    }
}
