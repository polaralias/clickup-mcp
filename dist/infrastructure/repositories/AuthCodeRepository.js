import { pool } from "../db/index.js";
export class AuthCodeRepository {
    async create(authCode) {
        await pool.query("INSERT INTO auth_codes (code, connection_id, expires_at, redirect_uri, code_challenge, code_challenge_method, client_id) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
            authCode.code,
            authCode.connectionId,
            authCode.expiresAt,
            authCode.redirectUri,
            authCode.codeChallenge,
            authCode.codeChallengeMethod,
            authCode.clientId
        ]);
    }
    async get(code) {
        const res = await pool.query("SELECT * FROM auth_codes WHERE code = $1", [code]);
        if (res.rows.length === 0)
            return null;
        const row = res.rows[0];
        return {
            code: row.code,
            connectionId: row.connection_id,
            expiresAt: row.expires_at,
            redirectUri: row.redirect_uri,
            codeChallenge: row.code_challenge,
            codeChallengeMethod: row.code_challenge_method,
            clientId: row.client_id
        };
    }
    async delete(code) {
        await pool.query("DELETE FROM auth_codes WHERE code = $1", [code]);
    }
}
