import "dotenv/config"
import { getMasterKeyInfo } from "./src/application/security/masterKey.js"

console.log("MASTER_KEY from process.env:", process.env.MASTER_KEY ? "EXISTS" : "MISSING")
console.log("getMasterKeyInfo():", JSON.stringify(getMasterKeyInfo(), null, 2))
