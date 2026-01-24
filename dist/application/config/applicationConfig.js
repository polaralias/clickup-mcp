import { z } from "zod";
const DEFAULT_CHAR_LIMIT = 16000;
const DEFAULT_ATTACHMENT_LIMIT_MB = 8;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_REPORTING_MAX_TASKS = 200;
const DEFAULT_RISK_WINDOW_DAYS = 5;
const NumberSchema = z.number().finite().positive();
function parsePositiveNumber(value) {
    if (typeof value === "number" && NumberSchema.safeParse(value).success) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (NumberSchema.safeParse(parsed).success) {
            return parsed;
        }
    }
    return undefined;
}
function coalesceNumber(candidate, ...fallbacks) {
    const parsed = parsePositiveNumber(candidate);
    if (parsed !== undefined) {
        return parsed;
    }
    for (const fallback of fallbacks) {
        const value = fallback();
        if (value !== undefined) {
            return value;
        }
    }
    return undefined;
}
function parseBooleanFlag(value) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        const normalised = value.trim().toLowerCase();
        if (normalised === "")
            return undefined;
        if (["1", "true", "yes", "y", "on"].includes(normalised))
            return true;
        if (["0", "false", "no", "n", "off"].includes(normalised))
            return false;
    }
    return undefined;
}
function parseWriteMode(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const normalised = value.trim().toLowerCase();
    if (!normalised) {
        return undefined;
    }
    if (["write", "read", "selective"].includes(normalised)) {
        return normalised;
    }
    return undefined;
}
function parseIdList(value) {
    if (Array.isArray(value)) {
        return value
            .map((entry) => (typeof entry === "string" || typeof entry === "number" ? String(entry).trim() : ""))
            .filter((entry) => entry.length > 0);
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed)
            return [];
        return trimmed
            .split(/[,\s]+/)
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
    }
    return [];
}
function resolveBoolean(keys) {
    for (const key of keys) {
        const value = parseBooleanFlag(process.env[key]);
        if (value !== undefined) {
            return value;
        }
    }
    return undefined;
}
function resolveEnvNumber(keys) {
    for (const key of keys) {
        const value = process.env[key];
        const parsed = parsePositiveNumber(value);
        if (parsed !== undefined) {
            return parsed;
        }
    }
    return undefined;
}
function resolveEnvIdList(keys) {
    for (const key of keys) {
        const value = process.env[key];
        const parsed = parseIdList(value);
        if (parsed.length > 0) {
            return parsed;
        }
    }
    return [];
}
function resolveNonNegativeNumber(keys) {
    for (const key of keys) {
        const value = process.env[key];
        if (value === undefined || value === "") {
            continue;
        }
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0) {
            return parsed;
        }
    }
    return undefined;
}
function resolveTeamId(candidate) {
    const value = candidate?.trim();
    if (value) {
        return value;
    }
    const envValue = process.env.TEAM_ID ??
        process.env.teamId ??
        process.env.DEFAULT_TEAM_ID ??
        process.env.defaultTeamId;
    const trimmed = envValue?.trim();
    return trimmed || undefined;
}
function resolveApiKey(candidate, fallbackCandidate) {
    const direct = candidate?.trim();
    if (direct) {
        return direct;
    }
    const fallback = fallbackCandidate?.trim();
    if (fallback) {
        return fallback;
    }
    const envValue = process.env.CLICKUP_API_TOKEN ?? process.env.clickupApiToken ?? process.env.apiKey ?? process.env.API_KEY;
    const trimmed = envValue?.trim();
    return trimmed || undefined;
}
export function createApplicationConfig(input, apiKeyCandidate) {
    const teamId = resolveTeamId(input.teamId);
    if (!teamId) {
        throw new Error("teamId is required");
    }
    const apiKey = resolveApiKey(input.apiKey, apiKeyCandidate);
    if (!apiKey) {
        throw new Error("apiKey is required");
    }
    const charLimit = coalesceNumber(input.charLimit, () => resolveEnvNumber(["CHAR_LIMIT", "charLimit"]), () => DEFAULT_CHAR_LIMIT) ?? DEFAULT_CHAR_LIMIT;
    const maxAttachmentMb = coalesceNumber(input.maxAttachmentMb, () => resolveEnvNumber(["MAX_ATTACHMENT_MB", "maxAttachmentMb"]), () => DEFAULT_ATTACHMENT_LIMIT_MB) ?? DEFAULT_ATTACHMENT_LIMIT_MB;
    const configuredWriteMode = parseWriteMode(input.writeMode) ?? parseWriteMode(process.env.WRITE_MODE ?? process.env.writeMode);
    const readOnly = parseBooleanFlag(input.readOnly) ?? resolveBoolean(["READ_ONLY_MODE", "readOnlyMode", "READ_ONLY", "readOnly"]);
    const selectiveWrite = parseBooleanFlag(input.selectiveWrite) ?? resolveBoolean(["SELECTIVE_WRITE", "selectiveWrite"]);
    const writeSpacesInput = parseIdList(input.writeSpaces);
    const writeSpacesEnv = resolveEnvIdList(["WRITE_ALLOWED_SPACES", "writeAllowedSpaces", "WRITE_SPACES", "writeSpaces"]);
    const writeSpaces = writeSpacesInput.length ? writeSpacesInput : writeSpacesEnv;
    const writeListsInput = parseIdList(input.writeLists);
    const writeListsEnv = resolveEnvIdList(["WRITE_ALLOWED_LISTS", "writeAllowedLists", "WRITE_LISTS", "writeLists"]);
    const writeLists = writeListsInput.length ? writeListsInput : writeListsEnv;
    let writeMode;
    if (readOnly) {
        writeMode = "read";
    }
    else if (selectiveWrite === true) {
        writeMode = "selective";
    }
    else if (selectiveWrite === false) {
        writeMode = "write";
    }
    else if (configuredWriteMode) {
        writeMode = configuredWriteMode;
    }
    else {
        // Fallback: if config is missing, infer from presence of lists/spaces
        writeMode = writeSpaces.length || writeLists.length ? "selective" : "write";
    }
    const writeAccess = {
        mode: writeMode,
        allowedSpaces: new Set(writeSpaces),
        allowedLists: new Set(writeLists)
    };
    const hierarchyCacheTtlMs = (input.hierarchyCacheTtlMs ?? resolveNonNegativeNumber(["HIERARCHY_CACHE_TTL_MS"])) ??
        (resolveNonNegativeNumber(["HIERARCHY_CACHE_TTL_SECONDS"]) ?? DEFAULT_CACHE_TTL_MS / 1000) * 1000;
    const spaceConfigCacheTtlMs = (input.spaceConfigCacheTtlMs ?? resolveNonNegativeNumber(["SPACE_CONFIG_CACHE_TTL_MS"])) ??
        (resolveNonNegativeNumber(["SPACE_CONFIG_CACHE_TTL_SECONDS"]) ?? DEFAULT_CACHE_TTL_MS / 1000) * 1000;
    const reportingMaxTasks = coalesceNumber(input.reportingMaxTasks, () => resolveEnvNumber(["REPORTING_MAX_TASKS", "reportingMaxTasks"])) ??
        DEFAULT_REPORTING_MAX_TASKS;
    const defaultRiskWindowDays = coalesceNumber(input.defaultRiskWindowDays, () => resolveEnvNumber(["DEFAULT_RISK_WINDOW_DAYS", "defaultRiskWindowDays"])) ??
        DEFAULT_RISK_WINDOW_DAYS;
    return {
        teamId,
        apiKey,
        charLimit,
        maxAttachmentMb,
        writeMode,
        writeAccess,
        hierarchyCacheTtlMs,
        spaceConfigCacheTtlMs,
        reportingMaxTasks,
        defaultRiskWindowDays,
        authSource: input.authSource
    };
}
export function requireTeamId(config, message) {
    const teamId = config.teamId?.trim();
    if (teamId) {
        return teamId;
    }
    throw new Error(message);
}
export function getCharLimit(config) {
    return config.charLimit;
}
export function getMaxAttachmentSizeMb(config) {
    return config.maxAttachmentMb;
}
