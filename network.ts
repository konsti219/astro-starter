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

async function waitForSocket(socket: Deno.DatagramConn) {
    try {
        for await (const _ of socket) {
            return
        }
    } catch(_) {_}
}

export function checkNetwork(url: string) {
    return new Promise<boolean>((res, _) => {
        const hostname = url.split(":")[0]
        const port = parseInt(url.split(":")[1])

        const socket = Deno.listenDatagram({
            port: 0,
            transport: "udp",
            hostname: "0.0.0.0"
        })

        try {
            socket.send(new Uint8Array(data), { transport: "udp", port, hostname });

            const timeout = setTimeout(() => {
                socket.close()
                res(false)
            }, 1000)

            waitForSocket(socket).then(() => {
                clearTimeout(timeout)
                try {
                    socket.close()
                } catch(_) {_}
                res(true)
            })
            
        } catch (_) {
            try {
                socket.close()
            } catch(_) {_}
            res(false)
        }
    })
}
