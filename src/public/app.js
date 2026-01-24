const API_BASE = '/api';
const urlParams = new URLSearchParams(window.location.search);
const redirectUri = urlParams.get('redirect_uri') || urlParams.get('callback_url');
const state = urlParams.get('state');

document.addEventListener('DOMContentLoaded', async () => {
    // Populate OAuth hint URL
    const baseUrl = window.location.origin;
    const oauthUrlEl = document.getElementById('oauth-url');
    if (oauthUrlEl) {
        oauthUrlEl.innerText = baseUrl;
    }

    const fallbackMsg = document.getElementById('fallback-message');
    if (fallbackMsg) {
        fallbackMsg.innerHTML = fallbackMsg.innerHTML.replace('{{BASE_URL}}', baseUrl);
    }

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
    const title = document.getElementById('status-title');
    try {
        const res = await fetch(`${API_BASE}/config-status`);
        const data = await res.json();
        banner.classList.remove('hidden');
        if (data.status === 'present') {
            banner.style.background = 'rgba(16, 185, 129, 0.1)';
            banner.style.border = '1px solid rgba(16, 185, 129, 0.2)';
            banner.style.color = '#10b981';
            title.innerText = '✓ Server Configured';
        } else {
            banner.style.background = 'rgba(239, 68, 68, 0.1)';
            banner.style.border = '1px solid rgba(239, 68, 68, 0.2)';
            banner.style.color = '#ef4444';
            title.innerText = '⚠ Server Not Configured';
        }
    } catch (e) {
        banner.classList.remove('hidden');
        banner.style.background = 'rgba(239, 68, 68, 0.1)';
        banner.style.color = '#ef4444';
        title.innerText = 'Unable to check status';
    }
}

function renderConfigForm(schema) {
    const container = document.getElementById('config-fields-container');
    container.innerHTML = '';
    schema.fields.forEach(field => {
        const fieldName = field.name || field.key;
        const wrapper = document.createElement('div');
        wrapper.className = 'input-group animate-fade-in';
        const label = document.createElement('label');
        label.innerText = field.label;
        wrapper.appendChild(label);
        let input;

        const inputBaseClass = 'w-full p-3 border border-indigo-500/20 rounded-xl bg-slate-900/50 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all';

        if (field.type === 'select') {
            input = document.createElement('select');
            input.className = inputBaseClass;
            (field.options || []).forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.innerText = opt.label;
                input.appendChild(option);
            });
        } else if (field.type === 'checkbox' || field.type === 'boolean') {
            const checkboxWrapper = document.createElement('div');
            checkboxWrapper.className = 'flex items-center bg-slate-900/30 border border-indigo-500/10 rounded-xl p-3';
            input = document.createElement('input');
            input.type = 'checkbox';
            input.id = fieldName;
            input.className = 'w-5 h-5 mr-3 rounded border-indigo-500/20 bg-slate-900 text-indigo-500 focus:ring-indigo-500/50';
            const cbLabel = document.createElement('span');
            cbLabel.className = 'text-sm text-slate-300';
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
            input.className = inputBaseClass;
            input.rows = field.rows || 4;
            input.placeholder = field.placeholder || '';
        } else {
            input = document.createElement('input');
            input.type = field.type === 'password' ? 'password' : 'text';
            input.className = inputBaseClass;
            input.placeholder = field.placeholder || '';
        }
        input.name = fieldName;
        input.id = fieldName;
        if (field.required) input.required = true;
        if (field.format) input.dataset.format = field.format;
        wrapper.appendChild(input);
        if (field.description && field.type !== 'checkbox') {
            const hint = document.createElement('p');
            hint.className = 'text-xs text-slate-500 mt-2 ml-1';
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
