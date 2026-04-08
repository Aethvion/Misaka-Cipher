/**
 * companion-memory.js
 * ════════════════════
 * Handles the Companion Memory tab — lets the user switch between
 * companions and view each one's base_info.json and memory.json.
 *
 * API contract:
 *   GET /api/misakacipher/memory  → { base_info, memory }
 *   GET /api/axiom/memory         → { base_info, memory }
 *   GET /api/lyra/memory          → { base_info, memory }
 *   GET /api/companion-creator/list → [{ id, name, ... }]
 *   GET /api/companion-creator/{id}/memory → { base_info, memory }
 */

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────────────────────────
    let _currentCompanion = 'misakacipher';
    let _initialized = false;

    // Map companion ID → { label, endpoint }
    const BUILTIN_COMPANIONS = {
        misakacipher: { label: 'Misaka Cipher', endpoint: '/api/misakacipher/memory' },
        axiom:        { label: 'Axiom',          endpoint: '/api/axiom/memory'         },
        lyra:         { label: 'Lyra',           endpoint: '/api/lyra/memory'           },
    };

    // ── Public API (called from core.js on tab switch) ─────────────────────────
    window.refreshCompanionMemory = async function () {
        if (!_initialized) {
            _initialized = true;
            await _loadCustomCompanionButtons();
        }
        await _fetchAndDisplay(_currentCompanion);
    };

    window.selectCompanionMemory = async function (companionId, btnEl) {
        _currentCompanion = companionId;

        // Update active button state
        document.querySelectorAll('.cm-selector-btn').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');

        await _fetchAndDisplay(companionId);
    };

    // ── Internal ───────────────────────────────────────────────────────────────

    async function _fetchAndDisplay(companionId) {
        const baseInfoEl    = document.getElementById('cm-base-info-viewer');
        const memoryEl      = document.getElementById('cm-dynamic-memory-viewer');
        const activeNameEl  = document.getElementById('cm-active-name');
        const statusEl      = document.getElementById('cm-memory-status');

        if (!baseInfoEl || !memoryEl) return;

        // Show loading state
        const loadingHtml = '<div class="cm-loading"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';
        baseInfoEl.innerHTML = loadingHtml;
        memoryEl.innerHTML   = loadingHtml;
        if (statusEl) statusEl.textContent = 'fetching…';

        // Resolve endpoint
        let endpoint, label;
        if (BUILTIN_COMPANIONS[companionId]) {
            endpoint = BUILTIN_COMPANIONS[companionId].endpoint;
            label    = BUILTIN_COMPANIONS[companionId].label;
        } else {
            // Custom companion via companion-creator API
            endpoint = `/api/companion-creator/${companionId}/memory`;
            label    = companionId;
        }

        // Update active name
        if (activeNameEl) activeNameEl.textContent = label;

        try {
            const res  = await fetch(endpoint);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            const base_info = data.base_info || data.base_info_data || {};
            const memory    = data.memory    || data.memory_data    || {};

            baseInfoEl.textContent = JSON.stringify(base_info, null, 2);
            memoryEl.textContent   = JSON.stringify(memory,    null, 2);
            if (statusEl) statusEl.textContent = `loaded ${new Date().toLocaleTimeString()}`;

        } catch (err) {
            const errHtml = `<div class="cm-error"><i class="fas fa-exclamation-triangle"></i> ${err.message}</div>`;
            baseInfoEl.innerHTML = errHtml;
            memoryEl.innerHTML   = errHtml;
            if (statusEl) statusEl.textContent = 'error';
        }
    }

    async function _loadCustomCompanionButtons() {
        const container = document.getElementById('cm-custom-btns');
        if (!container) return;
        container.innerHTML = '';

        try {
            const res  = await fetch('/api/companion-creator/list');
            if (!res.ok) return;
            const data = await res.json();
            const companions = data.companions || [];

            for (const c of companions) {
                // Skip if it's one of the built-ins (by id)
                if (BUILTIN_COMPANIONS[c.id]) continue;

                const btn = document.createElement('button');
                btn.className = 'cm-selector-btn';
                btn.dataset.companion = c.id;
                btn.innerHTML = `
                    <span class="cm-btn-avatar custom">${(c.name || c.id).charAt(0).toUpperCase()}</span>
                    <span>${c.name || c.id}</span>
                `;
                btn.onclick = () => window.selectCompanionMemory(c.id, btn);
                container.appendChild(btn);
            }
        } catch (e) {
            // Companion creator may not have any entries — silently ignore
        }
    }

    // ── Listen for panelLoaded so we init on first open ───────────────────────
    document.addEventListener('panelLoaded', function (e) {
        if (e.detail && e.detail.panel === 'companion-memory') {
            window.refreshCompanionMemory();
        }
    });

})();
