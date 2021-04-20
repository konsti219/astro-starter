/*
    This code communicates with the rcon port of a dedicated server
    It's responsible for keeping track of the socket and handleing/parsing data 
    and reconnecting if the connection drops
*/

import { io } from "./deps.ts";

import { timeout } from "./util.ts";
import { info, warn, error } from "./logging.ts"


interface RconStats {
    build: string
    ownerName: string
    maxInGamePlayers: number
    playersInGame: number
    playersKnownToGame: number
    saveGameName: string
    playerActivityTimeout: number
    secondsInGame: number
    serverName: string
    serverURL: string
    averageFPS: number
    hasServerPassword: boolean
    isEnforcingWhitelist: boolean
    creativeMode: boolean
    isAchievementProgressionDisabled: boolean
}
export interface RconPlayer {
    playerGuid: string 
    playerCategory: string
    playerName: string
    inGame: boolean
    index: number
}
interface RconSave {
    name: string
    date: string
    bHasBeenFlaggedAsCreativeModeSave: boolean
}

export class RconManager {
    private encoder = new TextEncoder()
    private decoder = new TextDecoder()
    private tempCache = ""

    private queue: string[] = []

    private statsPromiseRes = () => {}
    private playersPromiseRes = () => {}
    private savesPromiseRes = () => { }
    private lastSuccesful = Date.now()
    
    private conn?: Deno.Conn
    private connectInterval: number | undefined = undefined
    public isConnected = false

    public stats: RconStats = {
        build: "",
        ownerName: "",
        maxInGamePlayers: 0,
        playersInGame: 0,
        playersKnownToGame: 0,
        saveGameName: "",
        playerActivityTimeout: 0,
        secondsInGame: 0,
        serverName: "",
        serverURL: "",
        averageFPS: 0,
        hasServerPassword: false,
        isEnforcingWhitelist: false,
        creativeMode: false,
        isAchievementProgressionDisabled: false
    }
    public players: RconPlayer[] = []
    public saves: RconSave[] = []


    constructor(private consoleAddr: string, private consolePassword: string, private noShutdown: boolean) { }

    // if this.connectInterval is set, it means the socket should be connecting
    // if this.isConnected is set to true it means there is an active tcp connection
    connect() {
        info("Connecting to RCON port at " + this.consoleAddr)

        // When the socket is told to connect start an internal loop that will constantly try to
        // connect to the server if it's not connected. This is to make sure the socket stays connected.
        if (!this.connectInterval) {
            this.connectInterval = setInterval(() => this.connectSocket(), 500)
        }

        // reset this here just in case
        this.lastSuccesful = Date.now()
    }
    disconnect() {
        // When told to disconnect it will close the socket and stop the loop
        clearInterval(this.connectInterval)
        this.connectInterval = undefined
        this.close()
    }

    private close() {
        this.isConnected = false
        try {
            this.conn?.close()
        } catch(_) {_}
    }

    private async connectSocket() {
        // only try to connect if it's not already connected
        if (!this.isConnected) {
            try {
                // start connection

                // set this here to prevent multiple sockets being established
                this.isConnected = true

                // get host and port
                const [hostname, port] = this.consoleAddr.split(":")
                // actually connect
                this.conn = await Deno.connect({ hostname, port: parseInt(port) })

                // write console password
                this.conn.write(this.encoder.encode(this.consolePassword + "\n"))

                // async iterator that handles all data coming in
                for await (const buffer of io.iter(this.conn)) {
                    this.handleData(buffer)
                }
            } catch (e) {
                this.close()

                // if an error occurs check if socket should have been connected, if yes warn
                if (this.isConnected) {
                    warn("Socket error/disconnect, addr: " + this.consoleAddr)
                }
                this.rconError(e)
            }
        }
    }
    private handleData(buffer: Uint8Array) {
        // data comes in as a stream
        this.tempCache += this.decoder.decode(buffer);

        // check if the data coming is finsihed
        if (this.tempCache.endsWith("\n")) {
            // split into the single responses
            const parts = this.tempCache.split("\n")

            for (const res of parts) {
                if (res.startsWith('{"build"')) {
                    // DSServerStatistics response

                    this.stats = JSON.parse(res)
                    this.statsPromiseRes()
                } else if (res.startsWith('{"playerInfo"')) {
                    // DSListPlayers response

                    this.players = JSON.parse(res).playerInfo
                    this.playersPromiseRes()
                } else if (res.startsWith('{"activeSaveName"')) {
                    // DSListGames response

                    this.saves = JSON.parse(res).gameList
                    this.savesPromiseRes()
                }  else {
                    if (res.length > 0) {
                        warn("unknown rcon response")
                        console.log(res)
                        console.log(res.length)
                    }
                }
            }

            // clear parsed data from cache
            this.tempCache = ""
        }
    }

    run(cmd: string) {
        this.queue.push(cmd)
    }

    setPlayerCategory(guid: string, category: string) {
        const player = this.players.find(p => p.playerGuid === guid)
        if (player) {
            this.setPlayerCategryName(player.playerName, category)
        } else {
            warn("could not find player with guid " + guid)
        }
    }
    setPlayerCategryName(name: string, category: string) {
        this.run(`DSSetPlayerCategoryForPlayerName ${name} ${category}`)
    }
    kickPlayer(guid: string) {
        this.run(`DSKickPlayerGuid ${guid}`)
    }

    saveGame(saveName?: string) {
        if (saveName) {
            this.run(`DSSaveGame ${saveName}`)
        } else {
            this.run(`DSSaveGame`)
        }
    }
    loadGame(saveName: string) {
        this.run(`DSLoadGame ${saveName}`)
    }
    newGame(saveName: string) {
        this.run(`DSNewGame ${saveName}`)
    }

    setWhitelist(enable: boolean) {
        this.run(`DSSetDenyUnlisted ${enable}`)
    }

    shutdown() {
        if (!this.noShutdown) this.run(`DSServerShutdown`)
    }

    async update() {
        if (!this.connectInterval) {
            warn("Tried to update RCON that is not connected")
            return
        }

        // add data gathering commands to queue
        this.run("DSServerStatistics")
        this.run("DSListGames")
        this.run("DSListPlayers")

        try {
            // turn queue into a single command string with commands seperated by \n
            const rconCmd = this.queue.reduce((acc, cmd) => acc + cmd + "\n", "")
            this.queue = []

            // write command string into socket
            await this.conn?.write(this.encoder.encode(rconCmd));
        } catch (e) {
            error("failed to send RCON command to " + this.consoleAddr)

            this.rconError(e)

            // return and continue execution of update loop
            return
        }

        try {
            await timeout(1000, Promise.all([
                new Promise<void>((res, _) => { this.statsPromiseRes = res }),
                new Promise<void>((res, _) => { this.playersPromiseRes = res }),
                new Promise<void>((res, _) => { this.savesPromiseRes = res })
            ]))

            this.lastSuccesful = Date.now()
        } catch (_) {
            warn("RCON response timeout")

            this.rconError("RCON timeout")
        }

    }

    private rconError(_: unknown) {
        if (Date.now() - this.lastSuccesful > 15000)
            warn(`RCON Error. Last success (ms ago): ${Date.now() - this.lastSuccesful}, addr: ${this.consoleAddr}. (not critical, ignore me)`)
        //console.error(errorMsg)

        // close the socket and wait for the loop to establish a new one
        this.close()

        // stop returning players as online after 30 seconds
        if (Date.now() - this.lastSuccesful > 30000) this.players.forEach(p => (p.inGame = false))

        // check if it is time to abondon the socket
        if (Date.now() - this.lastSuccesful > 600 * 1000) {
            error("Could connect to connect to RCON in 10 minutes. Retrying in 1 minute")

            this.players = []
            this.saves = []
            this.disconnect()

            setTimeout(() => this.connect(), 60000)
        }
    }

}
