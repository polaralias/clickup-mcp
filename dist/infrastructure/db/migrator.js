import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { pool } from "./index.js";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
export async function runMigrations() {
    const schemaPath = join(__dirname, "schema.sql");
    const schemaSql = readFileSync(schemaPath, "utf-8");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(schemaSql);
        await client.query("COMMIT");
        console.log("Migrations applied successfully");
    }
    catch (err) {
        await client.query("ROLLBACK");
        console.error("Migration failed", err);
        throw err;
    }
    finally {
        client.release();
    }
}
