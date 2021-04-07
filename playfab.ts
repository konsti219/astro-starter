/*
    This code communicates with playfab (the astroneer backend for dedicated servers)
    It's main point is to cache the server response and to request data for all servers in one request
*/

import { warn, critical } from "./logging.ts"

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
export interface PlayfabServer {
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


export class PlayfabManager {
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
    private deregisteredServers: Record<string, number> = {}

    constructor() {
        this.lastSuccesfullQuery = Date.now()
    }

    async update() {
        const fetchData = async () => {
            try {
                // generateXAUTH
                await this.getAuth()

                // fetch data from playfab
                const serverRes: {
                    code: number
                    status: string
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
                        PlayerCount: number
                        GameCount: number
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
            
                // check if data is present (if anything is wrong this will throw)
                if (!serverRes.data.Games) {
                    console.log(serverRes)
                    throw "sth is undefined";
                }

                // remove old servers
                this.serversData = []

                // console.log(serverRes.data.GameCount)
                // console.log(serverRes.data.Games.map(s => s.Tags.gameId))

                // read response data
                serverRes.data.Games.forEach(s => {
                    if (this.deregisteredServers[s.Tags.gameId] > 0) {
                        this.deregisteredServers[s.Tags.gameId] -= 1
                        return
                    } else {
                        delete this.deregisteredServers[s.Tags.gameId]
                    }

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

                this.lastSuccesfullQuery = Date.now()
            } catch (_) {
                warn("Playfab server query failed")
                if (this.lastSuccesfullQuery + (3600 * 1000) < Date.now()) {
                    critical("Could not connect for playfab for 1 hour, quitting")
                    warn("This will not stop the server processes, CHECK TASKMANAGER")
                    Deno.exit(1)
                }
            }
        }
        await timeout(1000, fetchData())
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
    }

    get(server:string):PlayfabServer | undefined {
        return this.serversData.find(s => server === s.Tags.gameId)
    }


    deregisterServer(IP: string) {
        this.serversData.filter(s => IP === s.Tags.gameId).forEach(async server => {
            await (
                await fetch("https://5EA1.playfabapi.com/Client/ExecuteCloudScript?sdk=" + skdVersion, {
                    method: "POST",
                    body: JSON.stringify({
                        FunctionName: "deregisterDedicatedServer",
                        FunctionParameter: { lobbyId: server.LobbyID },
                        GeneratePlayStreamEvent: true
                    }),
                    headers: this.headers,
                })
            ).json();
        })
        // don't include this server for 4 requests
        this.deregisteredServers[IP] = 4
    }


    async heartbeatServer(serverData: PlayfabServer) {
        await (
            await fetch("https://5EA1.playfabapi.com/Client/ExecuteCloudScript?sdk=" + skdVersion, {
                method: "POST",
                body: JSON.stringify({
                    FunctionName: "heartbeatDedicatedServer",
                    FunctionParameter: {
                        serverName: serverData.Tags.serverName,
                        buildVersion: serverData.Tags.gameBuild,
                        gameMode: serverData.Tags.category,
                        ipAddress: serverData.ServerIPV4Address,
                        port: serverData.ServerPort,
                        matchmakerBuild: serverData.BuildVersion,
                        maxPlayers: serverData.Tags.maxPlayers,
                        numPlayers: serverData.PlayerUserIds.length.toString(),
                        lobbyId: serverData.LobbyID,
                        publicSigningKey: serverData.Tags.publicSigningKey,
                        requiresPassword: serverData.Tags.requiresPassword
                    },
                    GeneratePlayStreamEvent: true
                }),
                headers: this.headers,
            })
        ).json();
    }
}

function timeout(ms: number, promise:Promise<unknown>) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('TIMEOUT'))
        }, ms)

        promise
            .then(value => {
                clearTimeout(timer)
                resolve(value)
            })
            .catch(reason => {
                clearTimeout(timer)
                reject(reason)
            })
    })
}
