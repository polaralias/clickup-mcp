const API_BASE = '/api';
let currentConnectionId = null;

// Parse query parameters
const urlParams = new URLSearchParams(window.location.search);
const redirectUri = urlParams.get('redirect_uri') || urlParams.get('callback_url');
const state = urlParams.get('state');

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Try to load user-bound config schema
    try {
        const res = await fetch(`${API_BASE}/config-schema`);
        if (res.ok) {
            const schema = await res.json();
            renderConfigForm(schema);
            return;
        }
    } catch (e) {
        console.log("Failed to fetch schema", e);
    }
    
    // In this workflow, we expect user_bound mode.
    // If it fails, we still show the status banner for troubleshooting.
    fetchConfigStatus();
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
