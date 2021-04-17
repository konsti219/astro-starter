# astro-starter

Astro Launcher alternative written in Typescript/Deno

## About

Easily setup and host astroneer servers. Mange your servers in a webinterface at `localhost:5000`

This tool offers many advantages over AstroLauncher, these include:

-   Server files are automatically downloaded
-   All setup can be done in a single config file
-   Easily host multiple servers
-   You can also use it to manage remote servers that have their RCON port opened (like gportal)

## Guides

-   [How to set up a locally hosted server](https://github.com/konsti219/astro-starter/wiki/How-to-set-up-a-locally-hosted-server)
-   [How to set up a local server with playit.gg](https://github.com/konsti219/astro-starter/wiki/How-to-set-up-a-local-server-with-playit.gg)
-   How to set up RCON for a Gportal server

## Config

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
            "customHeartbeat": true,
            "discordWebhook": "<webhook url>",
            "restartAt": "03:00"
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
            "enableAstrochatIntegration": true,
            "noShutdown": true
        }
    ]
}
```

## Linux

Currently the Astroneer dedicated server software is not available for linux and wine is not able to run it either.
Astro-starter does provide native linux builds that can be used for remote server management. Also if wine should at support astro-starter should be able to support it.

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
-   Network check
    -   (firewall)
    -   (upnp)
