const BASE_URL = "https://api.clickup.com/api/v2/";
const BASE_URL_V3 = "https://api.clickup.com/api/v3/";
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
async function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function parseClickUpError(error) {
    if (error instanceof ClickUpRequestError) {
        return { status: error.statusCode, body: error.upstream.body };
    }
    if (!(error instanceof Error)) {
        return undefined;
    }
    const match = error.message.match(/^ClickUp (\d+):\s*(.+)$/s);
    if (!match) {
        return undefined;
    }
    const status = Number.parseInt(match[1], 10);
    const rawBody = match[2];
    let parsedBody = rawBody;
    try {
        parsedBody = JSON.parse(rawBody);
    }
    catch {
        parsedBody = rawBody;
    }
    return { status, body: parsedBody };
}
function extractErrorCode(body) {
    if (!body || typeof body !== "object") {
        return undefined;
    }
    const withErr = body;
    if (withErr.err?.code) {
        return withErr.err.code;
    }
    return withErr.code;
}
function extractErrorMessage(body) {
    if (!body) {
        return undefined;
    }
    if (typeof body === "string") {
        return body;
    }
    if (typeof body === "object") {
        const candidate = body;
        return candidate.err?.message ?? candidate.message ?? candidate.error;
    }
    return undefined;
}
function serialiseForHint(body) {
    if (body === undefined || body === null) {
        return undefined;
    }
    if (typeof body === "string") {
        return body;
    }
    if (typeof body === "object") {
        try {
            return JSON.stringify(body);
        }
        catch {
            return undefined;
        }
    }
    return String(body);
}
function deriveHint({ path, statusCode, body }) {
    const bodyText = serialiseForHint(body)?.toLowerCase() ?? "";
    const messageText = extractErrorMessage(body)?.toLowerCase() ?? bodyText;
    if (statusCode === 400 &&
        (bodyText.includes("statuses") || messageText.includes("statuses"))) {
        return "ClickUp expects the statuses[] query parameter to be an array of status names. Provide statuses[] entries instead of a single value.";
    }
    if (statusCode === 400 &&
        /time/.test(path) &&
        (bodyText.includes("date") || messageText.includes("date") || messageText.includes("time"))) {
        return "Check the start and end timestamps sent to ClickUp. Provide ISO 8601 strings or epoch milliseconds in the workspace timezone.";
    }
    if (statusCode === 404 &&
        (/\/docs?\b/.test(path) || /\/view\b/.test(path) || path.includes("capability"))) {
        return "This ClickUp workspace may not support that capability. Use the capability tools to confirm availability or upgrade the workspace plan.";
    }
    return undefined;
}
function normaliseId(value) {
    if (typeof value === "string" && value.trim()) {
        return value;
    }
    if (typeof value === "number") {
        return String(value);
    }
    return undefined;
}
function truncate(value, maxLength = 400) {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength)}…`;
}
export class ClickUpRequestError extends Error {
    statusCode;
    ecode;
    hint;
    upstream;
    constructor({ statusCode, ecode, message, hint, upstream }) {
        super(message);
        this.name = "ClickUpRequestError";
        this.statusCode = statusCode;
        this.ecode = ecode;
        this.hint = hint;
        this.upstream = upstream;
    }
    toJSON() {
        return {
            statusCode: this.statusCode,
            ecode: this.ecode,
            message: this.message,
            hint: this.hint,
            upstream: this.upstream
        };
    }
}
export function normaliseClickUpError(error) {
    if (error instanceof ClickUpRequestError) {
        return error.toJSON();
    }
    if (error && typeof error === "object") {
        const candidate = error;
        if (typeof candidate.message === "string") {
            return {
                statusCode: candidate.statusCode,
                ecode: candidate.ecode,
                message: candidate.message,
                hint: candidate.hint,
                upstream: candidate.upstream
            };
        }
    }
    if (error instanceof Error) {
        return { message: error.message };
    }
    if (typeof error === "string") {
        return { message: error };
    }
    try {
        return { message: JSON.stringify(error) };
    }
    catch {
        return { message: "Unknown error" };
    }
}
export class ClickUpMembersFallbackError extends Error {
    teamId;
    cause;
    constructor(teamId, message = `ClickUp fallback member lookup failed for workspace ${teamId}`, options) {
        super(message);
        this.name = "ClickUpMembersFallbackError";
        this.teamId = teamId;
        this.cause = options?.cause;
    }
}
export class ClickUpClient {
    token;
    constructor(token) {
        this.token = token;
        if (!this.token) {
            throw new Error("CLICKUP_API_TOKEN is required");
        }
    }
    async requestWithBase(path, baseUrl, options = {}, attempt = 0) {
        const url = new URL(path, baseUrl);
        if (options.searchParams) {
            Object.entries(options.searchParams).forEach(([key, value]) => {
                if (value === undefined || value === null) {
                    return;
                }
                if (Array.isArray(value)) {
                    const paramKey = key.endsWith("[]") ? key : `${key}[]`;
                    value.forEach((entry) => {
                        if (entry !== undefined && entry !== null) {
                            url.searchParams.append(paramKey, String(entry));
                        }
                    });
                    return;
                }
                url.searchParams.set(key, String(value));
            });
        }
        const method = options.method ?? "GET";
        const response = await fetch(url, {
            method,
            headers: {
                Authorization: this.token,
                "Content-Type": "application/json",
                Accept: "application/json",
                ...options.headers
            },
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        if (!response.ok) {
            if (RETRY_STATUS.has(response.status) && attempt < 3) {
                await delay(2 ** attempt * 250);
                return this.requestWithBase(path, baseUrl, options, attempt + 1);
            }
            const rawBody = await response.text();
            let parsedBody = rawBody;
            if (rawBody) {
                try {
                    parsedBody = JSON.parse(rawBody);
                }
                catch {
                    parsedBody = rawBody;
                }
            }
            const headers = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });
            const statusCode = response.status;
            const message = `ClickUp ${statusCode}: ${rawBody}`;
            const ecode = extractErrorCode(parsedBody);
            const hint = deriveHint({ path, statusCode, body: parsedBody });
            throw new ClickUpRequestError({
                statusCode,
                ecode,
                message,
                hint,
                upstream: {
                    statusCode,
                    body: parsedBody,
                    rawBody,
                    headers,
                    request: { method, path }
                }
            });
        }
        if (response.status === 204) {
            return null;
        }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return response.json();
        }
        return response.text();
    }
    request(path, options = {}, attempt = 0) {
        return this.requestWithBase(path, BASE_URL, options, attempt);
    }
    requestV3(path, options = {}, attempt = 0) {
        return this.requestWithBase(path, BASE_URL_V3, options, attempt);
    }
    listWorkspaces() {
        return this.request("team");
    }
    listSpaces(workspaceId) {
        return this.request(`team/${workspaceId}/space`);
    }
    listFolders(spaceId) {
        return this.request(`space/${spaceId}/folder`);
    }
    listLists(spaceId, folderId) {
        if (folderId) {
            return this.request(`folder/${folderId}/list`);
        }
        return this.request(`space/${spaceId}/list`);
    }
    createFolder(spaceId, body) {
        return this.request(`space/${spaceId}/folder`, {
            method: "POST",
            body
        });
    }
    updateFolder(folderId, body) {
        return this.request(`folder/${folderId}`, {
            method: "PUT",
            body
        });
    }
    deleteFolder(folderId) {
        return this.request(`folder/${folderId}`, {
            method: "DELETE"
        });
    }
    createListInSpace(spaceId, body) {
        return this.request(`space/${spaceId}/list`, {
            method: "POST",
            body
        });
    }
    createListInFolder(folderId, body) {
        return this.request(`folder/${folderId}/list`, {
            method: "POST",
            body
        });
    }
    createListFromTemplate(templateId, destination, body) {
        if (destination.folderId) {
            return this.request(`folder/${destination.folderId}/list/template/${templateId}`, {
                method: "POST",
                body
            });
        }
        if (destination.spaceId) {
            return this.request(`space/${destination.spaceId}/list/template/${templateId}`, {
                method: "POST",
                body
            });
        }
        throw new Error("Must provide spaceId or folderId");
    }
    updateList(listId, body) {
        return this.request(`list/${listId}`, {
            method: "PUT",
            body
        });
    }
    deleteList(listId) {
        return this.request(`list/${listId}`, {
            method: "DELETE"
        });
    }
    getList(listId) {
        return this.request(`list/${listId}`);
    }
    getListCustomFields(listId) {
        return this.request(`list/${listId}/field`);
    }
    setTaskCustomFieldValue(taskId, fieldId, value) {
        return this.request(`task/${taskId}/field/${fieldId}`, {
            method: "POST",
            body: { value }
        });
    }
    clearTaskCustomFieldValue(taskId, fieldId) {
        return this.request(`task/${taskId}/field/${fieldId}`, {
            method: "DELETE"
        });
    }
    createListView(listId, body) {
        return this.request(`list/${listId}/view`, {
            method: "POST",
            body
        });
    }
    createSpaceView(spaceId, body) {
        return this.request(`space/${spaceId}/view`, {
            method: "POST",
            body
        });
    }
    updateView(viewId, body) {
        return this.request(`view/${viewId}`, {
            method: "PUT",
            body
        });
    }
    deleteView(viewId) {
        return this.request(`view/${viewId}`, {
            method: "DELETE"
        });
    }
    listTagsForSpace(spaceId) {
        return this.request(`space/${spaceId}/tag`);
    }
    createSpaceTag(spaceId, body) {
        return this.request(`space/${spaceId}/tag`, {
            method: "POST",
            body
        });
    }
    updateSpaceTag(spaceId, tagName, body) {
        return this.request(`space/${spaceId}/tag/${encodeURIComponent(tagName)}`, {
            method: "PUT",
            body
        });
    }
    deleteSpaceTag(spaceId, tagName) {
        return this.request(`space/${spaceId}/tag/${encodeURIComponent(tagName)}`, {
            method: "DELETE"
        });
    }
    async listMembers(teamId) {
        if (!teamId) {
            return this.request("team");
        }
        try {
            const response = await this.request(`team/${teamId}/member`);
            return this.buildMemberListing(response, "direct");
        }
        catch (error) {
            const fallback = this.extractFallbackContext(error);
            if (!fallback) {
                throw error;
            }
            try {
                const fallbackResult = await this.listMembersViaTeamListing(teamId);
                return this.buildMemberListing(fallbackResult.raw, "fallback", fallback.diagnostics);
            }
            catch (fallbackError) {
                throw new ClickUpMembersFallbackError(teamId, undefined, { cause: fallbackError });
            }
        }
    }
    extractFallbackContext(error) {
        if (!(error instanceof Error)) {
            return undefined;
        }
        const parsed = parseClickUpError(error);
        if (parsed?.status === 404) {
            return { diagnostics: this.formatFallbackDiagnostics(parsed.status, parsed.body) };
        }
        if (error.message.includes("ClickUp 404")) {
            return { diagnostics: truncate(error.message) };
        }
        return undefined;
    }
    async listMembersViaTeamListing(teamId) {
        const response = await this.request("team");
        const teams = this.extractTeams(response);
        const targetId = teamId.trim();
        const team = teams.find((entry) => this.teamMatches(entry, targetId));
        if (!team) {
            throw new Error(`Workspace ${targetId} was not present in /team response`);
        }
        const members = Array.isArray(team.members) ? team.members : [];
        return { members, raw: team };
    }
    buildMemberListing(raw, source, diagnostics) {
        const members = this.extractMembers(raw);
        const listing = { members, source, raw };
        if (diagnostics) {
            listing.diagnostics = diagnostics;
        }
        return listing;
    }
    extractMembers(response) {
        if (Array.isArray(response?.members)) {
            return (response.members ?? []);
        }
        if (Array.isArray(response)) {
            return response;
        }
        return [];
    }
    formatFallbackDiagnostics(status, body) {
        const parts = [];
        if (typeof status === "number") {
            parts.push(`status=${status}`);
        }
        const code = extractErrorCode(body);
        if (code) {
            parts.push(`code=${code}`);
        }
        const snippet = this.serialiseBody(body);
        if (snippet) {
            parts.push(`body=${snippet}`);
        }
        return parts.length > 0 ? parts.join(" ") : undefined;
    }
    serialiseBody(body) {
        if (body === undefined || body === null) {
            return undefined;
        }
        if (typeof body === "string") {
            return truncate(body);
        }
        if (typeof body === "object") {
            try {
                return truncate(JSON.stringify(body));
            }
            catch {
                return "[unserializable body]";
            }
        }
        return truncate(String(body));
    }
    extractTeams(response) {
        if (Array.isArray(response)) {
            return response;
        }
        if (response && typeof response === "object") {
            const withTeams = response;
            if (Array.isArray(withTeams.teams)) {
                return withTeams.teams;
            }
            if (Array.isArray(withTeams.data)) {
                return withTeams.data;
            }
        }
        return [];
    }
    teamMatches(entry, teamId) {
        if (!entry || typeof entry !== "object") {
            return false;
        }
        const candidate = entry;
        const matchers = [candidate.id, candidate.team_id, candidate.teamId];
        return matchers.some((value) => normaliseId(value) === teamId);
    }
    async getTeams() {
        const response = await this.request("team");
        return this.extractTeams(response);
    }
    resolveMembers(teamId) {
        return this.request(`team/${teamId}/member`);
    }
    searchTasks(teamId, query) {
        return this.request(`team/${teamId}/task`, {
            method: "GET",
            searchParams: query
        });
    }
    getTask(taskId, query = {}) {
        return this.request(`task/${taskId}`, { method: "GET", searchParams: query });
    }
    listTasksInList(listId, query = {}) {
        return this.request(`list/${listId}/task`, {
            method: "GET",
            searchParams: query
        });
    }
    listTaskComments(taskId) {
        return this.request(`task/${taskId}/comment`);
    }
    createTask(listId, body) {
        return this.request(`list/${listId}/task`, {
            method: "POST",
            body
        });
    }
    updateTask(taskId, body) {
        return this.request(`task/${taskId}`, {
            method: "PUT",
            body
        });
    }
    deleteTask(taskId) {
        return this.request(`task/${taskId}`, {
            method: "DELETE"
        });
    }
    duplicateTask(taskId, body) {
        return this.request(`task/${taskId}/duplicate`, {
            method: "POST",
            body
        });
    }
    commentTask(taskId, body) {
        return this.request(`task/${taskId}/comment`, {
            method: "POST",
            body
        });
    }
    attachFile(taskId, formData) {
        return fetch(`${BASE_URL}/task/${taskId}/attachment`, {
            method: "POST",
            headers: {
                Authorization: this.token
            },
            body: formData
        }).then((response) => {
            if (!response.ok) {
                throw new Error(`ClickUp ${response.status}`);
            }
            return response.json();
        });
    }
    addTags(taskId, tags) {
        if (!Array.isArray(tags) || tags.length === 0) {
            return Promise.resolve([]);
        }
        return Promise.all(tags.map((tag) => this.request(`task/${taskId}/tag/${encodeURIComponent(tag)}`, {
            method: "POST"
        })));
    }
    removeTags(taskId, tags) {
        if (!Array.isArray(tags) || tags.length === 0) {
            return Promise.resolve([]);
        }
        return Promise.all(tags.map((tag) => this.request(`task/${taskId}/tag/${encodeURIComponent(tag)}`, {
            method: "DELETE"
        })));
    }
    createTasksBulk(teamId, tasks) {
        return this.request(`task/bulk`, {
            method: "POST",
            searchParams: { team_id: teamId },
            body: { tasks }
        });
    }
    updateTasksBulk(teamId, tasks) {
        return this.request(`task/bulk`, {
            method: "PUT",
            searchParams: { team_id: teamId },
            body: { tasks }
        });
    }
    deleteTasksBulk(teamId, taskIds) {
        return this.request(`task/bulk`, {
            method: "DELETE",
            searchParams: { team_id: teamId },
            body: { task_ids: taskIds }
        });
    }
    addTagsBulk(teamId, operations) {
        return this.request(`task/tag/bulk`, {
            method: "POST",
            searchParams: { team_id: teamId },
            body: { operations }
        });
    }
    createDoc(workspaceId, body) {
        return this.requestV3(`workspaces/${workspaceId}/docs`, {
            method: "POST",
            body
        });
    }
    listDocuments(workspaceId, filters = {}) {
        return this.requestV3(`workspaces/${workspaceId}/docs`, {
            method: "GET",
            searchParams: filters
        });
    }
    getDocument(workspaceId, docId) {
        return this.requestV3(`workspaces/${workspaceId}/docs/${docId}`);
    }
    listDocPages(docId) {
        return this.requestV3(`docs/${docId}/page_listing`);
    }
    bulkGetDocumentPages(docId, pageIds) {
        return this.requestV3(`docs/${docId}/pages/bulk`, {
            method: "POST",
            body: { page_ids: pageIds }
        });
    }
    createDocumentPage(docId, body) {
        return this.requestV3(`docs/${docId}/pages`, {
            method: "POST",
            body
        });
    }
    getDocPage(docId, pageId) {
        return this.requestV3(`docs/${docId}/pages/${pageId}`);
    }
    updateDocPage(docId, pageId, body) {
        return this.requestV3(`docs/${docId}/pages/${pageId}`, {
            method: "PUT",
            body
        });
    }
    searchDocs(teamId, query) {
        return this.requestV3(`workspaces/${teamId}/docs`, {
            method: "GET",
            searchParams: query
        });
    }
    startTimer(taskId) {
        return this.request(`task/${taskId}/time`, {
            method: "POST",
            body: { start: Date.now() }
        });
    }
    stopTimer(taskId) {
        return this.request(`task/${taskId}/time`, {
            method: "POST",
            body: { end: Date.now() }
        });
    }
    createTimeEntry(taskId, body) {
        return this.request(`task/${taskId}/time`, {
            method: "POST",
            body
        });
    }
    getTaskTimeEntries(taskId) {
        return this.request(`task/${taskId}/time`);
    }
    updateTimeEntry(teamId, entryId, body) {
        return this.request(`team/${teamId}/time_entries/${entryId}`, {
            method: "PUT",
            body
        });
    }
    deleteTimeEntry(teamId, entryId) {
        return this.request(`team/${teamId}/time_entries/${entryId}`, {
            method: "DELETE"
        });
    }
    listTimeEntries(teamId, query) {
        return this.request(`team/${teamId}/time_entries`, {
            method: "GET",
            searchParams: query
        });
    }
    getCurrentTimeEntry(teamId) {
        return this.request(`team/${teamId}/time_entries/current`);
    }
    reportTime(path, query) {
        return this.request(path, {
            method: "GET",
            searchParams: query
        });
    }
}
