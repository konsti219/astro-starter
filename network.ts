const data = [
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x08,
]

export async function checkNetworkUnsafe(url: string) {
    try {
        const hostname = url.split(":")[0]
        const port = parseInt(url.split(":")[1])

        const socket = await Deno.listenDatagram({
            port: 0,
            transport: "udp",
            hostname: "0.0.0.0"
        });
    
        try {
            socket.send(new Uint8Array(data), { transport: "udp", port, hostname });
            const timeout = setTimeout(() => {
                throw ""
            }, 1000)

            for await (const _ of socket) {
                socket.close()
                clearTimeout(timeout)
                return true
            }
        } catch (_) {
            socket.close()
            return false
        }
    } catch (e) {
        console.error(e)
        return false
    }
}

export function checkNetwork(url: string) {
    return new Promise<boolean>((res, _) => {
        checkNetworkUnsafe(url).then((v) => {
            if (v) res(true)
            else res(false)
        }).catch((_) => {
            res(false)
        })
    })
}
/*
try {
    console.log(await checkNetwork("172.107.179.214:38100"))
    console.log(await checkNetwork("123.456.789.012:1234"))
} catch (e) {
    //
}
console.log("finish")*/
