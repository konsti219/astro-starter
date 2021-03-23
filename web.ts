import { oak, Colors } from "./deps.ts";

import { Starter } from "./Starter.ts";

import { info, warn, error } from "./logging.ts"


function notFound(context: oak.Context) {
  context.response.status = oak.Status.NotFound;
  context.response.body =
    `<html><body><h1>404 - Not Found</h1><p>Path <code>${context.request.url}</code> not found.`;
}

class WebServer {
    private router = new oak.Router();
    private app = new oak.Application();
    
    constructor(private starter: Starter) {

        // ROUTER

        // home
        this.router.get("/", (context) => {
            context.response.body = "Hello world!";
        })
        this.router.get("/book", (context) => {
            context.response.body = "books"
        })
        this.router.post("/book", (context: oak.RouterContext) => {
            console.log("post book");
            /*
            if (!context.request.hasBody) {
            context.throw(Status.BadRequest, "Bad Request");
            }
            const body = context.request.body();
            let book: Partial<Book> | undefined;
            if (body.type === "json") {
            book = await body.value;
            } else if (body.type === "form") {
            book = {};
            for (const [key, value] of await body.value) {
                book[key as keyof Book] = value;
            }
            } else if (body.type === "form-data") {
            const formData = await body.value.read();
            book = formData.fields;
            }
            if (book) {
            context.assert(book.id && typeof book.id === "string", Status.BadRequest);
            books.set(book.id, book as Book);
            context.response.status = Status.OK;
            context.response.body = book;
            context.response.type = "json";
            return;
            }
            context.throw(Status.BadRequest, "Bad Request");*/
        })
        this.router.get<{ id: string }>("/book/:id", (context) => {
            if (context.params) { //&& books.has(context.params.id)) {
                context.response.body = "book " + context.params.id
            } else {
                return notFound(context);
            }
        });


        // APP

        // Logger
        this.app.use(async (context, next) => {
            await next();
            const rt = context.response.headers.get("X-Response-Time");
            console.log(
                `${Colors.green(context.request.method)} ${
                    Colors.cyan(decodeURIComponent(context.request.url.pathname))
                } - ${Colors.bold(String(rt))}`,
            );
        });

        // Response Time
        this.app.use(async (context, next) => {
            const start = Date.now();
            await next();
            const ms = Date.now() - start;
            context.response.headers.set("X-Response-Time", `${ms}ms`);
        });

        // Error handler
        this.app.use(async (context, next) => {
        try {
            await next();
        } catch (err) {
            if (oak.isHttpError(err)) {
                context.response.status = err.status;
                const { message, status, stack } = err;
                if (context.request.accepts("json")) {
                    context.response.body = { message, status, stack };
                    context.response.type = "json";
                } else {
                    context.response.body = `${status} ${message}\n\n${stack ?? ""}`;
                    context.response.type = "text/plain";
                }
            } else {
                error(err);
                throw err;
            }
        }
        });

        // Use the router
        this.app.use(this.router.routes());
        this.app.use(this.router.allowedMethods());

        // A basic 404 page
        this.app.use(notFound);

        this.app.addEventListener("listen", ({ hostname, port }) => {
            info(`Webserver listening on ${hostname}:${port}`)
        });
    }

    async listen() {
        await this.app.listen({ hostname: "127.0.0.1", port: this.starter.webserverPort });
    }
}


export { WebServer }