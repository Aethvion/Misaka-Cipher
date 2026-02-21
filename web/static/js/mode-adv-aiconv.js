/**
 * Misaka Cipher - Advanced AI Conversation (Research Mode)
 */

let allPersonas = [];
let activePersonas = [];
let activeAdvaiconvThreadId = null;
let advaiconvState = 'stopped'; // 'stopped', 'running', 'paused'
let advaiconvInterval = null;
let currentSpeakerIndex = 0;

// Elements
const advaiconvPersonSelect = document.getElementById('advaiconv-person-add');
const advaiconvPersonChips = document.getElementById('advaiconv-person-chips');
const advaiconvTopicInput = document.getElementById('advaiconv-topic');
const advaiconvSpeedInput = document.getElementById('advaiconv-speed-input');
const advaiconvContextInput = document.getElementById('advaiconv-context-input');
const btnAdvaiconvStart = document.getElementById('advaiconv-start-btn');
const btnAdvaiconvPause = document.getElementById('advaiconv-pause-btn');
const btnAdvaiconvStop = document.getElementById('advaiconv-stop-btn');
const advaiconvMessagesContainer = document.getElementById('advaiconv-messages');
const statusIndicator = document.getElementById('advaiconv-status-indicator');
const btnNewPersona = document.getElementById('advaiconv-new-person-btn');
const advaiconvThreadList = document.getElementById('advaiconv-thread-list');
const btnAdvaiconvNewThread = document.getElementById('advaiconv-new-thread-btn');
const titleAdvaiconvThread = document.getElementById('advaiconv-active-thread-title');

let allThreads = [];
let advaiconvAvailableModels = {}; // Grouped by provider

async function initAdvaiconv() {
    await fetchAdvaiconvModels();
    await fetchPersonas();
    await fetchThreads();

    // Bind Events
    if (advaiconvPersonSelect) {
        advaiconvPersonSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                addPersonaToActive(e.target.value);
                e.target.value = "";
            }
        });
    }

    if (btnNewPersona) {
        btnNewPersona.addEventListener('click', openPersonaModal);
    }

    if (btnAdvaiconvStart) {
        btnAdvaiconvStart.addEventListener('click', startSimulation);
    }
    if (btnAdvaiconvPause) {
        btnAdvaiconvPause.addEventListener('click', pauseSimulation);
    }
    if (btnAdvaiconvStop) {
        btnAdvaiconvStop.addEventListener('click', stopSimulation);
    }

    if (btnAdvaiconvNewThread) {
        btnAdvaiconvNewThread.addEventListener('click', () => {
            stopSimulation();
            activeAdvaiconvThreadId = null;
            advaiconvMessagesContainer.innerHTML = `
                <div class="arena-placeholder" id="advaiconv-placeholder">
                    <span class="tab-icon" style="font-size:3rem;">🧪</span>
                    <p>Select subjects, configure the environment, and start the simulation!</p>
                </div>
            `;
            titleAdvaiconvThread.innerText = "New Simulation";
            advaiconvTopicInput.value = "";
            activePersonas = [];
            renderActivePersonChips();
            renderThreads();
        });
    }
}

async function fetchAdvaiconvModels() {
    try {
        const res = await fetch('/api/registry/models/chat');
        if (!res.ok) return;
        const data = await res.json();

        advaiconvAvailableModels = {};
        for (const m of data.models || []) {
            const prov = m.provider || 'unknown';
            if (!advaiconvAvailableModels[prov]) advaiconvAvailableModels[prov] = [];
            advaiconvAvailableModels[prov].push(m);
        }
    } catch (e) {
        console.error("Failed to fetch models for Advaiconv", e);
    }
}

async function fetchPersonas() {
    try {
        const res = await fetch('/api/research/people');
        allPersonas = await res.json();

        let html = '<option value="" disabled selected>+ Add Person...</option>';
        for (const p of allPersonas) {
            html += `<option value="${p.id}">${p.name} (${p.gender})</option>`;
        }
        if (advaiconvPersonSelect) advaiconvPersonSelect.innerHTML = html;

    } catch (e) {
        console.error("Failed to load personas", e);
    }
}

async function fetchThreads() {
    try {
        const res = await fetch('/api/research/threads');
        allThreads = await res.json();
        renderThreads();
    } catch (e) {
        console.error("Failed to fetch threads", e);
    }
}

function renderThreads() {
    if (!advaiconvThreadList) return;
    let html = '';
    if (allThreads.length === 0) {
        html = '<div class="placeholder-text" style="padding: 0.5rem; font-size: 0.8rem;">No threads found.</div>';
    } else {
        for (const t of allThreads) {
            const isActive = t.id === activeAdvaiconvThreadId ? 'active' : '';
            const dateSplit = t.updated_at ? t.updated_at.split('T') : ['Unknown', ''];
            const dateStr = dateSplit[0] + ' ' + (dateSplit[1] ? dateSplit[1].substring(0, 5) : '');
            html += `
                <div class="advaiconv-thread-item ${isActive}" onclick="loadThread('${t.id}')">
                    <span class="advaiconv-thread-title">${t.name || 'Unnamed Thread'}</span>
                    <span class="advaiconv-thread-date">${dateStr}</span>
                </div>
            `;
        }
    }
    advaiconvThreadList.innerHTML = html;
}

async function loadThread(threadId) {
    if (advaiconvState !== 'stopped') return;
    try {
        const res = await fetch(`/api/research/threads/${threadId}`);
        const data = await res.json();
        activeAdvaiconvThreadId = data.meta.id;
        titleAdvaiconvThread.innerText = data.meta.name;
        advaiconvTopicInput.value = data.meta.topic || "";

        // Restore participants
        activePersonas = [];
        for (const pid of data.meta.participants || []) {
            const p = allPersonas.find(x => x.id === pid);
            if (p) activePersonas.push(p);
        }
        renderActivePersonChips();

        // Render existing messages
        advaiconvMessagesContainer.innerHTML = '';
        for (const m of data.messages || []) {
            let fallbackTraits = null;
            const snap = (data.snapshots || []).find(s => s.message_id === m.id);
            if (snap) fallbackTraits = snap.traits;
            appendUiMessage(m, fallbackTraits);
        }

        renderThreads();
    } catch (e) {
        console.error(e);
    }
}

window.loadThread = loadThread;

function generateModelOptionsHtml(selectedModelId) {
    if (Object.keys(advaiconvAvailableModels).length === 0) return '<option value="">auto</option>';
    let html = '';
    for (const [provider, models] of Object.entries(advaiconvAvailableModels)) {
        html += `<optgroup label="${provider}">`;
        for (const m of models) {
            const s = m.id === selectedModelId ? 'selected' : '';
            html += `<option value="${m.id}" ${s}>${m.id}</option>`;
        }
        html += `</optgroup>`;
    }
    return html;
}

async function addPersonaToActive(personId) {
    if (activePersonas.find(p => p.id === personId)) return; // already added

    const person = allPersonas.find(p => p.id === personId);
    if (!person) return;

    activePersonas.push(person);
    renderActivePersonChips();

    // Dynamically notify system if running/paused
    if (activeAdvaiconvThreadId && (advaiconvState === 'running' || advaiconvState === 'paused')) {
        await notifySystemEvent(`System Event: ${person.name} has joined the conversation.`);
    }
}

async function removePersonaFromActive(personId) {
    const pIndex = activePersonas.findIndex(p => p.id === personId);
    if (pIndex > -1) {
        const p = activePersonas[pIndex];
        activePersonas.splice(pIndex, 1);
        renderActivePersonChips();

        if (activeAdvaiconvThreadId && (advaiconvState === 'running' || advaiconvState === 'paused')) {
            await notifySystemEvent(`System Event: ${p.name} has left the conversation.`);
        }
    }
}

function renderActivePersonChips() {
    if (!advaiconvPersonChips) return;

    let html = '';
    for (const p of activePersonas) {
        // default to first model if none selected
        if (!p.selectedModel && Object.keys(advaiconvAvailableModels).length > 0) {
            const firstProv = Object.keys(advaiconvAvailableModels)[0];
            if (firstProv && advaiconvAvailableModels[firstProv].length > 0) {
                p.selectedModel = advaiconvAvailableModels[firstProv][0].id;
            }
        }

        const modelsHtml = generateModelOptionsHtml(p.selectedModel);

        html += `
            <div class="person-chip">
                <div class="person-chip-info" style="flex:1;">
                    <div style="display:flex; justify-content:space-between;">
                        <span class="person-chip-name">${p.name} <span class="person-chip-gender">(${p.gender})</span></span>
                        <span class="person-chip-remove" onclick="removePersonaFromActive('${p.id}')">
                            <i class="fas fa-times"></i>
                        </span>
                    </div>
                    <select class="persona-model-select" onchange="updatePersonaModel('${p.id}', this.value)">
                        ${modelsHtml}
                    </select>
                </div>
            </div>
        `;
    }
    advaiconvPersonChips.innerHTML = html;
}

window.updatePersonaModel = function (personId, modelId) {
    const p = activePersonas.find(x => x.id === personId);
    if (p) p.selectedModel = modelId;
}

async function notifySystemEvent(msg) {
    if (!activeAdvaiconvThreadId) return;
    try {
        await fetch(`/api/research/threads/${activeAdvaiconvThreadId}/system_message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg })
        });
        appendUiMessage({ role: 'system', content: msg });

        // Also update participants list
        await fetch(`/api/research/threads/${activeAdvaiconvThreadId}/participants`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(activePersonas.map(p => p.id))
        });
    } catch (e) {
        console.error("System event failed", e);
    }
}

// ----- Simulation Loop ----- //

async function startSimulation() {
    if (activePersonas.length < 1) {
        alert("Add at least one persona.");
        return;
    }

    if (advaiconvState === 'stopped') {
        const topic = advaiconvTopicInput.value.trim() || "Free conversation in a neutral environment.";
        if (!activeAdvaiconvThreadId) {
            try {
                // Create thread
                const res = await fetch('/api/research/threads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: "Simulation " + new Date().toLocaleTimeString(),
                        topic: topic,
                        participants: activePersonas.map(p => p.id)
                    })
                });
                const threadData = await res.json();
                activeAdvaiconvThreadId = threadData.id;
                titleAdvaiconvThread.innerText = threadData.name;
                allThreads.unshift(threadData);
                renderThreads();
            } catch (e) {
                console.error(e);
                return;
            }
        }

        // clear ui
        if (document.getElementById('advaiconv-placeholder')) {
            document.getElementById('advaiconv-placeholder').remove();
        }
        advaiconvMessagesContainer.innerHTML = '';

        // Inject environment system prompt
        await notifySystemEvent(`Environment Setup: ${topic}`);

        currentSpeakerIndex = 0;
    }

    advaiconvState = 'running';
    updateControls();
    scheduleNextTurn();
}

function pauseSimulation() {
    advaiconvState = 'paused';
    if (advaiconvInterval) clearTimeout(advaiconvInterval);
    updateControls();
}

function stopSimulation() {
    advaiconvState = 'stopped';
    if (advaiconvInterval) clearTimeout(advaiconvInterval);
    activeAdvaiconvThreadId = null;
    updateControls();
}

function updateControls() {
    statusIndicator.innerText = advaiconvState.toUpperCase();
    if (advaiconvState === 'running') {
        statusIndicator.style.color = 'var(--success)';
        btnAdvaiconvStart.disabled = true;
        btnAdvaiconvPause.disabled = false;
        btnAdvaiconvStop.disabled = false;
        // Don't disable person selection so we can dynamically add/remove while running/paused!
    } else if (advaiconvState === 'paused') {
        statusIndicator.style.color = 'var(--warning)';
        btnAdvaiconvStart.disabled = false;
        btnAdvaiconvPause.disabled = true;
        btnAdvaiconvStop.disabled = false;
    } else {
        statusIndicator.style.color = 'var(--text-secondary)';
        btnAdvaiconvStart.disabled = false;
        btnAdvaiconvPause.disabled = true;
        btnAdvaiconvStop.disabled = true;
    }
}

async function scheduleNextTurn() {
    if (advaiconvState !== 'running') return;

    const speaker = activePersonas[currentSpeakerIndex];
    statusIndicator.innerText = `RUNNING (${speaker.name} thinking...)`;

    // UI placeholder for typing
    const typingId = 'typing-' + Date.now();
    appendUiMessage({ role: 'system', id: typingId, content: `${speaker.name} is thinking...` });

    try {
        const selectedModel = speaker.selectedModel || "auto";
        const maxCxt = parseInt(advaiconvContextInput.value) || 20;

        const res = await fetch(`/api/research/threads/${activeAdvaiconvThreadId}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                person_id: speaker.id,
                model_id: selectedModel,
                max_context: maxCxt
            })
        });

        const data = await res.json();
        const tEl = document.getElementById(typingId);
        if (tEl) tEl.remove();

        if (data.message) {
            appendUiMessage(data.message, data.updated_person.traits);

            // update local persona traits so next turn uses it internally (backend already has it)
            speaker.traits = data.updated_person.traits;
        } else {
            console.error("No message in response", data);
            pauseSimulation();
            return;
        }

    } catch (e) {
        console.error("Turn failed", e);
        const tEl = document.getElementById(typingId);
        if (tEl) tEl.remove();
        appendUiMessage({ role: 'system', content: `Error: ${e.message}` });
        pauseSimulation();
        return;
    }

    if (advaiconvState === 'running') {
        currentSpeakerIndex = (currentSpeakerIndex + 1) % activePersonas.length;
        const delayMs = parseInt(advaiconvSpeedInput.value) || 2000;
        advaiconvInterval = setTimeout(scheduleNextTurn, delayMs);
    }
}

function appendUiMessage(msg, traits = null) {
    const isSystem = msg.role === 'system';

    let html = '';
    const wrapperId = msg.id || ('sys-' + Date.now());

    if (isSystem) {
        html = `
            <div id="${wrapperId}" class="message system-message" style="margin-bottom: 0.8rem;">
                <div class="message-content" style="color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">
                    <strong>[System Env]</strong> ${msg.content}
                </div>
            </div>
        `;
    } else {
        // Build traits badges
        let traitHtml = '';
        if (traits) {
            for (const [key, val] of Object.entries(traits)) {
                traitHtml += `<span class="trait-badge">${key}: <strong>${val}</strong></span>`;
            }
        }

        let tldrHtml = '';
        if (msg.tldr) {
            tldrHtml = `<div class="trait-tldr"><strong>Logic:</strong> ${msg.tldr}</div>`;
        }

        html = `
            <div id="${wrapperId}" class="message bot-message" style="margin-bottom: 1.5rem; background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; border: 1px solid var(--border);">
                <div style="font-weight: 600; color: var(--primary); margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
                    ${msg.name}
                    ${traits ? `<div class="trait-badges" style="margin: 0; padding: 0; border: none;">${traitHtml}</div>` : ''}
                </div>
                <div class="message-content" style="line-height: 1.5; color: var(--text-primary);">
                    ${msg.content}
                </div>
                ${tldrHtml}
            </div>
        `;
    }

    advaiconvMessagesContainer.insertAdjacentHTML('beforeend', html);
    advaiconvMessagesContainer.scrollTop = advaiconvMessagesContainer.scrollHeight;
}

// ----- Persona Creation UI ----- //

function openPersonaModal() {
    // Standard modal logic hooking into main app
    const modalHtml = `
        <div class="modal-dialog" style="max-width: 500px;">
            <div class="modal-header">
                <h2>Create Research Persona</h2>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="persona-modal-grid">
                    <div>
                        <label>Name</label>
                        <input type="text" id="p-name" class="term-input" style="width:100%;">
                    </div>
                    <div>
                        <label>Gender/Identity</label>
                        <input type="text" id="p-gender" class="term-input" style="width:100%;">
                    </div>
                    <div>
                        <label style="margin-bottom: 0;">Background Overview</label>
                        <span style="display:block; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.4rem; padding-left: 1px;">The core identity of the persona. Describe their profession, general disposition, and underlying beliefs. This forms the foundation of their system prompt.</span>
                        <textarea id="p-bg" class="term-input" style="width:100%; height:80px;" placeholder="E.g., 'A logical structural engineer who prioritizes safety over aesthetics and speaks formally.'"></textarea>
                    </div>
                    <div>
                        <label>Initial Hidden Memory</label>
                        <textarea id="p-mem" class="term-input" style="width:100%; height:80px;" placeholder="Base memories before simulation starts..."></textarea>
                    </div>
                    <div>
                        <label>Traits (Scale 1-10)</label>
                        <div id="p-traits-container">
                            <div class="persona-trait-row">
                                <input type="text" class="term-input tt-name" placeholder="Trait (e.g., Happiness)" value="Happiness">
                                <input type="number" class="term-input tt-val" min="1" max="10" value="5">
                            </div>
                            <div class="persona-trait-row">
                                <input type="text" class="term-input tt-name" placeholder="Trait (e.g., Openness)" value="Openness">
                                <input type="number" class="term-input tt-val" min="1" max="10" value="5">
                            </div>
                            <div class="persona-trait-row">
                                <input type="text" class="term-input tt-name" placeholder="Trait (e.g., Skepticism)" value="Skepticism">
                                <input type="number" class="term-input tt-val" min="1" max="10" value="5">
                            </div>
                        </div>
                        <button onclick="addTraitRow()" class="action-btn secondary small" style="margin-top:0.5rem;">+ Add Trait</button>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="action-btn secondary" onclick="closeModal()">Cancel</button>
                <button class="action-btn primary" onclick="saveNewPersona()">Save</button>
            </div>
        </div>
    `;
    openCustomModal(modalHtml);
}

window.addTraitRow = function () {
    const c = document.getElementById('p-traits-container');
    c.insertAdjacentHTML('beforeend', `
        <div class="persona-trait-row">
            <input type="text" class="term-input tt-name" placeholder="Trait Name">
            <input type="number" class="term-input tt-val" min="1" max="10" value="5">
        </div>
    `);
}

window.saveNewPersona = async function () {
    const payload = {
        name: document.getElementById('p-name').value.trim(),
        gender: document.getElementById('p-gender').value.trim(),
        background: document.getElementById('p-bg').value.trim(),
        memory: document.getElementById('p-mem').value.trim(),
        traits: {}
    };

    if (!payload.name || !payload.background) {
        alert("Name and Background are required.");
        return;
    }

    const traitRows = document.querySelectorAll('#p-traits-container .persona-trait-row');
    traitRows.forEach(row => {
        const tname = row.querySelector('.tt-name').value.trim();
        const tval = parseInt(row.querySelector('.tt-val').value) || 5;
        if (tname) {
            payload.traits[tname] = tval;
        }
    });

    try {
        const res = await fetch('/api/research/people', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        await fetchPersonas();
        closeModal();
    } catch (e) {
        alert("Failed: " + e.message);
    }
}

// Hook into app initialization
document.addEventListener('DOMContentLoaded', () => {
    // Only init if we are on the page that has the panel
    if (document.getElementById('advaiconv-panel')) {
        setTimeout(initAdvaiconv, 500); // Give model-registry time to load
    }
});
