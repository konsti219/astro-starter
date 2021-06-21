Deno.env.set('RUST_BACKTRACE', 'full');

import { Starter } from "./Starter.ts"

const starter = new Starter(Deno.cwd())
await starter.start()
