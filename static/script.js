// deno-lint-ignore-file

const DateTime = luxon.DateTime;
let test = `\${}`;

// shutdown button
document.querySelector("#btnShutdown").addEventListener("click", async (_) => {
    await fetch("/api/shutdown", { method: "POST" });
});

let expanded = {};

const update = async () => {
    try {
        const data = await (await fetch("/api/servers")).json();
        //console.log(data);

        document.querySelector("#starterUptime").innerText = humanizeDuration(
            Date.now() - data.onlineSince,
            {
                largest: 2,
                round: true,
            }
        );

        const serversDiv = document.querySelector("#servers");
        serversDiv.innerHTML = "";

        data.servers.forEach((s) => {
            // server fieldset
            const field = document
                .querySelector("#server")
                .content.cloneNode(true);

            // server status
            if (s.status === "stopped") {
                field.querySelector(".serverStatus").innerText = "Stopped";
                field.querySelector(".serverStatus").classList.add("redText");
                //
            } else if (s.status === "starting") {
                field.querySelector(".serverStatus").innerText = "Starting...";
                field
                    .querySelector(".serverStatus")
                    .classList.add("yellowText");
                //
            } else if (s.status === "running") {
                field.querySelector(".serverStatus").innerText = "Running";
                field.querySelector(".serverStatus").classList.add("greenText");
                //
            } else if (s.status === "stopping") {
                field.querySelector(".serverStatus").innerText = "Stopping...";
                field
                    .querySelector(".serverStatus")
                    .classList.add("yellowText");
            }

            // server id
            field.querySelector(".id").innerText = s.id;

            // server name
            field.querySelector(".serverName").innerText = s.name;

            // server address
            field.querySelector(".serverAddr").innerText = s.serverAddr + " ";
            const a = document.createElement("a");
            a.addEventListener("click", () => copyText(s.serverAddr));
            a.innerText = "Copy";
            field.querySelector(".serverAddr").appendChild(a);

            // host type (local/remote)
            field.querySelector(".serverHost").innerText = s.serverType;

            // server type (Individual/Preferred)
            if (s.playfabData)
                field.querySelector(".serverType").innerText =
                    s.playfabData.Tags.category;

            // owner
            field.querySelector(".serverOwner").innerText = s.owner;

            // whitelist
            field.querySelector(".serverHasWhitelist").innerText =
                s.stats.isEnforcingWhitelist;

            // password
            field.querySelector(".serverHasPassword").innerText =
                s.stats.hasServerPassword;

            // game build
            field.querySelector(".serverBuild").innerText = s.stats.build;

            // player counts
            field.querySelector(
                ".serverPlayerCount"
            ).innerText = `Players (${s.stats.playersInGame}/${s.stats.maxInGamePlayers})`;

            // players
            s.players
                .filter((s) => s.inGame)
                .concat(s.players.filter((s) => !s.inGame))
                .forEach((p) => {
                    const row = document
                        .querySelector("#playerRow")
                        .content.cloneNode(true);

                    const tableDivs = row.querySelectorAll(".listingData");

                    // columns head
                    // name
                    tableDivs[0].textContent =
                        p.name == "" ? "UNKNOWN" : p.name;
                    if (p.inGame) tableDivs[0].classList.add("green");
                    if (p.cached || p.name == "")
                        tableDivs[0].classList.add("italic");

                    // category
                    tableDivs[1].textContent = p.category;

                    // last online
                    if (Date.now() - p.lastSeen < 60000) {
                        tableDivs[2].textContent = "Just now";
                    } else if (p.lastSeen == 0) {
                        tableDivs[2].textContent = "Never";
                    } else {
                        tableDivs[2].textContent = timeAgo(
                            DateTime.fromMillis(p.lastSeen)
                        );
                    }

                    // listing body
                    // name, category
                    row.querySelector(".playerName").innerText =
                        p.name == "" ? "UNKNOWN" : p.name;
                    row.querySelector(".playerCategory").innerText = p.category;

                    // first join
                    row.querySelector(".playerFirstJoin").innerText =
                        p.firstJoin === 0
                            ? "Never"
                            : DateTime.fromMillis(p.firstJoin).toFormat(
                                  "yyyy-LL-dd HH:mm"
                              );
                    row.querySelector(".playerFirstJoinName").innerText =
                        p.firstJoinName == "" ? "UNKNOWN" : p.firstJoinName;

                    // online, online since
                    row.querySelector(".playerInGame").innerText = p.inGame;
                    row.querySelector(".playerOnlineSince").innerText =
                        p.onlineSince === 0
                            ? "not online"
                            : timeAgo(DateTime.fromMillis(p.onlineSince));
                    // last seen
                    row.querySelector(".playerLastSeen").innerText = p;
                    if (Date.now() - p.lastSeen < 60000) {
                        row.querySelector(".playerLastSeen").innerText =
                            "Just now";
                    } else if (p.lastSeen == 0) {
                        row.querySelector(".playerLastSeen").innerText =
                            "Never";
                    } else {
                        row.querySelector(
                            ".playerLastSeen"
                        ).innerText = timeAgo(DateTime.fromMillis(p.lastSeen));
                    }
                    // playtime
                    const curPlaytime =
                        p.onlineSince > 0 ? Date.now() - p.onlineSince : 0;
                    const playtime = p.prevPlaytime + curPlaytime;
                    row.querySelector(
                        ".playerPlaytime"
                    ).innerText = humanizeDuration(playtime, {
                        largest: 2,
                        round: true,
                    });

                    // cached
                    row.querySelector(".playerCached").innerText = p.cached;
                    // guid
                    row.querySelector(".playerGuid").innerText = p.guid;
                    // playfabid
                    row.querySelector(".playerPlayfabid").innerText =
                        p.playfabid;

                    // expand stuff
                    const columns = row.children[0].children[0];
                    // set tracking id
                    const id =
                        s.id + (p.guid != "" ? p.guid : p.name) + p.playfabid;
                    columns.setAttribute("data-expandgroup", id);

                    // add listener
                    columns.addEventListener("click", (e) => {
                        const id = e.target.parentElement.getAttribute(
                            "data-expandgroup"
                        );
                        const isExpanded = id in expanded;

                        e.target.parentElement.parentElement.children[1].style.display = isExpanded
                            ? "none"
                            : "block";

                        if (isExpanded) delete expanded[id];
                        else expanded[id] = true;
                    });
                    // check if already expanded
                    row.children[0].children[1].style.display =
                        id in expanded ? "block" : "none";

                    // buttons
                    row.querySelector(".btnKick").disabled =
                        !s.rconConnected || !p.inGame;
                    row.querySelector(".btnKick").addEventListener(
                        "click",
                        (e) =>
                            fetch(`/api/servers/${s.id}/kick`, {
                                method: "POST",
                                body: JSON.stringify({
                                    guid: p.guid,
                                }),
                            })
                    );
                    row.querySelector(".btnBan").disabled =
                        !s.rconConnected || p.category === "Blacklisted";
                    row.querySelector(".btnBan").addEventListener(
                        "click",
                        (e) =>
                            fetch(`/api/servers/${s.id}/setcategory`, {
                                method: "POST",
                                body: JSON.stringify({
                                    guid: p.guid,
                                    category: "Blacklisted",
                                }),
                            })
                    );
                    row.querySelector(".btnWhitelist").disabled =
                        !s.rconConnected || p.category === "Whitelisted";
                    row.querySelector(".btnWhitelist").addEventListener(
                        "click",
                        (e) =>
                            fetch(`/api/servers/${s.id}/setcategory`, {
                                method: "POST",
                                body: JSON.stringify({
                                    guid: p.guid,
                                    category: "Whitelisted",
                                }),
                            })
                    );
                    row.querySelector(".btnReset").disabled =
                        !s.rconConnected || p.category === "Unlisted";
                    row.querySelector(".btnReset").addEventListener(
                        "click",
                        (e) =>
                            fetch(`/api/servers/${s.id}/setcategory`, {
                                method: "POST",
                                body: JSON.stringify({
                                    guid: p.guid,
                                    category: "Unlisted",
                                }),
                            })
                    );

                    field.querySelector(".playerListing").appendChild(row);
                });

            // saves
            s.saves.forEach((save) => {
                const row = document
                    .querySelector("#saveRow")
                    .content.cloneNode(true);

                const tableDivs = row.querySelectorAll(".listingData");

                // columns head
                // name
                tableDivs[0].textContent = save.name;
                if (save.name == s.stats.saveGameName)
                    tableDivs[0].classList.add("green");
                // date
                tableDivs[1].textContent = save.date;
                // creative
                tableDivs[2].textContent =
                    save.bHasBeenFlaggedAsCreativeModeSave;

                // listing body
                row.querySelector(".saveName").innerText = save.name;
                row.querySelector(".saveDate").innerText = save.date;
                row.querySelector(".saveCreative").innerText =
                    save.bHasBeenFlaggedAsCreativeModeSave;

                // expand stuff
                const columns = row.children[0].children[0];
                // set tracking id
                const id = s.id + save.name;
                columns.setAttribute("data-expandgroup", id);

                // add listener
                columns.addEventListener("click", (e) => {
                    const id = e.target.parentElement.getAttribute(
                        "data-expandgroup"
                    );
                    const isExpanded = id in expanded;

                    e.target.parentElement.parentElement.children[1].style.display = isExpanded
                        ? "none"
                        : "block";

                    if (isExpanded) delete expanded[id];
                    else expanded[id] = true;
                });
                // check if already expanded
                row.children[0].children[1].style.display =
                    id in expanded ? "block" : "none";

                // load button
                row.querySelector(".btnLoad").addEventListener("click", (e) =>
                    fetch(`/api/servers/${s.id}/gameload`, {
                        method: "POST",
                        body: JSON.stringify({
                            name: save.name,
                        }),
                    })
                );

                field.querySelector(".saveListing").appendChild(row);
            });

            // save buttons
            field.querySelector(".btnSaveGame").addEventListener("click", (e) =>
                fetch(`/api/servers/${s.id}/gamesave`, {
                    method: "POST",
                })
            );
            field.querySelector(".btnNewGame").addEventListener("click", (e) =>
                fetch(`/api/servers/${s.id}/gamenew`, {
                    method: "POST",
                    body: JSON.stringify({
                        name: prompt("Enter New Save Name:").toUpperCase(),
                    }),
                })
            );

            // action buttons
            field
                .querySelector(".btnStop")
                .addEventListener("click", async (_) => {
                    await fetch(`/api/servers/${s.id}/stop`, {
                        method: "POST",
                    });
                });
            field
                .querySelector(".btnStart")
                .addEventListener("click", async (_) => {
                    await fetch(`/api/servers/${s.id}/start`, {
                        method: "POST",
                    });
                });
            field
                .querySelector(".btnRestart")
                .addEventListener("click", async (_) => {
                    await fetch(`/api/servers/${s.id}/restart`, {
                        method: "POST",
                    });
                });

            if (s.status === "stopped") {
                field.querySelector(".btnStop").style.display = "none";
                //
            } else if (s.status === "starting") {
                field.querySelector(".btnStart").style.display = "none";
                field.querySelector(".btnStop").disabled = true;
                field.querySelector(".btnRestart").disabled = true;
                //
            } else if (s.status === "running") {
                field.querySelector(".btnStart").style.display = "none";
                //
            } else if (s.status === "stopping") {
                field.querySelector(".btnStop").style.display = "none";
                field.querySelector(".btnStart").disabled = true;
                field.querySelector(".btnRestart").disabled = true;
            }

            //console.log(s);
            /*
            playfabData: {Region: "USEast", LobbyID: "512496370981876417", BuildVersion: "8", GameMode: "CoopStandard", PlayerUserIds: Array(0), …}
            stats: {build: "1.18.68.0", ownerName: "Konsti219", maxInGamePlayers: 8, playersInGame: 0, playersKnownToGame: 0, …}
            */

            serversDiv.appendChild(field);
        });

        document.querySelector("#isDisconnected").style.display = "none";
    } catch (e) {
        console.error(e);
        document.querySelector("#isDisconnected").style.display = "block";
    }
};
setInterval(update, 2000);
update();

// "x minutes ago" calculator
const units = ["year", "month", "week", "day", "hour", "minute", "second"];
const timeAgo = (date) => {
    let dateTime = DateTime.fromISO(date);
    const diff = dateTime.diffNow().shiftTo(...units);
    const unit = units.find((unit) => diff.get(unit) !== 0) || "second";

    const relativeFormatter = new Intl.RelativeTimeFormat("en", {
        numeric: "auto",
    });
    return relativeFormatter.format(Math.trunc(diff.as(unit)), unit);
};

// copy to clipboard on http
const copyText = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
};
