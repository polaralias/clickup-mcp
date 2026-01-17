import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { EncryptionService } from "../EncryptionService.js"

describe("EncryptionService", () => {
  const originalMasterKey = process.env.MASTER_KEY

  beforeEach(() => {
    process.env.MASTER_KEY = "0".repeat(64)
  })

  afterEach(() => {
    if (originalMasterKey === undefined) {
      delete process.env.MASTER_KEY
    } else {
      process.env.MASTER_KEY = originalMasterKey
    }
  })

  it("encrypts and decrypts a string successfully", () => {
    const service = new EncryptionService()
    const plaintext = "sensitive-api-key-12345"

    const encrypted = service.encrypt(plaintext)
    const decrypted = service.decrypt(encrypted)

    expect(decrypted).toBe(plaintext)
    expect(encrypted).not.toBe(plaintext)
  })

  it("produces different ciphertext for the same plaintext", () => {
    const service = new EncryptionService()
    const plaintext = "test-data"

    const encrypted1 = service.encrypt(plaintext)
    const encrypted2 = service.encrypt(plaintext)

    expect(encrypted1).not.toBe(encrypted2)
  })

  it("throws on invalid encrypted format", () => {
    const service = new EncryptionService()

    expect(() => service.decrypt("invalid-format")).toThrow("Invalid encrypted text format")
  })

  it("throws on tampered ciphertext", () => {
    const service = new EncryptionService()
    const encrypted = service.encrypt("test")
    const [iv, authTag, ciphertext] = encrypted.split(":")
    const tamperedCiphertext = ciphertext.replace(/[0-9a-f]/i, (char) => (char.toLowerCase() === "a" ? "b" : "a"))
    const tampered = `${iv}:${authTag}:${tamperedCiphertext}`

    expect(() => service.decrypt(tampered)).toThrow()
  })
})
