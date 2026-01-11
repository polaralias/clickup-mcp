import "dotenv/config"
import express from "express"
import { getMasterKeyInfo } from "./src/application/security/masterKey.js"

const app = express()
app.get("/test", (req, res) => {
    res.json({
        env: process.env.MASTER_KEY ? "EXISTS" : "MISSING",
        info: getMasterKeyInfo()
    })
})

const port = 3999
app.listen(port, () => {
    console.log(`Test server running on http://localhost:${port}`)
})
