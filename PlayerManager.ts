import { path, fs } from "./deps.ts"

import { Starter } from "./Starter.ts";
import { Server } from "./Server.ts";
import { RconPlayer } from "./rcon.ts";

import { info, warn, error } from "./logging.ts"

enum PlayerCategory {
    Unlisted = "Unlisted",
    Blacklisted = "Blacklisted",
    Whitelisted = "Whitelisted",
    Admin = "Admin",
    Pending = "Pending",
    Owner = "Owner"
}
interface Player {
    guid: string
    playfabid: string
    name: string
    firstJoinName: string

    inGame: boolean
    firstJoin: number
    onlineSince: number
    lastSeen: number
    prevPlaytime: number

    category: PlayerCategory

    cached: boolean
}
/*
players.json
{    
    players: [
        {
            guid: "",
            playfabid: ""
            name: "",
            firstJoinName: "",

            firstJoin: 0
            lastSeen: 0
            playtime: 0

            category: PlayerCategory
        }
    ]
}

*/


class PlayerManager {
    private players: Player[] = []
    private playersFile = ""

    constructor(serverDir: string, private server:Server, private starter: Starter) {
        this.playersFile = path.join(serverDir, "players.json")
    }

    async readFile() {
        if (fs.existsSync(this.playersFile)) {
            const tempPlayers: {
                players: {
                    guid: string
                    playfabid: string
                    name: string
                    firstJoinName: string

                    firstJoin: number
                    lastSeen: number
                    playtime: number

                    category: PlayerCategory
                }[]
            } = JSON.parse(await Deno.readTextFile(this.playersFile))

            tempPlayers.players.forEach(p => {
                this.players.push({
                    guid: p.guid,
                    playfabid: p.playfabid,
                    name: p.name,
                    firstJoinName: p.firstJoinName,

                    inGame: false,
                    firstJoin: p.firstJoin,
                    onlineSince: 0,
                    lastSeen: p.lastSeen,
                    prevPlaytime: p.playtime,

                    category: p.category,

                    cached: true
                })
            });
        } else {
            await Deno.writeTextFile(this.playersFile, JSON.stringify({ players: [] }))
        }
    }

    writeFile() {
        Deno.writeTextFileSync(this.playersFile, JSON.stringify({
            players: this.players.map(p => ({
                guid: p.guid,
                playfabid: p.playfabid,
                name: p.name,
                firstJoinName: p.firstJoinName,

                firstJoin: p.firstJoin,
                lastSeen: p.lastSeen,
                playtime: PlayerManager.playtime(p),

                category: p.category
            }))
        }))
    }

    list() {
        return this.players
    }

    update(rconPlayers: RconPlayer[]) {
        // check for and store untracked players
        rconPlayers.forEach(p => {
            // check for untracked players
            if (!this.players.find(cp => cp.guid === p.playerGuid)) {
                info(`${this.server.name}: '${p.playerName}' is new`)

                this.players.push({
                    guid: p.playerGuid,
                    playfabid: "",
                    name: p.playerName,
                    firstJoinName: p.playerName,

                    inGame: false,
                    firstJoin: Date.now(),
                    onlineSince: 0,
                    lastSeen: 0,
                    prevPlaytime: 0,

                    category: PlayerManager.categoryToEnum(p.playerCategory),

                    cached: true
                })
            }
        })

        // loop through all players and check for inGame change and update stats
        this.players.forEach(p => {

            const rconP = rconPlayers.find(rp => rp.playerGuid === p.guid)
            // rconP could be undefined because the server could forget players
            if (rconP) {

                // joining
                if (rconP.inGame && !p.inGame) {
                    info(`${this.server.name}: '${rconP.playerName}' joining`)
                    p.inGame = true
                    p.onlineSince = Date.now()
                }

                // leaving
                if (!rconP.inGame && p.inGame) {
                    info(`${this.server.name}: '${rconP.playerName}' leaving`)
                    p.inGame = false
                    p.prevPlaytime = PlayerManager.playtime(p)
                    p.onlineSince = 0
                }

                // update other data
                p.name = rconP.playerName
                p.inGame = rconP.inGame
                p.category = PlayerManager.categoryToEnum(rconP.playerCategory)

                if (p.inGame) p.lastSeen = Date.now()
            }

            // set cached, true means that the server forgot the player
            p.cached = !rconP
        })

        // save new data to disk
        this.writeFile()
    }

    // calculate playtime based on previously recorded time and for how long the player has been online
    static playtime(player: Player): number {
        const curPlaytime = player.onlineSince > 0 ? Date.now() - player.onlineSince : 0
        return player.prevPlaytime + curPlaytime
    }

    static categoryToEnum(cat: string): PlayerCategory {
        if (cat === "Unlisted") {
            return PlayerCategory.Unlisted
        } else if (cat === "Blacklisted") {
            return PlayerCategory.Blacklisted
        } else if (cat === "Whitelisted") {
            return PlayerCategory.Whitelisted
        } else if (cat === "Admin") {
            return PlayerCategory.Admin
        } else if (cat === "Pending") {
            return PlayerCategory.Pending
        } else if (cat === "Owner") {
            return PlayerCategory.Owner
        } else {
            return PlayerCategory.Unlisted
        }
    }
}

export { PlayerManager }