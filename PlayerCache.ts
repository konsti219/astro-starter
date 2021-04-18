/*
    The player cache stores names for all servers
    Players are identified by their playfabid
*/

import { path, fs } from "./deps.ts"
import { Starter } from "./Starter.ts";
import { Player } from "./PlayerManager.ts";

interface CachePlayer {
    guid: string
    playfabid: string
    name: string
    firstJoinName: string

    firstJoin: number
    lastSeen: number
}
/*
starterData/data.json
{    
    playersCache: [
        {
            guid: "",
            playfabid: ""
            name: "",
            firstJoinName: "",

            firstJoin: 0,
            lastSeen: 0
        }
    ]
}
*/

export class PlayerCache {
    private players: CachePlayer[] = []
    private dataFile = ""

    constructor(private starter: Starter) {
        if (!starter.dir) return

        this.dataFile = path.join(this.starter.dir, "starterData", "data.json")
    }

    async readFile() {
        if (fs.existsSync(this.dataFile)) {
            const tempPlayers: {
                playerCache: {
                    guid: string
                    playfabid: string
                    name: string
                    firstJoinName: string

                    firstJoin: number
                    lastSeen: number
                }[]
            } = JSON.parse(await Deno.readTextFile(this.dataFile))

            tempPlayers.playerCache.forEach(p => {
                this.players.push({
                    guid: p.guid,
                    playfabid: p.playfabid,
                    name: p.name,
                    firstJoinName: p.firstJoinName,

                    firstJoin: p.firstJoin,
                    lastSeen: p.lastSeen
                })
            });
        } else {
            await Deno.writeTextFile(this.dataFile, JSON.stringify({ playerCache: [] }))
        }
    }

    writeFile() {
        Deno.writeTextFileSync(this.dataFile, JSON.stringify({
            playerCache: this.players.map(p => ({
                guid: p.guid,
                playfabid: p.playfabid,
                name: p.name,
                firstJoinName: p.firstJoinName,

                firstJoin: p.firstJoin,
                lastSeen: p.lastSeen
            }))
        }))
    }

    update(players: Player[]) {
        players.forEach(p => {
            // check if palyer has a known playfab id
            if (p.playfabid === "") return

            // check if new
            if (!this.players.find(lp => lp.playfabid === p.playfabid)) {
                console.log("new cache player")
                this.players.push({
                    guid: p.guid,
                    playfabid: p.playfabid,
                    name: p.name,
                    firstJoinName: "",

                    firstJoin: 0,
                    lastSeen: 0
                })
            }

            const cachePlayer = this.players.find(lp => lp.playfabid === p.playfabid)

            if (cachePlayer) {
                // check for incomplete first data
                if (p.inGame) {
                    if (cachePlayer.firstJoinName === "") cachePlayer.firstJoinName = p.firstJoinName
                    if (cachePlayer.firstJoin === 0) cachePlayer.firstJoin = Date.now()
                }

                // update other data
                if (p.name !== "") cachePlayer.name = p.name
                if (p.inGame) cachePlayer.lastSeen = Date.now()
            }
        })

        // save new data to disk
        this.writeFile()
    }
}
