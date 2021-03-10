import { Starter } from "./Starter.ts"
import { Server } from "./Server.ts"

interface ConfigFileServer {
    id?: string
    type?: string
    name?: string
    IP?: string
    port?: number
    consolePort?: string
    consolePassword?: string
    whitelist?: boolean
    saveInterval?: number
    backupSaves?: boolean
    backupInterval?: number
    enableAstrochatIntegration?: boolean
}
interface ConfigFile {
    webserverPort?: number
    owner?: string
    servers: ConfigFileServer[]
}

const parseConfig = (configPath: string, starter: Starter) => {
    const configJson = Deno.readTextFileSync(configPath)
    let config: ConfigFile = { servers: [] }
    try {
        config = JSON.parse(configJson)
    } catch (e) {
        console.error("Parsing config file failed")
    }

    starter.webserverPort = config.webserverPort ?? 5000
    starter.owner = config.owner ?? ""

    for (const i in (config.servers)) {
        const s = config.servers[i]

        starter.servers.push(new Server(
            s.id ?? `server${i}`,
            s.type ?? "local",
            s.name ?? `My server ${i}`,
            s.IP ?? "_public",
            s.port ?? 8777,
            s.consolePort ?? "_auto",
            s.consolePassword ?? "_random",
            s.whitelist ?? false,
            s.saveInterval ?? 900,
            s.backupSaves ?? true,
            s.backupInterval ?? 3600,
            s.enableAstrochatIntegration ?? false,
            starter.owner,
            starter
        ))
    }
}

export { parseConfig }
