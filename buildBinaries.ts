/*
    This is a build script
    It is not indented to be runas part of the main program
*/
import { base64 } from "./deps.ts";

const targets = [
    "x86_64-unknown-linux-gnu",
    "x86_64-pc-windows-msvc"
]
console.log(`Building for targets ${targets}`)


// #region DEAL WITH STATIC FILES
// move static file content into .ts file to be included in binaries

// get files
const staticFiles = Array.from(Deno.readDirSync("./static")).filter(entry => entry.isFile && entry.name !== "static.ts")

// rename dev static.ts
Deno.renameSync("./static/static.ts", "./static/static_.ts")

const encoder = new TextEncoder

// import base64 lib for generated file
Deno.writeFileSync("./static/static.ts", encoder.encode(`import { base64 } from "./../deps.ts";\nconst decoder = new TextDecoder()\n`), { create: true, append: true })

staticFiles.forEach(file => {
    // this turns the static files into code in static.ts
    console.log(`Converting file ${file.name}`)

    // read file
    const fileContent = base64.fromUint8Array(Deno.readFileSync(`./static/${file.name}`))
    // generate code
    const varname = file.name.split("").filter(char => char !== ".").join("")
    const content = `export const ${varname} = decoder.decode(base64.toUint8Array(\`${fileContent}\`))\n`

    // append to static.ts
    Deno.writeTextFileSync("./static/static.ts", content, { append: true })
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
//Deno.removeSync("./static/static.ts")
//Deno.renameSync("./static/static_.ts", "./static/static.ts")
// #endregion

console.log("DONE")
