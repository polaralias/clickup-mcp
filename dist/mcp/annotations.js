function baseAnnotation(cat, intent, extras = {}) {
    const sdkHints = {};
    const internalMeta = {
        category: cat,
        intent: intent
    };
    for (const [key, value] of Object.entries(extras)) {
        if (key === "idempotent")
            sdkHints.idempotentHint = !!value;
        else if (key === "readOnly")
            sdkHints.readOnlyHint = !!value;
        else if (key === "destructive")
            sdkHints.destructiveHint = !!value;
        else
            internalMeta[key] = value;
    }
    return {
        annotations: sdkHints,
        _internalMeta: internalMeta
    };
}
export function readOnlyAnnotation(cat, intent, extras = {}) {
    return baseAnnotation(cat, intent, { readOnly: true, ...extras });
}
export function destructiveAnnotation(cat, intent, extras = {}) {
    return baseAnnotation(cat, intent, { destructive: true, confirm: "dryRun+confirm=yes", ...extras });
}
