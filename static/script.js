// deno-lint-ignore-file

document.querySelector("#btnShutdown").addEventListener("click", async (_) => {
    await fetch("/api/shutdown", {
        method: "POST",
        body: "",
    });
});

setInterval(async () => {
    const data = await (await fetch("/api/servers")).json();
    console.log(data);
}, 2000);
