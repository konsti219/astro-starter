// this is to have the file included in the build

export const indexContent = /*html*/`
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Astro Starter</title>

        <style>
            body {
                font-family: Arial, Helvetica, sans-serif;
            }
        </style>
    </head>
    <body>
        <h3>Starter</h3>

        <button id="btnShutdown">Shutdown</button>
    </body>
    <script>
        document
            .querySelector("#btnShutdown")
            .addEventListener("click", async (_) => {
                await fetch("/api/shutdown", {
                    method: "POST",
                    body: "",
                });
            });
    </script>
</html>`
