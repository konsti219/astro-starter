import { Router, Status, path } from "./../deps.ts"

import { Starter } from "./../Starter.ts"

import { infoWebhook } from "./../logging.ts"

import { getDateHour } from "../timespamp.ts";

export class ApiRouter {
    public router = new Router()
    public playersCache: { name: string, x: number, y: number, z: number }[] = []

    constructor(private starter: Starter) {

        this.router.get("/", ctx => {
            ctx.response.body = "api beep boop"
        })


        // server data
        this.router.get("/servers", ctx => {
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

        // GET
        this.router.get<{ id: string, action: string }>("/servers/:id/:action", ctx => {
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
                        case "astrochat": {
                            if (ctx.request.url.searchParams.get("evt") === "chat") {
                                infoWebhook(`:speech_balloon: **${ctx.request.url.searchParams.get("name")}**: ${ctx.request.url.searchParams.get("msg")}`,
                                    server.name, server.webhook)
                            }

                            ctx.response.body = { status: "OK" }

                            break
                        }
                        case "analytics": {
                            // parse data coming from analytics mod
                            const playerStr = ctx.request.url.searchParams.get("players")

                            // if param present means it's data coming in, else return cache
                            if (playerStr) {
                                const stripDelimeter = playerStr.substring(0, playerStr.length - 3).substring(2)
                                let players = stripDelimeter.split("],[").map(p => {
                                    const parts = p.replaceAll("\"", "").replace("(", "").replace(")", "").split(",")
                                    return {
                                        name: parts[0],
                                        x: parseFloat(parts[1]), y: parseFloat(parts[2]), z: parseFloat(parts[3])
                                    }
                                })
                                if (playerStr.length === 2) players = []

                                // save to cache
                                this.playersCache = players

                                // if there are players online save their positions in a compact format
                                if (players.length > 0) {
                                    const compactPlayers = players.map(p => `${p.name},${p.x},${p.y},${p.z};`).join("")

                                    Deno.writeTextFileSync(path.join(server.serverDir, "analytics", `log_${getDateHour()}`),
                                        `${Date.now()};${compactPlayers}\n`
                                        , { append: true })
                                }
                            }

                            ctx.response.body = { players: this.playersCache }

                            break
                        }
                        default:
                            err()
                    }



                } else {
                    err()
                }
            } else {
                err()
            }
        });

        // TODO auth
        // POST
        this.router.post<{ id: string, action: string }>("/servers/:id/:action", async ctx => {
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
                        default:
                            err()
                    }

                    ctx.response.body = { status: "OK" }

                } else {
                    err()
                }
            } else {
                err()
            }
        });

        // shutdown everything
        this.router.post("/shutdown", ctx => {
            this.starter.shutdown()
            ctx.response.body = { status: "OK" }
            ctx.response.type = "json"
        })
        this.router.post("/silentshutdown", ctx => {
            this.starter.shutdown(true)
            ctx.response.body = { status: "OK" }
            ctx.response.type = "json"
        })

    }
}
