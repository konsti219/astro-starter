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
    serverPassword?: string
    whitelist?: boolean
    maxPlayers?: number
    afkTimeout?: number
    saveInterval?: number
    backupSaves?: boolean
    backupInterval?: number
    enableAstrochatIntegration?: boolean
    customHeartbeat?: boolean
    discordWebhook?: string
    restartAt?: string
    makeBackupSaveAt?: string
    restoreSaveName?: string
    noShutdown?: boolean
}
interface ConfigFile {
    webserverPort?: number
    owner?: string
    rconErrorRestart?: boolean
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
    starter.rconErrorRestart = config.rconErrorRestart ?? false

    if ((new Set(config.servers.map(s => s.id))).size !== config.servers.length) {
        critical("found duplicate id! ids have to be unique.")
        Deno.exit(1)
    }

    for (const i in (config.servers)) {
        const s = config.servers[i]

        if (!(s.type === "local" || s.type === "remote" || s.type === "playfab")) {
            critical(`serverTypr can only be "local" || "remote" || "playfab". Server id: ${s.id}`)
            Deno.exit(1)
        }

        starter.servers.push(new Server(
            s.id ?? `server${i}`,
            s.type ?? "local",
            s.name ?? `Server ${i}`,
            s.IP ?? "_public",
            s.port ?? 8777,
            s.consolePort ?? "_auto",
            s.consolePassword ?? "_random",
            s.serverPassword ?? "",
            s.whitelist ?? false,
            s.maxPlayers ?? 8,
            s.afkTimeout ?? 0,
            s.saveInterval ?? 900,
            s.backupSaves ?? true,
            s.backupInterval ?? 3600,
            s.enableAstrochatIntegration ?? false,
            s.customHeartbeat ?? false,
            s.discordWebhook ?? "",
            s.restartAt ?? "",
            s.makeBackupSaveAt ?? "",
            s.restoreSaveName ?? "",
            s.noShutdown ?? false,
            starter.owner,
            starter
        ))
    }
}
