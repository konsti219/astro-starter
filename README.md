# astro-starter

Astro Launcher alternative written in Typescript/Deno

## About

Easily setup and host astroneer servers. Mange your servers in a webinterface at `localhost:5000`

This tool offers many advantages over AstroLauncher, these include:

-   Server files are automatically downloaded
-   All setup can be done in a single config file
-   Easily host multiple servers
-   You can also use it to manage remote servers that have their RCON port opened (like gportal)

## Setup

1.  Download `astro-starter.exe` from the releases
2.  Put it in an empty folder
3.  Run it once, this will generate the default config file `starter.json` and `start.bat`
4.  Modify the config file by putting in your username in the owner field and choosing a server name and putting it in the name field
5.  Start the server by double clicking `start.bat`
6.  The server will now dowload all the files and start

Note: you still need to manually opne your firewall and setup port forwarding

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
-   Network check
    -   (firewall)
    -   (upnp)
    -   tests
