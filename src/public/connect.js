document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const fields = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method'];
    const err = document.getElementById('error-msg');
    const schemaStatus = document.getElementById('schema-status');
    const required = ['client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method'];
    const missing = required.filter(f => !params.get(f));

    if (missing.length > 0) {
        err.innerText = `Missing required parameters: ${missing.join(', ')}`;
        err.classList.remove('hidden');
        document.getElementById('submit-btn').disabled = true;
    }
    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = params.get(f) || '';
    });

    let schema = null;
    try {
        schemaStatus.innerText = 'Loading fields...';
        schema = await fetchSchema(['/api/connect-schema', '/api/config-schema']);
        if (schema && Array.isArray(schema.fields)) {
            renderFields(schema.fields, document.getElementById('connection-fields-container'));
            schemaStatus.innerText = '';
        } else { schemaStatus.innerText = 'No schema provided'; }
    } catch (e) { schemaStatus.innerText = 'Failed to load fields'; }

    document.getElementById('connect-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submit-btn');
        const originalText = btn.innerText;
        btn.innerText = 'Connecting...';
        btn.disabled = true;
        err.classList.add('hidden');
        err.innerText = '';

        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        const config = {};
        const container = document.getElementById('connection-fields-container');
        const inputs = container.querySelectorAll('input, select, textarea');

        inputs.forEach(el => {
            const name = el.name || el.id;
            if (!name) return;
            if (el.type === 'checkbox') { config[name] = el.checked; return; }
            if (el.dataset && el.dataset.format === 'csv') {
                config[name] = String(el.value || '').split(',').map(s => s.trim()).filter(Boolean);
                return;
            }
            if (el.dataset && el.dataset.format === 'json') {
                const raw = String(el.value || '').trim();
                config[name] = raw ? JSON.parse(raw) : null;
                return;
            }
            config[name] = el.value;
        });

        const payload = {
            client_id: data.client_id,
            redirect_uri: data.redirect_uri,
            state: data.state,
            code_challenge: data.code_challenge,
            code_challenge_method: data.code_challenge_method,
            csrf_token: data.csrf_token,
            name: data.name,
            config
        };

        try {
            const res = await fetch('/authorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const out = await res.json();
            if (!res.ok) throw new Error(out.error || 'Connection failed');
            if (out.redirectUrl) { window.location.href = out.redirectUrl; return; }
            throw new Error('No redirect URL returned');
        } catch (ex) {
            err.innerText = ex.message;
            err.classList.remove('hidden');
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    });
});

async function fetchSchema(paths) {
    for (const p of paths) {
        const res = await fetch(p);
        if (res.ok) return await res.json();
    }
    return null;
}

function renderFields(fields, container) {
    container.innerHTML = '';
    fields.forEach(field => {
        const wrapper = document.createElement('div');
        wrapper.className = 'input-group animate-fade-in';
        const label = document.createElement('label');
        label.className = 'label-text';
        label.innerText = field.label || field.name;
        wrapper.appendChild(label);
        let input;

        const inputBaseClass = 'input-field';

        if (field.type === 'select') {
            input = document.createElement('select');
            input.className = inputBaseClass;
            (field.options || []).forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.innerText = opt.label;
                input.appendChild(option);
            });
        } else if (field.type === 'checkbox') {
            const checkboxWrapper = document.createElement('div');
            checkboxWrapper.className = 'flex items-center bg-white/5 border border-white/10 rounded-2xl p-4 transition-all hover:bg-white/10';
            input = document.createElement('input');
            input.type = 'checkbox';
            input.id = field.name;
            input.name = field.name;
            input.className = 'w-5 h-5 mr-4 rounded border-white/20 bg-black/40 text-blue-500 focus:ring-blue-500/50';
            const cbLabel = document.createElement('span');
            cbLabel.className = 'text-sm text-blue-100/70';
            cbLabel.innerText = field.description || '';
            checkboxWrapper.appendChild(input);
            checkboxWrapper.appendChild(cbLabel);
            wrapper.appendChild(checkboxWrapper);
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
        input.id = field.name;
        input.name = field.name;
        if (field.required) input.required = true;
        if (field.format) input.dataset.format = field.format;
        wrapper.appendChild(input);
        if (field.description && field.type !== 'checkbox') {
            const hint = document.createElement('p');
            hint.className = 'text-[10px] text-blue-200/30 mt-2 ml-2 uppercase tracking-widest font-bold';
            hint.innerText = field.description;
            wrapper.appendChild(hint);
        }
        container.appendChild(wrapper);
    });
}
