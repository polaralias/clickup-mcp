export type LogLevel = "debug" | "info" | "warn" | "error"

export type LogContext = {
  requestId?: string
  userId?: string
  apiKeyId?: string
  path?: string
  method?: string
  duration?: number
  error?: Error | unknown
  [key: string]: unknown
}

function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    }
  }

  return { raw: String(error) }
}

function log(level: LogLevel, message: string, context: LogContext = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
    ...(context.error ? { error: formatError(context.error) } : {})
  }

  const cleaned = Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined)
  )

  const output = JSON.stringify(cleaned)

  if (level === "error") {
    console.error(output)
  } else if (level === "warn") {
    console.warn(output)
  } else {
    console.log(output)
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log("debug", message, context),
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext) => log("warn", message, context),
  error: (message: string, context?: LogContext) => log("error", message, context)
}
