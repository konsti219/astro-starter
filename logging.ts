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

export function info(msg: string): void {
    console.log(Colors.green("[INFO] ") + msg)
    addToLogFile("[INFO] " + msg)
}
export function infoWebhook(msg: string, webhook: string): void {
    console.log(Colors.green("[INFO] ") + msg)
    addToLogFile("[INFO] " + msg)
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
