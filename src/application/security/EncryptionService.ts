import { createCipheriv, createDecipheriv, randomBytes } from "crypto"
import { getMasterKeyBytes } from "./masterKey.js"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // NIST recommended for GCM

export class EncryptionService {
  private key: Buffer

  constructor() {
    this.key = getMasterKeyBytes()
  }

  encrypt(text: string): string {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, this.key, iv)
    let encrypted = cipher.update(text, "utf8", "hex")
    encrypted += cipher.final("hex")
    const authTag = cipher.getAuthTag()
    // Format: iv:authTag:encrypted
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`
  }

  decrypt(text: string): string {
    const parts = text.split(":")
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted text format")
    }
    const [ivHex, authTagHex, encryptedHex] = parts
    const iv = Buffer.from(ivHex, "hex")
    const authTag = Buffer.from(authTagHex, "hex")
    const decipher = createDecipheriv(ALGORITHM, this.key, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encryptedHex, "hex", "utf8")
    decrypted += decipher.final("utf8")
    return decrypted
  }
}
