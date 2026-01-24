const API_REFERENCE_URL = "https://clickup.com/api";
const MAX_LABEL_LENGTH = 80;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
function decodeHtmlEntities(value) {
    return value
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
}
function stripTags(value) {
    return value.replace(/<[^>]*>/g, " ");
}
function normaliseWhitespace(value) {
    return value
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" ");
}
function formatLabel(label) {
    const normalised = normaliseWhitespace(label);
    if (normalised.length <= MAX_LABEL_LENGTH) {
        return { label: normalised, fullLabel: normalised };
    }
    return {
        label: `${normalised.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`,
        fullLabel: normalised
    };
}
function normaliseUrl(href) {
    try {
        const url = new URL(href, API_REFERENCE_URL);
        return url.toString();
    }
    catch (error) {
        return null;
    }
}
function extractSidebar(html) {
    const match = html.match(/<nav[^>]*(sidebar|side-nav)[^>]*>[\s\S]*?<\/nav>/i);
    if (match) {
        return match[0];
    }
    const fallback = html.match(/<aside[^>]*>[\s\S]*?<\/aside>/i);
    if (fallback) {
        return fallback[0];
    }
    return html;
}
function parseSectionFromTag(tag) {
    const attributeMatch = tag.match(/data-(?:section|group|category)="([^"]+)"/i);
    if (attributeMatch) {
        return normaliseWhitespace(decodeHtmlEntities(attributeMatch[1]));
    }
    const ariaMatch = tag.match(/aria-label="([^"]+)"/i);
    if (ariaMatch) {
        return normaliseWhitespace(decodeHtmlEntities(ariaMatch[1]));
    }
    const titleMatch = tag.match(/title="([^"]+)"/i);
    if (titleMatch) {
        return normaliseWhitespace(decodeHtmlEntities(titleMatch[1]));
    }
    return undefined;
}
function parseRawLinks(html) {
    const sidebar = extractSidebar(html);
    const anchorRegex = /(<a[^>]*href="([^"]+)"[^>]*>)([\s\S]*?)<\/a>/gi;
    const seen = new Set();
    const links = [];
    let match;
    while ((match = anchorRegex.exec(sidebar))) {
        const fullTag = match[1] ?? "";
        const href = match[2];
        const content = match[3] ?? "";
        const label = normaliseWhitespace(decodeHtmlEntities(stripTags(content)));
        if (!href || !label) {
            continue;
        }
        const url = normaliseUrl(href);
        if (!url || seen.has(url)) {
            continue;
        }
        seen.add(url);
        const section = parseSectionFromTag(fullTag);
        links.push({ href: url, label, section });
    }
    return links;
}
function convertToReferenceLink(raw) {
    const formatted = formatLabel(raw.label);
    return {
        label: formatted.label,
        fullLabel: formatted.fullLabel,
        url: raw.href,
        section: raw.section
    };
}
export async function listReferenceLinks(input = {}) {
    const requestedLimit = input.limit ?? DEFAULT_LIMIT;
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.floor(requestedLimit), MAX_LIMIT)
        : DEFAULT_LIMIT;
    const response = await fetch(API_REFERENCE_URL, {
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; ClickUp-MCP/1.0)",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9"
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to load ClickUp API reference: ${response.status}`);
    }
    const html = await response.text();
    const rawLinks = parseRawLinks(html);
    const links = rawLinks.slice(0, limit).map(convertToReferenceLink);
    const truncated = rawLinks.length > links.length;
    return {
        summary: links.length > 0
            ? `Found ${links.length} reference link${links.length === 1 ? "" : "s"} from the ClickUp API sidebar.`
            : "No reference links were detected in the ClickUp API sidebar.",
        links,
        truncated,
        source: API_REFERENCE_URL,
        sources: [API_REFERENCE_URL],
        safety: "Public ClickUp reference content only. No workspace or task data is accessed.",
        guidance: links.length > 0 ? "Call clickup_fetch_reference_page with a URL to retrieve an individual page." : undefined
    };
}
