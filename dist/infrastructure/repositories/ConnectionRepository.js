import { pool } from "../db/index.js";
export class ConnectionRepository {
    async create(connection) {
        await pool.query(`INSERT INTO connections (id, name, config, encrypted_secrets, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`, [connection.id, connection.name, connection.config, connection.encryptedSecrets, connection.createdAt, connection.updatedAt]);
    }
    async getById(id) {
        const res = await pool.query(`SELECT * FROM connections WHERE id = $1`, [id]);
        if (res.rows.length === 0)
            return null;
        const row = res.rows[0];
        return {
            id: row.id,
            name: row.name,
            config: row.config,
            encryptedSecrets: row.encrypted_secrets,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
    async list() {
        const res = await pool.query(`SELECT * FROM connections ORDER BY created_at DESC`);
        return res.rows.map(row => ({
            id: row.id,
            name: row.name,
            config: row.config,
            encryptedSecrets: row.encrypted_secrets,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
    }
    async update(id, updates) {
        const fields = [];
        const values = [];
        let i = 1;
        if (updates.name) {
            fields.push(`name = $${i++}`);
            values.push(updates.name);
        }
        if (updates.config) {
            fields.push(`config = $${i++}`);
            values.push(updates.config);
        }
        if (updates.encryptedSecrets) {
            fields.push(`encrypted_secrets = $${i++}`);
            values.push(updates.encryptedSecrets);
        }
        if (fields.length === 0)
            return;
        fields.push(`updated_at = NOW()`);
        values.push(id);
        await pool.query(`UPDATE connections SET ${fields.join(", ")} WHERE id = $${i}`, values);
    }
    async delete(id) {
        await pool.query(`DELETE FROM connections WHERE id = $1`, [id]);
    }
}
