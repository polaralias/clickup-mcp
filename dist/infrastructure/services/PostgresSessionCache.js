import { SessionCache } from "../../application/services/SessionCache.js";
export class PostgresSessionCache extends SessionCache {
    repo;
    constructor(repo, hierarchyTtlMs, spaceConfigTtlMs) {
        super(hierarchyTtlMs, spaceConfigTtlMs);
        this.repo = repo;
    }
    async getHierarchy(teamId) {
        const key = `hierarchy:${teamId}`;
        const result = await this.repo.get(key);
        if (!result)
            return null;
        return result.value;
    }
    async setHierarchy(teamId, hierarchy) {
        const key = `hierarchy:${teamId}`;
        await this.repo.set(key, hierarchy, this.hierarchyTtlMs);
    }
    async invalidateHierarchy(teamId) {
        await this.repo.delete(`hierarchy:${teamId}`);
    }
    async getSpaceConfig(teamId) {
        const key = `spaceConfig:${teamId}`;
        const result = await this.repo.get(key);
        if (!result)
            return null;
        return result.value;
    }
    async setSpaceConfig(teamId, config) {
        const key = `spaceConfig:${teamId}`;
        await this.repo.set(key, config, this.spaceConfigTtlMs);
    }
    async invalidateSpaceConfig(teamId) {
        await this.repo.delete(`spaceConfig:${teamId}`);
    }
}
