// Misaka Cipher - Preferences & Settings View
// Handles interacting with user preferences and provider configuration data

const prefs = {
    data: {},

    async load() {
        try {
            const response = await fetch('/api/preferences');
            this.data = await response.json();
            console.log('Loaded preferences:', this.data);
            return this.data;
        } catch (error) {
            console.error('Failed to load preferences:', error);
            return {};
        }
    },

    get(key, defaultValue) {
        // Generic dot notation support
        if (key.includes('.')) {
            const parts = key.split('.');
            let current = this.data;
            for (const part of parts) {
                if (current === undefined || current === null) return defaultValue;
                current = current[part];
            }
            return current !== undefined ? current : defaultValue;
        }

        return this.data[key] !== undefined ? this.data[key] : defaultValue;
    },

    async set(key, value) {
        // Update local cache immediately
        if (key.includes('.')) {
            const parts = key.split('.');
            if (!this.data[parts[0]]) this.data[parts[0]] = {};
            this.data[parts[0]][parts[1]] = value;
        } else {
            this.data[key] = value;
        }

        // Save to server
        try {
            await fetch(`/api/preferences/${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value })
            });
        } catch (error) {
            console.error(`Failed to save preference ${key}:`, error);
        }
    }
};

async function loadPreferences() {
    await prefs.load();

    // Apply Active Tab
    const activeTab = prefs.get('active_tab');
    if (activeTab && activeTab !== (typeof currentMainTab !== 'undefined' ? currentMainTab : '')) {
        if (typeof switchMainTab === 'function') switchMainTab(activeTab, false);
    }

    // Apply Package Filters 
    if (typeof allPackages !== 'undefined' && allPackages.length > 0) {
        if (typeof renderPackagesTable === 'function') renderPackagesTable();
    }

    // Apply Settings UI
    const hideSystem = document.getElementById('setting-hide-system-pkgs');
    if (hideSystem) hideSystem.checked = prefs.get('package_filters.hide_system', false);

    const assistantEnabled = document.getElementById('setting-assistant-enabled');
    if (assistantEnabled) {
        assistantEnabled.checked = prefs.get('assistant.enabled', true);

        // Remove old listener if any to prevent duplicates (though loadPreferences is usually called once)
        assistantEnabled.onchange = async (e) => {
            await savePreference('assistant.enabled', e.target.checked);

            // Dispatch event so assistant.js can pick it up immediately
            window.dispatchEvent(new CustomEvent('assistantSettingsUpdated', {
                detail: { enabled: e.target.checked }
            }));
        };
    }

    const assistantModel = document.getElementById('setting-assistant-model');
    if (assistantModel) {
        // The options will be populated by loadChatModels() later, but we can set up the change listener here
        assistantModel.onchange = async (e) => {
            await savePreference('assistant.model', e.target.value);
        };
    }

    const assistantContext = document.getElementById('setting-assistant-context');
    if (assistantContext) {
        assistantContext.checked = prefs.get('assistant.include_web_context', false);
        assistantContext.onchange = async (e) => {
            await savePreference('assistant.include_web_context', e.target.checked);
        };
    }

    const assistantTypingSpeed = document.getElementById('setting-assistant-typing-speed');
    const assistantTypingVal = document.getElementById('setting-assistant-typing-speed-val');
    if (assistantTypingSpeed && assistantTypingVal) {
        const currentSpeed = prefs.get('assistant.typing_speed', 20);
        assistantTypingSpeed.value = currentSpeed;
        assistantTypingVal.textContent = currentSpeed;

        assistantTypingSpeed.oninput = (e) => {
            assistantTypingVal.textContent = e.target.value;
        };
        assistantTypingSpeed.onchange = async (e) => {
            const val = parseInt(e.target.value, 10);
            await savePreference('assistant.typing_speed', val);
            window.dispatchEvent(new CustomEvent('assistantSettingsUpdated', {
                detail: { typing_speed: val }
            }));
        };
    }

    const assistantContextLimit = document.getElementById('setting-assistant-context-limit');
    const assistantContextLimitVal = document.getElementById('setting-assistant-context-limit-val');
    if (assistantContextLimit && assistantContextLimitVal) {
        const currentLimit = prefs.get('assistant.context_limit', 5);
        assistantContextLimit.value = currentLimit;
        assistantContextLimitVal.textContent = currentLimit;

        assistantContextLimit.oninput = (e) => {
            assistantContextLimitVal.textContent = e.target.value;
        };
        assistantContextLimit.onchange = async (e) => {
            const val = parseInt(e.target.value, 10);
            await savePreference('assistant.context_limit', val);
            window.dispatchEvent(new CustomEvent('assistantSettingsUpdated', {
                detail: { context_limit: val }
            }));
        };
    }

    if (typeof updateChatLayout === 'function') updateChatLayout();
}

async function savePreference(key, value) {
    await prefs.set(key, value);
}

// Ensure the UI calls prefs properly
const originalSwitchMainTab = typeof switchMainTab === 'function' ? switchMainTab : function (t) { };
window.switchMainTab = function (tabName, save = true) {
    originalSwitchMainTab(tabName);
    if (save) savePreference('active_tab', tabName);
};

// ===== Provider Settings =====

let _registryData = null;
let _suggestedModels = {};
let _settingsDirty = false;

function markSettingsDirty() {
    if (_settingsDirty) return;
    _settingsDirty = true;
    const banner = document.getElementById('provider-unsaved-banner');
    if (banner) banner.style.display = 'block';
}

function clearSettingsDirty() {
    _settingsDirty = false;
    const banner = document.getElementById('provider-unsaved-banner');
    if (banner) banner.style.display = 'none';
}

async function loadProviderSettings() {
    try {
        // Load registry and suggestions in parallel
        const [regRes, sugRes] = await Promise.all([
            fetch('/api/registry'),
            fetch('/api/registry/suggested')
        ]);

        if (!regRes.ok) throw new Error('Failed to load registry');
        _registryData = await regRes.json();

        if (sugRes.ok) {
            _suggestedModels = await sugRes.json();
        }

        renderProviderCards(_registryData);
        loadChatModels();
        clearSettingsDirty();
    } catch (error) {
        console.error('Error loading provider settings:', error);
        const container = document.getElementById('provider-cards-container');
        if (container) container.innerHTML = '<div class="loading-placeholder">Error loading providers</div>';
    }
}

async function loadChatModels() {
    const select = document.getElementById('model-select');
    const assistantSelect = document.getElementById('setting-assistant-model');

    if (!select && !assistantSelect) return;

    const currentVal = select ? select.value : null;
    try {
        const res = await fetch('/api/registry/models/chat');
        if (!res.ok) throw new Error('Failed to load chat models');
        const data = await res.json();

        let html = '<option value="auto">Model: Auto</option>';
        let assistantHtml = '';

        for (const m of data.models || []) {
            const costHint = (m.input_cost_per_1m_tokens || m.output_cost_per_1m_tokens)
                ? ` ($${m.input_cost_per_1m_tokens}/$${m.output_cost_per_1m_tokens})`
                : '';
            const option = `<option value="${m.id}" title="${m.description || ''}">${m.id}${costHint}</option>`;
            html += option;
            assistantHtml += option;
        }

        if (select) {
            select.innerHTML = html;
            if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
                select.value = currentVal;
            }
        }

        if (assistantSelect) {
            assistantSelect.innerHTML = assistantHtml;
            // Set value from preferences
            const prefModel = prefs.get('assistant.model', 'gemini-2.0-flash');
            if (assistantSelect.querySelector(`option[value="${prefModel}"]`)) {
                assistantSelect.value = prefModel;
            }
        }

    } catch (err) {
        console.error('Error loading chat models:', err);
    }
}

function renderProviderCards(registry) {
    const container = document.getElementById('provider-cards-container');
    if (!container) return;

    const providers = registry.providers || {};
    if (Object.keys(providers).length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No providers configured</div>';
        return;
    }

    container.innerHTML = '';

    for (const [name, config] of Object.entries(providers)) {
        const chatConfig = config.chat_config || { active: config.active, priority: config.priority };
        const agentConfig = config.agent_config || { active: config.active, priority: config.priority };
        const isMainActive = chatConfig.active || agentConfig.active;

        const card = document.createElement('div');
        card.className = `provider-card ${isMainActive ? 'active' : 'inactive'}`;
        card.dataset.provider = name;

        // Build model rows
        const models = config.models || {};
        const sortedModelKeys = Object.keys(models).sort();
        let modelCardsHtml = '';

        for (const modelKey of sortedModelKeys) {
            const modelInfo = models[modelKey];
            const info = typeof modelInfo === 'object' ? modelInfo : { id: modelInfo };
            const caps = (info.capabilities || []);
            const isImageGen = caps.includes('image_generation');

            const capsHtml = caps.map(c =>
                `<span class="cap-tag ${c === 'image_generation' ? 'cap-image' : ''}" data-cap="${c}" title="Click to remove">${c} x</span>`
            ).join('');

            const inputCost = info.input_cost_per_1m_tokens ?? '';
            const outputCost = info.output_cost_per_1m_tokens ?? '';
            const desc = info.description || info.notes || '';

            // Image Config Data
            const imgConfig = info.image_config || {};
            const aspects = (imgConfig.aspect_ratios || []).join(', ');
            const resols = (imgConfig.resolutions || []).join(', ');

            modelCardsHtml += `
                <tr class="model-entry" data-model-key="${modelKey}">
                    <td>
                        <input type="text" class="model-input input-model-id model-id-input" value="${info.id || ''}" placeholder="model-id">
                    </td>
                    <td>
                        <input type="number" class="model-input input-cost model-input-cost" value="${inputCost}" step="0.01" min="0" placeholder="0.00">
                    </td>
                    <td>
                        <input type="number" class="model-input input-cost model-output-cost" value="${outputCost}" step="0.01" min="0" placeholder="0.00">
                    </td>
                    <td>
                        <div class="caps-cell model-caps-container">
                            ${capsHtml}
                            <select class="cap-add-select term-select" style="width: 80px; font-size: 0.8rem; padding: 2px;">
                                <option value="" disabled selected>+ Add</option>
                                <option value="chat">Chat</option>
                                <option value="analysis">Analysis</option>
                                <option value="code_generation">Code</option>
                                <option value="image_generation">Image Gen</option>
                                <option value="complex_reasoning">Reasoning</option>
                                <option value="verification">Verification</option>
                            </select>
                        </div>
                    </td>
                    <td>
                        <input type="text" class="model-input input-desc model-desc-input" value="${desc}" placeholder="Description...">
                    </td>
                    <td style="text-align: center; display: flex; gap: 5px; justify-content: center;">
                        ${isImageGen ? `<button class="btn-icon model-config-btn" title="Configure Image Settings">ÔÜÖ´©Å</button>` : ''}
                        <button class="btn-icon model-delete-btn" data-provider="${name}" data-model-key="${modelKey}" title="Remove model">x</button>
                    </td>
                </tr>
            `;

            if (isImageGen) {
                modelCardsHtml += `
                    <tr class="image-config-row" style="display: none; background: rgba(0,0,0,0.2);">
                        <td colspan="6" style="padding: 10px 20px;">
                            <div class="image-config-form" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div class="config-group">
                                    <label>Aspect Ratios (comma-separated)</label>
                                    <input type="text" class="model-input img-config-aspects" value="${aspects}" placeholder="1:1, 16:9, 4:3">
                                </div>
                                <div class="config-group">
                                    <label>Resolutions (comma-separated)</label>
                                    <input type="text" class="model-input img-config-resols" value="${resols}" placeholder="1024x1024, 1024x1792">
                                </div>
                                <div class="config-group" style="grid-column: span 2; display: flex; gap: 20px; align-items: center;">
                                    <label class="checkbox-label">
                                        <input type="checkbox" class="img-config-neg-prompt" ${imgConfig.supports_negative_prompt ? 'checked' : ''}>
                                        Negative Prompt
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" class="img-config-seed" ${imgConfig.supports_seed ? 'checked' : ''}>
                                        Seed Control
                                    </label>
                                    <label class="checkbox-label">
                                        <input type="checkbox" class="img-config-quality" ${(imgConfig.quality_options?.length > 1) ? 'checked' : ''}>
                                        HD Quality Option
                                    </label>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            }
        }

        // Build suggestion options for this provider
        const suggestions = _suggestedModels[name] || [];
        let suggestOptions = '<option value="">Select suggested model</option>';
        for (const s of suggestions) {
            suggestOptions += `<option value="${s.key}" data-model='${JSON.stringify(s)}'>${s.id} (${s.tier}) - ${s.description}</option>`;
        }
        suggestOptions += '<option value="__custom__">Custom model...</option>';

        card.innerHTML = `
            <div class="provider-card-header">
                <h4><span class="provider-status-dot ${isMainActive ? 'active' : 'inactive'}"></span>${name}</h4>
                <div class="provider-card-field" style="margin:0; padding:0; flex-direction:row; gap:10px;">
                    <label style="font-size:0.8em; margin:0;">Global Retries:</label>
                    <input type="number" class="provider-retries" data-provider="${name}" value="${config.retries_per_step || 0}" min="0" max="50" style="width:50px; padding:2px;">
                </div>
            </div>

            <div class="provider-config-inline">
                <div class="config-toggle-row">
                    <span class="toggle-label">Allow for chat</span>
                    <label class="switch small">
                        <input type="checkbox" class="chat-active-toggle" data-provider="${name}" ${chatConfig.active ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                    <span class="toggle-label priority-label">Priority</span>
                    <input type="number" class="priority-input chat-priority" data-provider="${name}" value="${chatConfig.priority || 99}" min="1" max="99">
                </div>
                <div class="config-toggle-row">
                    <span class="toggle-label">Allow for agents</span>
                    <label class="switch small">
                        <input type="checkbox" class="agent-active-toggle" data-provider="${name}" ${agentConfig.active ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                    <span class="toggle-label priority-label">Priority</span>
                    <input type="number" class="priority-input agent-priority" data-provider="${name}" value="${agentConfig.priority || 99}" min="1" max="99">
                </div>
            </div>

            <div class="provider-card-field dev-only-field" style="display:none;">
                <label>API Key Env</label>
                <span style="font-family: 'Fira Code', monospace; font-size: 0.8rem; color: var(--primary);">${config.api_key_env || '(none)'}</span>
            </div>

            <div class="provider-models-section">
                <div class="models-table-container">
                    <table class="models-table">
                        <thead>
                            <tr>
                                <th style="width: 180px;">Model ID</th>
                                <th style="width: 100px;">Input ($/1M)</th>
                                <th style="width: 100px;">Output ($/1M)</th>
                                <th style="width: 30%;">Capabilities</th>
                                <th>Description</th>
                                <th style="width: 50px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${modelCardsHtml || '<tr><td colspan="6" style="text-align: center; padding: 2rem; opacity: 0.5;">No models configured</td></tr>'}
                        </tbody>
                    </table>
                    <div class="table-footer add-model-area" data-provider="${name}">
                        <select class="model-suggestion-select" data-provider="${name}" style="display:none;">
                            ${suggestOptions}
                        </select>
                        <button class="model-add-btn action-btn primary" data-provider="${name}">+ Add Model</button>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(card);
    }

    // --- Event listeners ---
    _attachProviderListeners(container);
}

function _attachProviderListeners(container) {
    // Track changes on all inputs/toggles
    container.addEventListener('input', () => markSettingsDirty());
    container.addEventListener('change', () => markSettingsDirty());

    // Active toggle listeners (update card visual state)
    container.querySelectorAll('.chat-active-toggle, .agent-active-toggle').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const card = e.target.closest('.provider-card');
            const dot = card.querySelector('.provider-status-dot');
            const chatActive = card.querySelector('.chat-active-toggle').checked;
            const agentActive = card.querySelector('.agent-active-toggle').checked;
            const isActive = chatActive || agentActive;
            if (isActive) {
                card.classList.replace('inactive', 'active');
                dot.classList.replace('inactive', 'active');
            } else {
                card.classList.replace('active', 'inactive');
                dot.classList.replace('active', 'inactive');
            }
        });
    });

    // Delete model buttons
    container.querySelectorAll('.model-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const provName = e.target.dataset.provider;
            const modelKey = e.target.dataset.modelKey;
            if (!confirm(`Remove model "${modelKey}" from ${provName}?`)) return;

            try {
                const res = await fetch(`/api/registry/provider/${provName}/models/${modelKey}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Delete failed');
                await loadProviderSettings();
                loadChatModels();
            } catch (err) {
                console.error('Failed to delete model:', err);
                alert('Failed to delete model');
            }
        });
    });

    // Add model buttons ÔÇö show suggestion dropdown inline
    container.querySelectorAll('.model-add-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const provName = e.target.dataset.provider;
            const area = e.target.closest('.add-model-area');
            const select = area.querySelector('.model-suggestion-select');
            // Toggle dropdown
            if (select.style.display === 'none') {
                select.style.display = 'block';
                btn.textContent = 'Cancel';
                select.value = '';
            } else {
                select.style.display = 'none';
                btn.textContent = '+ Add Model';
            }
        });
    });

    // Suggestion select change
    container.querySelectorAll('.model-suggestion-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const provName = sel.dataset.provider;
            const val = sel.value;
            const area = sel.closest('.add-model-area');
            const addBtn = area.querySelector('.model-add-btn');

            if (!val) return;

            let key, modelId, inputCost = 0, outputCost = 0, caps = ['chat'], desc = '', imageConfig = null;

            if (val === '__custom__') {
                key = prompt('Enter a short key for the model (e.g. "flash", "pro"):');
                if (!key) { sel.value = ''; return; }
                modelId = prompt('Enter the model ID (e.g. "gemini-2.0-flash"):');
                if (!modelId) { sel.value = ''; return; }
            } else {
                const opt = sel.options[sel.selectedIndex];
                const data = JSON.parse(opt.dataset.model);
                key = data.key;
                modelId = data.id;
                inputCost = data.input_cost || 0;
                outputCost = data.output_cost || 0;
                caps = data.capabilities || ['chat'];
                desc = data.description || '';
                imageConfig = data.image_config || null;
            }

            try {
                const res = await fetch(`/api/registry/provider/${provName}/models`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: key.trim(),
                        id: modelId.trim(),
                        capabilities: caps,
                        input_cost_per_1m_tokens: inputCost,
                        output_cost_per_1m_tokens: outputCost,
                        description: desc,
                        image_config: imageConfig
                    })
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || 'Add failed');
                }
                await loadProviderSettings();
                loadChatModels();
            } catch (err) {
                console.error('Failed to add model:', err);
                alert(`Failed to add model: ${err.message}`);
            }

            sel.style.display = 'none';
            addBtn.textContent = '+ Add Model';
        });
    });

    // Configure button listeners (Toggle Image Settings)
    container.querySelectorAll('.model-config-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const row = btn.closest('tr');
            const configRow = row.nextElementSibling;
            if (configRow && configRow.classList.contains('image-config-row')) {
                configRow.style.display = configRow.style.display === 'none' ? 'table-row' : 'none';
            }
        });
    });

    // Capability Select (Add capability)
    container.querySelectorAll('.cap-add-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const val = select.value;
            if (!val) return;

            const capContainer = select.parentElement;

            // Check if already exists
            const existing = Array.from(capContainer.querySelectorAll('.cap-tag'))
                .map(t => t.dataset.cap);

            if (existing.includes(val)) {
                select.value = "";
                return;
            }

            const tag = document.createElement('span');
            tag.className = `cap-tag${val === 'image_generation' ? ' cap-image' : ''}`;
            tag.dataset.cap = val;
            tag.textContent = val + ' x';
            tag.title = 'Click to remove';
            tag.addEventListener('click', () => { tag.remove(); markSettingsDirty(); });

            capContainer.insertBefore(tag, select);
            select.value = "";
            markSettingsDirty();

            // If adding image_generation, we might want to show a hint to save
            if (val === 'image_generation') {
                // Ideally we'd re-render to show the config button, but for now just saving is fine
                alert('Added Image Generation. Please SAVE to configure image settings.');
            }
        });
    });

    // Make existing cap tags removable
    container.querySelectorAll('.cap-tag').forEach(tag => {
        tag.addEventListener('click', () => { tag.remove(); markSettingsDirty(); });
    });

    // Save button listener
    const saveBtn = document.getElementById('save-provider-settings');
    if (saveBtn) {
        saveBtn.onclick = saveProviderSettings;
    }
}

async function saveProviderSettings() {
    if (!_registryData) return;

    const statusEl = document.getElementById('provider-save-status');

    try {
        // Collect values from UI
        const cards = document.querySelectorAll('.provider-card');
        cards.forEach(card => {
            const name = card.dataset.provider;
            if (!_registryData.providers[name]) return;

            const chatActive = card.querySelector('.chat-active-toggle')?.checked ?? false;
            const chatPriority = parseInt(card.querySelector('.chat-priority')?.value) || 99;

            const agentActive = card.querySelector('.agent-active-toggle')?.checked ?? false;
            const agentPriority = parseInt(card.querySelector('.agent-priority')?.value) || 99;

            const retriesInput = card.querySelector('.provider-retries');

            // Update schema
            _registryData.providers[name].chat_config = { active: chatActive, priority: chatPriority };
            _registryData.providers[name].agent_config = { active: agentActive, priority: agentPriority };

            _registryData.providers[name].retries_per_step = parseInt(retriesInput?.value) || 0;

            // Legacy fields
            _registryData.providers[name].active = chatActive;
            _registryData.providers[name].priority = chatPriority;

            // Collect Model Updates
            const modelEntries = card.querySelectorAll('.model-entry');
            modelEntries.forEach(entry => {
                const modelKey = entry.dataset.modelKey;
                if (!_registryData.providers[name].models[modelKey]) return;

                const id = entry.querySelector('.model-id-input').value.trim();
                const inputCost = parseFloat(entry.querySelector('.model-input-cost').value) || 0;
                const outputCost = parseFloat(entry.querySelector('.model-output-cost').value) || 0;
                const desc = entry.querySelector('.model-desc-input').value.trim();

                const caps = [];
                entry.querySelectorAll('.cap-tag').forEach(tag => caps.push(tag.dataset.cap || tag.textContent.replace(' x', '')));

                if (typeof _registryData.providers[name].models[modelKey] === 'string') {
                    _registryData.providers[name].models[modelKey] = {
                        id: id || _registryData.providers[name].models[modelKey]
                    };
                }

                const modelObj = _registryData.providers[name].models[modelKey];
                modelObj.id = id;
                modelObj.input_cost_per_1m_tokens = inputCost;
                modelObj.output_cost_per_1m_tokens = outputCost;
                modelObj.description = desc;
                modelObj.capabilities = caps;

                // Scrape Image Config if present
                if (caps.includes('image_generation')) {
                    const configRow = entry.nextElementSibling;
                    if (configRow && configRow.classList.contains('image-config-row')) {
                        const aspects = configRow.querySelector('.img-config-aspects').value.split(',').map(s => s.trim()).filter(Boolean);
                        const resols = configRow.querySelector('.img-config-resols').value.split(',').map(s => s.trim()).filter(Boolean);
                        const negPrompt = configRow.querySelector('.img-config-neg-prompt').checked;
                        const seed = configRow.querySelector('.img-config-seed').checked;
                        const quality = configRow.querySelector('.img-config-quality').checked;

                        modelObj.image_config = {
                            aspect_ratios: aspects,
                            resolutions: resols,
                            supports_negative_prompt: negPrompt,
                            supports_seed: seed,
                            quality_options: quality ? ['standard', 'hd'] : ['standard']
                        };
                    }
                }
            });
        });

        // POST to API
        const response = await fetch('/api/registry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(_registryData)
        });

        if (!response.ok) throw new Error('Failed to save');

        clearSettingsDirty();

        if (statusEl) {
            statusEl.textContent = '\u2713 Saved';
            statusEl.style.color = 'var(--success)';
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
        }

        loadChatModels();

    } catch (error) {
        console.error('Error saving provider settings:', error);
        if (statusEl) {
            statusEl.textContent = '\u2717 Save failed';
            statusEl.style.color = 'var(--error)';
        }
    }
}

// ===== Developer Mode & .env Management =====

function initDevMode() {
    const toggle = document.getElementById('setting-dev-mode');
    if (!toggle) return;

    toggle.addEventListener('change', () => {
        const envSection = document.getElementById('env-section');
        const devFields = document.querySelectorAll('.dev-only-field');

        if (toggle.checked) {
            if (envSection) { envSection.style.display = ''; loadEnvStatus(); }
            devFields.forEach(f => f.style.display = '');
        } else {
            if (envSection) envSection.style.display = 'none';
            devFields.forEach(f => f.style.display = 'none');
        }
    });
}

async function loadEnvStatus() {
    const container = document.getElementById('env-status-container');
    if (!container) return;

    try {
        const res = await fetch('/api/registry/env/status');
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();

        if (!data.exists) {
            container.innerHTML = `
                <div class="env-not-found">
                    <p>No <code>.env</code> file found. Create one to store your API keys securely.</p>
                    <button id="create-env-btn" class="btn-primary">Create .env from template</button>
                </div>
            `;
            document.getElementById('create-env-btn').addEventListener('click', async () => {
                try {
                    const r = await fetch('/api/registry/env/create', { method: 'POST' });
                    if (!r.ok) throw new Error('Failed');
                    loadEnvStatus(); // Reload
                } catch (e) {
                    alert('Failed to create .env: ' + e.message);
                }
            });
        } else {
            let keysHtml = '';
            for (const k of data.keys) {
                keysHtml += `
                    <div class="env-key-row">
                        <label class="env-key-name">${k.name}</label>
                        <div class="env-key-input-wrapper">
                            <input type="password" class="env-key-input" data-key="${k.name}"
                                placeholder="${k.has_value ? k.masked_value : 'Not set'}"
                                value="">
                            <button class="env-reveal-btn" title="Reveal key">­ƒæü</button>
                        </div>
                        <button class="env-save-key-btn btn-primary small" data-key="${k.name}">Save</button>
                        <span class="env-key-status ${k.has_value ? 'set' : 'unset'}">${k.has_value ? 'Key Set' : 'Key Not Set'}</span>
                    </div>
                `;
            }
            container.innerHTML = `<div class="env-keys-list">${keysHtml}</div>`;

            // Reveal toggle
            container.querySelectorAll('.env-reveal-btn').forEach(btn => {
                btn.addEventListener('mousedown', () => {
                    const input = btn.previousElementSibling;
                    input.type = 'text';
                });
                btn.addEventListener('mouseup', () => {
                    const input = btn.previousElementSibling;
                    input.type = 'password';
                });
                btn.addEventListener('mouseleave', () => {
                    const input = btn.previousElementSibling;
                    input.type = 'password';
                });
            });

            // Save individual key
            container.querySelectorAll('.env-save-key-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const keyName = btn.dataset.key;
                    const input = container.querySelector(`.env-key-input[data-key="${keyName}"]`);
                    const value = input.value.trim();
                    if (!value) { alert('Enter a value first'); return; }

                    try {
                        const r = await fetch('/api/registry/env/update', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: keyName, value: value })
                        });
                        if (!r.ok) throw new Error('Failed');
                        input.value = '';
                        loadEnvStatus();
                    } catch (e) {
                        alert('Failed to save key: ' + e.message);
                    }
                });
            });
        }
    } catch (e) {
        container.innerHTML = '<div class="loading-placeholder">Error loading .env status</div>';
        console.error('Failed to load env status:', e);
    }
}

