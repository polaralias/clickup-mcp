import { getCharLimit } from "../config/applicationConfig.js";
export function applyCharBudget(text, config) {
    const limit = getCharLimit(config);
    if (text.length <= limit) {
        return { value: text, truncated: false };
    }
    return { value: text.slice(0, limit), truncated: true };
}
