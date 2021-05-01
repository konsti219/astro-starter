/*
    The player manager stores data about the players of a server
    and is responsible for reading/storing to disk
    and it does all the logic for join/leave and playfab ids
*/

import { path, fs } from "./deps.ts"

import { Starter } from "./Starter.ts";
import { Server } from "./Server.ts";
import { RconPlayer } from "./rcon.ts";

import { info, infoWebhook, warn } from "./logging.ts"

enum PlayerCategory {
    Unlisted = "Unlisted",
    Blacklisted = "Blacklisted",
    Whitelisted = "Whitelisted",
    Admin = "Admin",
    Pending = "Pending",
    Owner = "Owner"
}
export interface Player {
    guid: string
    playfabid: string
    idMatches: { id: string, seen: number }[]
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
starterData/servers/{server}/data.json
{    
    players: [
        {
            guid: "",
            playfabid: "",
            idMatches: [
                { id: "", seen: 0 }
            ]
            name: "",
            firstJoinName: "",

            firstJoin: 0,
            lastSeen: 0,
            playtime: 0,

            category: PlayerCategory
        }
    ]
}
*/


export class PlayerManager {
    private players: Player[] = []
    private playersFile = ""

    constructor(private server: Server, private starter?: Starter) {
        this.playersFile = path.join(this.server.serverDir, "data.json")
    }

    async readFile() {
        if (fs.existsSync(this.playersFile)) {
            const tempPlayers: {
                players: {
                    guid: string
                    playfabid: string
                    idMatches?: [
                        { id: string, seen: number }
                    ]
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
                    idMatches: p.idMatches ?? [],
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
                idMatches: p.idMatches,
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

    /* this function does player tracking shit and diffing. IT'S A MESS */
    update(rconPlayers: RconPlayer[]) {
        const hasRCON = this.server.serverType !== "playfab"
        const playfabPlayers: string[] = this.server.playfabData?.PlayerUserIds ?? []

        /*
            hasRcon == true: players are identified by guid and added to list when they show up there
            hasRcon == false: players are identified by playfabid and added when in playfab
        */

        /* CHECK FOR UNTRACKED */
        if (hasRCON) {
            // based on RCON
            rconPlayers.forEach(rconP => {
                // this accounts for new normal players and whitelisted ones
                const existingGuid = !!this.players.find(cp => cp.guid === rconP.playerGuid)
                const existingName = !!this.players.find(cp => cp.name === rconP.playerName)

                if (!existingGuid || (!existingName && rconP.playerGuid === "")) {
                    info(`'${rconP.playerName}' is new`, this.server.name)

                    this.players.push({
                        guid: rconP.playerGuid,
                        playfabid: "",
                        idMatches: [],
                        name: rconP.playerName,
                        firstJoinName: "",

                        inGame: false,
                        firstJoin: 0,
                        onlineSince: 0,
                        lastSeen: 0,
                        prevPlaytime: 0,

                        category: PlayerManager.categoryToEnum(rconP.playerCategory),

                        cached: true
                    })

                }
            })
        } else {
            // based on playfab
            playfabPlayers.forEach(p => {
                // check for untracked players
                if (!this.players.find(cp => cp.playfabid === p)) {
                    info(`'${p}' is new`, this.server.name)

                    this.players.push({
                        guid: "",
                        playfabid: p,
                        idMatches: [],
                        name: "",
                        firstJoinName: "",

                        inGame: false,
                        firstJoin: 0,
                        onlineSince: 0,
                        lastSeen: 0,
                        prevPlaytime: 0,

                        category: PlayerCategory.Pending,

                        cached: true
                    })
                }
            })
        }


        /* ID MATCHING */
        const userIds = this.server.playfabData?.PlayerUserIds
        if (hasRCON && userIds) {
            // gather up all possible matches
            const playerMatchPool: {
                player: Player,
                ids: {
                    id: string,
                    percent: number
                }[]
            }[] = []
            this.players.forEach(player => {
                // make sure player has guid and is online
                const rconP = rconPlayers.find(rp => rp.playerGuid === player.guid)
                if (player.guid !== "" && rconP && rconP.inGame) {

                    // increment counter for how often the player has been seen online with this id
                    userIds.forEach(id => {
                        // add new entry
                        if (!player.idMatches.find(match => match.id === id)) {
                            player.idMatches.push({ id, seen: 0 })
                        }

                        // increment
                        const match = player.idMatches.find(match => match.id === id)
                        if (match) {
                            match.seen++
                        }
                    })

                    // then calculate percentage for each id how much it is part of the total of what the player has been seen with
                    const totalSeen = player.idMatches.reduce((acc, cur) => acc + cur.seen, 0)
                    playerMatchPool.push({
                        player,
                        ids: player.idMatches.map(match => ({ id: match.id, percent: match.seen / totalSeen }))
                    })
                }
            })

            // get all possible ids
            let allIds = playerMatchPool.flatMap(matches => matches.ids)

            // only keep entry with highest percent
            // first get the highest for each number
            const highest: Record<string, number> = {}
            allIds.forEach(id => {
                if (!highest[id.id]) {
                    highest[id.id] = id.percent
                } else {
                    if (highest[id.id] < id.percent) {
                        highest[id.id] = id.percent
                    }
                }
            })
            // then filter out the lower ones
            allIds = allIds.filter(id => highest[id.id] === id.percent)
        }
        this.cleanup(hasRCON)


        /* PLAYER STATE CHANGES */

        const onlinePlayersNum = playfabPlayers.length
        const maxPlayers = this.server.playfabData?.Tags.maxPlayers ?? 0

        // loop through all players and check for inGame change and update stats
        this.players.forEach(player => {

            // rconP could be undefined because the server could forget players or there might not be RCON
            let rconP = rconPlayers.find(rp => rp.playerGuid === player.guid)
            // make sure not to fetch if there is no guid
            if (rconP?.playerGuid === "") rconP = undefined

            // pick out by name for whitelisted
            const rconPName = rconPlayers.find(rp => rp.playerName === player.name)

            if (rconP) {
                // if we have the player via RCON update data locally and send to cache

                if (rconP.playerGuid !== "") {
                    if (rconP.playerName !== "") player.name = rconP.playerName
                    player.category = PlayerManager.categoryToEnum(rconP.playerCategory)

                    this.starter?.playerCache.update(player)

                    player.cached = false
                }
            } else if (rconPName && !rconP) {
                // for players on whitelist
                player.cached = false
            } else {
                // else try to read data from cache
                const cacheData = this.starter?.playerCache.find(player.playfabid)
                if (cacheData) {
                    player.guid = cacheData.guid
                    player.name = cacheData.name
                }

                player.cached = true
            }

            // for join/leave
            const oldInGame = player.inGame
            player.inGame = playfabPlayers.includes(player.playfabid)

            if (player.inGame) {
                // check for incomplete first data
                if (player.firstJoinName === "" && player.name !== "") player.firstJoinName = player.name
                if (player.firstJoin === 0) player.firstJoin = Date.now()

                player.lastSeen = Date.now()
            }


            // JOIN / LEAVE
            // basically just "UNKNOWN" instead of an empty string
            const humanName = player.name === "" ? `UNKNOWN ('${player.playfabid.substr(0, 4)}')` : `'${player.name}'`

            // joining
            if (player.inGame && !oldInGame) {
                infoWebhook(`${humanName} joining (${onlinePlayersNum}/${maxPlayers})`,
                    this.server.name, this.server.webhook)

                player.onlineSince = Date.now()
            }

            // leaving
            if (!player.inGame && oldInGame) {
                infoWebhook(`${humanName} leaving (${onlinePlayersNum}/${maxPlayers})`,
                    this.server.name, this.server.webhook)

                player.prevPlaytime = PlayerManager.playtime(player)
                player.onlineSince = 0
            }

        })

        // save new data to disk
        this.writeFile()
    }

    private cleanup(hasRCON: boolean) {
        if (hasRCON) {
            // remove duplicate ids if found (backup)
            this.players.forEach(p1 => {
                this.players.forEach(p2 => {
                    if (p1 != p2 && p1.playfabid == p2.playfabid && p1.playfabid != "") {
                        warn(`Found duplicate playfabid (${p1.name}, ${p2.name}), removing`)
                        p1.playfabid = ""
                        p2.playfabid = ""
                    }
                })
            })

            // remove duplicate accounts (RCON)
            this.players.forEach(p1 => {
                this.players.forEach(p2 => {
                    // based on guid
                    if (p1 !== p2 && p1.guid === p2.guid && p1.guid !== "") {
                        warn(`Found duplicate guid (${p1.name}, ${p2.name}), rm one with less palytime`)
                        if (p1.prevPlaytime > p2.prevPlaytime) {
                            this.players = this.players.filter(p => p !== p2)
                        } else {
                            this.players = this.players.filter(p => p !== p1)
                        }
                    }

                    // based on name (for whitelisted players)
                    if (p1 !== p2 && p1.name === p2.name && (p1.guid === "" || p2.guid === "")) {
                        if (p1.guid === "") {
                            this.players = this.players.filter(p => p !== p1)
                        } else {
                            this.players = this.players.filter(p => p !== p2)
                        }
                    }
                })
            })
        } else {
            // remove duplicate accounts (playfab)
            this.players.forEach(p1 => {
                this.players.forEach(p2 => {
                    if (p1 !== p2 && p1.playfabid === p2.playfabid) {
                        warn(`Found duplicate playfabid (${p1.playfabid}, ${p2.playfabid}), rm one with less palytime`)
                        if (p1.prevPlaytime > p2.prevPlaytime) {
                            this.players = this.players.filter(p => p !== p2)
                        } else {
                            this.players = this.players.filter(p => p !== p1)
                        }
                    }
                })
            })
        }
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
