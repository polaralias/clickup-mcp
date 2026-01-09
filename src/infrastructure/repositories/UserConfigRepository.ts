import { pool } from "../db/index.js"
import { randomUUID } from "crypto"

export interface UserConfig {
    id: string
    server_id: string
    config_enc: string
    config_fingerprint?: string
    created_at: Date
}

export class UserConfigRepository {
    async create(data: { serverId: string, configEnc: string, fingerprint?: string }): Promise<UserConfig> {
        const id = randomUUID()
        const res = await pool.query(
            `INSERT INTO user_configs (id, server_id, config_enc, config_fingerprint)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
            [id, data.serverId, data.configEnc, data.fingerprint]
        )
        return res.rows[0]
    }

    async getById(id: string): Promise<UserConfig | null> {
        const res = await pool.query(`SELECT * FROM user_configs WHERE id = $1`, [id])
        return res.rows[0] || null
    }

    async listAll(): Promise<UserConfig[]> {
        const res = await pool.query(`SELECT * FROM user_configs ORDER BY created_at DESC`)
        return res.rows
    }
}
