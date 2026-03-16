'use strict';

/**
 * Aethvion App Tab System  (app-tabs.js)
 * ───────────────────────────────────────
 * Manages the top tab bar that lets users open Aethvion apps inside the
 * main dashboard window without losing any app state.
 *
 * Key design rule
 * ───────────────
 * Each app gets ONE iframe that is created on first open and NEVER destroyed
 * until the tab is explicitly closed.  Switching tabs toggles CSS display
 * only — no src change, no reload, state is preserved.
 *
 * Public API (window.ATB)
 * ───────────────────────
 *   ATB.openApp(appId)      – open (or focus) an app by id
 *   ATB.switchTo(panelId)   – switch the visible panel by DOM id
 *   ATB.retryApp(appId)     – rebuild a failed app tab / iframe
 */
const ATB = (() => {

    // ── App registry ──────────────────────────────────────────────────────────
    const APPS = [
        { id: 'code',         label: 'Code IDE',      emoji: '💻', port: 8083 },
        { id: 'hardwareinfo', label: 'Hardware Info',  emoji: '🖥️',  port: 8084 },
        { id: 'vtuber',       label: 'VTuber',         emoji: '🎭', port: 8082 },
        { id: 'audio',        label: 'Audio Studio',   emoji: '🎙️',  port: 8086 },
    ];

    const NEXUS_PANEL = 'panel-nexus';
    let _active = NEXUS_PANEL;

    // ── Tab switching ─────────────────────────────────────────────────────────
    function switchTo(panelId) {
        if (panelId === _active) return;

        const prev = document.getElementById(_active);
        if (prev) prev.style.display = 'none';

        const next = document.getElementById(panelId);
        if (!next) return;

        // Nexus panel is a flex column; iframe panels are block
        next.style.display = panelId === NEXUS_PANEL ? 'flex' : 'block';

        document.querySelectorAll('.atb-tab').forEach(t =>
            t.classList.toggle('atb-tab--active', t.dataset.panel === panelId)
        );

        _active = panelId;
        _refreshMenuOpenStates();
    }

    // ── Open an app ───────────────────────────────────────────────────────────
    function openApp(appOrId) {
        const app = typeof appOrId === 'string'
            ? APPS.find(a => a.id === appOrId)
            : appOrId;
        if (!app) return;

        const panelId = `panel-app-${app.id}`;

        // Already open → just switch to it
        if (document.getElementById(panelId)) {
            switchTo(panelId);
            return;
        }

        // Build iframe panel
        const panel = _buildPanel(app, panelId);
        document.getElementById('app-panels').appendChild(panel);

        // Build tab
        const tab = _buildTab(app, panelId);
        document.getElementById('atb-tabs').appendChild(tab);

        switchTo(panelId);
    }

    // ── Build iframe panel ────────────────────────────────────────────────────
    function _buildPanel(app, panelId) {
        const url    = `http://localhost:${app.port}`;
        const loadId = `${panelId}-loading`;
        const frmId  = `${panelId}-iframe`;

        const panel  = document.createElement('div');
        panel.id     = panelId;
        panel.className = 'app-panel app-iframe-panel';
        panel.style.display = 'none';
        panel.innerHTML = `
            <div class="app-iframe-loading" id="${loadId}">
                <div class="app-iframe-spinner"></div>
                <p>Starting <strong>${app.label}</strong>…</p>
                <p class="app-iframe-port">${url}</p>
            </div>
            <iframe
                id="${frmId}"
                src="${url}"
                title="${app.label}"
                allowfullscreen
                style="display:none;"
            ></iframe>`;

        // Wire up events after the panel is in the DOM
        requestAnimationFrame(() => {
            const iframe   = document.getElementById(frmId);
            const loadingEl = document.getElementById(loadId);
            if (!iframe || !loadingEl) return;

            iframe.addEventListener('load', () => {
                loadingEl.style.display = 'none';
                iframe.style.display   = 'block';
            });

            // Timeout fallback: mark as error if 10 s pass with no load
            setTimeout(() => {
                if (loadingEl.style.display !== 'none') {
                    _showError(loadingEl, app);
                }
            }, 10_000);
        });

        return panel;
    }

    function _showError(loadingEl, app) {
        loadingEl.innerHTML = `
            <div class="app-iframe-error-icon">⚠️</div>
            <p class="app-iframe-error">Could not connect to ${app.label}</p>
            <p class="app-iframe-error-msg">
                Make sure the app is running on port ${app.port}
            </p>
            <button class="app-iframe-retry-btn"
                    onclick="ATB.retryApp('${app.id}')">
                Retry
            </button>`;
    }

    // Public: retry a failed app
    function retryApp(appId) {
        const app     = APPS.find(a => a.id === appId);
        const panelId = `panel-app-${appId}`;
        const tab     = document.querySelector(`[data-panel="${panelId}"]`);
        const panel   = document.getElementById(panelId);

        if (_active === panelId) {
            _active = NEXUS_PANEL;   // reset before switch to avoid guard
        }
        tab?.remove();
        panel?.remove();

        if (app) openApp(app);
    }

    // ── Build tab button ──────────────────────────────────────────────────────
    function _buildTab(app, panelId) {
        const tab       = document.createElement('button');
        tab.className   = 'atb-tab';
        tab.dataset.panel = panelId;
        tab.setAttribute('title', app.label);
        tab.innerHTML = `
            <span class="atb-tab-emoji">${app.emoji}</span>
            <span class="atb-tab-label">${app.label}</span>
            <span class="atb-tab-close" title="Close tab">✕</span>`;

        tab.addEventListener('click', e => {
            if (!e.target.classList.contains('atb-tab-close')) {
                switchTo(panelId);
            }
        });

        tab.querySelector('.atb-tab-close').addEventListener('click', e => {
            e.stopPropagation();
            _closeTab(panelId, tab);
        });

        return tab;
    }

    function _closeTab(panelId, tabEl) {
        if (_active === panelId) {
            _active = NEXUS_PANEL;   // reset guard, then switch
            switchTo(NEXUS_PANEL);
        }
        tabEl.remove();
        document.getElementById(panelId)?.remove();
        _refreshMenuOpenStates();
    }

    // ── Apps dropdown ─────────────────────────────────────────────────────────
    function _buildAppsMenu() {
        const menu = document.getElementById('atb-apps-menu');
        if (!menu) return;
        menu.innerHTML = `<div class="atb-apps-menu-title">Aethvion Apps</div>`;

        APPS.forEach(app => {
            const isOpen = !!document.getElementById(`panel-app-${app.id}`);
            const btn    = document.createElement('button');
            btn.className = `atb-app-item${isOpen ? ' atb-app-item--open' : ''}`;
            btn.dataset.appId = app.id;
            btn.innerHTML = `
                <span class="atb-app-emoji">${app.emoji}</span>
                <span class="atb-app-name">${app.label}</span>
                <span class="atb-app-port">:${app.port}</span>
                <span class="atb-app-checkmark">✓</span>`;
            btn.addEventListener('click', () => {
                openApp(app);
                _closeMenu();
            });
            menu.appendChild(btn);
        });
    }

    function _refreshMenuOpenStates() {
        document.querySelectorAll('.atb-app-item').forEach(item => {
            const id     = item.dataset.appId;
            const isOpen = !!document.getElementById(`panel-app-${id}`);
            item.classList.toggle('atb-app-item--open', isOpen);
        });
    }

    function _openMenu() {
        _buildAppsMenu();
        document.getElementById('atb-apps-menu')?.classList.add('open');
        document.getElementById('atb-apps-btn')?.classList.add('open');
    }
    function _closeMenu() {
        document.getElementById('atb-apps-menu')?.classList.remove('open');
        document.getElementById('atb-apps-btn')?.classList.remove('open');
    }
    function _toggleMenu() {
        const open = document.getElementById('atb-apps-menu')?.classList.contains('open');
        open ? _closeMenu() : _openMenu();
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        // Nexus tab
        document.querySelector('[data-panel="panel-nexus"]')
            ?.addEventListener('click', () => switchTo(NEXUS_PANEL));

        // Apps button
        document.getElementById('atb-apps-btn')
            ?.addEventListener('click', e => { e.stopPropagation(); _toggleMenu(); });

        // Prevent click-inside from closing the menu
        document.getElementById('atb-apps-menu')
            ?.addEventListener('click', e => e.stopPropagation());

        // Click outside closes the menu
        document.addEventListener('click', _closeMenu);

        // Keyboard: Escape closes the menu; Ctrl+` cycles app panels
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') _closeMenu();
        });
    }

    // ── Public surface ────────────────────────────────────────────────────────
    return { init, openApp, switchTo, retryApp };

})();

document.addEventListener('DOMContentLoaded', () => ATB.init());
