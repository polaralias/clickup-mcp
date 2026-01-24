import { pool } from "../db/index.js";
export class CacheRepository {
    async get(key) {
        const res = await pool.query(`SELECT value, expires_at FROM cache WHERE key = $1 AND expires_at > NOW()`, [key]);
        if (res.rows.length === 0)
            return null;
        return {
            value: res.rows[0].value,
            expiresAt: res.rows[0].expires_at
        };
    }
    async set(key, value, ttlMs) {
        const expiresAt = new Date(Date.now() + ttlMs);
        await pool.query(`INSERT INTO cache (key, value, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, expires_at = $3`, [key, value, expiresAt]);
    }
    async delete(key) {
        await pool.query(`DELETE FROM cache WHERE key = $1`, [key]);
    }
}
