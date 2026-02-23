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

    // Assistant Settings
    const assistantEnabled = document.getElementById('setting-assistant-enabled');
    if (assistantEnabled) {
        assistantEnabled.checked = prefs.get('assistant.enabled', true);
        assistantEnabled.onchange = async (e) => {
            await savePreference('assistant.enabled', e.target.checked);
            window.dispatchEvent(new CustomEvent('assistantSettingsUpdated', {
                detail: { enabled: e.target.checked }
            }));
        };
    }

    const assistantModel = document.getElementById('setting-assistant-model');
    if (assistantModel) {
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

    // Initialize Other Sections
    loadGlobalSettings();
    initDevMode();
    initTooltips();
}

async function savePreference(key, value) {
    await prefs.set(key, value);
}

// ===== Global settings.json Management =====

async function loadGlobalSettings() {
    const container = document.getElementById('global-settings-container');
    if (!container) return;

    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();

        // Recursively flatten or pick important ones? 
        // For simplicity, we'll render output_validation and system blocks
        let html = '';

        // Flatten settings for editing
        const renderGroup = (title, obj, prefix = '') => {
            let groupHtml = `<div class="settings-subgroup"><h4>${title}</h4>`;
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    groupHtml += renderGroup(key, value, prefix ? `${prefix}.${key}` : key);
                } else if (typeof value === 'boolean') {
                    groupHtml += `
                        <div class="compact-item toggle-item">
                            <div class="item-label">${key.replace(/_/g, ' ')}</div>
                            <label class="switch small">
                                <input type="checkbox" class="global-setting-input" data-key="${prefix ? prefix + '.' + key : key}" ${value ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                    `;
                } else {
                    groupHtml += `
                        <div class="compact-item">
                            <div class="item-label">${key.replace(/_/g, ' ')}</div>
                            <input type="${typeof value === 'number' ? 'number' : 'text'}" 
                                class="global-setting-input control-input-small" 
                                data-key="${prefix ? prefix + '.' + key : key}" 
                                value="${value}">
                        </div>
                    `;
                }
            }
            groupHtml += `</div>`;
            return groupHtml;
        };

        if (settings.output_validation) html += renderGroup('Output Validation', settings.output_validation, 'output_validation');
        if (settings.system) html += renderGroup('System Settings', settings.system, 'system');

        container.innerHTML = html;

        // Attach listeners
        container.querySelectorAll('.global-setting-input').forEach(input => {
            input.addEventListener('change', async (e) => {
                const key = e.target.dataset.key;
                let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                if (e.target.type === 'number') value = parseFloat(value);

                try {
                    await fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ [key]: value })
                    });
                } catch (err) {
                    console.error('Failed to save global setting:', err);
                }
            });
        });

    } catch (error) {
        console.error('Failed to load settings.json:', error);
        container.innerHTML = '<div class="loading-placeholder">Failed to load settings</div>';
    }
}

// ===== Developer Mode & .env Management =====

let devModeActive = false;

function initDevMode() {
    const btn = document.getElementById('btn-toggle-dev-mode');
    if (!btn) return;

    btn.addEventListener('click', () => {
        devModeActive = !devModeActive;
        const icon = btn.querySelector('i');
        const envContainer = document.getElementById('env-status-container');

        if (devModeActive) {
            btn.classList.add('active');
            icon.className = 'fas fa-lock-open';
            loadEnvStatus();
        } else {
            btn.classList.remove('active');
            icon.className = 'fas fa-lock';
            if (envContainer) envContainer.innerHTML = '<div class="locked-placeholder"><i class="fas fa-lock"></i> Developer Mode Restricted</div>';
        }

        // Also show/hide dev-only fields in provider cards if they exist
        document.querySelectorAll('.dev-only-field').forEach(f => f.style.display = devModeActive ? '' : 'none');
    });

    // Initial state
    const envContainer = document.getElementById('env-status-container');
    if (envContainer) envContainer.innerHTML = '<div class="locked-placeholder"><i class="fas fa-lock"></i> Developer Mode Restricted</div>';
}

async function loadEnvStatus() {
    const container = document.getElementById('env-status-container');
    if (!container || !devModeActive) return;

    container.innerHTML = '<div class="loading-placeholder">Loading environment variables...</div>';

    try {
        const res = await fetch('/api/registry/env/status');
        if (!res.ok) throw new Error('Failed to load status');
        const data = await res.json();

        if (!data.exists) {
            container.innerHTML = `
                <div class="env-not-found">
                    <p>No <code>.env</code> file found.</p>
                    <button id="create-env-btn" class="action-btn secondary small">Create from Template</button>
                </div>
            `;
            document.getElementById('create-env-btn').onclick = async () => {
                await fetch('/api/registry/env/create', { method: 'POST' });
                loadEnvStatus();
            };
        } else {
            let keysHtml = '<div class="env-keys-list-compact">';
            for (const k of data.keys) {
                keysHtml += `
                    <div class="env-key-row-compact">
                        <div class="key-info">
                            <span class="key-name">${k.name}</span>
                            <span class="key-status ${k.has_value ? 'set' : 'unset'}"></span>
                        </div>
                        <div class="key-actions">
                            <input type="password" class="env-key-input-compact" data-key="${k.name}" placeholder="${k.has_value ? '********' : 'Not set'}">
                            <button class="action-btn xs-btn env-save-key-btn" data-key="${k.name}"><i class="fas fa-save"></i></button>
                        </div>
                    </div>
                `;
            }
            keysHtml += '</div>';
            container.innerHTML = keysHtml;

            container.querySelectorAll('.env-save-key-btn').forEach(b => {
                b.onclick = async () => {
                    const kname = b.dataset.key;
                    const input = container.querySelector(`input[data-key="${kname}"]`);
                    if (!input.value.trim()) return;

                    await fetch('/api/registry/env/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: kname, value: input.value.trim() })
                    });
                    input.value = '';
                    loadEnvStatus();
                };
            });
        }
    } catch (e) {
        container.innerHTML = '<div class="loading-placeholder error">Error loading .env</div>';
    }
}

// ===== Tooltips =====

function initTooltips() {
    document.querySelectorAll('.tooltip-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            const title = trigger.getAttribute('title');
            alert(title); // Simple for now, can be improved to floating tooltips
        });
    });
}

// ===== Provider & Profile Management =====

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
        const [regRes, sugRes] = await Promise.all([
            fetch('/api/registry'),
            fetch('/api/registry/suggested')
        ]);

        if (!regRes.ok) throw new Error('Failed to load registry');
        _registryData = await regRes.json();
        if (sugRes.ok) _suggestedModels = await sugRes.json();

        renderProviderCards(_registryData);
        renderProfiles();
        initProfileCreationButtons();
        loadChatModels();
        clearSettingsDirty();
    } catch (error) {
        console.error('Error loading provider settings:', error);
    }
}

async function loadChatModels() {
    const selects = [
        document.getElementById('model-select'),
        document.getElementById('setting-assistant-model'),
        document.getElementById('agent-model-select'),
        document.getElementById('arena-model-add'),
        document.getElementById('aiconv-model-add'),
        document.getElementById('advaiconv-person-add')
    ].filter(Boolean);

    if (selects.length === 0) return;

    try {
        const res = await fetch('/api/registry/models/chat');
        if (!res.ok) throw new Error('Failed to load chat models');
        const data = await res.json();

        const chatOptions = generateCategorizedModelOptions(data, 'chat');
        const agentOptions = generateCategorizedModelOptions(data, 'agent');

        selects.forEach(sel => {
            const currentVal = sel.value;
            const isAgent = sel.id === 'agent-model-select';
            sel.innerHTML = isAgent ? agentOptions : chatOptions;

            // Fix for assistant select initialization
            if (sel.id === 'setting-assistant-model') {
                const prefModel = prefs.get('assistant.model', 'gemini-2.0-flash');
                if (sel.querySelector(`option[value="${prefModel}"]`)) {
                    sel.value = prefModel;
                }
            } else if (currentVal && sel.querySelector(`option[value="${currentVal}"]`)) {
                sel.value = currentVal;
            }
        });

    } catch (err) {
        console.error('Error loading chat models:', err);
    }
}

function renderProviderCards(registry) {
    const container = document.getElementById('provider-cards-container');
    if (!container) return;

    const providers = registry.providers || {};
    let html = '';

    for (const [name, config] of Object.entries(providers)) {
        const isActive = (config.chat_config?.active || config.agent_config?.active);

        html += `
            <div class="compact-provider-item ${isActive ? 'active' : ''}" data-provider="${name}">
                <div class="provider-info-row">
                    <div class="provider-main">
                        <span class="status-dot ${isActive ? 'active' : ''}"></span>
                        <span class="provider-name">${name}</span>
                    </div>
                    <div class="provider-actions">
                        <button class="action-btn xs-btn toggle-models-btn" title="Edit Models"><i class="fas fa-list"></i></button>
                    </div>
                </div>
                <div class="provider-config-grid">
                    <div class="config-row">
                        <span class="label">Chat</span>
                        <label class="switch small">
                            <input type="checkbox" class="chat-active-toggle" data-provider="${name}" ${config.chat_config?.active ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <div class="config-row">
                        <span class="label">Agent</span>
                        <label class="switch small">
                            <input type="checkbox" class="agent-active-toggle" data-provider="${name}" ${config.agent_config?.active ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>
                <div class="provider-models-foldout" style="display:none;">
                    <table class="compact-models-table">
                        <thead>
                            <tr>
                                <th>Model ID</th>
                                <th>Cost (In/Out)</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(config.models || {}).map(([key, m]) => `
                                <tr>
                                    <td><input type="text" class="model-id-input-small" value="${typeof m === 'string' ? m : m.id}" data-key="${key}"></td>
                                    <td>
                                        <div class="cost-inputs">
                                            <input type="number" step="0.01" class="model-cost-in" value="${m.input_cost_per_1m_tokens || 0}">
                                            <input type="number" step="0.01" class="model-cost-out" value="${m.output_cost_per_1m_tokens || 0}">
                                        </div>
                                    </td>
                                    <td>
                                        <button class="btn-icon xs-btn del-model" data-key="${key}"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="add-model-line">
                        <button class="action-btn xs-btn secondary add-model-btn" data-provider="${name}">+ Add Model</button>
                    </div>
                </div>
            </div>
        `;
    }

    container.innerHTML = html || '<div class="placeholder-text">No providers found.</div>';

    // Event Listeners
    container.querySelectorAll('.toggle-models-btn').forEach(btn => {
        btn.onclick = () => {
            const foldout = btn.closest('.compact-provider-item').querySelector('.provider-models-foldout');
            foldout.style.display = foldout.style.display === 'none' ? 'block' : 'none';
        };
    });

    container.querySelectorAll('input').forEach(i => i.onchange = () => markSettingsDirty());
    container.querySelectorAll('.chat-active-toggle, .agent-active-toggle').forEach(t => {
        t.onchange = (e) => {
            const item = e.target.closest('.compact-provider-item');
            const dot = item.querySelector('.status-dot');
            const isActive = item.querySelector('.chat-active-toggle').checked || item.querySelector('.agent-active-toggle').checked;
            item.classList.toggle('active', isActive);
            dot.classList.toggle('active', isActive);
            markSettingsDirty();
        };
    });

    const saveBtn = document.getElementById('save-provider-settings');
    if (saveBtn) saveBtn.onclick = saveProviderSettings;
}

async function saveProviderSettings() {
    if (!_registryData) return;

    const items = document.querySelectorAll('.compact-provider-item');
    items.forEach(item => {
        const name = item.dataset.provider;
        const prov = _registryData.providers[name];
        if (!prov) return;

        prov.chat_config = { active: item.querySelector('.chat-active-toggle').checked, priority: 1 };
        prov.agent_config = { active: item.querySelector('.agent-active-toggle').checked, priority: 1 };

        // Model updates
        const modelRows = item.querySelectorAll('tbody tr');
        modelRows.forEach(row => {
            const key = row.querySelector('.model-id-input-small').dataset.key;
            if (prov.models[key]) {
                const m = prov.models[key];
                const newId = row.querySelector('.model-id-input-small').value;
                const costIn = parseFloat(row.querySelector('.model-cost-in').value);
                const costOut = parseFloat(row.querySelector('.model-cost-out').value);

                if (typeof m === 'string') {
                    prov.models[key] = { id: newId, input_cost_per_1m_tokens: costIn, output_cost_per_1m_tokens: costOut };
                } else {
                    m.id = newId;
                    m.input_cost_per_1m_tokens = costIn;
                    m.output_cost_per_1m_tokens = costOut;
                }
            }
        });
    });

    try {
        const res = await fetch('/api/registry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(_registryData)
        });
        if (res.ok) {
            clearSettingsDirty();
            loadChatModels();
            alert('Settings saved successfully.');
        }
    } catch (e) {
        console.error('Save failed:', e);
    }
}

function renderProfiles() {
    if (!_registryData) return;
    const profiles = _registryData.profiles || { chat_profiles: {}, agent_profiles: {} };

    const render = (containerId, dict, type) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        let html = '';
        for (const [name, models] of Object.entries(dict)) {
            html += `
                <div class="compact-profile-item">
                    <div class="profile-main">
                        <span class="profile-name">${name === 'default' ? '⭐ default' : name}</span>
                        <div class="profile-models-badges">
                            ${models.map(m => `<span class="model-badge">${m.split('/').pop()}</span>`).join('')}
                        </div>
                    </div>
                    <div class="profile-actions">
                        <button class="action-btn xs-btn secondary edit-profile" data-name="${name}" data-type="${type}"><i class="fas fa-edit"></i></button>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html || '<div class="placeholder-text">No profiles.</div>';

        container.querySelectorAll('.edit-profile').forEach(b => {
            b.onclick = () => alert('Profile editing coming in next update. Current profiles are view-only in this compact mode.');
        });
    };

    render('chat-profiles-container', profiles.chat_profiles, 'chat');
    render('agent-profiles-container', profiles.agent_profiles, 'agent');
}

function initProfileCreationButtons() {
    // Stubs for now
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
    loadPreferences();
    loadProviderSettings();
});
