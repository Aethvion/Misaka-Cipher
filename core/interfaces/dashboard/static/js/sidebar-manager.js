/**
 * Aethvion Suite — Sidebar Manager (Folder Edition)
 *
 * Fully dynamic sidebar renderer with user-configurable folders.
 *
 * Normal mode:
 *   - Renders tabs + folders from config
 *   - Hidden tabs are invisible; folders with no visible tabs are hidden
 *   - Folders are collapsible (click header)
 *
 * Edit mode (toggle "Customize"):
 *   - Drag-and-drop: reorder tabs, reorder folders, move tabs between folders
 *   - Eye toggle: hide/show individual tabs
 *   - Add folder, rename folder (inline), delete folder (tabs go to root)
 *   - All tabs visible (hidden ones are dimmed so user can re-enable them)
 *
 * Persistence: localStorage key 'sidebar_v2'
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'sidebar_v2';

    // ── Tab Registry ──────────────────────────────────────────────────────────
    // All navigable tabs. mode[] = which dashboard modes show this tab.
    const TABS = [
        { id: 'suite-home',        label: 'Home',             icon: 'fas fa-house',              mode: ['home'] },
        { id: 'chat',              label: 'Chat',             icon: 'fas fa-comments',            mode: ['ai']   },
        { id: 'agents',            label: 'Agents',           icon: 'fas fa-robot',              mode: ['ai']   },
        { id: 'agent-corp',        label: 'Agent Corp',       icon: 'fas fa-building',           mode: ['ai']   },
        { id: 'schedule',          label: 'Schedule',         icon: 'fas fa-calendar-alt',       mode: ['ai']   },
        { id: 'photo',             label: 'Photo',            icon: 'fas fa-image',              mode: ['ai']   },
        { id: 'audio',             label: 'Audio',            icon: 'fas fa-microphone',         mode: ['ai']   },
        { id: 'advaiconv',         label: 'Adv. AI Conv.',    icon: 'fas fa-flask',              mode: ['ai']   },
        { id: 'researchboard',     label: 'Directors',        icon: 'fas fa-balance-scale',      mode: ['ai']   },
        { id: 'arena',             label: 'Arena',            icon: 'fas fa-shield-halved',      mode: ['ai']   },
        { id: 'aiconv',            label: 'AI Conv.',         icon: 'fas fa-masks-theater',      mode: ['ai']   },
        { id: 'explained',         label: 'Explained',        icon: 'fas fa-lightbulb',          mode: ['ai']   },
        { id: 'misaka-cipher',     label: 'Misaka Cipher',    icon: 'fas fa-wand-magic-sparkles',mode: ['ai']   },
        { id: 'axiom',             label: 'Axiom',            icon: 'fas fa-atom',               mode: ['ai']   },
        { id: 'lyra',              label: 'Lyra',             icon: 'fas fa-music',              mode: ['ai']   },
        { id: 'companion-creator', label: 'Create Companion', icon: 'fas fa-plus-circle',        mode: ['ai']   },
        { id: 'games-center',      label: 'Games Center',     icon: 'fas fa-gamepad',            mode: ['ai']   },
        { id: 'memory',            label: 'Memory',           icon: 'fas fa-book',               mode: ['ai']   },
        { id: 'companion-memory',  label: 'Companion Memory', icon: 'fas fa-dna',                mode: ['ai']   },
        { id: 'persistent-memory', label: 'Persistent',       icon: 'fas fa-brain',              mode: ['ai']   },
        { id: 'sched-overview',    label: 'Scheduled',        icon: 'fas fa-calendar-check',     mode: ['ai']   },
        { id: 'output',            label: 'Output',           icon: 'fas fa-upload',             mode: ['ai']   },
        { id: 'screenshots',       label: 'Gallery',          icon: 'fas fa-camera-retro',       mode: ['ai']   },
        { id: 'camera',            label: 'Camera',           icon: 'fas fa-camera',             mode: ['ai']   },
        { id: 'uploads',           label: 'Uploads',          icon: 'fas fa-folder',             mode: ['ai']   },
        { id: 'local-models',      label: 'Text & Chat',      icon: 'fas fa-microchip',          mode: ['ai']   },
        { id: 'image-models',      label: 'Image Models',     icon: 'fas fa-mountain-sun',       mode: ['ai']   },
        { id: 'audio-models',      label: 'Audio & Speech',   icon: 'fas fa-volume-high',        mode: ['ai']   },
        { id: 'api-providers',     label: 'API Providers',    icon: 'fas fa-plug',               mode: ['ai']   },
        { id: 'logs',              label: 'Logs',             icon: 'fas fa-scroll',             mode: ['ai']   },
        { id: 'documentation',     label: 'Docs',             icon: 'fas fa-book-open',          mode: ['ai']   },
        { id: 'usage',             label: 'Usage',            icon: 'fas fa-chart-bar',          mode: ['ai']   },
        { id: 'status',            label: 'Status',           icon: 'fas fa-traffic-light',      mode: ['ai']   },
        { id: 'ports',             label: 'Ports',            icon: 'fas fa-plug',               mode: ['ai']   },
    ];

    const TAB_MAP = Object.fromEntries(TABS.map(t => [t.id, t]));

    // ── Default Config ────────────────────────────────────────────────────────
    function defaultConfig() {
        return {
            hidden: {},
            folders: {
                'f-workspace':  { name: 'Workspace',    expanded: true  },
                'f-research':   { name: 'Research',     expanded: false },
                'f-companions': { name: 'Companions',   expanded: false },
                'f-fun':        { name: 'Entertainment',expanded: false },
                'f-memory':     { name: 'Memory',       expanded: false },
                'f-storage':    { name: 'Storage',      expanded: false },
                'f-models':     { name: 'Model Hub',    expanded: false },
                'f-system':     { name: 'System',       expanded: false },
            },
            order: [
                { type: 'tab',    id: 'suite-home' },
                { type: 'folder', id: 'f-workspace',  children: ['chat','agents','agent-corp','schedule','photo','audio'] },
                { type: 'folder', id: 'f-research',   children: ['advaiconv','researchboard','arena','aiconv','explained'] },
                { type: 'folder', id: 'f-companions', children: ['misaka-cipher','axiom','lyra','companion-creator'] },
                { type: 'folder', id: 'f-fun',        children: ['games-center'] },
                { type: 'folder', id: 'f-memory',     children: ['memory','companion-memory','persistent-memory','sched-overview'] },
                { type: 'folder', id: 'f-storage',    children: ['output','screenshots','camera','uploads'] },
                { type: 'folder', id: 'f-models',     children: ['local-models','image-models','audio-models','api-providers'] },
                { type: 'folder', id: 'f-system',     children: ['logs','documentation','usage','status','ports'] },
            ],
        };
    }

    // ── Storage ───────────────────────────────────────────────────────────────
    function cfgLoad() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!saved) return defaultConfig();

            // Surface any tabs that are in the registry but missing from saved config
            const placed = new Set();
            for (const entry of saved.order) {
                if (entry.type === 'tab') placed.add(entry.id);
                else if (entry.type === 'folder') (entry.children || []).forEach(id => placed.add(id));
            }
            TABS.forEach(t => { if (!placed.has(t.id)) saved.order.push({ type: 'tab', id: t.id }); });
            return saved;
        } catch (_) { return defaultConfig(); }
    }

    function cfgSave() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch (_) {}
    }

    // ── State ─────────────────────────────────────────────────────────────────
    let config   = null;
    let editMode = false;

    // Drag state
    let dragging    = null; // { type:'tab'|'folder', id, srcFolderId }
    let dropCurrent = null; // { targetEl, position:'before'|'after'|'into' }

    // ── Mode detection ────────────────────────────────────────────────────────
    function getCurrentMode() {
        if (document.body.classList.contains('theme-ai'))   return 'ai';
        if (document.body.classList.contains('theme-home')) return 'home';
        return window.dashboardMode || 'home';
    }

    // ── HTML escape ───────────────────────────────────────────────────────────
    function esc(s) {
        return String(s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function render() {
        const container = document.getElementById('sidebar-tab-list');
        if (!container) return;

        // Clear drag classes before wipe
        clearDropHighlights();

        container.innerHTML = '';

        const mode = getCurrentMode();

        for (const entry of config.order) {
            if (entry.type === 'tab') {
                const el = renderTab(entry.id, null, mode);
                if (el) container.appendChild(el);
            } else if (entry.type === 'folder') {
                const el = renderFolder(entry, mode);
                if (el) container.appendChild(el);
            }
        }

        // "New Folder" button in edit mode
        if (editMode) {
            const addBtn = document.createElement('button');
            addBtn.className = 'sidebar-add-folder-btn';
            addBtn.innerHTML = '<i class="fas fa-folder-plus"></i><span>New Folder</span>';
            addBtn.addEventListener('click', addFolder);
            container.appendChild(addBtn);
        }

        // Re-apply current mode visibility
        applyMode(mode);

        // Re-attach drag-drop in edit mode
        if (editMode) setupDragDrop(container);
    }

    // ── Render: single tab button ─────────────────────────────────────────────
    function renderTab(tabId, folderId, mode) {
        const tab = TAB_MAP[tabId];
        if (!tab) return null;

        const isHidden = config.hidden[tabId] === true;

        // In normal mode, skip hidden tabs
        if (!editMode && isHidden) return null;

        const modeClasses = tab.mode.map(m => `mode-${m}`).join(' ');

        const btn = document.createElement('button');
        btn.className = `main-tab ${modeClasses}`;
        btn.dataset.maintab = tabId;
        btn.dataset.tooltip  = tab.label;
        if (folderId) btn.dataset.folderId = folderId;

        // In edit mode: show hidden ones dimmed
        if (editMode && isHidden) btn.classList.add('edit-hidden');

        // Drag grip (edit mode only)
        if (editMode) {
            const grip = document.createElement('span');
            grip.className = 'drag-grip';
            grip.title = 'Drag to reorder';
            grip.draggable = true;
            grip.innerHTML = '<i class="fas fa-grip-vertical"></i>';
            btn.appendChild(grip);
        }

        // Icon
        const icon = document.createElement('span');
        icon.className = 'tab-icon';
        icon.innerHTML = `<i class="${tab.icon}"></i>`;
        btn.appendChild(icon);

        // Label
        const label = document.createElement('span');
        label.className = 'tab-label';
        label.textContent = tab.label;
        btn.appendChild(label);

        // Eye toggle (edit mode only)
        if (editMode) {
            const eye = document.createElement('button');
            eye.className = 'vis-toggle';
            eye.dataset.tabid = tabId;
            eye.title = isHidden ? 'Enable' : 'Disable';
            eye.innerHTML = `<i class="fas ${isHidden ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
            eye.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTabVisibility(tabId);
            });
            btn.appendChild(eye);
        }

        // Tab click → switch panel (add our own listener since core.js may have run before us)
        btn.addEventListener('click', (e) => {
            if (e.target.closest('.drag-grip') || e.target.closest('.vis-toggle')) return;
            if (dragging) return;
            if (typeof switchMainTab === 'function') switchMainTab(tabId);
        });

        // Special: companions slot — inject custom-companions-sidebar div before companion-creator
        if (tabId === 'lyra' && folderId) {
            const companions = document.getElementById('custom-companions-sidebar');
            // Will be handled after render in renderFolder
        }

        return btn;
    }

    // ── Render: folder ────────────────────────────────────────────────────────
    function renderFolder(entry, mode) {
        const folder = config.folders[entry.id];
        if (!folder) return null;

        const children = entry.children || [];
        const isHidden = config.hidden;

        // Check if folder has any renderable tabs in normal mode
        if (!editMode) {
            const hasVisible = children.some(id => {
                if (isHidden[id]) return false;
                const t = TAB_MAP[id];
                return t && t.mode.includes(mode);
            });
            if (!hasVisible) return null;
        }

        // Wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'sidebar-folder';
        wrapper.dataset.folderId = entry.id;

        // Header
        const header = document.createElement('div');
        header.className = 'folder-header';
        header.dataset.folderId = entry.id;

        if (editMode) {
            const grip = document.createElement('span');
            grip.className = 'drag-grip folder-drag-grip';
            grip.title = 'Drag to reorder';
            grip.innerHTML = '<i class="fas fa-grip-vertical"></i>';
            header.appendChild(grip);
        }

        const chevron = document.createElement('i');
        chevron.className = `fas fa-chevron-right folder-chevron${folder.expanded ? ' expanded' : ''}`;
        header.appendChild(chevron);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'folder-name';
        nameSpan.textContent = folder.name;
        header.appendChild(nameSpan);

        if (editMode) {
            const actions = document.createElement('span');
            actions.className = 'folder-actions';
            actions.innerHTML = `
                <button class="folder-rename-btn" title="Rename"><i class="fas fa-pen"></i></button>
                <button class="folder-delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
            `;
            actions.querySelector('.folder-rename-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                startRename(entry.id, nameSpan);
            });
            actions.querySelector('.folder-delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteFolder(entry.id);
            });
            header.appendChild(actions);
        }

        header.addEventListener('click', (e) => {
            if (e.target.closest('.folder-actions')) return;
            if (e.target.closest('.drag-grip')) return;
            if (dragging) return;
            toggleFolder(entry.id);
        });

        wrapper.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = `folder-body${folder.expanded ? ' expanded' : ''}`;
        body.dataset.folderId = entry.id;

        for (const tabId of children) {
            const tabEl = renderTab(tabId, entry.id, mode);
            if (tabEl) {
                body.appendChild(tabEl);
                // Companions slot — insert custom div after lyra
                if (tabId === 'lyra') {
                    const customDiv = document.createElement('div');
                    customDiv.id = 'custom-companions-sidebar';
                    body.appendChild(customDiv);
                }
            }
        }

        wrapper.appendChild(body);
        return wrapper;
    }

    // ── Mode visibility ───────────────────────────────────────────────────────
    function applyMode(mode) {
        // Apply mode-hidden to tabs that don't belong to the current mode
        // (mirrors what core.js's setDashboardMode does)
        document.querySelectorAll('#sidebar-tab-list .main-tab').forEach(btn => {
            const hasCurrent = btn.classList.contains(`mode-${mode}`);
            btn.classList.toggle('mode-hidden', !hasCurrent);
        });
    }

    // ── Folder operations ─────────────────────────────────────────────────────
    function toggleFolder(folderId) {
        if (!config.folders[folderId]) return;
        config.folders[folderId].expanded = !config.folders[folderId].expanded;
        cfgSave();
        render();
    }

    function addFolder() {
        const id = 'f-' + Date.now();
        config.folders[id] = { name: 'New Folder', expanded: true };
        config.order.push({ type: 'folder', id, children: [] });
        cfgSave();
        render();
        // Immediately trigger rename
        const wrapper = document.querySelector(`.sidebar-folder[data-folder-id="${id}"]`);
        const nameSpan = wrapper?.querySelector('.folder-name');
        if (nameSpan) startRename(id, nameSpan);
    }

    function startRename(folderId, nameSpan) {
        const current = config.folders[folderId]?.name || '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'folder-rename-input';
        input.value = current;

        nameSpan.replaceWith(input);
        input.focus();
        input.select();

        function commit() {
            const newName = input.value.trim() || current;
            if (config.folders[folderId]) config.folders[folderId].name = newName;
            cfgSave();
            render();
        }

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')  { input.blur(); }
            if (e.key === 'Escape') { input.value = current; input.blur(); }
        });
    }

    function deleteFolder(folderId) {
        const entry = config.order.find(e => e.type === 'folder' && e.id === folderId);
        if (!entry) return;

        const idx = config.order.indexOf(entry);
        const orphans = (entry.children || []).map(id => ({ type: 'tab', id }));
        config.order.splice(idx, 1, ...orphans);
        delete config.folders[folderId];
        cfgSave();
        render();
    }

    function toggleTabVisibility(tabId) {
        config.hidden[tabId] = !config.hidden[tabId];
        cfgSave();
        render();
    }

    // ── Drag and drop ─────────────────────────────────────────────────────────

    let dropIndicator = null;

    function setupDragDrop(container) {
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'drop-indicator';
        dropIndicator.style.display = 'none';
        document.body.appendChild(dropIndicator); // appended to body so it can float

        container.addEventListener('dragstart', onDragStart, true);
        container.addEventListener('drag',      onDrag,      true);
        container.addEventListener('dragend',   onDragEnd,   true);
        container.addEventListener('dragover',  onDragOver,  true);
        container.addEventListener('drop',      onDrop,      true);
    }

    function onDragStart(e) {
        // Determine what is being dragged
        const grip = e.target.closest('.drag-grip');
        if (!grip) { e.preventDefault(); return; }

        const tab = grip.closest('.main-tab');
        const folderHeader = grip.closest('.folder-header');

        if (tab) {
            dragging = {
                type: 'tab',
                id: tab.dataset.maintab,
                srcFolderId: tab.dataset.folderId || null,
            };
            tab.classList.add('is-dragging');
        } else if (folderHeader && grip.classList.contains('folder-drag-grip')) {
            const folderId = folderHeader.dataset.folderId;
            dragging = {
                type: 'folder',
                id: folderId,
            };
            folderHeader.closest('.sidebar-folder')?.classList.add('is-dragging');
        } else {
            e.preventDefault();
            return;
        }

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ''); // needed for Firefox
    }

    function onDrag() {
        // Keep indicator visible during drag
    }

    function onDragEnd() {
        clearDropHighlights();
        if (dropIndicator) { dropIndicator.remove(); dropIndicator = null; }
        dragging = null;
        dropCurrent = null;
    }

    function onDragOver(e) {
        e.preventDefault();
        if (!dragging) return;

        clearDropHighlights();
        if (!dropIndicator) return;

        const tab          = e.target.closest('.main-tab:not(.is-dragging)');
        const folderHeader = e.target.closest('.folder-header');
        const folderBody   = e.target.closest('.folder-body');
        const container    = document.getElementById('sidebar-tab-list');

        if (dragging.type === 'tab') {
            if (folderHeader && !tab) {
                // Dropping onto a folder header → "drop into folder"
                folderHeader.classList.add('drop-target-folder');
                dropCurrent = { type: 'into-folder', folderId: folderHeader.dataset.folderId };
                dropIndicator.style.display = 'none';
            } else if (tab) {
                // Dropping near another tab
                const rect  = tab.getBoundingClientRect();
                const after = e.clientY > rect.top + rect.height / 2;
                positionIndicator(tab, after);
                dropCurrent = {
                    type: after ? 'after-tab' : 'before-tab',
                    tabId: tab.dataset.maintab,
                    folderId: tab.dataset.folderId || null,
                };
            } else if (folderBody && !tab) {
                // Dropping into empty folder body area
                folderBody.classList.add('drop-target-folder');
                dropCurrent = { type: 'into-folder', folderId: folderBody.dataset.folderId };
                dropIndicator.style.display = 'none';
            } else if (container) {
                // Root drop — find position
                positionAtRoot(e.clientY, container);
            }
        } else if (dragging.type === 'folder') {
            const targetFolder = e.target.closest('.sidebar-folder:not(.is-dragging)');
            if (targetFolder) {
                const rect  = targetFolder.getBoundingClientRect();
                const after = e.clientY > rect.top + rect.height / 2;
                positionIndicator(targetFolder, after);
                dropCurrent = {
                    type: after ? 'after-folder' : 'before-folder',
                    folderId: targetFolder.dataset.folderId,
                };
            }
        }
    }

    function positionIndicator(el, after) {
        const rect = el.getBoundingClientRect();
        const indicator = dropIndicator;
        if (!indicator) return;

        indicator.style.display  = 'block';
        indicator.style.position = 'fixed';
        indicator.style.left     = rect.left + 'px';
        indicator.style.width    = rect.width + 'px';
        indicator.style.top      = (after ? rect.bottom - 1 : rect.top) + 'px';
    }

    function positionAtRoot(clientY, container) {
        const children = [...container.children].filter(el =>
            !el.classList.contains('drop-indicator') &&
            !el.classList.contains('sidebar-add-folder-btn')
        );
        let insertBefore = null;
        for (const child of children) {
            const r = child.getBoundingClientRect();
            if (clientY < r.top + r.height / 2) { insertBefore = child; break; }
        }
        const ref = insertBefore || children[children.length - 1];
        if (ref) {
            const after = !insertBefore;
            positionIndicator(ref, after);
            dropCurrent = { type: 'root', insertBefore: insertBefore?.dataset?.maintab || insertBefore?.dataset?.folderId || null };
        }
    }

    function clearDropHighlights() {
        document.querySelectorAll('.drop-target-folder').forEach(el => el.classList.remove('drop-target-folder'));
        document.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
        if (dropIndicator) dropIndicator.style.display = 'none';
    }

    function onDrop(e) {
        e.preventDefault();
        if (!dragging || !dropCurrent) { onDragEnd(); return; }

        if (dragging.type === 'tab') {
            const tabId      = dragging.id;
            const srcFolder  = dragging.srcFolderId;
            const dc         = dropCurrent;

            // Remove from source
            removeTabFromConfig(tabId, srcFolder);

            if (dc.type === 'into-folder') {
                const folderEntry = config.order.find(e => e.type === 'folder' && e.id === dc.folderId);
                if (folderEntry) {
                    folderEntry.children.push(tabId);
                    if (config.folders[dc.folderId]) config.folders[dc.folderId].expanded = true;
                }
            } else if (dc.type === 'before-tab' || dc.type === 'after-tab') {
                insertTabNearTab(tabId, dc.tabId, dc.folderId, dc.type === 'after-tab');
            } else if (dc.type === 'root') {
                config.order.push({ type: 'tab', id: tabId });
            }

        } else if (dragging.type === 'folder') {
            const srcId = dragging.id;
            const dc    = dropCurrent;

            if (dc.type === 'before-folder' || dc.type === 'after-folder') {
                const srcEntry    = config.order.find(e => e.type === 'folder' && e.id === srcId);
                const targetEntry = config.order.find(e => e.type === 'folder' && e.id === dc.folderId);
                if (srcEntry && targetEntry) {
                    const srcIdx = config.order.indexOf(srcEntry);
                    config.order.splice(srcIdx, 1);
                    const tgtIdx = config.order.indexOf(targetEntry);
                    config.order.splice(dc.type === 'after-folder' ? tgtIdx + 1 : tgtIdx, 0, srcEntry);
                }
            }
        }

        cfgSave();
        onDragEnd();
        render();
    }

    function removeTabFromConfig(tabId, srcFolderId) {
        if (srcFolderId) {
            const entry = config.order.find(e => e.type === 'folder' && e.id === srcFolderId);
            if (entry) entry.children = entry.children.filter(id => id !== tabId);
        } else {
            const idx = config.order.findIndex(e => e.type === 'tab' && e.id === tabId);
            if (idx >= 0) config.order.splice(idx, 1);
        }
    }

    function insertTabNearTab(tabId, nearTabId, nearFolderId, after) {
        if (nearFolderId) {
            const entry = config.order.find(e => e.type === 'folder' && e.id === nearFolderId);
            if (entry) {
                const idx = entry.children.indexOf(nearTabId);
                entry.children.splice(after ? idx + 1 : idx, 0, tabId);
            }
        } else {
            const idx = config.order.findIndex(e => e.type === 'tab' && e.id === nearTabId);
            if (idx >= 0) config.order.splice(after ? idx + 1 : idx, 0, { type: 'tab', id: tabId });
            else config.order.push({ type: 'tab', id: tabId });
        }
    }

    // ── Edit mode toggle ──────────────────────────────────────────────────────
    function enterEditMode() {
        editMode = true;
        document.querySelector('.sidebar-nav')?.classList.add('sidebar-edit-mode');
        updateToggleBtn();
        render();
    }

    function exitEditMode() {
        editMode = false;
        document.querySelector('.sidebar-nav')?.classList.remove('sidebar-edit-mode');
        updateToggleBtn();
        render();
    }

    // ── Customize button ──────────────────────────────────────────────────────
    function buildToggleBtn() {
        const btn = document.createElement('button');
        btn.id        = 'cust-toggle';
        btn.className = 'cust-toggle-btn';
        btn.title     = 'Customize sidebar';
        updateToggleBtnEl(btn);
        btn.addEventListener('click', () => editMode ? exitEditMode() : enterEditMode());
        return btn;
    }

    function updateToggleBtnEl(btn) {
        if (!btn) return;
        if (editMode) {
            btn.innerHTML = '<i class="fas fa-check"></i><span>Done</span>';
            btn.classList.add('edit-active');
        } else {
            btn.innerHTML = '<i class="fas fa-sliders"></i><span>Customize</span>';
            btn.classList.remove('edit-active');
        }
    }

    function updateToggleBtn() {
        updateToggleBtnEl(document.getElementById('cust-toggle'));
    }

    // ── Watch for mode changes (body class swap) ──────────────────────────────
    function watchMode() {
        const observer = new MutationObserver(() => {
            applyMode(getCurrentMode());
            // In normal mode also re-render (folders may need to hide/show)
            if (!editMode) render();
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        const sidebarBottom = document.querySelector('.sidebar-nav .sidebar-bottom');
        if (!sidebarBottom) return;

        config = cfgLoad();

        // Inject Customize button at the top of sidebar-bottom
        const toggleBtn = buildToggleBtn();
        sidebarBottom.prepend(toggleBtn);

        watchMode();
        render();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 120);
    }
})();
