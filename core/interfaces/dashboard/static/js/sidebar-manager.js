/**
 * Aethvion Suite — Sidebar Manager
 * Overlays a non-destructive customization layer on the existing static sidebar.
 *
 * Customize mode: toggled by a button in .sidebar-bottom.
 *   ON  → sidebar adds .ae-edit-mode; every .main-tab gets inline grip + eye controls.
 *   OFF → controls are removed; config is saved to localStorage.
 *
 * Tab visibility: hidden tabs get .ae-tab-hidden (display:none).
 * Reorder:        drag-and-drop in edit mode moves the actual .main-tab DOM nodes,
 *                 preserving section/category wrapping.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'ae_sidebar_v2';

    // ── Storage helpers ───────────────────────────────────────────
    const cfg = {
        load() {
            try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
            catch (_) { return {}; }
        },
        save(data) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
        }
    };

    // ── State ─────────────────────────────────────────────────────
    let editMode = false;
    let config   = cfg.load();
    let dragSrc  = null;

    // ── Apply saved visibility to all tabs ────────────────────────
    function applyVisibility() {
        document.querySelectorAll('.sidebar-nav .main-tabs .main-tab').forEach(btn => {
            const id = btn.dataset.maintab;
            if (!id) return;
            btn.classList.toggle('ae-tab-hidden', config[id]?.hidden === true);
        });
    }

    // ── Inject edit controls into every .main-tab ─────────────────
    function injectControls() {
        document.querySelectorAll('.sidebar-nav .main-tabs .main-tab').forEach(btn => {
            const id = btn.dataset.maintab;
            if (!id || btn.querySelector('.ae-grip')) return; // already injected

            const hidden = config[id]?.hidden === true;

            // Grip
            const grip = document.createElement('span');
            grip.className = 'ae-grip';
            grip.title = 'Drag to reorder';
            grip.innerHTML = '<i class="fas fa-grip-vertical"></i>';
            btn.prepend(grip);

            // Eye toggle
            const eye = document.createElement('button');
            eye.className = 'ae-eye';
            eye.dataset.tabid = id;
            eye.title = hidden ? 'Show' : 'Hide';
            eye.innerHTML = `<i class="fas ${hidden ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
            btn.appendChild(eye);

            // Draggable
            btn.draggable = true;
        });
    }

    // ── Remove edit controls ──────────────────────────────────────
    function removeControls() {
        document.querySelectorAll('.sidebar-nav .ae-grip').forEach(el => el.remove());
        document.querySelectorAll('.sidebar-nav .ae-eye').forEach(el => el.remove());
        document.querySelectorAll('.sidebar-nav .main-tabs .main-tab').forEach(btn => {
            btn.draggable = false;
        });
    }

    // ── Drag-and-drop: moves the actual DOM tab button ─────────────
    function setupDrag() {
        const mainTabs = document.querySelector('.sidebar-nav .main-tabs');
        if (!mainTabs) return;

        mainTabs.addEventListener('dragstart', onDragStart, true);
        mainTabs.addEventListener('dragend',   onDragEnd,   true);
        mainTabs.addEventListener('dragover',  onDragOver,  true);
        mainTabs.addEventListener('drop',      onDrop,      true);
    }

    function teardownDrag() {
        const mainTabs = document.querySelector('.sidebar-nav .main-tabs');
        if (!mainTabs) return;
        mainTabs.removeEventListener('dragstart', onDragStart, true);
        mainTabs.removeEventListener('dragend',   onDragEnd,   true);
        mainTabs.removeEventListener('dragover',  onDragOver,  true);
        mainTabs.removeEventListener('drop',      onDrop,      true);
    }

    function onDragStart(e) {
        dragSrc = e.target.closest('.main-tab');
        if (!dragSrc) return;
        dragSrc.classList.add('ae-dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    function onDragEnd() {
        dragSrc?.classList.remove('ae-dragging');
        document.querySelectorAll('.ae-drop-target').forEach(el => el.classList.remove('ae-drop-target'));
        dragSrc = null;
    }

    function onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('.main-tab');
        if (!target || target === dragSrc) return;
        document.querySelectorAll('.ae-drop-target').forEach(el => el.classList.remove('ae-drop-target'));
        target.classList.add('ae-drop-target');
    }

    function onDrop(e) {
        e.preventDefault();
        const target = e.target.closest('.main-tab');
        if (!target || !dragSrc || target === dragSrc) return;
        target.classList.remove('ae-drop-target');

        // Insert dragSrc before or after target depending on vertical position
        const rect = target.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        if (after) target.after(dragSrc);
        else target.before(dragSrc);

        // Persist order
        const order = [...document.querySelectorAll('.sidebar-nav .main-tabs .main-tab')]
            .map(b => b.dataset.maintab).filter(Boolean);
        config._order = order;
        cfg.save(config);
    }

    // ── Eye toggle handler (delegated from .main-tabs) ─────────────
    function onEyeClick(e) {
        const eye = e.target.closest('.ae-eye');
        if (!eye) return;
        e.stopPropagation(); // don't trigger tab navigation

        const id  = eye.dataset.tabid;
        const btn = document.querySelector(`.sidebar-nav .main-tab[data-maintab="${id}"]`);
        if (!btn) return;

        const nowHidden = !(config[id]?.hidden === true);
        if (!config[id]) config[id] = {};
        config[id].hidden = nowHidden;
        cfg.save(config);

        // Update eye icon immediately (visibility applies when edit mode ends)
        eye.title = nowHidden ? 'Show' : 'Hide';
        eye.querySelector('i').className = `fas ${nowHidden ? 'fa-eye-slash' : 'fa-eye'}`;
        btn.classList.toggle('ae-will-hide', nowHidden);
    }

    // ── Toggle edit mode ──────────────────────────────────────────
    function enterEditMode() {
        editMode = true;
        const sidebar = document.querySelector('.sidebar-nav');
        sidebar?.classList.add('ae-edit-mode');
        injectControls();
        setupDrag();

        // Delegate eye clicks on the main-tabs container
        const mainTabs = document.querySelector('.sidebar-nav .main-tabs');
        mainTabs?.addEventListener('click', onEyeClick, true);

        updateToggleBtn();
    }

    function exitEditMode() {
        editMode = false;
        const sidebar = document.querySelector('.sidebar-nav');
        sidebar?.classList.remove('ae-edit-mode');

        teardownDrag();
        removeControls();

        // Remove will-hide preview class
        document.querySelectorAll('.ae-will-hide').forEach(el => el.classList.remove('ae-will-hide'));

        const mainTabs = document.querySelector('.sidebar-nav .main-tabs');
        mainTabs?.removeEventListener('click', onEyeClick, true);

        // Apply final visibility
        applyVisibility();
        updateToggleBtn();
    }

    // ── Build / update the Customize button ───────────────────────
    function buildToggleBtn() {
        const existing = document.getElementById('ae-cust-toggle');
        if (existing) return existing;

        const btn = document.createElement('button');
        btn.id        = 'ae-cust-toggle';
        btn.className = 'ae-cust-toggle-btn';
        btn.title     = 'Customize sidebar tabs';
        updateToggleBtnHTML(btn);
        return btn;
    }

    function updateToggleBtnHTML(btn) {
        if (!btn) return;
        if (editMode) {
            btn.innerHTML = '<i class="fas fa-check"></i><span>Done</span>';
            btn.classList.add('ae-edit-active');
        } else {
            btn.innerHTML = '<i class="fas fa-sliders"></i><span>Customize</span>';
            btn.classList.remove('ae-edit-active');
        }
    }

    function updateToggleBtn() {
        updateToggleBtnHTML(document.getElementById('ae-cust-toggle'));
    }

    // ── Reset ─────────────────────────────────────────────────────
    function buildResetBtn() {
        const existing = document.getElementById('ae-reset-btn');
        if (existing) return existing;

        const btn = document.createElement('button');
        btn.id        = 'ae-reset-btn';
        btn.className = 'ae-reset-btn';
        btn.title     = 'Reset to defaults';
        btn.innerHTML = '<i class="fas fa-rotate-left"></i><span>Reset</span>';
        btn.addEventListener('click', () => {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        });
        return btn;
    }

    // ── Init ──────────────────────────────────────────────────────
    function init() {
        const sidebarBottom = document.querySelector('.sidebar-nav .sidebar-bottom');
        if (!sidebarBottom) return;

        config = cfg.load();
        applyVisibility();

        const toggleBtn = buildToggleBtn();
        const resetBtn  = buildResetBtn();

        // Insert into sidebar-bottom, above the version tab
        sidebarBottom.prepend(resetBtn);
        sidebarBottom.prepend(toggleBtn);

        toggleBtn.addEventListener('click', () => {
            if (editMode) exitEditMode();
            else enterEditMode();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 120);
    }
})();
