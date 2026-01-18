const API_BASE = '/api';
const urlParams = new URLSearchParams(window.location.search);
const redirectUri = urlParams.get('redirect_uri') || urlParams.get('callback_url');
const state = urlParams.get('state');

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch(`${API_BASE}/config-schema`);
        if (res.ok) {
            const schema = await res.json();
            renderConfigForm(schema);
            document.getElementById('view-config-entry').classList.remove('hidden');
            await fetchConfigStatus();
            return;
        }
    } catch (e) { console.error('Failed to load config schema', e); }
    await fetchConfigStatus();
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
            icon.innerText = '✅';
            title.innerText = 'Server is configured';
            message.innerText = `Encryption key is set (${data.format}).`;
            guidance.innerText = '';
        } else {
            banner.className = 'mb-6 p-4 rounded-lg border bg-red-50 border-red-200 text-red-800';
            icon.innerText = '❌';
            title.innerText = 'Server is not configured';
            message.innerText = 'The required encryption key is missing. User-bound API keys cannot be issued.';
            guidance.innerText = 'Set the server encryption key environment variable to enable secure storage and key issuance.';
        }
    } catch (e) {
        banner.classList.remove('hidden');
        banner.className = 'mb-6 p-4 rounded-lg border bg-red-50 border-red-200 text-red-800';
        icon.innerText = '❌';
        title.innerText = 'Unable to check server status';
        message.innerText = 'Could not reach /api/config-status. Is the server running?';
        guidance.innerText = '';
    }
}

function renderConfigForm(schema) {
    const container = document.getElementById('config-fields-container');
    container.innerHTML = '';
    schema.fields.forEach(field => {
        const fieldName = field.name || field.key;
        const wrapper = document.createElement('div');
        const label = document.createElement('label');
        label.className = 'block text-sm font-medium text-gray-700 mb-1';
        label.innerText = field.label;
        wrapper.appendChild(label);
        let input;
        if (field.type === 'select') {
            input = document.createElement('select');
            input.className = 'w-full p-2 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500';
            (field.options || []).forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.innerText = opt.label;
                input.appendChild(option);
            });
        } else if (field.type === 'checkbox' || field.type === 'boolean') {
            const checkboxWrapper = document.createElement('div');
            checkboxWrapper.className = 'flex items-center bg-gray-50 border border-gray-300 rounded-lg p-2';
            input = document.createElement('input');
            input.type = 'checkbox';
            input.id = fieldName;
            input.className = 'mr-2';
            const cbLabel = document.createElement('span');
            cbLabel.className = 'text-sm text-gray-700';
            cbLabel.innerText = field.description || '';
            checkboxWrapper.appendChild(input);
            checkboxWrapper.appendChild(cbLabel);
            wrapper.appendChild(checkboxWrapper);
            input.name = fieldName;
            if (field.required) input.required = true;
            container.appendChild(wrapper);
            return;
        } else if (field.type === 'textarea') {
            input = document.createElement('textarea');
            input.className = 'w-full p-2 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500';
            input.rows = field.rows || 4;
            input.placeholder = field.placeholder || '';
        } else {
            input = document.createElement('input');
            input.type = field.type === 'password' ? 'password' : 'text';
            input.className = 'w-full p-2 border border-gray-300 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500';
            input.placeholder = field.placeholder || '';
        }
        input.name = fieldName;
        input.id = fieldName;
        if (field.required) input.required = true;
        if (field.format) input.dataset.format = field.format;
        wrapper.appendChild(input);
        if (field.description) {
            const hint = document.createElement('p');
            hint.className = 'text-xs text-gray-500 mt-1';
            hint.innerText = field.description;
            wrapper.appendChild(hint);
        }
        container.appendChild(wrapper);
    });
    document.getElementById('user-bound-form').addEventListener('submit', handleIssueKey);
}

async function handleIssueKey(e) {
    e.preventDefault();
    const btn = document.getElementById('issue-btn');
    const originalText = btn.innerText;
    btn.innerText = 'Issuing...';
    btn.disabled = true;
    const form = e.target;
    const formData = new FormData(form);
    const payload = {};
    for (const [k, v] of formData.entries()) {
        const el = document.getElementById(k);
        if (el && el.type === 'checkbox') {
            payload[k] = el.checked;
        } else if (el && el.dataset && el.dataset.format === 'csv') {
            payload[k] = String(v).split(',').map(s => s.trim()).filter(Boolean);
        } else {
            payload[k] = v;
        }
    }
    try {
        const res = await fetch(`${API_BASE}/api-keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to issue API key');
        showApiKeyResult(data.apiKey);
    } catch (err) { alert(err.message); } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function showApiKeyResult(apiKey) {
    document.getElementById('view-config-entry').classList.add('hidden');
    document.getElementById('api-key-result').classList.remove('hidden');
    const pre = document.getElementById('api-key-value');
    pre.innerText = apiKey;
    document.getElementById('copy-btn').onclick = async () => {
        try {
            await navigator.clipboard.writeText(apiKey);
            document.getElementById('copy-btn').innerText = 'Copied!';
            setTimeout(() => (document.getElementById('copy-btn').innerText = 'Copy'), 1500);
        } catch (e) { alert('Copy failed'); }
    };
    if (redirectUri) {
        const url = new URL(redirectUri);
        url.searchParams.set('api_key', apiKey);
        if (state) url.searchParams.set('state', state);
        setTimeout(() => { window.location.href = url.toString(); }, 500);
    }
}

function resetConfigForm() {
    document.getElementById('api-key-result').classList.add('hidden');
    document.getElementById('view-config-entry').classList.remove('hidden');
    document.getElementById('user-bound-form').reset();
}
