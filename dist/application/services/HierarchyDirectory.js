const DEFAULT_TTL_MS = 5 * 60 * 1000;
function ensureArray(candidate, property) {
    if (property && candidate && typeof candidate === "object") {
        const nested = candidate[property];
        if (Array.isArray(nested)) {
            return nested;
        }
    }
    if (Array.isArray(candidate)) {
        return candidate;
    }
    return [];
}
function buildMetadata(entry, ttlMs) {
    const now = Date.now();
    const ageMs = now - entry.fetchedAt;
    return {
        scope: entry.scope,
        key: entry.key,
        context: entry.context,
        lastFetched: new Date(entry.fetchedAt).toISOString(),
        ageMs,
        expiresAt: new Date(entry.expiresAt).toISOString(),
        ttlMs,
        stale: ageMs > ttlMs,
        totalItems: entry.items.length
    };
}
export class HierarchyDirectory {
    sessionCache;
    teamId;
    workspaces;
    spaces = new Map();
    folders = new Map();
    lists = new Map();
    ttlMs;
    loaded = false;
    constructor(ttlMs = DEFAULT_TTL_MS, sessionCache, teamId) {
        this.sessionCache = sessionCache;
        this.teamId = teamId;
        this.ttlMs = ttlMs ?? DEFAULT_TTL_MS;
    }
    toCacheEntry(scope, key, cached) {
        const expiresAt = cached.fetchedAt + this.ttlMs;
        if (this.ttlMs <= 0 || Date.now() > expiresAt) {
            return undefined;
        }
        return {
            scope,
            key,
            items: [...cached.items],
            fetchedAt: cached.fetchedAt,
            expiresAt,
            context: cached.context
        };
    }
    async loadIfNeeded() {
        if (this.loaded || !this.sessionCache || !this.teamId) {
            return;
        }
        const cached = await this.sessionCache.getHierarchy(this.teamId);
        this.loaded = true;
        if (!cached) {
            return;
        }
        if (cached.workspaces) {
            this.workspaces = this.toCacheEntry("workspaces", "workspaces", cached.workspaces);
        }
        this.restoreMapEntries(this.spaces, "spaces", cached.spaces);
        this.restoreMapEntries(this.folders, "folders", cached.folders);
        this.restoreMapEntries(this.lists, "lists", cached.lists);
    }
    restoreMapEntries(target, scope, entries) {
        if (!entries) {
            return;
        }
        for (const [key, cached] of Object.entries(entries)) {
            const entry = this.toCacheEntry(scope, key, cached);
            if (entry) {
                target.set(key, entry);
            }
        }
    }
    purgeExpired() {
        const now = Date.now();
        if (this.workspaces && now > this.workspaces.expiresAt) {
            this.workspaces = undefined;
        }
        for (const [key, entry] of this.spaces.entries()) {
            if (now > entry.expiresAt) {
                this.spaces.delete(key);
            }
        }
        for (const [key, entry] of this.folders.entries()) {
            if (now > entry.expiresAt) {
                this.folders.delete(key);
            }
        }
        for (const [key, entry] of this.lists.entries()) {
            if (now > entry.expiresAt) {
                this.lists.delete(key);
            }
        }
    }
    toCachedHierarchyEntry(entry) {
        return {
            items: [...entry.items],
            fetchedAt: entry.fetchedAt,
            context: entry.context
        };
    }
    async persist() {
        this.purgeExpired();
        if (!this.sessionCache || !this.teamId || this.ttlMs <= 0) {
            return;
        }
        const hierarchy = {
            spaces: {},
            folders: {},
            lists: {}
        };
        if (this.workspaces) {
            hierarchy.workspaces = this.toCachedHierarchyEntry(this.workspaces);
        }
        for (const [key, entry] of this.spaces.entries()) {
            hierarchy.spaces[key] = this.toCachedHierarchyEntry(entry);
        }
        for (const [key, entry] of this.folders.entries()) {
            hierarchy.folders[key] = this.toCachedHierarchyEntry(entry);
        }
        for (const [key, entry] of this.lists.entries()) {
            hierarchy.lists[key] = this.toCachedHierarchyEntry(entry);
        }
        await this.sessionCache.setHierarchy(this.teamId, hierarchy);
    }
    async ensureWorkspaces(fetchWorkspaces, options = {}) {
        await this.loadIfNeeded();
        this.purgeExpired();
        const now = Date.now();
        const expired = this.workspaces ? now > this.workspaces.expiresAt : true;
        if (!this.workspaces || expired || options.forceRefresh) {
            const response = await fetchWorkspaces();
            const workspaces = ensureArray(response, "teams");
            this.workspaces = {
                scope: "workspaces",
                key: "workspaces",
                items: workspaces,
                fetchedAt: now,
                expiresAt: now + this.ttlMs
            };
        }
        await this.persist();
        return {
            items: this.workspaces.items,
            cache: buildMetadata(this.workspaces, this.ttlMs)
        };
    }
    async ensureSpaces(workspaceId, fetchSpaces, options = {}) {
        await this.loadIfNeeded();
        this.purgeExpired();
        const key = workspaceId;
        const existing = this.spaces.get(key);
        const now = Date.now();
        const expired = existing ? now > existing.expiresAt : true;
        if (!existing || expired || options.forceRefresh) {
            const response = await fetchSpaces();
            const spaces = ensureArray(response, "spaces");
            const entry = {
                scope: "spaces",
                key,
                items: spaces,
                fetchedAt: now,
                expiresAt: now + this.ttlMs,
                context: { workspaceId }
            };
            this.spaces.set(key, entry);
            return {
                items: entry.items,
                cache: buildMetadata(entry, this.ttlMs)
            };
        }
        await this.persist();
        return {
            items: existing.items,
            cache: buildMetadata(existing, this.ttlMs)
        };
    }
    async ensureFolders(spaceId, fetchFolders, options = {}) {
        await this.loadIfNeeded();
        this.purgeExpired();
        const key = spaceId;
        const existing = this.folders.get(key);
        const now = Date.now();
        const expired = existing ? now > existing.expiresAt : true;
        if (!existing || expired || options.forceRefresh) {
            const response = await fetchFolders();
            const folders = ensureArray(response, "folders");
            const entry = {
                scope: "folders",
                key,
                items: folders,
                fetchedAt: now,
                expiresAt: now + this.ttlMs,
                context: { spaceId }
            };
            this.folders.set(key, entry);
            return {
                items: entry.items,
                cache: buildMetadata(entry, this.ttlMs)
            };
        }
        await this.persist();
        return {
            items: existing.items,
            cache: buildMetadata(existing, this.ttlMs)
        };
    }
    async ensureLists(spaceId, folderId, fetchLists, options = {}) {
        await this.loadIfNeeded();
        this.purgeExpired();
        const key = folderId ? `folder:${folderId}` : `space:${spaceId ?? ""}`;
        const existing = this.lists.get(key);
        const now = Date.now();
        const expired = existing ? now > existing.expiresAt : true;
        if (!existing || expired || options.forceRefresh) {
            const response = await fetchLists();
            const lists = ensureArray(response, "lists");
            const entry = {
                scope: "lists",
                key,
                items: lists,
                fetchedAt: now,
                expiresAt: now + this.ttlMs,
                context: {
                    spaceId,
                    folderId
                }
            };
            this.lists.set(key, entry);
            return {
                items: entry.items,
                cache: buildMetadata(entry, this.ttlMs)
            };
        }
        await this.persist();
        return {
            items: existing.items,
            cache: buildMetadata(existing, this.ttlMs)
        };
    }
    async invalidateWorkspaces() {
        this.workspaces = undefined;
        await this.invalidateSpaces();
        await this.persist();
    }
    async invalidateSpaces(workspaceId) {
        if (!workspaceId) {
            this.spaces.clear();
            await this.invalidateFolders();
            await this.persist();
            return;
        }
        this.spaces.delete(workspaceId);
        await this.persist();
    }
    async invalidateFolders(spaceId) {
        if (!spaceId) {
            this.folders.clear();
            await this.invalidateLists();
            await this.persist();
            return;
        }
        for (const [key, entry] of this.folders.entries()) {
            if (entry.context?.spaceId === spaceId || key === spaceId) {
                this.folders.delete(key);
            }
        }
        await this.persist();
    }
    async invalidateListsForSpace(spaceId) {
        for (const [key, entry] of this.lists.entries()) {
            if (entry.context?.spaceId === spaceId || key === `space:${spaceId}`) {
                this.lists.delete(key);
            }
        }
        await this.persist();
    }
    async invalidateListsForFolder(folderId) {
        for (const [key, entry] of this.lists.entries()) {
            if (entry.context?.folderId === folderId || key === `folder:${folderId}`) {
                this.lists.delete(key);
            }
        }
        await this.persist();
    }
    async invalidateLists() {
        this.lists.clear();
        await this.persist();
    }
}
