export function extractExistingDescription(source) {
    if (!source || typeof source !== "object") {
        return undefined;
    }
    const payload = source;
    const description = typeof payload.description === "string" ? payload.description : undefined;
    const textContent = typeof payload.text_content === "string" ? payload.text_content : undefined;
    return description ?? textContent;
}
export function buildPreservedDescription(newDescription, existingDescription) {
    const existing = existingDescription ?? "";
    if (existing.trim() === "") {
        return newDescription;
    }
    return `${newDescription}\n\n---\nPrevious description (auto preserved):\n${existing}`;
}
