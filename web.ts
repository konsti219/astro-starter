import { oak, Colors, path } from "./deps.ts"

import { Starter } from "./Starter.ts"

import { info, warn, error } from "./logging.ts"
import { indexContent } from "./static/index.ts";


function notFound(context: oak.Context) {
  context.response.status = oak.Status.NotFound
  context.response.body =
    `<html><body><h1>404 - Not Found</h1><p>Path <code>${context.request.url}</code> not found.`
}

class WebServer {
    private router = new oak.Router()
    private app = new oak.Application()
    
    constructor(private starter: Starter) {

        // ROUTER

        // home
        this.router.get("/", context => {
            context.response.body = indexContent
        })
        this.router.get<{ id: string }>("/book/:id", context => {
            if (context.params) { //&& books.has(context.params.id)) {
                context.response.body = "book " + context.params.id
            } else {
                return notFound(context)
            }
        });

        this.router.get("/api/servers", context => {
            context.response.body = {
                msg: "Astro Starter <a href='/stop'>Stop servers</a>",
                servers: this.starter.servers.map(s => ({
                    id: s.id,
                    name: s.name,
                    status: s.status,
                    stats: s.rcon.stats,
                    players: s.players.list()
                }))
            }
            context.response.type = "json"
        })

        this.router.post("/api/shutdown", context => {
            this.starter.shutdown()
            context.response.body = { status: "OK" }
            context.response.type = "json"
        })


        // APP

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
        });

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
        await this.app.listen({ hostname: "127.0.0.1", port: this.starter.webserverPort })
    }
}


export { WebServer }