import { Starter } from "./Starter.ts"
import { Server } from "./Server.ts"

import { critical } from "./logging.ts"

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
    customHeartbeat?: boolean
    discordWebhook?: string
    restartAt?: string
    noShutdown: boolean
}
interface ConfigFile {
    webserverPort?: number
    owner?: string
    servers: ConfigFileServer[]
}

export const parseConfig = (configPath: string, starter: Starter) => {
    const configJson = Deno.readTextFileSync(configPath)
    let config: ConfigFile = { servers: [] }
    try {
        config = JSON.parse(configJson)
    } catch (_) {
        critical("Parsing config file failed")
        Deno.exit(1)
    }

    starter.webserverPort = config.webserverPort ?? 5000
    starter.owner = config.owner ?? ""

    if ((new Set(config.servers.map(s => s.id))).size !== config.servers.length) {
        critical("found duplicate id! ids have to be unique.")
        Deno.exit(1)
    }

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
            s.customHeartbeat ?? false,
            s.discordWebhook ?? "",
            s.restartAt ?? "",
            s.noShutdown ?? false,
            starter.owner,
            starter
        ))
    }
}
