import { Colors } from "./deps.ts"

const info = (t:string) => {
    console.log(Colors.green("[INFO] ") + t)
}

const warn = (t:string) => {
    console.log(Colors.yellow("[WARN] ") + t)
}

const error = (t:string) => {
    console.log(Colors.red("[ERROR] ") + t)
}

export { info, warn, error }
