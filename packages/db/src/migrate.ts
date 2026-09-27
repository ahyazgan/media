import "dotenv/config";
import { createDb } from "./client.ts";

const handle = await createDb();
console.log(`[db] migrating (${handle.dialect}) ...`);
await handle.migrate();
console.log("[db] migrations applied");
await handle.close();
