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
            "enableAstrochatIntegration": false
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

```
deno compile -A --unstable --lite index.ts
```

## TODO

-   Keep track of players
-   Manage backups
-   Webinterface
-   better Playfab unregister
-   playfab heartbeat
