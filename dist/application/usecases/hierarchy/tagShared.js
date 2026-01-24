import { readString } from "./structureShared.js";
function normaliseTagName(value) {
    return value.trim().toLowerCase();
}
export function normaliseHexColor(value, label) {
    if (value === undefined) {
        return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        throw new Error(`Provide a ${label} color in hex format like #RRGGBB`);
    }
    const withoutHash = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
    if (!/^[0-9a-fA-F]{3}$/.test(withoutHash) && !/^[0-9a-fA-F]{6}$/.test(withoutHash)) {
        throw new Error(`Invalid ${label} color \"${value}\". Use hex format like #RRGGBB or #RGB`);
    }
    const expanded = withoutHash.length === 3
        ? withoutHash
            .split("")
            .map((char) => char + char)
            .join("")
        : withoutHash;
    return `#${expanded.toUpperCase()}`;
}
function mapSpaceTag(candidate, spaceId) {
    if (!candidate || typeof candidate !== "object") {
        return undefined;
    }
    const name = readString(candidate, ["name", "tag", "tag_name", "label"]) ??
        readString(candidate.tag ?? undefined, ["name"]) ??
        undefined;
    if (!name) {
        return undefined;
    }
    const foreground = readString(candidate, ["tag_fg", "fg_color", "foreground", "foregroundColor", "color"]) ??
        readString(candidate.color ?? undefined, ["fg", "foreground"]) ??
        undefined;
    const background = readString(candidate, ["tag_bg", "bg_color", "background", "backgroundColor"]) ??
        readString(candidate.color ?? undefined, ["bg", "background"]) ??
        undefined;
    const colors = buildColors(foreground, background);
    return { spaceId, name, colors };
}
export function buildColors(foreground, background) {
    const result = {};
    if (foreground) {
        result.foreground = foreground;
    }
    if (background) {
        result.background = background;
    }
    return Object.keys(result).length > 0 ? result : undefined;
}
function extractTagCollection(response) {
    if (Array.isArray(response)) {
        return response;
    }
    if (response && typeof response === "object") {
        const candidate = response.tags;
        if (Array.isArray(candidate)) {
            return candidate;
        }
    }
    return [];
}
export async function ensureSpaceTagCollection(spaceId, client, cache, options = {}) {
    if (!options.forceRefresh) {
        const cached = await cache.read(spaceId);
        if (cached) {
            return cached;
        }
    }
    const response = await client.listTagsForSpace(spaceId);
    const collection = extractTagCollection(response);
    await cache.store(spaceId, collection);
    return [...collection];
}
export async function loadSpaceTags(spaceId, client, cache, options = {}) {
    const collection = await ensureSpaceTagCollection(spaceId, client, cache, options);
    return collection
        .map((candidate) => mapSpaceTag(candidate, spaceId))
        .filter((tag) => Boolean(tag));
}
export function findTagByName(tags, name) {
    const target = normaliseTagName(name);
    return tags.find((tag) => normaliseTagName(tag.name) === target);
}
export function summariseTagFromResponse(response, spaceId, fallback) {
    if (response && typeof response === "object") {
        const raw = response;
        const candidate = raw.tag ?? raw.data ?? raw.result;
        const mapped = mapSpaceTag(candidate, spaceId) ??
            mapSpaceTag(raw.tag ?? undefined, spaceId) ??
            mapSpaceTag(response, spaceId);
        if (mapped) {
            return mapped;
        }
    }
    return fallback;
}
