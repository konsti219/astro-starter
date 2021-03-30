import { Colors, fs, path } from "./deps.ts"

let logDir = Deno.cwd()
export function setLogDir(dir: string): void {
    logDir = dir
    fs.ensureDirSync(logDir)
}

export function debug(msg: string): void {
    console.log(Colors.blue("[DEBUG] ") + msg)
    addToLogFile("[DEBUG] " + msg)
}

export function info(msg: string, server?: string): void {
    const prefix = server ? `[INFO - ${server}] ` : `[INFO] `
    console.log(Colors.green(prefix) + msg)
    addToLogFile(prefix + msg)
}
export function infoWebhook(msg: string, server: string, webhook: string): void {
    console.log(Colors.green(`[INFO - ${server}] `) + msg)
    addToLogFile(`[INFO - ${server}] ` + msg)

    if (webhook !== "") {
        try {
            fetch(webhook, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    content: msg,
                    username: `${server} [Astro Starter]`,
                    avatar_url: "https://cdn.glitch.com/21049ce3-c04d-43f4-9653-0d83cc66504c%2Fastroleague_bot.jpg?v=1616962135777",
                    allowed_mentions: { parse: [] }
                })
            })
        } catch(_) {/**/}
    }
}

export function warn(msg: string): void {
    console.warn(Colors.yellow("[WARN] ") + msg)
    addToLogFile("[WARN] " + msg)
}

export function error(msg: string): void {
    console.error(Colors.red("[ERROR] ") + msg)
    addToLogFile("[ERROR] " + msg)
}
export function critical(msg: string): void {
    console.error(Colors.bold(Colors.red("[CRITICAL] ")) + msg)
    addToLogFile("[CRITICAL] " + msg)
}

function addToLogFile(msg: string) {
    const now = new Date
    const logFile = `log_${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}.txt`

    Deno.writeTextFileSync(path.join(logDir, logFile), msg + "\n", { append: true })
}
