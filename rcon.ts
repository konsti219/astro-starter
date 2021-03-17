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

class RconManager {
    private encoder = new TextEncoder()
    private decoder = new TextDecoder()
    private queue:string[] = []
    private conn?: Deno.Conn
    private reconnectInterval = 0
    public isConnected = false

    public players: RconPlayer[] = []


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
                const [hostname, port] = this.consoleAddr.split(":")
                this.conn = await Deno.connect({ hostname, port: parseInt(port) })

                this.conn.write(this.encoder.encode(this.consolePassword + "\n"))

                this.isConnected = true

                for await (const buffer of Deno.iter(this.conn)) {
                    this.handleData(buffer)
                }
            } catch (e) {
                this.isConnected = false
                try {
                    this.conn?.close()
                } catch(_) {/**/}
                warn("Socket error/disconnect")
                console.log(e)
            }
        }
    }
    private handleData(buffer: Uint8Array) {
        console.log(this.decoder.decode(buffer))
        /*
            tempCache += data.toString();

            if (tempCache.endsWith("\r\n")) {
            clearTimeout(timeout);
            client.destroy();

            next();
            try {
                res(JSON.parse(tempCache));
            } catch (e) {
                console.error("JSON failed");
                rej(e);
            }
            }*/
    }

    run(cmd:string) {
        this.queue.push(cmd)
    }

    async update() {
        // "DSListPlayers"
            // DSServerStatistics
            // DSListGamesDSListGames
        await this.conn?.write(this.encoder.encode("DSServerStatistics\n"));
        /*return new Promise<void>((res, _) => {
            res()
        })*/
    }

}
export { RconManager }

