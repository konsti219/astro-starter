/*
    This code communicates with the rcon port of a dedicated server
    It's responsible for keeping track of the socket and handleing/parsing packets 
    and reconnecting if the connection drops
*/

import { info, warn, error } from "./logging.ts"


interface RconPlayer {
    playerGuid: string 
    playerCategory: string
    playerName: string
    inGame: boolean
    index: number
}
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
    
    private conn?: Deno.Conn
    private reconnectInterval = 0
    public isConnected = false

    public players: RconPlayer[] = []
    public stats: RconStats | undefined
    public saves: RconSave[] = []


    constructor(private consoleAddr: string, private consolePassword: string) { }

    connect() {
        // When the socket is told to connect start an internal loop that will constantly try
        // to connect to the server if it's not connected. This is to make sure the socket stays connected.
        this.reconnectInterval = setInterval(() => this.connectSocket(), 500)
    }
    close() {
        // When told to disconnect it will close the socket and stop the loop
        this.conn?.close()
        this.isConnected = false
        clearInterval(this.reconnectInterval)
    }

    private async connectSocket() {
        // only try to connect if it's not already connected
        if (!this.isConnected) {
            try {
                // start connection
                info("Connecting to RCON port at " + this.consoleAddr)

                // set this here to prevent multiple sockets being established
                this.isConnected = true

                // get host and port and connect
                const [hostname, port] = this.consoleAddr.split(":")
                this.conn = await Deno.connect({ hostname, port: parseInt(port) })

                // write console password
                this.conn.write(this.encoder.encode(this.consolePassword + "\n"))

                for await (const buffer of Deno.iter(this.conn)) {
                    this.handleData(buffer)
                }
            } catch (e) {
                this.isConnected = false
                try {
                    this.conn?.close()
                } catch(_) {/**/}
                warn("Socket error/disconnect, addr: " + this.consoleAddr)
                // console.log(e)
            }
        }
    }
    private handleData(buffer: Uint8Array) {
        // data comes in as a stream, split into the single responses
        this.tempCache += this.decoder.decode(buffer);

        if (this.tempCache.endsWith("\n")) {
            const parts = this.tempCache.split("\n")

            for (const res of parts) {
                if (res.startsWith('{"build"')) {
                    // DSServerStatistics response

                    const data:RconStats = JSON.parse(res)
                    info("stats:")
                    console.log(data.serverURL)
                } else if (res.startsWith('{"activeSaveName"')) {
                    // DSListGames response

                    const data: {
                        activeSaveName: string,
                        gameList: RconSave[]
                    } = JSON.parse(res)
                    info("games:")
                    //console.log(data)
                } else if (res.startsWith('{"playerInfo"')) {
                    // DSListPlayers response

                    const data: {
                        playerInfo: RconPlayer[]
                    } = JSON.parse(res)
                    info("players:")
                    //console.log(data)
                } else {
                    if (res.length > 0) {
                        warn("unknown res")
                        console.log(res)
                        console.log(res.length)
                    }
                }
            }

            this.tempCache = ""
        }
    }

    run(cmd:string) {
        this.queue.push(cmd)
    }

    async update() {
        // "DSListPlayers"
            // DSServerStatistics
            // DSListGames
        info("sending to " + this.consoleAddr)
        try {
            await this.conn?.write(this.encoder.encode("DSServerStatistics\nDSListGames\nDSListPlayers\n"));
        } catch (_) {
            error("failed to send")
            this.conn?.close()
            this.isConnected = false
        }
        /*return new Promise<void>((res, _) => {
            res()
        })*/
    }

}
export { RconManager }

