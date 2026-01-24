import { randomUUID } from "node:crypto";
export class ConnectionManager {
    repo;
    encryption;
    constructor(repo, encryption) {
        this.repo = repo;
        this.encryption = encryption;
    }
    async create(input) {
        const { apiKey, ...publicConfig } = input.config;
        if (!apiKey)
            throw new Error("apiKey is required");
        const encryptedSecrets = this.encryption.encrypt(JSON.stringify({ apiKey }));
        const connection = {
            id: randomUUID(),
            name: input.name,
            config: publicConfig,
            encryptedSecrets,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        await this.repo.create(connection);
        return connection;
    }
    async get(id) {
        return this.repo.getById(id);
    }
    async list() {
        return this.repo.list();
    }
    async delete(id) {
        await this.repo.delete(id);
    }
    async getSecrets(connection) {
        const decrypted = this.encryption.decrypt(connection.encryptedSecrets);
        return JSON.parse(decrypted);
    }
}
