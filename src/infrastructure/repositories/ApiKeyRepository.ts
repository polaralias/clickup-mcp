import { pool } from "../db/index.js"
import { randomUUID } from "crypto"

export interface ApiKey {
    id: string
    user_config_id: string
    key_hash: string
    revoked_at?: Date
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
        // Write-throttling could be implemented here or in the caller
        // For now, simple update
        await pool.query(
            `UPDATE api_keys SET last_used_at = NOW(), last_used_ip = $2 WHERE id = $1`,
            [id, ip]
        )
    }
}
