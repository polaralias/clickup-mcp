const API_BASE = '/api';
let currentConnectionId = null;

// Parse query parameters
const urlParams = new URLSearchParams(window.location.search);
const redirectUri = urlParams.get('redirect_uri') || urlParams.get('callback_url');
const state = urlParams.get('state');

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Try to load user-bound config schema first
    try {
        const res = await fetch(`${API_BASE}/config-schema`);
        if (res.ok) {
            const schema = await res.json();
            renderConfigForm(schema);
            document.getElementById('view-dashboard').classList.add('hidden');
            document.getElementById('view-config-entry').classList.remove('hidden');
            return;
        }
    } catch (e) {
        console.log("Not in user-bound mode or failed to fetch schema", e);
    }

    // Fallback to existing dashboard logic
    fetchConfigStatus();
    if (redirectUri) {
        // OAuth Mode
        showCreate();
        document.getElementById('view-dashboard').classList.add('hidden');
        document.getElementById('cancel-btn').classList.add('hidden'); // Cannot cancel in OAuth flow
        document.getElementById('save-btn').innerText = 'Authorize & Connect';
        // Auto-fill form if needed or show empty
    } else {
        // Dashboard Mode
        loadConnections();
    }
});

async function fetchConfigStatus() {
    const banner = document.getElementById('config-status-banner');
    const icon = document.getElementById('status-icon');
    const title = document.getElementById('status-title');
    const message = document.getElementById('status-message');
    const guidance = document.getElementById('status-guidance');

    try {
        const res = await fetch(`${API_BASE}/config-status`);
        const data = await res.json();

        banner.classList.remove('hidden');
        if (data.status === 'present') {
            banner.className = 'mb-6 p-4 rounded-lg border bg-green-50 border-green-200 text-green-800';
            icon.innerHTML = '✅';
            title.innerText = 'Configured';
            message.innerText = `Master key is present (${data.format}${data.isFallback ? ', using fallback' : ''})`;
            guidance.classList.add('hidden');
        } else {
            banner.className = 'mb-6 p-4 rounded-lg border bg-red-50 border-red-200 text-red-800';
            icon.innerHTML = '❌';
            title.innerText = 'Server not configured: MASTER_KEY missing';
            message.innerText = 'Please set the MASTER_KEY environment variable.';
            guidance.classList.remove('hidden');
        }
    } catch (e) {
        console.error('Failed to fetch config status', e);
    }
}

function showCreate() {
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-detail').classList.add('hidden');
    document.getElementById('view-create').classList.remove('hidden');
}

function hideCreate() {
    if (redirectUri) return; // Cannot cancel in OAuth mode
    document.getElementById('view-create').classList.add('hidden');
    document.getElementById('view-dashboard').classList.remove('hidden');
    document.getElementById('config-form').reset();
}

function hideDetail() {
    document.getElementById('view-detail').classList.add('hidden');
    document.getElementById('view-dashboard').classList.remove('hidden');
    currentConnectionId = null;
}

async function loadConnections() {
    try {
        const res = await fetch(`${API_BASE}/connections`);
        const banner = document.getElementById('config-status-banner');
        const isUnconfigured = banner && !banner.classList.contains('hidden') && banner.classList.contains('bg-red-50');

        if (res.status === 500) {
            const data = await res.json();

            // If the banner already shows the server is not configured, don't repeat the error in the list
            if (isUnconfigured && data.error && data.error.includes('MASTER_KEY')) {
                document.getElementById('list-container').innerHTML = '';
                return;
            }

            document.getElementById('list-container').innerHTML = `<p class="text-red-600">Error: ${data.error}</p>`;
            return;
        }
        const data = await res.json();
        const container = document.getElementById('list-container');

        if (data.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center">No connections found.</p>';
            return;
        }

        container.innerHTML = data.map(conn => `
            <div class="bg-white border rounded p-4 flex justify-between items-center hover:bg-gray-50 transition">
                <div>
                    <h3 class="font-medium text-gray-800">${conn.name}</h3>
                    <p class="text-xs text-gray-500">ID: ${conn.id}</p>
                </div>
                <div class="space-x-2">
                    <button onclick="viewConnection('${conn.id}')" class="text-blue-600 hover:text-blue-800 text-sm font-medium">Manage</button>
                    <button onclick="deleteConnection('${conn.id}')" class="text-red-500 hover:text-red-700 text-sm">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
        document.getElementById('list-container').innerHTML = '<p class="text-red-600">Failed to load connections.</p>';
    }
}

async function handleSave(event) {
    event.preventDefault();
    const btn = document.getElementById('save-btn');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Saving...';

    const name = document.getElementById('conn-name').value || 'ClickUp Connection';
    const apiKey = document.getElementById('conn-apiKey').value;
    const readOnly = document.getElementById('conn-readOnly').checked;
    const selectiveWrite = document.getElementById('conn-selectiveWrite').checked;
    const writeSpaces = document.getElementById('conn-writeSpaces').value;
    const writeLists = document.getElementById('conn-writeLists').value;

    const config = {
        apiKey,
        readOnly,
        selectiveWrite,
        writeSpaces: writeSpaces ? writeSpaces.split(',').map(s => s.trim()) : [],
        writeLists: writeLists ? writeLists.split(',').map(s => s.trim()) : []
    };

    try {
        // 1. Create Connection
        const res = await fetch(`${API_BASE}/connections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, config })
        });
        const connData = await res.json();

        if (connData.error) throw new Error(connData.error);

        if (redirectUri) {
            // OAuth Mode: Request Auth Code and Redirect
            const authRes = await fetch(`${API_BASE}/auth/code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    connectionId: connData.id,
                    redirectUri,
                    // Send strictly as redirect_uri as well for robustness if needed,
                    // but backend expects 'redirectUri' or 'redirect_uri'.
                    // Let's stick to what was working and verify in router.ts it handles it.
                    // router.ts: const { connectionId, redirectUri } = req.body
                    // It seems router.ts expects redirectUri.
                })
            });
            const authData = await authRes.json();
            if (authData.error) throw new Error(authData.error);

            const code = authData.code;
            // Construct redirect URL
            const url = new URL(redirectUri);
            url.searchParams.set('code', code);
            if (state) url.searchParams.set('state', state);

            window.location.href = url.toString();
        } else {
            // Dashboard Mode: Return to list
            hideCreate();
            loadConnections();
        }
    } catch (e) {
        alert(e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

async function deleteConnection(id) {
    if (!confirm('Are you sure you want to delete this connection?')) return;
    await fetch(`${API_BASE}/connections/${id}`, { method: 'DELETE' });
    loadConnections();
}

async function viewConnection(id) {
    currentConnectionId = id;
    try {
        const res = await fetch(`${API_BASE}/connections/${id}`);
        const data = await res.json();

        document.getElementById('view-dashboard').classList.add('hidden');
        document.getElementById('view-detail').classList.remove('hidden');
        document.getElementById('session-output').classList.add('hidden');

        const config = data.config;
        document.getElementById('detail-content').innerHTML = `
            <div class="grid grid-cols-2 gap-x-4 gap-y-2">
                <span class="font-medium text-gray-600">Name:</span> <span class="text-gray-900">${data.name}</span>
                <span class="font-medium text-gray-600">Team ID:</span> <span class="text-gray-900">${config.teamId}</span>
                <span class="font-medium text-gray-600">Read Only:</span> <span class="text-gray-900">${config.readOnly ? 'Yes' : 'No'}</span>
                <span class="font-medium text-gray-600">Selective Write:</span> <span class="text-gray-900">${config.selectiveWrite ? 'Yes' : 'No'}</span>
            </div>
            ${config.writeSpaces?.length ? `<div class="mt-2"><span class="font-medium text-gray-600">Write Spaces:</span> <span class="text-gray-900">${config.writeSpaces.join(', ')}</span></div>` : ''}
            ${config.writeLists?.length ? `<div class="mt-2"><span class="font-medium text-gray-600">Write Lists:</span> <span class="text-gray-900">${config.writeLists.join(', ')}</span></div>` : ''}
            <div class="mt-2 text-xs text-gray-400">Created: ${new Date(data.createdAt).toLocaleString()}</div>
        `;

        loadSessions();
    } catch (e) {
        console.error(e);
        alert('Failed to load connection details');
    }
}

async function createSession() {
    if (!currentConnectionId) return;

    try {
        const res = await fetch(`${API_BASE}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId: currentConnectionId })
        });
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        document.getElementById('session-output').classList.remove('hidden');
        document.getElementById('token-display').innerText = data.accessToken;
        loadSessions();
    } catch (e) {
        alert(e.message);
    }
}

async function loadSessions() {
    if (!currentConnectionId) return;

    try {
        const res = await fetch(`${API_BASE}/connections/${currentConnectionId}/sessions`);
        const data = await res.json();

        const container = document.getElementById('session-list');
        if (data.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm">No active sessions.</p>';
            return;
        }

        container.innerHTML = data.map(sess => {
            const isRevoked = sess.revoked;
            const isExpired = new Date(sess.expiresAt) < new Date();
            const status = isRevoked ? 'Revoked' : (isExpired ? 'Expired' : 'Active');
            const statusColor = isRevoked || isExpired ? 'text-gray-500' : 'text-green-600';

            return `
                <div class="flex justify-between items-center text-sm p-2 bg-white border rounded">
                    <div>
                        <span class="font-mono text-xs text-gray-600">${sess.id.substring(0, 8)}...</span>
                        <span class="ml-2 ${statusColor} font-medium">${status}</span>
                        <div class="text-xs text-gray-400">Exp: ${new Date(sess.expiresAt).toLocaleDateString()}</div>
                    </div>
                    ${!isRevoked ? `<button onclick="revokeSession('${sess.id}')" class="text-red-500 hover:text-red-700 text-xs border border-red-200 px-2 py-1 rounded">Revoke</button>` : ''}
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error(e);
    }
}

async function revokeSession(sessionId) {
    if (!confirm('Revoke this session? Client will lose access immediately.')) return;
    await fetch(`${API_BASE}/sessions/${sessionId}/revoke`, { method: 'POST' });
    loadSessions();
}

function copyToken() {
    const text = document.getElementById('token-display').innerText;
    navigator.clipboard.writeText(text).then(() => {
        alert('Copied to clipboard!');
    });
}

// --- User Bound API Key Flow ---

function renderConfigForm(schema) {
    const container = document.getElementById('config-fields-container');
    container.innerHTML = schema.fields.map(field => {
        const requiredMark = field.required ? '<span class="text-red-500">*</span>' : '';
        const helpText = field.helpText ? `<p class="text-xs text-gray-500 mt-1">${field.helpText}</p>` : '';

        let inputHtml = '';
        if (field.type === 'select') {
            const options = field.options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
            inputHtml = `<select name="${field.name}" ${field.required ? 'required' : ''} class="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none">${options}</select>`;
        } else if (field.type === 'checkbox') {
            inputHtml = `
                <label class="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" name="${field.name}" class="form-checkbox h-4 w-4 text-blue-600">
                    <span class="text-sm text-gray-700">${field.label}</span>
                </label>`;
            return `<div class="p-2 bg-gray-50 rounded">${inputHtml}${helpText}</div>`;
        } else {
            const type = field.type === 'password' ? 'password' : 'text';
            inputHtml = `<input type="${type}" name="${field.name}" ${field.required ? 'required' : ''} class="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="${field.placeholder || ''}">`;
        }

        return `
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">${field.label} ${requiredMark}</label>
                ${inputHtml}
                ${helpText}
            </div>
        `;
    }).join('');
}

async function handleUserBoundSubmit(event) {
    event.preventDefault();
    const btn = document.getElementById('issue-btn');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Issuing...';

    const form = event.target;
    // Extract data
    const formData = {};
    // Iterate inputs
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        if (!input.name) return;
        if (input.type === 'checkbox') {
            formData[input.name] = input.checked;
        } else {
            formData[input.name] = input.value;
        }
    });

    try {
        const res = await fetch(`${API_BASE}/api-keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        // Success
        document.getElementById('user-bound-form').classList.add('hidden');
        document.getElementById('api-key-result').classList.remove('hidden');
        document.getElementById('new-api-key-display').innerText = data.apiKey;
    } catch (e) {
        alert(e.message || "Failed to issue key");
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

function copyNewKey() {
    const text = document.getElementById('new-api-key-display').innerText;
    navigator.clipboard.writeText(text).then(() => {
        alert('Copied key to clipboard!');
    });
}

function resetConfigForm() {
    document.getElementById('user-bound-form').reset();
    document.getElementById('user-bound-form').classList.remove('hidden');
    document.getElementById('api-key-result').classList.add('hidden');
}
