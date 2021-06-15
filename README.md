# astro-starter

A tool to help you host and manage Astroneer dedicated servers written in Typescript/Deno

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
-   [How to set up RCON management for a Gportal server](https://github.com/konsti219/astro-starter/wiki/How-to-set-up-RCON-management-for-a-Gportal-server)
-   [How to add Discord integration](https://github.com/konsti219/astro-starter/wiki/How-to-add-Discord-integration)

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
            "serverPassword": "my password (leave empty for no password)",
            "whitelist": false,
            "maxPlayers": 8,
            "afkTimeout": 1800,
            "saveInterval": 900,
            "backupSaves": true,
            "backupInterval": 3600,
            "enableAstrochatIntegration": false,
            "customHeartbeat": true,
            "discordWebhook": "<webhook url>",
            "restartAt": "06:00",
            "makeBackupSaveAt": "06:00",
            "backupIntervalHours": 24,
            "restoreSaveName": ""
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

Docs:

-   [Configuration file - starter.json](https://github.com/konsti219/astro-starter/wiki/Configuration-file---starter.json)

## Linux

Currently the Astroneer dedicated server software is not available for linux and wine is not able to run it either.
Astro-starter does provide native linux builds that can be used for remote server management. Also if wine should at support astro-starter should be able to support it.

## run (development)

Tested with deno 1.10.2

```
deno run -A --unstable index.ts
```

## compile

To build binaries for windows and linux just run the following command to run the build script that takes care of static files.

```
deno run -A --unstable buildBinaries.ts
```

## TODO

-   Manage backups
-   Network check
    -   (firewall)
    -   (upnp)
