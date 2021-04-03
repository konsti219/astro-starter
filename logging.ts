import { Colors, fs, path } from "./deps.ts"

let logDir = Deno.cwd()
export function setLogDir(dir: string): void {
    logDir = dir
    fs.ensureDirSync(logDir)

    // add an empty line at each start for seperation
    const now = new Date
    Deno.writeTextFileSync(path.join(logDir, logFileName(now)), "\n", { append: true })
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

    Deno.writeTextFileSync(path.join(logDir, logFileName(now)),
        `[${year(now)}-${month(now)}-${date(now)} ${hour(now)}:${minute(now)}:${second(now)}]${msg}\n`
        , { append: true })
}

function year(now: Date) {
    return now.getFullYear()
}
function month(now: Date) {
    return zeroPad(now.getMonth() + 1)
}
function date(now: Date) {
    return zeroPad(now.getDate())
}
function hour(now: Date) {
    return zeroPad(now.getHours())
}
function minute(now: Date) {
    return zeroPad(now.getMinutes())
}
function second(now: Date) {
    return zeroPad(now.getSeconds())
}

function zeroPad(num: number) {
    if (num.toString().length === 1) {
        return "0" + num
    } else {
        return num.toString()
    }
}

function logFileName(now: Date) {
    return `log_${year(now)}-${month(now)}-${date(now)}.txt`
}
