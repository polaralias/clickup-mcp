const DEFAULT_TTL_MS = 5 * 60 * 1000;
export class SessionCache {
    hierarchyTtlMs;
    spaceConfigTtlMs;
    hierarchyEntries = new Map();
    spaceConfigEntries = new Map();
    constructor(hierarchyTtlMs = DEFAULT_TTL_MS, spaceConfigTtlMs = DEFAULT_TTL_MS) {
        this.hierarchyTtlMs = hierarchyTtlMs;
        this.spaceConfigTtlMs = spaceConfigTtlMs;
    }
    async getHierarchy(teamId) {
        const entry = this.hierarchyEntries.get(teamId);
        if (!entry) {
            return null;
        }
        if (this.isExpired(entry.storedAt, this.hierarchyTtlMs)) {
            this.hierarchyEntries.delete(teamId);
            return null;
        }
        return entry.value;
    }
    async setHierarchy(teamId, hierarchy) {
        if (this.hierarchyTtlMs <= 0) {
            return;
        }
        const storedAt = this.resolveHierarchyTimestamp(hierarchy);
        this.hierarchyEntries.set(teamId, { value: hierarchy, storedAt });
    }
    async invalidateHierarchy(teamId) {
        this.hierarchyEntries.delete(teamId);
    }
    async getSpaceConfig(teamId) {
        const entry = this.spaceConfigEntries.get(teamId);
        if (!entry) {
            return null;
        }
        if (this.isExpired(entry.storedAt, this.spaceConfigTtlMs)) {
            this.spaceConfigEntries.delete(teamId);
            return null;
        }
        return entry.value;
    }
    async setSpaceConfig(teamId, config) {
        if (this.spaceConfigTtlMs <= 0) {
            return;
        }
        const storedAt = this.resolveSpaceConfigTimestamp(config);
        this.spaceConfigEntries.set(teamId, { value: config, storedAt });
    }
    async invalidateSpaceConfig(teamId) {
        this.spaceConfigEntries.delete(teamId);
    }
    isExpired(storedAt, ttlMs) {
        if (ttlMs <= 0) {
            return true;
        }
        return Date.now() - storedAt > ttlMs;
    }
    resolveHierarchyTimestamp(hierarchy) {
        const timestamps = [];
        if (hierarchy.workspaces) {
            timestamps.push(hierarchy.workspaces.fetchedAt);
        }
        for (const entry of Object.values(hierarchy.spaces ?? {})) {
            timestamps.push(entry.fetchedAt);
        }
        for (const entry of Object.values(hierarchy.folders ?? {})) {
            timestamps.push(entry.fetchedAt);
        }
        for (const entry of Object.values(hierarchy.lists ?? {})) {
            timestamps.push(entry.fetchedAt);
        }
        return timestamps.length ? Math.min(...timestamps) : Date.now();
    }
    resolveSpaceConfigTimestamp(config) {
        const timestamps = Object.values(config.tagsBySpaceId).map((entry) => entry.fetchedAt);
        return timestamps.length ? Math.min(...timestamps) : Date.now();
    }
}
