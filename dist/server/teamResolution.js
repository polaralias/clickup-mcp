import { ClickUpClient } from "../infrastructure/clickup/ClickUpClient.js";
export async function resolveTeamIdFromApiKey(apiKey) {
    const client = new ClickUpClient(apiKey);
    const teams = (await client.getTeams());
    if (teams && teams.length > 0) {
        return teams[0].id;
    }
    throw new Error("No teams found for the provided API key");
}
