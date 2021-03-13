/*
    This code communicates with playfab (the astroneer backend for dedicated servers)
    It's main point is to cache the server response and to request data fro all servers in one response
*/

const skdVersion = "UE4MKPL-1.49.201027"

interface PlayfabServerTags {
    maxPlayers: number
    numPlayers: number
    isFull: boolean
    gameId: string // IP + port
    gameBuild: string
    serverName: string
    category: string
    publicSigningKey: string
    requiresPassword: boolean
}
interface PlayfabServer {
    Region: string
    LobbyID: string
    BuildVersion: string
    GameMode: string
    PlayerUserIds: string[]
    RunTime: number
    GameServerState: number
    GameServerStateEnum: string
    Tags: PlayfabServerTags
    LastHeartbeat: string
    ServerHostname: string
    ServerIPV4Address: string
    ServerPort: number
}

class PlayfabManager {
    private servers: string[] = []
    private serversData: PlayfabServer[] = []
    private headers:Record<string, string> = {
        "Accept": "*/*",
        "Accept-Encoding": "none", //"deflate, gzip",
        "Content-Type": "application/json; charset=utf-8",
        "X-PlayFabSDK": skdVersion,
        "User-Agent":
            "Astro/++UE4+Release-4.23-CL-0 Windows/10.0.19041.1.768.64bit",
    }
    private lastSuccesfullQuery = 0
    private lastAuth = 0

    constructor() {
        this.lastSuccesfullQuery = Date.now()
    }

    async update() {
        // generateXAUTH
        await this.getAuth()

        // fetch data from playfab
        const serverRes: {
            data: {
                Games: {
                    Region: string
                    LobbyID: string
                    BuildVersion: string
                    GameMode: string
                    PlayerUserIds: string[]
                    RunTime: number
                    GameServerState: number
                    GameServerStateEnum: string
                    Tags: {
                        maxPlayers: string
                        numPlayers: string
                        isFull: string
                        gameId: string
                        gameBuild: string
                        serverName: string
                        category: string
                        publicSigningKey: string
                        requiresPassword: string
                    },
                    LastHeartbeat: string
                    ServerHostname: string
                    ServerIPV4Address: string
                    ServerPort: number
                }[]
            }
        } = await (
            await fetch("https://5EA1.playfabapi.com/Client/GetCurrentGames?sdk=" + skdVersion, {
                method: "POST",
                body: JSON.stringify({
                    TagFilter: {
                        Includes: this.servers.map(s => ({ Data: { gameId: s } }))
                    },
                }),
                headers: this.headers,
            })
        ).json();

        // remove old servers
        this.serversData = []

        // read response data
        serverRes.data.Games.forEach(s => {
            const tags: PlayfabServerTags = {
                maxPlayers: parseInt(s.Tags.maxPlayers),
                numPlayers: parseInt(s.Tags.maxPlayers),
                isFull: s.Tags.isFull === "true",
                gameId: s.Tags.gameId,
                gameBuild: s.Tags.gameBuild,
                serverName: s.Tags.serverName,
                category: s.Tags.category,
                publicSigningKey: s.Tags.publicSigningKey,
                requiresPassword: s.Tags.requiresPassword === "true"
            }
            const server: PlayfabServer = {
                Region: s.Region,
                LobbyID: s.LobbyID,
                BuildVersion: s.BuildVersion,
                GameMode: s.GameMode,
                PlayerUserIds: s.PlayerUserIds,
                RunTime: s.RunTime,
                GameServerState: s.GameServerState,
                GameServerStateEnum: s.GameServerStateEnum,
                Tags: tags,
                LastHeartbeat: s.LastHeartbeat,
                ServerHostname: s.ServerHostname,
                ServerIPV4Address: s.ServerIPV4Address,
                ServerPort: s.ServerPort
            }
            this.serversData.push(server)
        });
    }

    async getAuth() {
        // only refetch auth if it's older than one hour
        if (this.lastAuth + (3600 * 1000) < Date.now()) {
            const resXAUTH = await fetch("https://5EA1.playfabapi.com/Client/LoginWithCustomID?sdk=" + skdVersion, {
                method: "POST",
                body: JSON.stringify({
                    CreateAccount: true,
                    CustomId: "astro-starter_" + Math.round(Math.random() * 10000),
                    TitleId: "5EA1",
                }),
                headers: this.headers,
            });
            this.headers["X-Authorization"] = (await resXAUTH.json()).data.SessionTicket;
        }
    }

    add(server:string) {
        this.servers.push(server)
        console.log(server, this.servers)
    }

    get(server:string):PlayfabServer | undefined {
        return this.serversData.find(s => server === s.Tags.gameId)
    }
}

export { PlayfabManager }