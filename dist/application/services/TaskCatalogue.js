const DEFAULT_LIST_TTL_MS = 60 * 1000;
const DEFAULT_SEARCH_TTL_MS = 2 * 60 * 1000;
const DEFAULT_MAX_LIST_ENTRIES = 50;
const DEFAULT_MAX_SEARCH_ENTRIES = 100;
const DEFAULT_MAX_TASK_RECORDS = 1000;
function normaliseFilters(filters) {
    return {
        includeClosed: Boolean(filters.includeClosed),
        includeSubtasks: Boolean(filters.includeSubtasks),
        includeTasksInMultipleLists: Boolean(filters.includeTasksInMultipleLists)
    };
}
function buildListKey(listId, filters, page) {
    const normalised = normaliseFilters(filters);
    return [
        "list",
        listId,
        normalised.includeClosed ? "closed:1" : "closed:0",
        normalised.includeSubtasks ? "subs:1" : "subs:0",
        normalised.includeTasksInMultipleLists ? "timl:1" : "timl:0",
        `page:${page}`
    ].join(":");
}
function serialiseValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => serialiseValue(item)).join(",");
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value)
            .filter(([, candidate]) => candidate !== undefined && candidate !== null)
            .sort(([a], [b]) => a.localeCompare(b));
        return entries.map(([key, candidate]) => `${key}:${serialiseValue(candidate)}`).join("|");
    }
    return String(value);
}
function buildSearchKey(teamId, params) {
    const entries = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${serialiseValue(value)}`)
        .sort();
    return ["search", teamId, ...entries].join("|");
}
function buildSignature(records) {
    const ids = records
        .map((record) => record.id)
        .filter((id) => typeof id === "string" && id.length > 0)
        .sort();
    if (ids.length === 0) {
        return undefined;
    }
    return ids.join("|");
}
function toTaskRecordFromList(task, listId, listName, listUrl) {
    return {
        ...task,
        listId: task.listId ?? listId,
        listName: task.listName ?? listName,
        listUrl: task.listUrl ?? listUrl
    };
}
export class TaskCatalogue {
    listCache = new Map();
    searchCache = new Map();
    contextCache = new Map();
    taskRecords = new Map();
    listTtlMs;
    searchTtlMs;
    maxListEntries;
    maxSearchEntries;
    maxTaskRecords;
    constructor(options = {}) {
        this.listTtlMs = options.listTtlMs ?? DEFAULT_LIST_TTL_MS;
        this.searchTtlMs = options.searchTtlMs ?? DEFAULT_SEARCH_TTL_MS;
        this.maxListEntries = options.maxListEntries ?? DEFAULT_MAX_LIST_ENTRIES;
        this.maxSearchEntries = options.maxSearchEntries ?? DEFAULT_MAX_SEARCH_ENTRIES;
        this.maxTaskRecords = options.maxTaskRecords ?? DEFAULT_MAX_TASK_RECORDS;
    }
    getListPage(listId, filters, page) {
        const key = buildListKey(listId, filters, page);
        const cached = this.listCache.get(key);
        if (!cached) {
            return undefined;
        }
        if (cached.expiresAt <= Date.now()) {
            this.listCache.delete(key);
            return undefined;
        }
        return cached;
    }
    storeListPage(options) {
        const key = buildListKey(options.listId, options.filters, options.page);
        const now = Date.now();
        const entry = {
            listId: options.listId,
            filters: normaliseFilters(options.filters),
            page: options.page,
            tasks: options.tasks.map((task) => toTaskRecordFromList(task, options.listId, options.listName, options.listUrl)),
            items: options.items,
            total: options.total,
            listName: options.listName,
            listUrl: options.listUrl,
            fetchedAt: now,
            expiresAt: now + this.listTtlMs
        };
        this.listCache.set(key, entry);
        this.enforceLimit(this.listCache, this.maxListEntries);
        this.storeTaskRecords(entry.tasks, entry.expiresAt, now);
    }
    getSearchEntry(teamId, params) {
        const key = buildSearchKey(teamId, params);
        const cached = this.searchCache.get(key);
        if (!cached) {
            return undefined;
        }
        if (cached.expiresAt <= Date.now()) {
            this.searchCache.delete(key);
            if (cached.signature) {
                this.contextCache.delete(cached.signature);
            }
            return undefined;
        }
        return cached;
    }
    storeSearchEntry(options) {
        const key = buildSearchKey(options.teamId, options.params);
        const now = Date.now();
        const signature = buildSignature(options.records);
        const entry = {
            key,
            tasks: options.tasks,
            records: options.records,
            index: options.index,
            fetchedAt: now,
            expiresAt: now + this.searchTtlMs,
            signature
        };
        this.searchCache.set(key, entry);
        this.enforceLimit(this.searchCache, this.maxSearchEntries);
        if (signature) {
            this.contextCache.set(signature, {
                signature,
                records: options.records,
                index: options.index,
                fetchedAt: now,
                expiresAt: now + this.searchTtlMs
            });
            this.enforceLimit(this.contextCache, this.maxSearchEntries);
        }
        this.storeTaskRecords(options.records, entry.expiresAt, now);
    }
    getContextIndex(records) {
        const signature = buildSignature(records);
        if (!signature) {
            return undefined;
        }
        const cached = this.contextCache.get(signature);
        if (!cached) {
            return undefined;
        }
        if (cached.expiresAt <= Date.now()) {
            this.contextCache.delete(signature);
            return undefined;
        }
        return cached;
    }
    storeContextIndex(options) {
        const signature = buildSignature(options.records);
        if (!signature) {
            return;
        }
        const now = Date.now();
        this.contextCache.set(signature, {
            signature,
            records: options.records,
            index: options.index,
            fetchedAt: now,
            expiresAt: now + this.searchTtlMs
        });
        this.enforceLimit(this.contextCache, this.maxSearchEntries);
        this.storeTaskRecords(options.records, now + this.searchTtlMs, now);
    }
    lookupTask(taskId) {
        const cached = this.taskRecords.get(taskId);
        if (!cached) {
            return undefined;
        }
        if (cached.expiresAt <= Date.now()) {
            this.taskRecords.delete(taskId);
            return undefined;
        }
        return cached.record;
    }
    invalidateList(listId) {
        Array.from(this.listCache.entries()).forEach(([key, entry]) => {
            if (entry.listId === listId) {
                this.listCache.delete(key);
            }
        });
        this.purgeContexts((context) => context.records.some((record) => record.listId === listId));
    }
    invalidateTask(taskId) {
        Array.from(this.listCache.entries()).forEach(([key, entry]) => {
            if (entry.tasks.some((task) => task.id === taskId)) {
                this.listCache.delete(key);
            }
        });
        Array.from(this.searchCache.entries()).forEach(([key, entry]) => {
            if (entry.records.some((record) => record.id === taskId)) {
                this.searchCache.delete(key);
                if (entry.signature) {
                    this.contextCache.delete(entry.signature);
                }
            }
        });
        this.purgeContexts((context) => context.records.some((record) => record.id === taskId));
        this.taskRecords.delete(taskId);
    }
    invalidateSearch() {
        this.searchCache.clear();
        this.contextCache.clear();
    }
    purgeContexts(predicate) {
        Array.from(this.contextCache.entries()).forEach(([key, entry]) => {
            if (predicate(entry)) {
                this.contextCache.delete(key);
            }
        });
    }
    enforceLimit(map, limit) {
        if (map.size <= limit) {
            return;
        }
        const entries = Array.from(map.entries());
        entries
            .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)
            .slice(0, Math.max(0, entries.length - limit))
            .forEach(([key]) => {
            map.delete(key);
        });
    }
    storeTaskRecords(records, expiresAt, fetchedAt) {
        records.forEach((record) => {
            if (!record.id)
                return;
            this.taskRecords.set(record.id, {
                record,
                fetchedAt,
                expiresAt
            });
        });
        this.enforceLimit(this.taskRecords, this.maxTaskRecords);
    }
}
