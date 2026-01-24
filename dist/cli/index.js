import dotenv from "dotenv";
import { ConnectionRepository } from "../infrastructure/repositories/ConnectionRepository.js";
import { ApiKeyRepository } from "../infrastructure/repositories/ApiKeyRepository.js";
async function main() {
    try {
        dotenv.config();
        const [, , command, action, id] = process.argv;
        if (!command) {
            console.log("Usage: npm run cli <connections|api-keys> <list|delete|revoke> [id]");
            process.exit(1);
        }
        if (!process.env.DATABASE_URL) {
            console.error("Error: DATABASE_URL environment variable is not set.");
            process.exit(1);
        }
        const connectionRepo = new ConnectionRepository();
        const apiKeyRepo = new ApiKeyRepository();
        if (command === "connections") {
            if (action === "list") {
                const connections = await connectionRepo.list();
                if (connections.length === 0) {
                    console.log("No connections found.");
                }
                else {
                    console.table(connections.map(c => ({
                        id: c.id,
                        name: c.name
                    })));
                }
            }
            else if (action === "delete") {
                if (!id)
                    throw new Error("ID required for delete");
                await connectionRepo.delete(id);
                console.log(`Connection ${id} deleted.`);
            }
            else {
                console.log("Unknown action for connections. Use list or delete.");
            }
        }
        else if (command === "api-keys") {
            if (action === "list") {
                const keys = await apiKeyRepo.listAll();
                if (keys.length === 0) {
                    console.log("No API keys found.");
                }
                else {
                    console.table(keys.map(k => ({
                        id: k.id,
                        created_at: k.created_at
                    })));
                }
            }
            else if (action === "revoke") {
                if (!id)
                    throw new Error("ID required for revoke");
                await apiKeyRepo.revoke(id);
                console.log(`API Key ${id} revoked.`);
            }
            else {
                console.log("Unknown action for api-keys. Use list or revoke.");
            }
        }
        else {
            console.log("Unknown command. Use connections or api-keys.");
        }
    }
    catch (error) {
        console.error("CLI Fatal Error:", error);
        process.exit(1);
    }
    finally {
        // Ensure pool is closed or process exits
        setTimeout(() => process.exit(0), 100);
    }
}
main().catch(err => {
    console.error("Unhandled Promise Rejection:", err);
    process.exit(1);
});
