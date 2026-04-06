/* ── API Providers View ─────────────────────────────────────────── */
(function () {
    const REGISTRY_URL = '/api/registry';

    const ICONS = {
        google_ai:  'fab fa-google',
        openai:     'fab fa-openai',
        anthropic:  'fas fa-brain',
        grok:       'fas fa-bolt',
        xai:        'fas fa-bolt',
        groq:       'fas fa-bolt',
        mistral:    'fas fa-wind',
        ollama:     'fas fa-microchip',
    };

    const DESCRIPTIONS = {
        google_ai:  'Gemini models — Flash for speed, Pro for complex reasoning and multimodal tasks.',
        openai:     'GPT-4o, o1, and mini variants. Industry-standard reasoning and multimodal capability.',
        anthropic:  'Claude 3.5 Sonnet & Haiku. Sophisticated reasoning and reliable outputs.',
        grok:       'xAI Grok models with real-time knowledge and strong reasoning.',
        groq:       'Lightning-fast LPU inference for Llama, Mixtral, and Gemma models.',
        mistral:    'Mistral Large, Pixtral, Codestral. High-efficiency European-hosted models.',
        ollama:     'Locally hosted models via the Ollama backend. Zero API cost.',
    };

    const DEFAULT_ICON = 'fas fa-plug';
    const DEFAULT_DESC = 'External AI service provider.';

    /* ── Helpers ──────────────────────────────────────────────────── */
    function iconFor(id) { return ICONS[id] || DEFAULT_ICON; }
    function descFor(id) { return DESCRIPTIONS[id] || DEFAULT_DESC; }

    function providerLabel(id) {
        const map = {
            google_ai: 'Google AI',
            openai:    'OpenAI',
            anthropic: 'Anthropic',
            grok:      'Grok (xAI)',
            xai:       'xAI',
            groq:      'Groq',
            mistral:   'Mistral AI',
            ollama:    'Ollama',
        };
        return map[id] || id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    function statusInfo(provider) {
        const models = provider.models || {};
        const modelCount = Object.keys(models).length;
        if (!provider.active) return { label: 'Inactive', cls: 'ap-status-inactive', count: modelCount };
        if (modelCount === 0) return { label: 'Standby', cls: 'ap-status-standby', count: 0 };
        return { label: 'Connected', cls: 'ap-status-connected', count: modelCount };
    }

    function formatCost(val) {
        if (val === undefined || val === null || val === '') return '—';
        const n = parseFloat(val);
        if (isNaN(n)) return '—';
        return '$' + n.toFixed(n < 1 ? 4 : 2);
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escAttr(str) {
        return String(str).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    }

    /* ── Fetch helpers ────────────────────────────────────────────── */
    async function fetchRegistry() {
        const res = await fetch(REGISTRY_URL);
        if (!res.ok) throw new Error(`GET ${REGISTRY_URL} → ${res.status}`);
        return res.json();
    }

    async function saveRegistry(registry) {
        const res = await fetch(REGISTRY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(registry),
        });
        if (!res.ok) throw new Error(`POST ${REGISTRY_URL} → ${res.status}`);
        return res.json().catch(() => ({}));
    }

    /* ── Render ───────────────────────────────────────────────────── */
    function renderModelRows(providerId, models) {
        const entries = Object.entries(models || {});
        if (entries.length === 0) {
            return `<tr class="ap-empty-row"><td colspan="5">No models configured.</td></tr>`;
        }
        return entries.map(([modelId, cfg]) => {
            const capPills = (cfg.capabilities || [])
                .map(c => `<span class="ap-cap-pill">${escHtml(c)}</span>`)
                .join('');
            return `
            <tr data-model-id="${escAttr(modelId)}">
                <td><span class="ap-model-id">${escHtml(modelId)}</span></td>
                <td class="ap-cost">${formatCost(cfg.input_cost_per_1m_tokens)}</td>
                <td class="ap-cost">${formatCost(cfg.output_cost_per_1m_tokens)}</td>
                <td><div class="ap-caps">${capPills || '<span class="ap-cap-pill">CHAT</span>'}</div></td>
                <td>
                    <button class="ap-btn-delete" title="Remove model"
                        onclick="apDeleteModel('${escAttr(providerId)}', '${escAttr(modelId)}', this)">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    function renderCard(providerId, provider) {
        const si = statusInfo(provider);
        const icon = iconFor(providerId);
        const desc = descFor(providerId);
        const label = providerLabel(providerId);

        return `
        <div class="ap-card" id="ap-card-${escAttr(providerId)}">
            <div class="ap-card-header" onclick="apToggleCard('${escAttr(providerId)}')">
                <div class="ap-provider-icon">
                    <i class="${escAttr(icon)}"></i>
                </div>
                <div class="ap-provider-meta">
                    <p class="ap-provider-name">${escHtml(label)}</p>
                    <p class="ap-provider-desc">${escHtml(desc)}</p>
                </div>
                <div class="ap-card-right">
                    <span class="ap-model-count">${si.count} model${si.count !== 1 ? 's' : ''}</span>
                    <span class="ap-status ${escAttr(si.cls)}">${escHtml(si.label)}</span>
                    <i class="fas fa-chevron-down ap-chevron"></i>
                </div>
            </div>
            <div class="ap-card-body">
                <table class="ap-model-table">
                    <thead>
                        <tr>
                            <th>Model ID</th>
                            <th>Input / 1M</th>
                            <th>Output / 1M</th>
                            <th>Capabilities</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="ap-tbody-${escAttr(providerId)}">
                        ${renderModelRows(providerId, provider.models)}
                    </tbody>
                </table>
                <div class="ap-add-row" id="ap-addrow-${escAttr(providerId)}">
                    <input class="ap-add-input id-input"
                        id="ap-newid-${escAttr(providerId)}"
                        type="text" placeholder="model-id" autocomplete="off" />
                    <label>In</label>
                    <input class="ap-add-input cost-input"
                        id="ap-incost-${escAttr(providerId)}"
                        type="number" placeholder="0.00" min="0" step="0.0001" />
                    <label>Out</label>
                    <input class="ap-add-input cost-input"
                        id="ap-outcost-${escAttr(providerId)}"
                        type="number" placeholder="0.00" min="0" step="0.0001" />
                    <button class="ap-btn-add"
                        onclick="apAddModel('${escAttr(providerId)}', this)">
                        <i class="fas fa-plus"></i> Add
                    </button>
                    <span class="ap-feedback" id="ap-fb-${escAttr(providerId)}"></span>
                </div>
            </div>
        </div>`;
    }

    /* ── Init ─────────────────────────────────────────────────────── */
    async function apInit() {
        const grid = document.getElementById('ap-provider-grid');
        if (!grid) return;

        grid.innerHTML = `<div class="ap-loading"><i class="fas fa-circle-notch fa-spin"></i><span>Loading registry...</span></div>`;

        try {
            const registry = await fetchRegistry();
            const providers = registry.providers || {};
            // API providers only — local models are managed in Settings
            const keys = Object.keys(providers).filter(id => id !== 'local');

            if (keys.length === 0) {
                grid.innerHTML = `<div class="ap-loading"><i class="fas fa-info-circle"></i><span>No API providers found in registry.</span></div>`;
                return;
            }

            grid.innerHTML = keys.map(id => renderCard(id, providers[id])).join('');
        } catch (err) {
            grid.innerHTML = `<div class="ap-loading"><i class="fas fa-exclamation-triangle"></i><span>Failed to load registry: ${escHtml(err.message)}</span></div>`;
        }
    }

    /* ── Toggle expand ────────────────────────────────────────────── */
    window.apToggleCard = function (providerId) {
        const card = document.getElementById(`ap-card-${providerId}`);
        if (card) card.classList.toggle('expanded');
    };

    /* ── Delete model ─────────────────────────────────────────────── */
    window.apDeleteModel = async function (providerId, modelId, btn) {
        if (!confirm(`Remove model "${modelId}" from ${providerLabel(providerId)}?`)) return;

        btn.disabled = true;
        const fbEl = document.getElementById(`ap-fb-${providerId}`);

        try {
            const registry = await fetchRegistry();
            const prov = (registry.providers || {})[providerId];
            if (!prov || !prov.models) throw new Error('Provider not found in registry');

            delete prov.models[modelId];
            await saveRegistry(registry);

            const tbody = document.getElementById(`ap-tbody-${providerId}`);
            if (tbody) tbody.innerHTML = renderModelRows(providerId, prov.models);

            const card = document.getElementById(`ap-card-${providerId}`);
            if (card) {
                const si = statusInfo(prov);
                const countEl = card.querySelector('.ap-model-count');
                if (countEl) countEl.textContent = `${si.count} model${si.count !== 1 ? 's' : ''}`;
                const statusEl = card.querySelector('.ap-status');
                if (statusEl) { statusEl.className = `ap-status ${si.cls}`; statusEl.textContent = si.label; }
            }

            if (fbEl) { fbEl.textContent = 'Removed.'; fbEl.className = 'ap-feedback success'; setTimeout(() => { if (fbEl) fbEl.textContent = ''; }, 2000); }
        } catch (err) {
            if (fbEl) { fbEl.textContent = err.message; fbEl.className = 'ap-feedback error'; }
            btn.disabled = false;
        }
    };

    /* ── Add model ────────────────────────────────────────────────── */
    window.apAddModel = async function (providerId, btn) {
        const idEl   = document.getElementById(`ap-newid-${providerId}`);
        const inEl   = document.getElementById(`ap-incost-${providerId}`);
        const outEl  = document.getElementById(`ap-outcost-${providerId}`);
        const fbEl   = document.getElementById(`ap-fb-${providerId}`);

        const modelId = idEl ? idEl.value.trim() : '';
        if (!modelId) {
            if (fbEl) { fbEl.textContent = 'Model ID is required.'; fbEl.className = 'ap-feedback error'; }
            return;
        }

        btn.disabled = true;

        try {
            const registry = await fetchRegistry();
            if (!registry.providers) registry.providers = {};
            if (!registry.providers[providerId]) registry.providers[providerId] = { models: {} };
            if (!registry.providers[providerId].models) registry.providers[providerId].models = {};

            const inputCost  = inEl  && inEl.value  !== '' ? parseFloat(inEl.value)  : null;
            const outputCost = outEl && outEl.value !== '' ? parseFloat(outEl.value) : null;

            const modelEntry = { capabilities: ['CHAT'] };
            if (inputCost  !== null && !isNaN(inputCost))  modelEntry.input_cost_per_1m_tokens  = inputCost;
            if (outputCost !== null && !isNaN(outputCost)) modelEntry.output_cost_per_1m_tokens = outputCost;

            registry.providers[providerId].models[modelId] = modelEntry;
            await saveRegistry(registry);

            const tbody = document.getElementById(`ap-tbody-${providerId}`);
            if (tbody) tbody.innerHTML = renderModelRows(providerId, registry.providers[providerId].models);

            const card = document.getElementById(`ap-card-${providerId}`);
            if (card) {
                const si = statusInfo(registry.providers[providerId]);
                const countEl = card.querySelector('.ap-model-count');
                if (countEl) countEl.textContent = `${si.count} model${si.count !== 1 ? 's' : ''}`;
                const statusEl = card.querySelector('.ap-status');
                if (statusEl) { statusEl.className = `ap-status ${si.cls}`; statusEl.textContent = si.label; }
            }

            if (idEl)  idEl.value  = '';
            if (inEl)  inEl.value  = '';
            if (outEl) outEl.value = '';

            if (fbEl) { fbEl.textContent = 'Model added.'; fbEl.className = 'ap-feedback success'; setTimeout(() => { if (fbEl) fbEl.textContent = ''; }, 2000); }
        } catch (err) {
            if (fbEl) { fbEl.textContent = err.message; fbEl.className = 'ap-feedback error'; }
        } finally {
            btn.disabled = false;
        }
    };

    /* ── Register with tab system ─────────────────────────────────── */
    if (typeof registerTabInit === 'function') {
        registerTabInit('api-providers', apInit);
    }
})();
