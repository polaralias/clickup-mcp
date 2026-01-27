import pg from "pg"
import { logger } from "../logging/logger.js"

const { Pool } = pg

let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5


if (!process.env.DATABASE_URL) {
  logger.error("DATABASE_URL environment variable is not defined. The application cannot connect to the database.")
  logger.error("If running in Docker, ensure you are passing environment variables or using a .env file that is properly mounted/loaded.")
  logger.error("Note: .env files are excluded from the Docker image by default for security.")
  // We throw here to prevent the 'role root does not exist' confusion later
  throw new Error("DATABASE_URL environment variable is required.")
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
})

pool.on("error", (err) => {
  logger.error("Database pool error on idle client", {
    error: err,
    reconnectAttempts
  })

  reconnectAttempts += 1

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logger.error("Max database reconnection attempts reached, exiting", {
      reconnectAttempts
    })
    process.exit(-1)
  }
})

pool.on("connect", () => {
  if (reconnectAttempts > 0) {
    logger.info("Database connection restored", { previousAttempts: reconnectAttempts })
    reconnectAttempts = 0
  }
})

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await pool.query("SELECT 1")
    return result.rows.length === 1
  } catch (error) {
    logger.error("Database health check failed", { error })
    return false
  }
}
