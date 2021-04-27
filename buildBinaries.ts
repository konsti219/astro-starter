/*
    This is a build script
    It is not indented to be runas part of the main program
*/

const targets = [
    "x86_64-unknown-linux-gnu",
    "x86_64-pc-windows-msvc"
]
console.log(`Building for targets ${targets}`)


// #region DEAL WITH STATIC FILES
// move static file content into .ts file to be included in binaries
const staticFiles = Array.from(Deno.readDirSync("./static")).filter(entry => entry.isFile && entry.name !== "static.ts")

// rename dev static.ts
Deno.renameSync("./static/static.ts", "./static/static_.ts")

const encoder = new TextEncoder
staticFiles.forEach(file => {
    // this turns the static files into code in static.ts
    console.log(`Converting file ${file.name}`)

    // read file
    let fileContent = Deno.readTextFileSync(`./static/${file.name}`)
    // mark out special charachters
    fileContent = fileContent.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("$", "\\$")

    // generate code
    const content = `export const ${file.name.split("").filter(char => char !== ".").join("")} = \`${fileContent}\`\n`

    // append to static.ts
    Deno.writeFileSync("./static/static.ts", encoder.encode(content), { create: true, append: true })
})
// #endregion

// #region COMPILE
for (const target of targets) {
    const proc = Deno.run({
        cmd: [
            "deno",
            "compile",
            "--unstable", "--lite", "-A",
            `--target=${target}`,
            "index.ts"
        ],
        stdout: "inherit",
        stdin: "inherit",
        stderr: "inherit"
    })
    await proc.status()
}
// #endregion

// #region CLEANUP
Deno.removeSync("./static/static.ts")
Deno.renameSync("./static/static_.ts", "./static/static.ts")
// #endregion

console.log("DONE")
