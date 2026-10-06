import pg from "pg";
import "dotenv/config";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
for (const q of process.argv.slice(2)) { const r = await c.query(q); console.log(JSON.stringify(r.rows, null, 0).slice(0, 4000)); console.log("---"); }
await c.end();
