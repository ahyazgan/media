import "./loadEnv.ts";
import { createDb } from "./client.ts";

if (!process.env.DATABASE_URL) console.warn("[db] UYARI: DATABASE_URL yok → bellek içi veritabanı; hiçbir şey kalıcı yazılmaz");
const handle = await createDb();
console.log(`[db] migrating (${handle.dialect}) ...`);
await handle.migrate();
console.log("[db] migrations applied");
await handle.close();
