import { describe, it, expect, vi, beforeEach } from "vitest"
import { ConnectionRepository } from "../ConnectionRepository.js"

vi.mock("../../db/index.js", () => ({
  pool: {
    query: vi.fn()
  }
}))

import { pool } from "../../db/index.js"

describe("ConnectionRepository", () => {
  let repo: ConnectionRepository

  beforeEach(() => {
    repo = new ConnectionRepository()
    vi.clearAllMocks()
  })

  it("creates a connection", async () => {
    const connection = {
      id: "uuid-123",
      name: "Test Connection",
      config: { teamId: "team-1" },
      encryptedSecrets: "encrypted-data",
      createdAt: new Date(),
      updatedAt: new Date()
    }

    await repo.create(connection)

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO connections"),
      expect.arrayContaining([connection.id, connection.name])
    )
  })

  it("returns null for a non-existent connection", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] })

    const result = await repo.getById("non-existent")

    expect(result).toBeNull()
  })
})
