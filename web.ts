import { Application, Router, Context, Status, isHttpError } from "./deps.ts"

import { ApiRouter } from "./routes/api.ts";

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

        // API ROUTER
        this.router.use("/api", (new ApiRouter(this.starter)).router.routes())


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
