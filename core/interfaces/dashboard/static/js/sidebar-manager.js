/**
 * Aethvion Suite — Sidebar Manager
 *
 * Behaviour:
 *   Normal mode  → hidden tabs are invisible (display:none via .tab-hidden)
 *   Edit mode    → ALL tabs are visible; hidden ones are visually dimmed with an indicator
 *                  so the user can always see what's available and toggle it back on
 *
 * Persistence: localStorage key 'sidebar_v2'
 * No overlay, no fullscreen panel — everything is inline within the existing sidebar.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'sidebar_v2';

    // ── Storage ───────────────────────────────────────────────────
    function cfgLoad() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
        catch (_) { return {}; }
    }
    function cfgSave(data) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
    }

    // ── State ─────────────────────────────────────────────────────
    let editMode = false;
    let config   = cfgLoad();
    let dragSrc  = null;

    // ── Visibility helpers ────────────────────────────────────────

    /**
     * Normal mode: truly hide tabs the user has disabled.
     * Edit mode:   show ALL tabs; mark disabled ones with .edit-hidden for styling.
     */
    function applyVisibility() {
        document.querySelectorAll('.sidebar-nav .main-tabs .main-tab').forEach(btn => {
            const id = btn.dataset.maintab;
            if (!id) return;
            const isHidden = config[id]?.hidden === true;

            if (editMode) {
                // Always visible in edit mode — just mark for visual treatment
                btn.classList.remove('tab-hidden');
                btn.classList.toggle('edit-hidden', isHidden);
            } else {
                // Truly hide disabled tabs outside edit mode
                btn.classList.toggle('tab-hidden', isHidden);
                btn.classList.remove('edit-hidden');
            }
        });
    }

    // ── Edit controls ─────────────────────────────────────────────

    /** Inject grip + eye button into every .main-tab */
    function injectControls() {
        document.querySelectorAll('.sidebar-nav .main-tabs .main-tab').forEach(btn => {
            const id = btn.dataset.maintab;
            if (!id || btn.querySelector('.drag-grip')) return;

            const isHidden = config[id]?.hidden === true;

            // Drag grip — prepended before icon
            const grip = document.createElement('span');
            grip.className = 'drag-grip';
            grip.title = 'Drag to reorder';
            grip.innerHTML = '<i class="fas fa-grip-vertical"></i>';
            btn.prepend(grip);

            // Eye toggle — appended after label
            const eye = document.createElement('button');
            eye.className = 'vis-toggle';
            eye.dataset.tabid = id;
            eye.title = isHidden ? 'Enable' : 'Disable';
            eye.innerHTML = `<i class="fas ${isHidden ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
            btn.appendChild(eye);

            btn.draggable = true;
        });
    }

    /** Remove all injected controls */
    function removeControls() {
        document.querySelectorAll('.sidebar-nav .drag-grip').forEach(el => el.remove());
        document.querySelectorAll('.sidebar-nav .vis-toggle').forEach(el => el.remove());
        document.querySelectorAll('.sidebar-nav .main-tabs .main-tab').forEach(btn => {
            btn.draggable = false;
        });
    }

    // ── Drag and drop ─────────────────────────────────────────────

    function onDragStart(e) {
        dragSrc = e.target.closest('.main-tab');
        if (!dragSrc) return;
        dragSrc.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    function onDragEnd() {
        dragSrc?.classList.remove('is-dragging');
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        dragSrc = null;
    }

    function onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('.main-tab');
        if (!target || target === dragSrc) return;
        document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        target.classList.add('drop-target');
    }

    function onDrop(e) {
        e.preventDefault();
        const target = e.target.closest('.main-tab');
        if (!target || !dragSrc || target === dragSrc) return;
        target.classList.remove('drop-target');

        const rect = target.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        if (after) target.after(dragSrc);
        else target.before(dragSrc);

        // Persist order
        const order = [...document.querySelectorAll('.sidebar-nav .main-tabs .main-tab')]
            .map(b => b.dataset.maintab).filter(Boolean);
        config._order = order;
        cfgSave(config);
    }

    function setupDrag() {
        const mt = document.querySelector('.sidebar-nav .main-tabs');
        if (!mt) return;
        mt.addEventListener('dragstart', onDragStart, true);
        mt.addEventListener('dragend',   onDragEnd,   true);
        mt.addEventListener('dragover',  onDragOver,  true);
        mt.addEventListener('drop',      onDrop,      true);
    }

    function teardownDrag() {
        const mt = document.querySelector('.sidebar-nav .main-tabs');
        if (!mt) return;
        mt.removeEventListener('dragstart', onDragStart, true);
        mt.removeEventListener('dragend',   onDragEnd,   true);
        mt.removeEventListener('dragover',  onDragOver,  true);
        mt.removeEventListener('drop',      onDrop,      true);
    }

    // ── Eye toggle handler (delegated) ────────────────────────────

    function onEyeClick(e) {
        const eye = e.target.closest('.vis-toggle');
        if (!eye) return;
        e.stopPropagation();

        const id  = eye.dataset.tabid;
        const btn = document.querySelector(`.sidebar-nav .main-tab[data-maintab="${id}"]`);
        if (!btn) return;

        const nowHidden = !(config[id]?.hidden === true);
        if (!config[id]) config[id] = {};
        config[id].hidden = nowHidden;
        cfgSave(config);

        // Update the eye icon immediately
        eye.title = nowHidden ? 'Enable' : 'Disable';
        eye.querySelector('i').className = `fas ${nowHidden ? 'fa-eye-slash' : 'fa-eye'}`;

        // Update visual state (still visible in edit mode, just marked)
        btn.classList.toggle('edit-hidden', nowHidden);
    }

    // ── Edit mode toggle ──────────────────────────────────────────

    function enterEditMode() {
        editMode = true;
        document.querySelector('.sidebar-nav')?.classList.add('sidebar-edit-mode');
        applyVisibility();   // show all, mark disabled ones
        injectControls();
        setupDrag();

        const mt = document.querySelector('.sidebar-nav .main-tabs');
        mt?.addEventListener('click', onEyeClick, true);

        updateToggleBtn();
    }

    function exitEditMode() {
        editMode = false;
        document.querySelector('.sidebar-nav')?.classList.remove('sidebar-edit-mode');

        teardownDrag();
        removeControls();

        const mt = document.querySelector('.sidebar-nav .main-tabs');
        mt?.removeEventListener('click', onEyeClick, true);

        applyVisibility();   // re-hide disabled tabs
        updateToggleBtn();
    }

    // ── Customize button ──────────────────────────────────────────

    function buildToggleBtn() {
        const btn = document.createElement('button');
        btn.id        = 'cust-toggle';
        btn.className = 'cust-toggle-btn';
        btn.title     = 'Customize sidebar tabs';
        renderToggleBtn(btn);
        return btn;
    }

    function renderToggleBtn(btn) {
        if (editMode) {
            btn.innerHTML = '<i class="fas fa-check"></i><span>Done</span>';
            btn.classList.add('edit-active');
        } else {
            btn.innerHTML = '<i class="fas fa-sliders"></i><span>Customize</span>';
            btn.classList.remove('edit-active');
        }
    }

    function updateToggleBtn() {
        const btn = document.getElementById('cust-toggle');
        if (btn) renderToggleBtn(btn);
    }

    // ── Init ──────────────────────────────────────────────────────

    function init() {
        const sidebarBottom = document.querySelector('.sidebar-nav .sidebar-bottom');
        if (!sidebarBottom) return;

        config = cfgLoad();
        applyVisibility();

        const toggleBtn = buildToggleBtn();
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
