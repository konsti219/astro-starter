export const defaultConfig = {
    "webserverPort": 5000,
    "owner": "your name",
    "servers": [
        {
            "id": "server1",
            "type": "local",
            "name": "Server 1",
            "IP": "_public",
            "port": 8777,
            "consolePort": "_auto",
            "consolePassword": "_random",
            "serverPassword": "",
            "whitelist": false,
            "maxPlayers": 8,
            "afkTimeout": 0,
            "saveInterval": 900,
            "backupSaves": true,
            "backupInterval": 3600,
            "enableAstrochatIntegration": false,
            "customHeartbeat": true,
            "discordWebhook": "",
            "restartAt": "06:00",
            "makeBackupSaveAt": "06:00",
            "backupIntervalHours": 24,
            "restoreSaveName": ""
        }
    ]
}
