function formatError(error) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: process.env.NODE_ENV === "development" ? error.stack : undefined
        };
    }
    return { raw: String(error) };
}
function log(level, message, context = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...context,
        ...(context.error ? { error: formatError(context.error) } : {})
    };
    const cleaned = Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined));
    const output = JSON.stringify(cleaned);
    if (level === "error") {
        console.error(output);
    }
    else if (level === "warn") {
        console.warn(output);
    }
    else {
        console.log(output);
    }
}
export const logger = {
    debug: (message, context) => log("debug", message, context),
    info: (message, context) => log("info", message, context),
    warn: (message, context) => log("warn", message, context),
    error: (message, context) => log("error", message, context)
};
