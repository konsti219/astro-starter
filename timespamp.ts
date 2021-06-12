function year(now: Date) {
    return now.getFullYear()
}
function month(now: Date) {
    return zeroPad(now.getMonth() + 1)
}
function date(now: Date) {
    return zeroPad(now.getDate())
}
function hour(now: Date) {
    return zeroPad(now.getHours())
}
function minute(now: Date) {
    return zeroPad(now.getMinutes())
}
function second(now: Date) {
    return zeroPad(now.getSeconds())
}

function zeroPad(num: number) {
    if (num.toString().length === 1) {
        return "0" + num
    } else {
        return num.toString()
    }
}

export function getTimeStamp() {
    const now = new Date

    return `${year(now)}_${month(now)}_${date(now)}-${hour(now)}_${minute(now)}_${second(now)}`
}

export function getDate() {
    const now = new Date

    return `${year(now)}-${month(now)}-${date(now)}`
}