function sanitiseDiagnostics(value) {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    if (trimmed.length <= 400) {
        return trimmed;
    }
    return `${trimmed.slice(0, 400)}…`;
}
export class CapabilityTracker {
    memberEndpoint = new Map();
    docsEndpoint = new Map();
    recordMemberEndpoint(teamId, directAvailable, diagnostics) {
        const sanitised = sanitiseDiagnostics(diagnostics);
        const entry = { directAvailable, lastChecked: Date.now(), diagnostics: sanitised };
        this.memberEndpoint.set(teamId, entry);
        return {
            teamId,
            directAvailable,
            lastChecked: new Date(entry.lastChecked).toISOString(),
            ...(sanitised ? { diagnostics: sanitised } : {})
        };
    }
    getMemberEndpoint(teamId) {
        const entry = this.memberEndpoint.get(teamId);
        if (!entry) {
            return undefined;
        }
        return {
            teamId,
            directAvailable: entry.directAvailable,
            lastChecked: new Date(entry.lastChecked).toISOString(),
            ...(entry.diagnostics ? { diagnostics: entry.diagnostics } : {})
        };
    }
    recordDocsEndpoint(teamId, docsAvailable, diagnostics) {
        const sanitised = sanitiseDiagnostics(diagnostics);
        const entry = { docsAvailable, lastChecked: Date.now(), diagnostics: sanitised };
        this.docsEndpoint.set(teamId, entry);
        return {
            teamId,
            docsAvailable,
            lastChecked: new Date(entry.lastChecked).toISOString(),
            ...(sanitised ? { diagnostics: sanitised } : {})
        };
    }
    getDocsEndpoint(teamId) {
        const entry = this.docsEndpoint.get(teamId);
        if (!entry) {
            return undefined;
        }
        return {
            teamId,
            docsAvailable: entry.docsAvailable,
            lastChecked: new Date(entry.lastChecked).toISOString(),
            ...(entry.diagnostics ? { diagnostics: entry.diagnostics } : {})
        };
    }
    snapshot() {
        const memberEndpoint = Array.from(this.memberEndpoint.entries()).map(([teamId, entry]) => ({
            teamId,
            directAvailable: entry.directAvailable,
            lastChecked: new Date(entry.lastChecked).toISOString(),
            ...(entry.diagnostics ? { diagnostics: entry.diagnostics } : {})
        }));
        const docsEndpoint = Array.from(this.docsEndpoint.entries()).map(([teamId, entry]) => ({
            teamId,
            docsAvailable: entry.docsAvailable,
            lastChecked: new Date(entry.lastChecked).toISOString(),
            ...(entry.diagnostics ? { diagnostics: entry.diagnostics } : {})
        }));
        return { memberEndpoint, docsEndpoint };
    }
}
