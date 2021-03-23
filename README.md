# astro-starter

Astro Launcher ripoff written in Typescript/Deno

## config

starter.json

```json
{
    "webserverPort": 5000,
    "owner": "your name",
    "servers": [
        {
            "id": "server1",
            "type": "local",
            "name": "My local server",
            "IP": "_public",
            "port": 8777,
            "consolePort": "_auto",
            "consolePassword": "_random",
            "whitelist": false,
            "saveInterval": 900,
            "backupSaves": true,
            "backupInterval": 3600,
            "enableAstrochatIntegration": false,
            "customHeartbeat": true
        },
        {
            "id": "server2",
            "type": "remote",
            "name": "My remote server",
            "IP": "123.456.789.012",
            "port": 42069,
            "consolePort": 42070,
            "consolePassword": "theremotepassword",
            "whitelist": true,
            "enableAstrochatIntegration": true
        }
    ]
}
```

## run (development)

```
deno run -A --unstable index.ts
```

## compile

To build the .exe for a release you need to take the files in /static and upload them somewhere.
Then you need to replace the paths in web.ts

```
deno compile -A --unstable --lite index.ts
```

## TODO

-   Manage backups
-   Webinterface
-   Network check
    -   (firewall)
    -   (upnp)
    -   tests
-   automatic restarts
-   better logging
