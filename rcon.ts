/*
    This code communicates with the rcon port of a dedicated server
    It's responsible for keeping track of the socket and handleing/parsing data 
    and reconnecting if the connection drops
*/

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

class RconManager {
    private encoder = new TextEncoder()
    private decoder = new TextDecoder()
    private tempCache = ""

    private queue: string[] = []

    private statsPromiseRes = () => {}
    private playersPromiseRes = () => {}
    private savesPromiseRes = () => {}
    
    private conn?: Deno.Conn
    private connectInterval = 0
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


    constructor(private consoleAddr: string, private consolePassword: string) { }

    connect() {
        // When the socket is told to connect start an internal loop that will constantly try to
        // connect to the server if it's not connected. This is to make sure the socket stays connected.
        this.connectInterval = setInterval(() => this.connectSocket(), 500)
    }
    close() {
        // When told to disconnect it will close the socket and stop the loop
        this.isConnected = false
        clearInterval(this.connectInterval)
        try {
            this.conn?.close()
        } catch(_) {_}
    }

    private async connectSocket() {
        // only try to connect if it's not already connected
        if (!this.isConnected) {
            try {
                // start connection
                info("Connecting to RCON port at " + this.consoleAddr)

                // set this here to prevent multiple sockets being established
                this.isConnected = true

                // get host and port
                const [hostname, port] = this.consoleAddr.split(":")
                // actually connect
                this.conn = await Deno.connect({ hostname, port: parseInt(port) })

                // write console password
                this.conn.write(this.encoder.encode(this.consolePassword + "\n"))

                // async iterator that handles all data coming in
                for await (const buffer of Deno.iter(this.conn)) {
                    this.handleData(buffer)
                }
            } catch (_) {
                if (this.isConnected) warn("Socket error/disconnect, addr: " + this.consoleAddr)
                this.isConnected = false
                try {
                    this.conn?.close()
                } catch(_) {_}
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

    run(cmd:string) {
        this.queue.push(cmd)
    }

    async update() {
        this.run("DSServerStatistics")
        this.run("DSListGames")
        this.run("DSListPlayers")
        try {
            const rconCmd = this.queue.reduce((acc, cmd) => acc + cmd + "\n", "")
            await this.conn?.write(this.encoder.encode(rconCmd));
            this.queue = []
        } catch (_) {
            error("failed to send RCON command to " + this.consoleAddr)
            this.close()
        }

        return Promise.all([
            new Promise<void>((res, _) => { this.statsPromiseRes = res }),
            new Promise<void>((res, _) => { this.playersPromiseRes = res }),
            new Promise<void>((res, _) => { this.savesPromiseRes = res })
        ])
    }

}
export { RconManager }

