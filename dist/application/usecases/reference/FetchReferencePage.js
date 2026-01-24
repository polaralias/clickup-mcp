import { truncateString } from "../../limits/truncation.js";
const API_HOST = "clickup.com";
const API_PREFIX = "/api";
const DEFAULT_BODY_LIMIT = 6000;
function ensureReferenceUrl(rawUrl) {
    const url = new URL(rawUrl, `https://${API_HOST}`);
    if (url.hostname !== API_HOST) {
        throw new Error("Only clickup.com reference URLs are supported.");
    }
    if (!url.pathname.startsWith(API_PREFIX)) {
        throw new Error("Reference URLs must live under /api.");
    }
    url.hash = "";
    return url.toString();
}
function decodeHtmlEntities(value) {
    return value
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
}
function removeTags(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "");
}
function convertToText(html) {
    const withBreaks = html
        .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, "\n")
        .replace(/<br\s*\/?/gi, "\n");
    const stripped = withBreaks.replace(/<[^>]*>/g, " ");
    const decoded = decodeHtmlEntities(stripped);
    return decoded
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .join("\n");
}
function buildSummary(text) {
    const firstParagraph = text.split(/\n+/).find((chunk) => chunk.trim().length > 0) ?? "";
    if (!firstParagraph) {
        return "Reference page fetched but no readable content was detected.";
    }
    if (firstParagraph.length <= 220) {
        return firstParagraph;
    }
    return `${firstParagraph.slice(0, 219).trimEnd()}…`;
}
export async function fetchReferencePage(input, config) {
    const limitCandidate = input.maxCharacters ?? DEFAULT_BODY_LIMIT;
    const limit = Number.isFinite(limitCandidate) && limitCandidate > 0
        ? Math.min(Math.floor(limitCandidate), config.charLimit)
        : Math.min(DEFAULT_BODY_LIMIT, config.charLimit);
    const resolvedUrl = ensureReferenceUrl(input.url);
    const response = await fetch(resolvedUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; ClickUp-MCP/1.0)",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9"
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch reference page: ${response.status}`);
    }
    const html = await response.text();
    const cleaned = removeTags(html);
    const text = convertToText(cleaned);
    const { value, truncated } = truncateString(text, limit);
    const summary = buildSummary(text);
    return {
        summary,
        body: value,
        truncated,
        source: resolvedUrl,
        sources: [resolvedUrl],
        safety: "Public ClickUp reference content only. No workspace or task data is accessed.",
        guidance: truncated ? "Content was truncated for token safety. Request a smaller section or raise maxCharacters within safe limits." : undefined
    };
}
