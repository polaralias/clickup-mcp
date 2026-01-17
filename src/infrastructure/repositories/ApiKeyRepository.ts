import { pool } from "../db/index.js"
import { randomUUID } from "crypto"

export interface ApiKey {
    id: string
    user_config_id: string
    key_hash: string
    revoked_at?: Date
    created_at: Date
    last_used_at?: Date
}

export class ApiKeyRepository {
    async create(data: { userConfigId: string, keyHash: string, name?: string, ip?: string }): Promise<ApiKey> {
        const id = randomUUID()
        const res = await pool.query(
            `INSERT INTO api_keys (id, user_config_id, key_hash, name, created_ip)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [id, data.userConfigId, data.keyHash, data.name, data.ip]
        )
        return res.rows[0]
    }

    async findByHash(keyHash: string): Promise<ApiKey | null> {
        const res = await pool.query(
            `SELECT * FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
            [keyHash]
        )
        return res.rows[0] || null
    }

    async recordUsage(id: string, ip?: string) {
        try {
            await pool.query(
                `UPDATE api_keys SET last_used_at = NOW(), last_used_ip = $2 WHERE id = $1`,
                [id, ip]
            )
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err)
            try {
                await pool.query(
                    `INSERT INTO api_key_usage_failures (id, api_key_id, last_used_ip, error)
           VALUES ($1, $2, $3, $4)`,
                    [randomUUID(), id, ip, errorMessage]
                )
            } catch (insertErr) {
                console.error(JSON.stringify({
                    event: "api_key_usage_record_failed",
                    timestamp: new Date().toISOString(),
                    api_key_id: id,
                    requester_ip: ip,
                    error: errorMessage,
                    insert_error: insertErr instanceof Error ? insertErr.message : String(insertErr)
                }))
            }
        }
    }

    async listAll(): Promise<(ApiKey & { name?: string, last_used_ip?: string })[]> {
        const res = await pool.query(
            `SELECT * FROM api_keys ORDER BY created_at DESC`
        )
        return res.rows
    }

    async revoke(id: string): Promise<void> {
        await pool.query(
            `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1`,
            [id]
        )
    }
}
