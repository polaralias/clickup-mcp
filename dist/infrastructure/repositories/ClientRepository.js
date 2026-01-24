import { pool } from "../db/index.js";
export class ClientRepository {
    async create(client) {
        await pool.query("INSERT INTO clients (client_id, client_name, redirect_uris, token_endpoint_auth_method) VALUES ($1, $2, $3, $4)", [
            client.clientId,
            client.clientName,
            JSON.stringify(client.redirectUris),
            client.tokenEndpointAuthMethod
        ]);
    }
    async get(clientId) {
        const res = await pool.query("SELECT * FROM clients WHERE client_id = $1", [clientId]);
        if (res.rows.length === 0)
            return null;
        const row = res.rows[0];
        return {
            clientId: row.client_id,
            clientName: row.client_name,
            redirectUris: row.redirect_uris,
            tokenEndpointAuthMethod: row.token_endpoint_auth_method,
            createdAt: row.created_at
        };
    }
    async delete(clientId) {
        await pool.query("DELETE FROM clients WHERE client_id = $1", [clientId]);
    }
}
