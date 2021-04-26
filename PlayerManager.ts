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
            playfabid: ""
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

    private playersRCON: RconPlayer[] = []
    private joinedPlayersRCON: Player[] = []
    private playersPlayfab: string[] = []
    private joinedPlayersPlayfab: string[] = []

    constructor(private server: Server, private starter?: Starter) {
        this.playersFile = path.join(this.server.serverDir, "data.json")
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

    /* this function does player tracking shit and diffing. IT'S A MESS */
    update(rconPlayers: RconPlayer[]) {
        const hasRCON = this.server.serverType !== "playfab"
        const newPlayfabPlayers: string[] = this.server.playfabData?.PlayerUserIds ?? []

        /*
            hasRcon == true: players are identified by guid and added to list when they show up there
            hasRcon == false: players are identified by playfabid and added when in playfab
        */
        
        /* CHECK FOR UNTRACKED */
        if (hasRCON) {
            // based on RCON
            rconPlayers.forEach(p => {
                // check for untracked players
                if (!this.players.find(cp => cp.guid === p.playerGuid)) {
                    info(`'${p.playerName}' is new`, this.server.name)

                    this.players.push({
                        guid: p.playerGuid,
                        playfabid: "",
                        name: "",
                        firstJoinName: "",

                        inGame: false,
                        firstJoin: 0,
                        onlineSince: 0,
                        lastSeen: 0,
                        prevPlaytime: 0,

                        category: PlayerManager.categoryToEnum(p.playerCategory),

                        cached: true
                    })
                }
            })
        } else {
            // based on playfab
            newPlayfabPlayers.forEach(p => {
                // check for untracked players
                if (!this.players.find(cp => cp.playfabid === p)) {
                    info(`'${p}' is new`, this.server.name)

                    this.players.push({
                        guid: "",
                        playfabid: p,
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
        if (hasRCON) {
            // update joined playfab list
            // check for new ids
            newPlayfabPlayers.forEach(id => {
                if (!this.playersPlayfab.includes(id)) {
                    this.joinedPlayersPlayfab.push(id)
                }
            })

            // update joined RCON list
            this.players.forEach(p => {
                const newRconP = rconPlayers.find(rp => rp.playerGuid === p.guid)
                const oldRconP = this.playersRCON.find(rp => rp.playerGuid === p.guid) ?? { inGame: false }

                if (newRconP) {
                    if (newRconP.inGame && !oldRconP.inGame) {
                        // add to playfab matching list
                        this.joinedPlayersRCON.push(p)
                    }
                }
            })

            // check if an old id is gone
            this.joinedPlayersPlayfab =
                this.joinedPlayersPlayfab.filter(id => newPlayfabPlayers.includes(id))
            this.joinedPlayersRCON =
                this.joinedPlayersRCON.filter(p => !!rconPlayers.find(rp => rp.playerGuid === p.guid))
        
            // do matching
            // (at this point I did not know it) NOTE: if two players join at the same time this could switch up their ids
            // but it's unlikely enough for me to ignore
            // REALITY: If the tool just started it can actually cause two palyers to join at the same time

            // stop matching if two joined at the same time
            if (this.joinedPlayersPlayfab.length > 1
                && this.joinedPlayersPlayfab.length === this.joinedPlayersRCON.length) {
                warn(`Two players joined at same time, aborting playfabid matching (${this.joinedPlayersPlayfab}, ${this.joinedPlayersRCON.map(p => p.name)})`)
                this.joinedPlayersPlayfab = []
                this.joinedPlayersRCON = []
            }

            if (this.joinedPlayersPlayfab.length > 0 && this.joinedPlayersRCON.length > 0) {
                const player = this.joinedPlayersRCON.shift()
                if (player) {
                    player.playfabid = this.joinedPlayersPlayfab.shift() ?? ""
                }
            }

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
                    if (p1 != p2 && p1.guid == p2.guid) {
                        warn(`Found duplicate guid (${p1.name}, ${p2.name}), rm one with less palytime`)
                        if (p1.prevPlaytime > p2.prevPlaytime) {
                            this.players = this.players.filter(p => p.guid !== p2.guid)
                        } else {
                            this.players = this.players.filter(p => p.guid !== p1.guid)
                        }
                    }
                })
            })
        } else {
            // remove duplicate accounts (playfab)
            this.players.forEach(p1 => {
                this.players.forEach(p2 => {
                    if (p1 != p2 && p1.playfabid == p2.playfabid) {
                        warn(`Found duplicate playfabid (${p1.playfabid}, ${p2.playfabid}), rm one with less palytime`)
                        if (p1.prevPlaytime > p2.prevPlaytime) {
                            this.players = this.players.filter(p => p.playfabid !== p2.playfabid)
                        } else {
                            this.players = this.players.filter(p => p.playfabid !== p1.playfabid)
                        }
                    }
                })
            })
        }

        
        /* PLAYER STATE CHANGES */
        // loop through all players and check for inGame change and update stats
        this.players.forEach(player => {

            const onlinePlayersNum = newPlayfabPlayers.length
            const maxPlayers = this.server.playfabData?.Tags.maxPlayers ?? 0

            // rconP could be undefined because the server could forget players or there might not be RCON
            const rconP = rconPlayers.find(rp => rp.playerGuid === player.guid)
            
            // for join/leave
            const oldInGame = player.inGame

            player.inGame = newPlayfabPlayers.includes(player.playfabid)

            
            if (rconP) {
                // if we have the player via RCON update data locally and send to cache

                if (rconP.playerName !== "") player.name = rconP.playerName
                player.category = PlayerManager.categoryToEnum(rconP.playerCategory)

                this.starter?.playerCache.update(player)

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

        // update local arrays (clone it, NOT reference)
        this.playersPlayfab = [...newPlayfabPlayers]
        this.playersRCON = [...rconPlayers]

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
