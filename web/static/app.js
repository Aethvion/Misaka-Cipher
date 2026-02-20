// Misaka Cipher - Web Dashboard JavaScript
// Handles WebSocket connections, UI interactions, and real-time updates

// WebSocket connections
let chatWs = null;
let logsWs = null;
let agentsWs = null;

// UI state
let currentMainTab = 'chat';

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeWebSockets();
    const refreshMemory = document.getElementById('refresh-memory-btn');
    if (refreshMemory) refreshMemory.addEventListener('click', loadMemoryData);

    // Initialize UI listeners (TABS, INPUTS, ETC)
    initializeUI();

    // Developer mode (must be before loadInitialData so toggle is ready)
    initDevMode();

    // Initial load
    loadInitialData();
});

// ===== WebSocket Management =====

// ===== System Terminal =====

// Expose to window for threads.js
window.updateTerminalVisibility = function () {
    const terminal = document.getElementById('system-terminal');
    if (!terminal) return;

    // Check current thread settings
    const currentThreadId = window.currentThreadId || 'default'; // accessing variable from threads.js (global scope issue?)
    // threads.js variables are not global by default unless script is simple or exposed.
    // Actually, threads, currentThreadId are top level in threads.js, but threads.js is loaded as a script, so they SHOULD be global?
    // Let's assume they are because previous code uses them. 
    // Wait, threads.js defines `let currentThreadId`, which is block scoped to the script if type module? No, type is not module.
    // It should be global.

    // However, safer to look at threads object.
    const thread = (window.threads && window.threads[window.currentThreadId]);

    // Default to true
    let enabled = true;
    if (thread && thread.settings && thread.settings.system_terminal_enabled === false) {
        enabled = false;
    }

    terminal.style.display = enabled ? 'flex' : 'none';
};

function updateSystemTerminal(message, title, agent, status) {
    const terminal = document.getElementById('terminal-content');
    if (!terminal) return;

    // Even if hidden, we append logs so they are there when toggled ON.

    const line = document.createElement('div');
    line.className = 'terminal-line';

    const time = new Date().toLocaleTimeString([], { hour12: false });

    // Status Icon
    let icon = 'ℹ️';
    if (status === 'running') icon = '⏳';
    if (status === 'completed') icon = '✓';
    if (status === 'failed') icon = '❌';

    // Build line content
    let html = `<span class="term-time">[${time}]</span>`;

    if (agent) {
        html += `<span class="term-agent">${agent}</span>`;
    }

    if (title) {
        html += `<span class="term-action">${title}:</span> `;
    }

    // Clean message content (remove markdown if possible or just text)
    // For terminal view, we want concise text, so minimal markdown parsing
    // Actually, simple text is better.
    let textContent = message;

    html += `<span>${textContent}</span>`;
    html += `<span class="term-status">${icon}</span>`;

    line.innerHTML = html;

    // Append
    terminal.appendChild(line);

    // Scroll to bottom
    terminal.scrollTop = terminal.scrollHeight;

    // Limit lines (e.g., 500)
    if (terminal.children.length > 500) {
        terminal.removeChild(terminal.firstChild);
    }
}

function initializeWebSockets() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;

    // Chat WebSocket
    chatWs = new WebSocket(`${wsProtocol}//${wsHost}/ws/chat`);
    chatWs.onopen = () => updateConnectionStatus(true);
    chatWs.onclose = () => {
        updateConnectionStatus(false);
        setTimeout(initializeWebSockets, 3000); // Reconnect
    };
    chatWs.onmessage = handleChatMessage;

    // Logs WebSocket
    logsWs = new WebSocket(`${wsProtocol}//${wsHost}/ws/logs`);
    logsWs.onmessage = handleLogMessage;

    // Agents WebSocket
    agentsWs = new WebSocket(`${wsProtocol}//${wsHost}/ws/agents`);
    agentsWs.onmessage = handleAgentsUpdate;
}

function updateConnectionStatus(connected) {
    const indicator = document.getElementById('status-indicator');
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('.status-text');

    if (connected) {
        dot.classList.add('connected');
        text.textContent = 'Connected';
    } else {
        dot.classList.remove('connected');
        text.textContent = 'Disconnected';
    }
}

// ===== UI Initialization =====

function initializeUI() {
    // Main tab switching (skip dropdown-managed tabs)
    document.querySelectorAll('.main-tab').forEach(tab => {
        if (tab.closest('.main-tab-dropdown')) return; // handled separately
        tab.addEventListener('click', () => switchMainTab(tab.dataset.maintab));
    });

    // Chat interaction
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');

    // Remove legacy binding - Threads.js handles this now
    // if (sendButton) {
    //     sendButton.addEventListener('click', sendMessage);
    // }

    // if (chatInput) {
    //     chatInput.addEventListener('keydown', (e) => {
    //         if (e.key === 'Enter') {
    //             if (!e.shiftKey) {
    //                 e.preventDefault();
    //                 sendMessage();
    //             }
    //             // Shift+Enter allows default behavior (newline)
    //         }
    //     });
    // }

    // Auto-resize textarea
    chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') this.style.height = '';
    });

    // Memory search (removed in favor of overview)
    // document.getElementById('memory-search-button').addEventListener('click', searchMemory);
    // document.getElementById('memory-search').addEventListener('keypress', (e) => {
    //     if (e.key === 'Enter') searchMemory();
    // });

    // Files filters
    document.getElementById('domain-filter').addEventListener('change', loadFiles);
    document.getElementById('type-filter').addEventListener('change', loadFiles);
    document.getElementById('refresh-files').addEventListener('click', loadFiles);

    // Tools forge button
    document.getElementById('forge-tool-button').addEventListener('click', () => {
        alert('Tool forging via UI coming soon! For now, use the chat: "Create a tool to..."');
    });

    // Voice Mode Toggle
    const voiceButton = document.getElementById('voice-mode-toggle');
    if (voiceButton) {
        voiceButton.addEventListener('click', () => {
            voiceButton.classList.toggle('active');
            const isActive = voiceButton.classList.contains('active');

            if (isActive) {
                // TODO: Implement actual voice recording logic
                voiceButton.innerHTML = '<i class="fas fa-stop"></i>';
                voiceButton.style.color = 'var(--accent)';
                addMessage('system', 'Voice mode activated (Simulation)');
            } else {
                voiceButton.innerHTML = '<i class="fas fa-microphone"></i>';
                voiceButton.style.color = '';
                addMessage('system', 'Voice mode deactivated');
            }
        });
    }

    // Add File Button (Placeholder)
    const addFileBtn = document.querySelector('.add-file-btn');
    if (addFileBtn) {
        addFileBtn.addEventListener('click', () => {
            // TODO: Implement file upload dialog
            alert('File upload coming soon!');
        });
    }

    // Package tab switching
    document.querySelectorAll('.package-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.packagetab;

            // Update tab buttons
            document.querySelectorAll('.package-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.packagetab === tabName);
            });

            // Update tab panels
            document.querySelectorAll('.package-tab-panel').forEach(panel => {
                panel.classList.toggle('active', panel.id === `${tabName}-packages`);
            });
        });
    });

    // Split Button Logic (Chat/Agent/Image/Arena)
    const dropdownWrapper = document.querySelector('.main-tab-dropdown');
    const arrowBtn = dropdownWrapper ? dropdownWrapper.querySelector('.split-arrow-action') : null;
    const mainActionBtn = dropdownWrapper ? dropdownWrapper.querySelector('.split-main-action') : null;

    if (arrowBtn && dropdownWrapper) {
        arrowBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownWrapper.classList.toggle('open');
        });
    }

    if (mainActionBtn) {
        mainActionBtn.addEventListener('click', () => {
            // Activate currently selected mode (stored in data-maintab)
            const mode = mainActionBtn.dataset.maintab;
            switchMainTab(mode);
        });
    }

    // Dropdown items
    document.querySelectorAll('.tab-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const subtab = item.dataset.subtab;
            switchMainTab(subtab);
            // Close dropdown
            if (dropdownWrapper) dropdownWrapper.classList.remove('open');
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        if (dropdownWrapper) dropdownWrapper.classList.remove('open');
    });

    // Initialize arena
    initializeArena();

    // Initialize Image Studio
    initializeImageStudio();
}

function initializeImageStudio() {
    const generateBtn = document.getElementById('generate-image-btn');
    const loadingOverlay = document.getElementById('image-loading-overlay');
    const promptInput = document.getElementById('image-prompt-input');

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            // Basic validation
            if (!promptInput || !promptInput.value.trim()) {
                alert('Please enter a prompt first.');
                return;
            }

            // Collect parameters
            const model = document.getElementById('image-model-selector').value;
            const aspectRatio = document.getElementById('image-aspect-ratio')?.value;
            const resolution = document.getElementById('image-resolution')?.value;
            const negPrompt = document.getElementById('image-negative-prompt')?.value;
            const seed = document.getElementById('image-seed')?.value;
            const quality = document.getElementById('image-quality')?.value;

            // Show loading
            if (loadingOverlay) loadingOverlay.style.display = 'flex';
            generateBtn.disabled = true;
            generateBtn.textContent = 'GENERATING...';

            // Call API
            fetch('/api/image/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: promptInput.value.trim(),
                    model: model,
                    n: 1,
                    size: resolution || "1024x1024",
                    aspect_ratio: aspectRatio,
                    negative_prompt: negPrompt,
                    seed: seed ? parseInt(seed) : null,
                    quality: quality || "standard"
                })
            })
                .then(response => response.json())
                .then(data => {
                    if (loadingOverlay) loadingOverlay.style.display = 'none';
                    generateBtn.disabled = false;
                    generateBtn.textContent = 'GENERATE';

                    if (data.success && data.images && data.images.length > 0) {
                        const imgData = data.images[0];
                        const viewer = document.getElementById('image-viewer-container');

                        // Hide empty state
                        const emptyState = viewer.querySelector('.empty-state-viewer');
                        if (emptyState) emptyState.style.display = 'none';

                        // Cleanup previous result
                        const existingImg = viewer.querySelector('.generated-result-container');
                        if (existingImg) existingImg.remove();

                        // Create result view
                        const container = document.createElement('div');
                        container.className = 'generated-result-container';
                        container.style.display = 'flex';
                        container.style.flexDirection = 'column';
                        container.style.alignItems = 'center';
                        container.style.gap = '1rem';
                        container.style.width = '100%';
                        container.style.height = '100%';

                        const img = document.createElement('img');
                        img.src = imgData.url;
                        img.className = 'generated-image-preview';
                        img.style.maxWidth = '100%';
                        img.style.maxHeight = '80vh';
                        img.style.objectFit = 'contain';
                        img.style.borderRadius = '8px';
                        img.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';

                        const meta = document.createElement('div');
                        meta.className = 'image-meta';
                        meta.innerHTML = `<span style="color:var(--text-secondary); font-size:0.9em;">Saved to: ${imgData.filename}</span>`;

                        container.appendChild(img);
                        container.appendChild(meta);
                        viewer.appendChild(container);

                    } else {
                        alert('Generation failed: ' + (data.error || 'Unknown error'));
                    }
                })
                .catch(err => {
                    if (loadingOverlay) loadingOverlay.style.display = 'none';
                    generateBtn.disabled = false;
                    generateBtn.textContent = 'GENERATE';
                    console.error(err);
                    alert('Error generating image: ' + err.message);
                });
        });
    }

    // Load models
    loadImageModels();

    // Model Selector Change
    const modelSelector = document.getElementById('image-model-selector');
    if (modelSelector) {
        modelSelector.addEventListener('change', () => {
            updateImageStudioControls();
        });
    }
}

async function loadImageModels() {
    const selector = document.getElementById('image-model-selector');
    if (!selector) return;

    // Ensure registry data is loaded
    if (!_registryData) {
        await loadProviderSettings();
    }

    if (!_registryData || !_registryData.providers) return;

    let html = '';
    const models = [];

    // Find all models with image_generation capability
    for (const [providerName, config] of Object.entries(_registryData.providers)) {
        if (!config.models) continue;
        for (const [key, info] of Object.entries(config.models)) {
            const caps = info.capabilities || [];
            if (caps.includes('image_generation')) {
                models.push({
                    key: key,
                    id: info.id || key,
                    provider: providerName,
                    name: `${providerName}: ${info.id || key}`,
                    image_config: info.image_config
                });
            }
        }
    }

    if (models.length === 0) {
        html = '<option value="" disabled>No image models found</option>';
    } else {
        models.forEach(m => {
            html += `<option value="${m.key}" data-provider="${m.provider}">${m.name}</option>`;
        });
    }

    selector.innerHTML = html;

    // Trigger update for initial selection
    if (selector.value) {
        updateImageStudioControls();
    }
}

function updateImageStudioControls() {
    const selector = document.getElementById('image-model-selector');
    if (!selector || !selector.value) return;

    // Find model data
    const selectedKey = selector.value;
    const selectedOption = selector.options[selector.selectedIndex];
    const providerName = selectedOption.dataset.provider;

    if (!_registryData || !_registryData.providers || !_registryData.providers[providerName]) return;

    const modelInfo = _registryData.providers[providerName].models[selectedKey];
    if (!modelInfo) return;

    const config = modelInfo.image_config || {};
    const sidebarContent = document.querySelector('.image-studio-sidebar .sidebar-content');

    // Remove existing dynamic controls (anything after the model selector group)
    // We need a stable way to identify dynamic controls. 
    // Let's assume controls after the "Model" group are dynamic, EXCEPT "Prompt" and "Generate".
    // Alternatively, we can target specific classes.
    // Let's clear specific dynamic containers if we added them, but we didn't add containers yet.
    // Strategy: Remove elements with class 'dynamic-control'.

    sidebarContent.querySelectorAll('.dynamic-control').forEach(el => el.remove());

    // Insert new controls BEFORE the Prompt group (which we can identify by checking siblings or IDs)
    const promptGroup = document.getElementById('image-prompt-input')?.closest('.control-group');

    // Helper to create control
    const createControl = (html) => {
        const div = document.createElement('div');
        div.className = 'control-group dynamic-control';
        div.style.marginTop = '1rem';
        div.innerHTML = html;
        if (promptGroup) {
            sidebarContent.insertBefore(div, promptGroup);
        } else {
            sidebarContent.appendChild(div);
        }
    };

    // Aspect Ratios
    if (config.aspect_ratios && config.aspect_ratios.length > 0) {
        const options = config.aspect_ratios.map(r => `<option value="${r}">${r}</option>`).join('');
        createControl(`
            <label>Aspect Ratio</label>
            <select class="term-select" style="width:100%;" id="image-aspect-ratio">
                ${options}
            </select>
        `);
    }

    // Resolutions
    if (config.resolutions && config.resolutions.length > 0) {
        const options = config.resolutions.map(r => `<option value="${r}">${r}</option>`).join('');
        createControl(`
            <label>Resolution</label>
            <select class="term-select" style="width:100%;" id="image-resolution">
                ${options}
            </select>
        `);
    }

    // Negative Prompt
    if (config.supports_negative_prompt) {
        createControl(`
            <label>Negative Prompt</label>
            <textarea class="term-input" id="image-negative-prompt" rows="2" placeholder="Low quality, blurry..."></textarea>
        `);
    }

    // Seed
    if (config.supports_seed) {
        createControl(`
            <label>Seed (Optional)</label>
            <input type="number" class="term-input" id="image-seed" placeholder="Random">
        `);
    }

    // Quality
    if (config.quality_options && config.quality_options.length > 1) {
        const options = config.quality_options.map(q => `<option value="${q}">${q}</option>`).join('');
        createControl(`
            <label>Quality</label>
            <select class="term-select" style="width:100%;" id="image-quality">
                ${options}
            </select>
        `);
    }
}

function switchMainTab(tabName) {
    currentMainTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.main-tab').forEach(tab => {
        if (tab.closest('.main-tab-dropdown')) {
            // Dropdown tab: active if chat, agent, image, or arena
            const categories = ['chat', 'agent', 'image', 'arena'];
            const isActive = categories.includes(tabName);

            // Check if this is the generic main tab button (the left split)
            if (tab.classList.contains('split-main-action')) {
                tab.classList.toggle('active', isActive);

                // Update the button text/icon if it matches one of our modes
                if (isActive) {
                    // Update data-maintab to reflect current mode
                    tab.dataset.maintab = tabName;

                    let icon = '💬';
                    let label = 'Chat';
                    if (tabName === 'agent') { icon = '🤖'; label = 'Agent'; }
                    if (tabName === 'image') { icon = '🎨'; label = 'Image'; }
                    if (tabName === 'arena') { icon = '⚔️'; label = 'Arena'; }

                    tab.innerHTML = `<span class="tab-icon">${icon}</span>${label}`;
                }
            } else if (tab.classList.contains('split-arrow-action')) {
                tab.classList.toggle('active', isActive);
            }
        } else {
            tab.classList.toggle('active', tab.dataset.maintab === tabName);
        }
    });

    // Update Sub-tab active state in dropdown
    document.querySelectorAll('.tab-dropdown-item').forEach(item => {
        item.classList.toggle('active', item.dataset.subtab === tabName);
    });

    // Update panels
    document.querySelectorAll('.main-tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    // Agent mode re-uses chat-panel
    let panelId = `${tabName}-panel`;
    if (tabName === 'agent') panelId = 'chat-panel';

    const targetPanel = document.getElementById(panelId);
    if (targetPanel) targetPanel.classList.add('active');

    // Load data for tab
    if (tabName === 'files') {
        loadFiles();
    } else if (tabName === 'tools') {
        loadTools();
    } else if (tabName === 'settings') {
        loadProviderSettings();
    } else if (tabName === 'usage') {
        loadUsageDashboard();
    } else if (tabName === 'arena') {
        loadArenaModels();
        loadArenaLeaderboard();
    } else if (tabName === 'status') {
        loadSystemStatusTab();
    }

    // Update layout based on mode
    updateChatLayout();
}

// ===== Data Loading =====

async function loadInitialData() {
    await loadPreferences(); // Load prefs FIRST
    await loadHeaderStatus(); // Restore header status
    await loadSystemStatusTab(); // Load status tab data
    await loadTools();        // Background
    loadPackages();     // Background
    loadMemoryData();   // Background
    loadChatModels();   // Populate model dropdown on startup

    // Initialize thread management (from threads.js)
    if (typeof initThreadManagement === 'function') {
        initThreadManagement();
    }

    // Refresh status every 5 seconds (Header)
    setInterval(loadHeaderStatus, 5000);

    // Refresh packages every 10 seconds
    setInterval(loadPackages, 10000);
}

async function loadSystemStatus() {
    try {
        const response = await fetch('/api/system/status');
        const data = await response.json();

        // Update compact status bar
        document.getElementById('nexus-status').textContent = data.nexus?.initialized ? '✓' : '✗';
        document.getElementById('agents-count').textContent = data.factory?.active_agents || 0;
        document.getElementById('tools-count').textContent = data.forge?.total_tools || 0;

        // Load files count
        const filesResp = await fetch('/api/workspace/files');
        const filesData = await filesResp.json();
        document.getElementById('files-count').textContent = filesData.count || 0;

    } catch (error) {
        console.error('Status load error:', error);
    }
}

async function loadFiles() {
    const domain = document.getElementById('domain-filter').value;
    const type = document.getElementById('type-filter').value;

    try {
        let url = '/api/workspace/files';
        if (domain) url += `?domain=${domain}`;

        const response = await fetch(url);
        const data = await response.json();

        const grid = document.getElementById('files-grid');

        if (data.count === 0) {
            grid.innerHTML = '<p class="placeholder-text">No files yet. Ask Misaka to create reports, analysis, or other outputs!</p>';
            return;
        }

        // Filter by type if selected
        let files = data.files;
        if (type) {
            files = files.filter(f => f.file_type === type);
        }

        grid.innerHTML = files.map(file => `
            <div class="file-card" onclick="downloadFile('${file.domain}', '${file.filename}')">
                <div class="file-icon">${getFileIcon(file.file_type)}</div>
                <div class="file-name">${file.filename}</div>
                <div class="file-meta">
                    <div>${file.domain}</div>
                    <div>${formatFileSize(file.size_bytes)}</div>
                    <div>${formatDate(file.created_at)}</div>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Files load error:', error);
        document.getElementById('files-grid').innerHTML =
            '<p class="placeholder-text">Error loading files</p>';
    }
}

// ===== Tool Registry Management =====

let allTools = [];
let toolSort = { column: 'name', direction: 'asc' };
let showSystemTools = false; // Default

async function loadTools() {
    // Load preference first
    try {
        const prefResponse = await fetch('/api/preferences/get?key=show_system_tools');
        if (prefResponse.ok) {
            const prefData = await prefResponse.json();
            // Assuming API returns {value: true/false} or similar
            // If API doesn't exist yet, we stick to default
            if (prefData && prefData.value !== undefined) {
                showSystemTools = prefData.value;
            }
        }
    } catch (e) {
        console.log("Could not load preferences, using default");
    }

    // Set checkbox state
    const checkbox = document.getElementById('hide-system-tools');
    if (checkbox) checkbox.checked = !showSystemTools; // Default false (show all), so check if hiding

    // Actually, let's flip the variable to be 'hideSystemTools' to match standard
    // Refactoring variable to match new preference key
    const shouldHide = await getHideToolsPref();
    if (checkbox) checkbox.checked = shouldHide;

    // Load actual tools data
    await loadAllTools();
}

async function getHideToolsPref() {
    try {
        const prefResponse = await fetch('/api/preferences/get?key=tool_filters.hide_system');
        if (prefResponse.ok) {
            const prefData = await prefResponse.json();
            return prefData.value === true;
        }
    } catch (e) { }
    return false; // Default show all
}

async function loadAllTools() {
    try {
        const response = await fetch('/api/tools/list');
        const data = await response.json();

        allTools = data.tools || [];
        populateToolDomains();
        renderToolsTable();

        // Initial setup only if not done
        if (!window.toolListenersSetup) {
            setupToolListeners();
            window.toolListenersSetup = true;
        }

    } catch (error) {
        console.error('Error loading tools:', error);
        document.getElementById('tools-table-body').innerHTML =
            '<tr><td colspan="5" class="placeholder-text error">Error loading tools</td></tr>';
    }
}

function populateToolDomains() {
    const domains = new Set(allTools.map(t => t.domain).filter(d => d));
    const select = document.getElementById('tool-domain-filter');
    const currentValue = select.value;

    // Keep "All Domains" option
    select.innerHTML = '<option value="">All Domains</option>';

    Array.from(domains).sort().forEach(domain => {
        const option = document.createElement('option');
        option.value = domain;
        option.textContent = domain;
        select.appendChild(option);
    });

    // Restore selection if possible
    if (domains.has(currentValue)) {
        select.value = currentValue;
    }
}

function setupToolListeners() {
    // Search
    const searchInput = document.getElementById('tool-search');
    searchInput.addEventListener('input', renderToolsTable);

    // Filter
    const filterSelect = document.getElementById('tool-domain-filter');
    filterSelect.addEventListener('change', renderToolsTable);

    // System Tools Toggle (Hide)
    const systemToggle = document.getElementById('hide-system-tools');
    if (systemToggle) {
        systemToggle.addEventListener('change', async (e) => {
            const hide = e.target.checked;
            // Save preference
            try {
                // Update local var (we need to filter in renderToolsTable)
                // Let's pass the state or re-read it
                renderToolsTable();

                await fetch('/api/preferences/set', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: 'tool_filters.hide_system',
                        value: hide
                    })
                });
            } catch (err) {
                console.error("Failed to save preference:", err);
            }
        });
    }

    // Refresh
    const refreshBtn = document.getElementById('refresh-tools-btn');
    refreshBtn.addEventListener('click', loadAllTools);

    // Sorting HEADERS
    document.querySelectorAll('#tools-table th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (toolSort.column === column) {
                toolSort.direction = toolSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                toolSort.column = column;
                toolSort.direction = 'asc';
                if (column === 'created') {
                    toolSort.direction = 'desc';
                }
            }
            renderToolsTable();
        });
    });
}

// ===== Memory Management =====

async function loadMemoryData() {
    try {
        const response = await fetch('/api/memory/overview');
        if (!response.ok) throw new Error("Failed to load memory overview");

        const data = await response.json();

        renderPermanentMemory(data.permanent);
        renderThreadMemory(data.threads);

    } catch (error) {
        console.error("Memory load error:", error);
        document.getElementById('thread-memory-container').innerHTML =
            `<p class="error-text">Failed to load memory data: ${error.message}</p>`;
    }
}

function renderPermanentMemory(insights) {
    const tbody = document.getElementById('permanent-memory-body');
    if (!insights || insights.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="placeholder-text" style="text-align:center; padding:15px;">No permanent insights yet.</td></tr>';
        return;
    }

    tbody.innerHTML = insights.map(i => `
        <tr>
            <td style="font-family: monospace; color: var(--text-secondary);">${i.id}</td>
            <td>${i.summary}</td>
            <td>${formatDate(i.created_at)}</td>
        </tr>
    `).join('');
}

function renderThreadMemory(threads) {
    const container = document.getElementById('thread-memory-container');

    if (!threads || threads.length === 0) {
        container.innerHTML = '<p class="placeholder-text">No thread memories found.</p>';
        return;
    }

    container.innerHTML = threads.map(thread => {
        // Build rows for this thread
        const rows = thread.memories && thread.memories.length > 0
            ? thread.memories.map(mem => {
                // Format timestamp (Specific Date + Time)
                const dateObj = new Date(mem.timestamp);
                const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString();

                // Details HTML (Raw Task Data)
                let detailsRow = '';
                if (mem.details) {
                    const jsonStr = JSON.stringify(mem.details, null, 2);
                    const detailsId = `mem-details-${mem.memory_id.replace(/[^a-zA-Z0-9]/g, '-')}`;
                    detailsRow = `
                        <tr id="${detailsId}" class="memory-details-row" style="display:none; background: rgba(0,0,0,0.1);">
                            <td colspan="5">
                                <div class="memory-details-content" style="padding: 10px;">
                                    <strong style="display:block; margin-bottom:5px; color:var(--accent-primary);">Raw Task Data:</strong>
                                    <pre style="background:rgba(0,0,0,0.3); padding:10px; border-radius:4px; max-height:300px; overflow:auto; font-size:0.8em;">${jsonStr}</pre>
                                </div>
                            </td>
                        </tr>
                    `;
                }

                // Main Row
                // Allow clicking row to toggle details if details exist
                const onclickAttr = mem.details ? `onclick="toggleMemoryDetails(this, '${mem.memory_id.replace(/[^a-zA-Z0-9]/g, '-')}')" style="cursor:pointer;"` : '';
                const expandIcon = mem.details ? '<span class="expand-icon">▶</span> ' : '';

                return `
                    <tr ${onclickAttr} class="memory-row">
                        <td style="font-family:var(--font-mono); font-size:0.8em; color:var(--text-secondary); width: 140px;">${mem.memory_id}</td>
                        <td><span class="status-badge" style="font-size:0.8em">${mem.event_type}</span></td>
                        <td>${expandIcon}${mem.summary}</td>
                        <td style="font-family:var(--font-mono); font-size:0.85em; color:var(--text-secondary);">${mem.content ? mem.content.substring(0, 50) + (mem.content.length > 50 ? '...' : '') : '-'}</td>
                        <td style="font-size:0.85em; white-space:nowrap;">${dateStr}</td>
                    </tr>
                    ${detailsRow}
                `;
            }).join('')
            : '<tr><td colspan="5" class="placeholder-text" style="text-align:center; padding:10px;">No memories for this thread.</td></tr>';

        return `
            <div class="thread-memory-card" style="margin-bottom: 2rem; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
                <div class="thread-header" style="padding: 1rem; background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h4 style="margin: 0; color: var(--primary);">${thread.title}</h4>
                        <span style="font-size: 0.8em; color: var(--text-secondary); font-family: var(--font-mono);">${thread.id}</span>
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary);">
                        ${thread.memory_count} memories
                    </div>
                </div>
                
                <div class="memory-table-wrapper">
                    <table class="data-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="text-align: left; border-bottom: 1px solid var(--border); font-size: 0.9em; position: sticky; top: 0; background: var(--bg-secondary); z-index: 1;">
                                <th style="padding: 10px; width: 140px;">ID</th>
                                <th style="padding: 10px; width: 100px;">Event</th>
                                <th style="padding: 10px;">Summary</th>
                                <th style="padding: 10px;">Content Snippet</th>
                                <th style="padding: 10px; width: 160px;">Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');
}

function toggleMemoryDetails(row, id) {
    const detailsRow = document.getElementById(`mem-details-${id}`);
    if (detailsRow) {
        const isHidden = detailsRow.style.display === 'none';
        detailsRow.style.display = isHidden ? 'table-row' : 'none';

        // Toggle icon rotation
        const icon = row.querySelector('.expand-icon');
        if (icon) {
            icon.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
            icon.style.display = 'inline-block';
            icon.style.transition = 'transform 0.2s';
        }
    }
}

function renderToolsTable() {
    const tbody = document.getElementById('tools-table-body');
    const search = document.getElementById('tool-search').value.toLowerCase();
    const domainFilter = document.getElementById('tool-domain-filter').value;
    const hideSystem = document.getElementById('hide-system-tools')?.checked || false;

    // 1. Filter
    let filtered = allTools.filter(tool => {
        // System Tool Filter
        if (hideSystem && tool.is_system) return false;

        // Domain Filter
        if (domainFilter && tool.domain !== domainFilter) return false;

        // Search Filter
        if (search) {
            const term = search.toLowerCase();
            return (
                tool.name.toLowerCase().includes(term) ||
                (tool.description && tool.description.toLowerCase().includes(term))
            );
        }
        return true;
    });

    // 2. Sort
    filtered.sort((a, b) => {
        let valA, valB;

        switch (toolSort.column) {
            case 'name':
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
                break;
            case 'domain':
                valA = (a.domain || '').toLowerCase();
                valB = (b.domain || '').toLowerCase();
                break;
            case 'created':
                valA = new Date(a.created_at || 0).getTime();
                valB = new Date(b.created_at || 0).getTime();
                break;
            case 'usage':
                valA = a.usage_count || 0;
                valB = b.usage_count || 0;
                break;
            default:
                return 0;
        }

        if (valA < valB) return toolSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return toolSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    // 3. Render
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="placeholder-text">No tools match your criteria</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(tool => {
        const detailsId = `tool-details-${tool.name.replace(/[^a-zA-Z0-9]/g, '-')}`;

        const mainRow = `
            <tr class="package-row" onclick="toggleToolDetails('${detailsId}')">
                <td>
                    <div class="pkg-name">
                        <span class="expand-icon">▶</span> ${tool.name}
                    </div>
                </td>
                <td><span class="status-badge installed">${tool.domain}</span></td>
                <td>${tool.usage_count || 0}</td>
                <td>${tool.description || 'No description'}</td>
                <td>${formatDate(tool.created_at || new Date())}</td>
                <td onclick="event.stopPropagation()">
                    ${tool.is_system
                ? '<span class="status-badge" style="background:var(--accent-secondary); opacity:0.8; cursor:default;">System</span>'
                : `<button class="action-btn small danger delete-tool-btn" data-tool="${tool.name}" onclick="deleteTool('${tool.name}')">Delete</button>`
            }
                </td>
            </tr>
        `;

        const detailsRow = `
            <tr id="${detailsId}" class="package-details-row" style="display: none;">
                <td colspan="6">
                    <div class="details-content">
                        <div class="detail-grid">
                            <div class="detail-item">
                                <span class="label">Parameters:</span>
                                <span class="value code-block">${JSON.stringify(tool.parameters, null, 2)}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">File Path:</span>
                                <span class="value">${tool.file_path || 'Unknown'}</span>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
        return mainRow + detailsRow;
    }).join('');
}

function toggleToolDetails(id) {
    const row = document.getElementById(id);
    if (!row) return;

    const isHidden = row.style.display === 'none';
    row.style.display = isHidden ? 'table-row' : 'none';

    // Toggle icon
    const prevRow = row.previousElementSibling;
    const icon = prevRow.querySelector('.expand-icon');
    if (icon) {
        icon.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
    }
}

async function deleteTool(toolName) {
    if (!confirm(`Are you sure you want to delete tool "${toolName}"? This cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/tools/${toolName}`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (result.success) {
            // Show success toast (basic)
            console.log(result.message);
            loadAllTools(); // Reload list
        } else {
            alert('Failed to delete tool: ' + result.message);
        }
    } catch (error) {
        console.error('Error deleting tool:', error);
        alert('Error deleting tool: ' + error.message);
    }
}


async function searchMemory() {
    const query = document.getElementById('memory-search').value;
    const domain = document.getElementById('memory-domain-filter').value;

    if (!query) return;

    try {
        const response = await fetch('/api/memory/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, domain: domain || null, limit: 10 })
        });

        const data = await response.json();
        const results = document.getElementById('memory-results');

        if (data.count === 0) {
            results.innerHTML = '<p class="placeholder-text">No memories found</p>';
            return;
        }

        results.innerHTML = data.results.map(mem => `
            <div class="memory-card">
                <div style="color: var(--primary); font-weight: 600;">${mem.event_type}</div>
                <div style="margin: 0.5rem 0;">${mem.summary}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">
                    <span>${mem.domain}</span> • 
                    <span>${formatDate(mem.timestamp)}</span> • 
                    <span style="font-family: 'Fira Code', monospace; color: var(--accent);">${mem.memory_id}</span>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Memory search error:', error);
    }
}

// ===== Chat Functions =====

// function sendMessage() {
function _legacy_sendMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();

    if (!message || chatWs.readyState !== WebSocket.OPEN) return;

    // Add user message to UI
    addMessage('user', message);

    // Send via WebSocket
    const messageData = { message: message };
    chatWs.send(JSON.stringify(messageData));

    // Clear input and reset height
    chatInput.value = '';
    chatInput.style.height = '';
}

// Configure Marked options
if (typeof marked !== 'undefined') {
    marked.setOptions({
        gfm: true,
        breaks: true,
        headerIds: false,
        mangle: false,
        sanitize: false // We trust backend content
    });
} else {
    console.error('CRITICAL: Marked library not loaded!');
}



function handleChatMessage(event) {
    const data = JSON.parse(event.data);

    if (data.type === 'response') {
        addMessage('ai', data.response, {
            trace_id: data.trace_id,
            actions: data.actions_taken,
            tools: data.tools_forged,
            actions: data.actions_taken,
            tools: data.tools_forged,
            agents: data.agents_spawned
        });

        // Reload files if any were created
        if (currentMainTab === 'files') {
            loadFiles();
        }
    } else if (data.type === 'agent_step') {
        // Updated: Route to System Terminal
        updateSystemTerminal(
            data.content,
            data.title,
            data.agent_name,
            data.status
        );

    } else if (data.type === 'package_installed') {
        console.log('Package installed:', data.package);
        loadAllPackages();
    } else if (data.type === 'package_failed') {
        console.warn('Package failed:', data.package, data.error);
        loadAllPackages();
        // Maybe show a toast in the future
    }
}

function addMessage(sender, content, metadata = {}) {
    const messages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    let html = '';

    if (sender === 'ai') {
        html = `
            <div class="message-header">
                <span class="message-sender">Misaka</span>
                ${metadata.trace_id ? `<span class="trace-id">${metadata.trace_id}</span>` : ''}
            </div>
            <div class="message-content">${marked.parse(content)}</div>
        `;

        // Handle details/summary if present (custom logic)
        if (content.includes('<details>')) {
            // For error messages with details, we trust the HTML from backend but still want markdown for the summary/intro
            // Split by <details> to parse the top part as markdown
            const parts = content.split('<details>');
            if (parts.length > 0) {
                const markdownPart = marked.parse(parts[0]);
                const detailsPart = '<details>' + parts.slice(1).join('<details>');
                html = `
                    <div class="message-header">
                        <span class="message-sender">Misaka</span>
                        ${metadata.trace_id ? `<span class="trace-id">${metadata.trace_id}</span>` : ''}
                    </div>
                    <div class="message-content">
                        ${markdownPart}
                        ${detailsPart}
                    </div>
                `;
            }
        }

        if (metadata.actions && metadata.actions.length > 0) {
            html += `<div class="action-pills">`;
            metadata.actions.forEach(action => {
                html += `<span class="action-pill">${action}</span>`;
            });
            html += `</div>`;
        }
    } else if (sender === 'agent_step') {
        const title = metadata.title || 'Agent Action';
        const agentName = metadata.agent_name;
        const status = metadata.status || 'completed';
        const isError = status === 'failed';

        // Use marked.parse for content but ensure it doesn't wrap everything in <p> if it's short
        html = `
                    <details class="agent-step-details" ${isError ? 'open' : ''}>
                <summary class="agent-step-summary ${isError ? 'error' : ''}">
                    <span class="step-icon">${isError ? '⚠️' : '🤖'}</span>
                    <span class="step-title">${title}</span>
                    ${agentName ? `<span class="step-agent">${agentName}</span>` : ''}
                </summary>
                <div class="step-content">
                    ${marked.parse(content)}
                </div>
            </details>
                    `;
    } else if (sender === 'user') {
        html = `
                    <div class="message-header">
                        <span class="message-sender">You</span>
            </div>
                    <div class="message-content">${content}</div>
                `;
    } else {
        html = `<div class="message-content">${content}</div>`;
    }

    messageDiv.innerHTML = html;
    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;

    // Syntax highlighting for code blocks
    messageDiv.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });
}

// ===== Log Handling =====

function handleLogMessage(event) {
    try {
        const log = JSON.parse(event.data);
        const container = document.getElementById('logs-container'); // Matched to index.html ID
        if (!container) return;

        // Defensive checks for log structure
        if (!log || typeof log !== 'object') return;

        // Skip heartbeat/noise logs
        if (log.type === 'heartbeat') return; // Explicit type check

        const msg = (log.message || "").toString();
        if (msg.includes("GET /api/system/status") ||
            msg.includes("GET /api/workspace/files") ||
            msg.includes("WebSocket connected")) {
            return;
        }

        const level = (log.level || 'info').toUpperCase();
        if (level === 'DEBUG') return; // Hide debug logs in UI

        const logLine = document.createElement('div');
        logLine.className = 'log-line';

        // Color classes
        let levelClass = 'log-info';
        if (level === 'WARNING') levelClass = 'log-warning';
        if (level === 'ERROR') levelClass = 'log-error';

        // Format: [LEVEL] Source: Message
        // Remove timestamps as requested
        const source = log.source ? `${log.source}: ` : '';

        // Identify system logs
        const isSystem = ['uvicorn', 'uvicorn.access', 'uvicorn.error', 'watchfiles', 'multipart', 'asyncio'].includes(log.source) ||
            msg.includes('WebSocket') ||
            source.includes('watchfiles');

        if (isSystem) {
            logLine.classList.add('log-system');
        }

        logLine.innerHTML = `<span class="${levelClass}">[${level}]</span> <span class="log-source">${source}</span><span class="log-msg">${msg}</span>`;

        container.appendChild(logLine);

        // Keep only last 200 logs
        while (container.children.length > 200) {
            container.removeChild(container.firstChild);
        }

        // Auto-scroll to bottom
        container.scrollTop = container.scrollHeight;
    } catch (error) {
        console.warn('Invalid log message:', error);
    }
}


// ===== Agents Handling =====

function handleAgentsUpdate(event) {
    const data = JSON.parse(event.data);
    const agents = data.agents || [];

    // Update agents count in header
    document.getElementById('agents-count').textContent = agents.length;

    const agentsList = document.getElementById('agents-list');

    if (agents.length === 0) {
        agentsList.innerHTML = '<div class="no-agents">No active agents</div>';
        return;
    }

    agentsList.innerHTML = agents.map(agent => `
                    <div class="agent-card">
            <div class="agent-name">${agent.name}</div>
            <div class="agent-status">${agent.status}</div>
            <div class="agent-trace">${agent.trace_id}</div>
        </div>
                    `).join('');
}

// ===== File Operations =====

function downloadFile(domain, filename) {
    window.location.href = `/api/workspace/files/${domain}/${filename}`;
}

// ===== Utility Functions =====

function getFileIcon(type) {
    const icons = {
        'pdf': '📄',
        'txt': '📝',
        'csv': '📊',
        'json': '🔧',
        'html': '🌐',
        'png': '🖼️',
        'jpg': '🖼️',
        'mp3': '🎵'
    };
    return icons[type] || '📁';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toTimeString().split(' ')[0];
}

// ===== Package Management =====

let allPackages = [];
let packageSort = { column: 'updated', direction: 'desc' };

async function loadPackages() {
    await loadAllPackages();
}

async function loadAllPackages() {
    try {
        const response = await fetch('/api/packages/all');
        const data = await response.json();

        allPackages = data.packages || [];
        renderPackagesTable();

        // Initial setup only if not done
        if (!window.packageListenersSetup) {
            setupPackageListeners();
            window.packageListenersSetup = true;
        }

    } catch (error) {
        console.error('Error loading packages:', error);
        document.getElementById('packages-table-body').innerHTML =
            '<tr><td colspan="6" class="placeholder-text error">Error loading packages</td></tr>';
    }
}

function setupPackageListeners() {
    // Search
    const searchInput = document.getElementById('package-search');
    searchInput.addEventListener('input', renderPackagesTable);

    // Filter
    const filterSelect = document.getElementById('package-status-filter');
    filterSelect.addEventListener('change', renderPackagesTable);

    // System Package Toggle
    const systemToggle = document.getElementById('hide-system-packages');
    if (systemToggle) {
        systemToggle.addEventListener('change', renderPackagesTable);
    }

    // Refresh
    const refreshBtn = document.getElementById('refresh-packages-btn');
    refreshBtn.addEventListener('click', loadAllPackages);

    // Sync
    const syncBtn = document.getElementById('sync-packages-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', syncPackages);
    }

    // Sorting HEADERS
    document.querySelectorAll('#packages-table th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (packageSort.column === column) {
                packageSort.direction = packageSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                packageSort.column = column;
                packageSort.direction = 'asc'; // Default to asc for new column, except maybe usage?
                if (column === 'usage' || column === 'updated' || column === 'safety') {
                    packageSort.direction = 'desc'; // These make more sense desc by default
                }
            }
            renderPackagesTable();
        });
    });
}

function renderPackagesTable() {
    const tbody = document.getElementById('packages-table-body');
    const search = document.getElementById('package-search').value.toLowerCase();
    const filter = document.getElementById('package-status-filter').value;
    const hideSystem = document.getElementById('hide-system-packages')?.checked || false;

    // 1. Filter
    let filtered = allPackages.filter(pkg => {
        // Status Filter
        if (filter !== 'all' && pkg.status !== filter) return false;

        // System Package Filter
        if (hideSystem && pkg.requested_by === 'System Sync') return false;

        // Search Filter
        if (search) {
            const term = search.toLowerCase();
            return (
                pkg.package_name.toLowerCase().includes(term) ||
                (pkg.reason && pkg.reason.toLowerCase().includes(term)) ||
                (pkg.metadata && pkg.metadata.description && pkg.metadata.description.toLowerCase().includes(term))
            );
        }
        return true;
    });

    // 2. Sort
    filtered.sort((a, b) => {
        let valA, valB;

        switch (packageSort.column) {
            case 'name':
                valA = a.package_name.toLowerCase();
                valB = b.package_name.toLowerCase();
                break;
            case 'status':
                valA = a.status;
                valB = b.status;
                break;
            case 'usage':
                valA = a.usage_count || 0;
                valB = b.usage_count || 0;
                break;
            case 'safety':
                valA = (a.metadata?.safety_score) || 0;
                valB = (b.metadata?.safety_score) || 0;
                break;
            case 'updated':
                // Use most recent relevant date
                valA = new Date(a.last_used_at || a.installed_at || a.approved_at || a.requested_at || 0).getTime();
                valB = new Date(b.last_used_at || b.installed_at || b.approved_at || b.requested_at || 0).getTime();
                break;
            default:
                return 0;
        }

        if (valA < valB) return packageSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return packageSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    // Capture currently open details
    const openDetails = Array.from(document.querySelectorAll('.package-details-row'))
        .filter(row => row.style.display !== 'none')
        .map(row => row.id);

    // 3. Render
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="placeholder-text">No packages match your criteria</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(pkg => {
        const meta = pkg.metadata || {};
        const safeLevel = meta.safety_level || 'UNKNOWN';
        let safeColor = 'var(--text-secondary)';
        if (safeLevel === 'HIGH') safeColor = '#10b981';
        if (safeLevel === 'MEDIUM') safeColor = '#f59e0b';
        if (safeLevel === 'LOW') safeColor = '#ef4444';

        const detailsId = `details-${pkg.package_name.replace(/[^a-zA-Z0-9]/g, '-')}`;

        let actionsHtml = '';
        if (pkg.status === 'pending') {
            actionsHtml = `
                <button class="icon-btn approve-btn" data-pkg="${pkg.package_name}" title="Approve">✓</button>
                <button class="icon-btn deny-btn" data-pkg="${pkg.package_name}" title="Deny">✗</button>
            `;
        } else if (pkg.status === 'installed') {
            actionsHtml = `<span class="dim-text">Active</span>`;
        } else if (pkg.status === 'approved') {
            actionsHtml = `<span class="dim-text">Installing...</span>`;
        } else if (pkg.status === 'denied') {
            actionsHtml = `<span class="dim-text">Denied</span>`;
        } else if (pkg.status === 'failed') {
            actionsHtml = `<span class="error-text">Failed</span>`;
        } else if (pkg.status === 'uninstalled') {
            actionsHtml = `<span class="dim-text">Uninstalled</span>`;
        }

        // Expanded actions
        let expandedActions = '';
        if (pkg.status === 'installed' || pkg.status === 'failed' || pkg.status === 'approved') {
            expandedActions += `<button class="action-btn small danger uninstall-btn" data-pkg="${pkg.package_name}">Uninstall</button>`;
        }
        if (pkg.status === 'failed' || pkg.status === 'uninstalled' || pkg.status === 'denied') {
            expandedActions += `<button class="action-btn small primary retry-btn" data-pkg="${pkg.package_name}">Retry / Install</button>`;
        }

        const mainRow = `
            <tr class="package-row ${pkg.status}" onclick="togglePackageDetails('${detailsId}')">
                <td>
                    <div class="pkg-name">
                        <span class="expand-icon">▶</span> ${pkg.package_name}
                    </div>
                </td>
                <td><span class="status-badge ${pkg.status}">${pkg.status}</span></td>
                <td>
                    <div class="usage-count">${pkg.usage_count || 0} calls</div>
                    <div class="last-used">${pkg.last_used_at ? formatDate(pkg.last_used_at) : 'Never'}</div>
                </td>
                <td>
                    <div class="safety-score" style="color: ${safeColor}">
                        ${Math.round(meta.safety_score || 0)}%
                    </div>
                </td>
                <td>${formatDate(pkg.installed_at || pkg.requested_at)}</td>
                <td onclick="event.stopPropagation()">${actionsHtml}</td>
            </tr>
        `;

        const detailsRow = `
            <tr id="${detailsId}" class="package-details-row" style="display: none;">
                <td colspan="6">
                    <div class="details-content">
                        <div class="detail-grid">
                            <div class="detail-item">
                                <span class="label">Version:</span>
                                <span class="value">${meta.version || 'Unknown'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Author:</span>
                                <span class="value">${meta.author || 'Unknown'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Downloads:</span>
                                <span class="value">${meta.downloads_last_month ? formatNumber(meta.downloads_last_month) + '/mo' : 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="label">Last Release:</span>
                                <span class="value">${meta.last_release ? formatDate(meta.last_release) : 'Unknown'}</span>
                            </div>
                             <div class="detail-item" style="grid-column: span 2;">
                                <span class="label">Description:</span>
                                <span class="value">${meta.description || pkg.reason || 'No description'}</span>
                            </div>
                        </div>
                        <div class="detail-actions">
                            ${expandedActions}
                        </div>
                    </div>
                </td>
            </tr>
        `;

        return mainRow + detailsRow;
    }).join('');

    // Restore open details
    openDetails.forEach(id => {
        const row = document.getElementById(id);
        if (row) {
            row.style.display = 'table-row';
            const prev = row.previousElementSibling;
            if (prev) {
                const icon = prev.querySelector('.expand-icon');
                if (icon) icon.style.transform = 'rotate(90deg)';
            }
        }
    });

    // Attach row action listeners
    tbody.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            approvePackage(btn.dataset.pkg);
        });
    });
    tbody.querySelectorAll('.deny-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            denyPackage(btn.dataset.pkg);
        });
    });

    // Attach details action listeners
    tbody.querySelectorAll('.uninstall-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            uninstallPackage(btn.dataset.pkg);
        });
    });
    tbody.querySelectorAll('.retry-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            retryPackage(btn.dataset.pkg);
        });
    });
}

function togglePackageDetails(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    // Toggle display
    if (row.style.display === 'none') {
        row.style.display = 'table-row';
        // Rotate icon in previous sibling
        const prev = row.previousElementSibling;
        const icon = prev.querySelector('.expand-icon');
        if (icon) icon.style.transform = 'rotate(90deg)';
    } else {
        row.style.display = 'none';
        const prev = row.previousElementSibling;
        const icon = prev.querySelector('.expand-icon');
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

async function syncPackages() {
    const btn = document.getElementById('sync-packages-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spin fa-sync"></i> Syncing...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/packages/sync', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            // Show toast/notification?
            console.log(data.message);
            loadAllPackages();
        } else {
            alert('Sync failed: ' + data.message);
        }
    } catch (e) {
        console.error('Sync error:', e);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function uninstallPackage(packageName) {
    if (!confirm(`Are you sure you want to uninstall "${packageName}"? This calls 'pip uninstall'.`)) return;

    try {
        const response = await fetch(`/api/packages/uninstall/${packageName}`, { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            loadAllPackages();
        } else {
            alert('Uninstall failed: ' + data.message);
        }
    } catch (e) {
        console.error('Uninstall error:', e);
    }
}

async function retryPackage(packageName) {
    if (!confirm(`Retry installation of "${packageName}"?`)) return;

    try {
        const response = await fetch(`/api/packages/retry/${packageName}`, { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            loadAllPackages();
        } else {
            alert('Retry failed: ' + data.message);
        }
    } catch (e) {
        console.error('Retry error:', e);
    }
}

async function approvePackage(packageName) {
    if (!confirm(`Install package "${packageName}"?`)) return;

    try {
        const response = await fetch(`/api/packages/approve/${packageName}`, { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            // Optimistic update
            const pkg = allPackages.find(p => p.package_name === packageName);
            if (pkg) pkg.status = 'approved';
            renderPackagesTable();
            // Reload to be sure
            loadAllPackages();
        } else {
            alert(`Failed: ${data.message}`);
        }
    } catch (error) {
        console.error('Error approving:', error);
    }
}

async function denyPackage(packageName) {
    if (!confirm(`Deny package "${packageName}"?`)) return;

    try {
        const response = await fetch(`/api/packages/deny/${packageName}`, { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            const pkg = allPackages.find(p => p.package_name === packageName);
            if (pkg) pkg.status = 'denied';
            renderPackagesTable();
            loadAllPackages();
        } else {
            alert(`Failed: ${data.message}`);
        }
    } catch (error) {
        console.error('Error denying:', error);
    }
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatDate(isoString) {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 30) return `${diffDays} days ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
}


// ===== Preferences Management =====

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
    if (activeTab && activeTab !== currentMainTab) {
        switchMainTab(activeTab, false); // false = don't save (avoid redundant save)
    }

    // Apply Package Filters (stored in variables for renderPackagesTable to use)
    if (allPackages.length > 0) {
        // If packages loaded before prefs (unlikely due to await), re-render
        renderPackagesTable();
    }

    // Apply Settings UI
    const strictMode = document.getElementById('setting-strict-mode');
    if (strictMode) strictMode.checked = prefs.get('validation.strict_mode', false);

    const hideSystem = document.getElementById('setting-hide-system-pkgs');
    if (hideSystem) hideSystem.checked = prefs.get('package_filters.hide_system', false);

    // updateChatLayout handles all visibility and grid sizing
    updateChatLayout();
}

function updateChatLayout() {
    const layout = document.querySelector('.three-column-layout');
    if (!layout) return;

    const agentsCol = document.querySelector('.agents-column');
    const showAgents = currentMainTab === 'agent';

    // Show agents column only in agent mode
    if (agentsCol) agentsCol.style.display = showAgents ? 'flex' : 'none';

    // Grid Template: Threads | Chat (| Agents)
    layout.style.gridTemplateColumns = showAgents ? '15% 1fr 20%' : '15% 1fr';
}

// Deprecated: toggleAgentsPanel
// Deprecated: toggleSystemLogs

async function savePreference(key, value) {
    await prefs.set(key, value);
}

// Hook into existing functions to save state

const originalSwitchMainTab = switchMainTab;
switchMainTab = function (tabName, save = true) {
    originalSwitchMainTab(tabName);
    if (save) savePreference('active_tab', tabName);
};

function applyPackagePreferencesToUI() {
    const statusFilter = document.getElementById('package-status-filter');
    if (statusFilter) {
        statusFilter.value = prefs.get('package_filters.status', 'all');
    }

    const hideSystemPkg = document.getElementById('hide-system-packages'); // Main tab toggle
    if (hideSystemPkg) {
        hideSystemPkg.checked = prefs.get('package_filters.hide_system', false);
    }

    // Also sync the settings tab toggle if it exists
    const settingHideSystem = document.getElementById('setting-hide-system-pkgs');
    if (settingHideSystem) {
        settingHideSystem.checked = prefs.get('package_filters.hide_system', false);
    }

    const searchInput = document.getElementById('package-search');
    if (searchInput) {
        searchInput.value = prefs.get('package_filters.search', '');
    }

    packageSort.column = prefs.get('package_sort.column', 'updated');
    packageSort.direction = prefs.get('package_sort.direction', 'desc');
}

// Updates to setupPackageListeners to attach save logic
const originalSetupPackageListeners = setupPackageListeners;
setupPackageListeners = function () {
    originalSetupPackageListeners();

    // Attach save logic to elements
    const statusFilter = document.getElementById('package-status-filter');
    statusFilter.addEventListener('change', (e) => savePreference('package_filters.status', e.target.value));

    const hideSystem = document.getElementById('hide-system-packages');
    if (hideSystem) {
        hideSystem.addEventListener('change', (e) => {
            savePreference('package_filters.hide_system', e.target.checked);
            // Sync settings toggle
            const settingToggle = document.getElementById('setting-hide-system-pkgs');
            if (settingToggle) settingToggle.checked = e.target.checked;
        });
    }

    const searchInput = document.getElementById('package-search');
    searchInput.addEventListener('input', (e) => savePreference('package_filters.search', e.target.value));

    // Settings Tab Listeners
    const strictMode = document.getElementById('setting-strict-mode');
    if (strictMode) {
        strictMode.addEventListener('change', (e) => savePreference('validation.strict_mode', e.target.checked));
    }

    const settingHideSystem = document.getElementById('setting-hide-system-pkgs');
    if (settingHideSystem) {
        settingHideSystem.addEventListener('change', (e) => {
            const checked = e.target.checked;
            savePreference('package_filters.hide_system', checked);
            // Sync main toggle
            const mainToggle = document.getElementById('hide-system-packages');
            if (mainToggle) {
                mainToggle.checked = checked;
                mainToggle.dispatchEvent(new Event('change'));
            } else {
                renderPackagesTable();
            }
        });
    }

};

// Override sort click to save
// We can't easily override the inner function closure of setupPackageListeners without replacing it totally.
// So we'll inject the apply logic into renderPackagesTable or loadAllPackages.

const originalRenderPackagesTable = renderPackagesTable;
renderPackagesTable = function () {
    // Before first render or if needed, sync UI variables from DOM which might have been set by Apply
    // But wait, render uses DOM values.

    // Let's modify loadAllPackages to Apply prefs to UI before first render
    originalRenderPackagesTable();
}

// Modify loadAllPackages to apply prefs
const originalLoadAllPackages = loadAllPackages;
loadAllPackages = async function () {
    try {
        const response = await fetch('/api/packages/all');
        const data = await response.json();

        allPackages = data.packages || [];

        // CHECKPOINT: Apply prefs to UI inputs before rendering
        if (!window.packagePrefsApplied) {
            applyPackagePreferencesToUI();
            window.packagePrefsApplied = true;
        }

        originalRenderPackagesTable();

        if (!window.packageListenersSetup) {
            setupPackageListeners();
            window.packageListenersSetup = true;
        }

    } catch (error) {
        console.error('Error loading packages:', error);
        document.getElementById('packages-table-body').innerHTML =
            '<tr><td colspan="6" class="placeholder-text error">Error loading packages</td></tr>';
    }
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
    if (!select) return;

    const currentVal = select.value;
    try {
        const res = await fetch('/api/registry/models/chat');
        if (!res.ok) throw new Error('Failed to load chat models');
        const data = await res.json();

        let html = '<option value="auto">Model: Auto</option>';
        for (const m of data.models || []) {
            const costHint = (m.input_cost_per_1m_tokens || m.output_cost_per_1m_tokens)
                ? ` ($${m.input_cost_per_1m_tokens}/$${m.output_cost_per_1m_tokens})`
                : '';
            html += `<option value="${m.id}" title="${m.description || ''}">${m.id}${costHint}</option>`;
        }
        select.innerHTML = html;

        if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
            select.value = currentVal;
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
                `<span class="cap-tag ${c === 'image_generation' ? 'cap-image' : ''}" data-cap="${c}" title="Click to remove">${c} ×</span>`
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
                            <select class="cap-add-select" style="width: 80px; font-size: 0.8rem; padding: 2px;">
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
                        ${isImageGen ? `<button class="btn-icon model-config-btn" title="Configure Image Settings">⚙️</button>` : ''}
                        <button class="btn-icon model-delete-btn" data-provider="${name}" data-model-key="${modelKey}" title="Remove model">×</button>
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
        let suggestOptions = '<option value="">— Select suggested model —</option>';
        for (const s of suggestions) {
            suggestOptions += `<option value="${s.key}" data-model='${JSON.stringify(s)}'>${s.id} (${s.tier}) — ${s.description}</option>`;
        }
        suggestOptions += '<option value="__custom__">✏️ Custom model...</option>';

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
                        <button class="model-add-btn" data-provider="${name}">+ Add Model</button>
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

    // Add model buttons — show suggestion dropdown inline
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
            tag.textContent = val + ' ×'; // x char
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
                entry.querySelectorAll('.cap-tag').forEach(tag => caps.push(tag.dataset.cap || tag.textContent.replace(' ×', '')));

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
                            <button class="env-reveal-btn" title="Reveal key">👁</button>
                        </div>
                        <button class="env-save-key-btn btn-primary small" data-key="${k.name}">Save</button>
                        <span class="env-key-status ${k.has_value ? 'set' : 'unset'}">${k.has_value ? '✓ Set' : '⚠ Not set'}</span>
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

// ===== Header Status =====

async function loadHeaderStatus() {
    try {
        const response = await fetch('/api/system/status');
        if (!response.ok) return; // Silent fail
        const data = await response.json();

        const nexusEl = document.getElementById('nexus-status');
        const agentsEl = document.getElementById('agents-count');
        // Nexus Status Indicator
        const indicator = document.getElementById('nexus-status-indicator');
        if (indicator) {
            const dot = indicator.querySelector('.status-dot');
            const text = indicator.querySelector('.status-text');
            const isOnline = data.nexus && data.nexus.initialized;

            if (dot) dot.style.backgroundColor = isOnline ? 'var(--success)' : 'var(--error)';
            if (indicator) indicator.style.borderColor = isOnline ? 'var(--success)' : 'var(--error)';
            if (text) {
                text.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
                text.style.color = isOnline ? 'var(--success)' : 'var(--error)';
            }
        }

        // Counts
        const agentsCount = document.getElementById('agents-count');
        const toolsCount = document.getElementById('tools-count');
        // Files count removed from header UI, so we stop updating it

        if (agentsCount) agentsCount.textContent = data.factory ? data.factory.active_agents : '0';
        if (toolsCount) toolsCount.textContent = data.forge ? data.forge.total_tools : '0';

    } catch (error) {
        // Handle disconnection visually
        const indicator = document.getElementById('nexus-status-indicator');
        if (indicator) {
            const dot = indicator.querySelector('.status-dot');
            const text = indicator.querySelector('.status-text');
            if (dot) dot.style.backgroundColor = 'var(--error)';
            if (indicator) indicator.style.borderColor = 'var(--error)';
            if (text) {
                text.textContent = 'DISCONNECTED';
                text.style.color = 'var(--error)';
            }
        }
    }
}

// ===== System Status =====

// ===== System Status Tab (Roadmap) =====

async function loadSystemStatusTab() {
    const container = document.querySelector('.roadmap-tree');
    if (!container) return;

    try {
        // Fetch data: Status JSON (Roadmap), Metrics JSON (Heavy), API Status (Light)
        const [roadmapRes, metricsRes, apiRes] = await Promise.all([
            fetch('/static/assets/system-status.json?v=' + Date.now()),
            fetch('/static/assets/system-metrics.json?v=' + Date.now()),
            fetch('/api/system/status')
        ]);

        const roadmapData = roadmapRes.ok ? await roadmapRes.json() : {};
        const metricsData = metricsRes.ok ? await metricsRes.json() : {};
        const apiData = apiRes.ok ? await apiRes.json() : {};

        // Update Header Meta
        const nameEl = document.getElementById('system-name-display');
        const verEl = document.getElementById('system-version-display');
        const dateEl = document.getElementById('status-last-update');

        if (nameEl) nameEl.textContent = roadmapData.system_name || 'Misaka Cipher';
        if (verEl) verEl.textContent = roadmapData.version ? `v${roadmapData.version}` : '';
        if (dateEl) dateEl.textContent = roadmapData.last_update || 'Unknown';

        // Render Telemetry (Merge API + Static Metrics)
        renderSystemTelemetry(apiData, metricsData);

        // Render Roadmap Tree
        const roadmap = roadmapData.roadmap || {};
        let html = '';

        // Helper to render section
        const renderSection = (title, items, type) => {
            const itemsHtml = (items || []).map(item => `<div class="roadmap-item">${item}</div>`).join('');
            return `
                <div class="roadmap-section ${type}">
                    <h3>${title}</h3>
                    <div class="roadmap-items">
                        ${itemsHtml}
                    </div>
                </div>
            `;
        };

        html += renderSection('COMPLETED', roadmap.working, 'working');
        html += renderSection('WORK IN PROGRESS', roadmap.wip, 'wip');
        html += renderSection('PLANNED', roadmap.planned, 'planned');

        container.innerHTML = html;

        // Start Vitals Polling
        startVitalsPolling();

    } catch (error) {
        console.error('Error loading system status:', error);
        container.innerHTML = '<div class="error-placeholder">Failed to load system status. Check console.</div>';
    }
}

let vitalsInterval = null;

function startVitalsPolling() {
    if (vitalsInterval) return; // Already running

    // Poll every 3 seconds
    vitalsInterval = setInterval(async () => {
        const tab = document.getElementById('status-panel');
        // Stop if tab not visible or switched away (simple check)
        if (!tab || tab.style.display === 'none' && !tab.classList.contains('active')) {
            // Note: tab display handling depends on how switchMainTab works. 
            // Ideally we hook into switchMainTab, but checking visibility here is a safety net.
            // If the app hides panels by display:none, this works.
        }

        // Better check: is it the active tab?
        // Relying on the fact that if we are here, we probably want updates.
        // But to be safe and save resources:
        if (document.querySelector('.main-tab-panel.active')?.id !== 'status-panel') {
            stopVitalsPolling();
            return;
        }

        try {
            const res = await fetch('/api/system/status');
            if (res.ok) {
                const data = await res.json();
                updateRealtimeVitals(data);
            }
        } catch (e) { console.warn('Vitals poll failed', e); }
    }, 3000);
}

function stopVitalsPolling() {
    if (vitalsInterval) {
        clearInterval(vitalsInterval);
        vitalsInterval = null;
    }
}

function updateRealtimeVitals(apiData) {
    // Only updates the Realtime section
    const container = document.getElementById('realtime-info-grid');
    if (!container) return;

    const nexusStatus = apiData.nexus || {};
    const factoryStatus = apiData.factory || {};
    const vitals = apiData.vitals || {};

    container.innerHTML = renderRealtimeCards(nexusStatus, factoryStatus, vitals);
}

function renderSystemTelemetry(apiData, metricsData) {
    // Realtime Section
    const rtContainer = document.getElementById('realtime-info-grid');
    if (rtContainer) {
        rtContainer.innerHTML = renderRealtimeCards(
            apiData.nexus || {},
            apiData.factory || {},
            apiData.vitals || {}
        );
    }

    // Local Info Section
    const localContainer = document.getElementById('local-info-grid');
    if (localContainer) {
        const forgeStatus = apiData.forge || {};
        const systemMetrics = metricsData.system || {};
        const memoryMetrics = metricsData.memory || {};

        const formatBytes = (bytes) => {
            if (!bytes) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        };

        // Update Local Timestamp
        const syncEl = document.getElementById('telemetry-last-sync');
        if (syncEl) {
            const lastSync = systemMetrics.last_sync;
            syncEl.textContent = lastSync ? new Date(lastSync).toLocaleString() : 'Never';
        }

        localContainer.innerHTML = `
            <div class="telemetry-card">
                <div class="t-label">PROJECT SIZE</div>
                <div class="t-value">${formatBytes(systemMetrics.project_size_bytes)}</div>
            </div>
            <div class="telemetry-card">
                <div class="t-label">EPISODIC (DB)</div>
                <div class="t-value">${memoryMetrics.episodic_count || 0} <span class="t-sub">(Memories)</span></div>
            </div>
            <div class="telemetry-card">
                <div class="t-label">KNOWLEDGE BASE</div>
                <div class="t-value">${formatBytes(systemMetrics.db_size_bytes)} <span class="t-sub">(DB)</span></div>
            </div>
            <div class="telemetry-card">
                <div class="t-label">TOOLS</div>
                <div class="t-value">${forgeStatus.total_tools || 0}</div>
            </div>
        `;
    }
}

function renderRealtimeCards(nexusStatus, factoryStatus, vitals) {
    return `
        <div class="telemetry-card">
            <div class="t-label">NEXUS STATUS</div>
            <div class="t-value ${nexusStatus.initialized ? 'online' : 'offline'}">
                ${nexusStatus.initialized ? 'ONLINE' : 'OFFLINE'}
            </div>
        </div>
        <div class="telemetry-card">
            <div class="t-label">CPU USAGE</div>
            <div class="t-value">
                ${vitals.cpu_percent || 0}%
            </div>
        </div>
        <div class="telemetry-card">
            <div class="t-label">RAM USAGE</div>
            <div class="t-value" style="font-size: 1rem;">
                ${vitals.ram_used_gb || 0} GB <span class="t-sub">/ ${vitals.ram_total_gb || 0} GB (${vitals.ram_percent || 0}%)</span>
            </div>
        </div>
        <div class="telemetry-card">
            <div class="t-label">ACTIVE AGENTS</div>
            <div class="t-value">${factoryStatus.active_agents || 0} <span class="t-sub">/ ${factoryStatus.total_agents || 0}</span></div>
        </div>
    `;
}

async function syncSystemTelemetry() {
    const btn = document.getElementById('sync-telemetry-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spin fa-spinner"></i> Syncing...';
    }

    try {
        const response = await fetch('/api/system/telemetry/sync', { method: 'POST' });
        if (!response.ok) throw new Error('Sync failed');

        await loadSystemStatusTab(); // Reload to show new data

        // Show temp success state
        if (btn) {
            btn.innerHTML = '<i class="fas fa-check"></i> Synced';
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-sync"></i> Sync Telemetry';
                btn.disabled = false;
            }, 2000);
        }
    } catch (error) {
        console.error('Telemetry sync error:', error);
        if (btn) {
            btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
            btn.disabled = false;
        }
    }
}

// ===== Usage Dashboard =====

let _providerChart = null;
let _timelineChart = null;
let _costByModelChart = null;
let _tokensByModelChart = null;

async function loadUsageDashboard() {
    try {
        // Read preference for time range
        const timeRange = prefs.get('usage.time_range', '1w');
        const hours = timeRange === '1d' ? 24 : 168; // 1w = 168h

        // Update buttons UI state
        document.querySelectorAll('.chart-time-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.range === timeRange);
        });

        const [summaryRes, historyRes, hourlyRes, costModelRes, tokensModelRes] = await Promise.all([
            fetch('/api/usage/summary'),
            fetch('/api/usage/history?limit=50'),
            fetch(`/api/usage/hourly?hours=${hours}`),
            fetch('/api/usage/cost-by-model'),
            fetch('/api/usage/tokens-by-model')
        ]);

        const summary = await summaryRes.json();
        const history = await historyRes.json();
        const hourly = await hourlyRes.json();
        const costModel = await costModelRes.json();
        const tokensModel = await tokensModelRes.json();

        updateUsageStatCards(summary);
        renderProviderChart(summary);
        renderTimelineChart(hourly);
        renderCostByModelChart(costModel);
        renderTokensByModelChart(tokensModel);
        renderModelUsageTable(summary);
        renderRecentCallsTable(history.entries || []);

        // Setup listeners if not already done
        if (!window.usageListenersSetup) {
            setupUsageListeners();
            window.usageListenersSetup = true;
        }

    } catch (error) {
        console.error('Error loading usage dashboard:', error);
    }
}

function setupUsageListeners() {
    document.querySelectorAll('.chart-time-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const range = e.target.dataset.range;
            await savePreference('usage.time_range', range);
            // Reload dashboard to reflect change
            loadUsageDashboard();
        });
    });
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

function formatCost(v) {
    if (v >= 1) return '$' + v.toFixed(2);
    if (v >= 0.01) return '$' + v.toFixed(4);
    return '$' + v.toFixed(6);
}

function updateUsageStatCards(summary) {
    document.getElementById('usage-total-calls').textContent = formatNumber(summary.total_calls || 0);
    document.getElementById('usage-total-tokens').textContent = formatNumber(summary.total_tokens || 0);
    document.getElementById('usage-input-cost').textContent = formatCost(summary.total_input_cost || 0);
    document.getElementById('usage-output-cost').textContent = formatCost(summary.total_output_cost || 0);
    document.getElementById('usage-success-rate').textContent = (summary.success_rate || 0).toFixed(1) + '%';
}

function renderProviderChart(summary) {
    const ctx = document.getElementById('chart-provider-calls');
    if (!ctx || typeof Chart === 'undefined') return;

    if (_providerChart) _providerChart.destroy();

    const providers = summary.by_provider || {};
    const labels = Object.keys(providers);
    const data = labels.map(k => providers[k].calls);

    const colorMap = {
        'google_ai': '#4285F4',
        'openai': '#10A37F',
        'grok': '#FF6600',
        'local': '#FFAA00'
    };
    const colors = labels.map(l => colorMap[l] || '#888888');

    _providerChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: '#0a0e1a',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#a0a0a0', font: { size: 12 } }
                }
            }
        }
    });
}

function renderTimelineChart(hourlyData) {
    const ctx = document.getElementById('chart-tokens-timeline');
    if (!ctx || typeof Chart === 'undefined') return;

    if (_timelineChart) _timelineChart.destroy();

    const hours = hourlyData.hours || [];
    const labels = hours.map(h => {
        const parts = h.hour.split('T');
        return parts[1] ? parts[1] + ':00' : h.hour;
    });
    const tokenData = hours.map(h => h.tokens);
    const callData = hours.map(h => h.calls);

    _timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Tokens',
                    data: tokenData,
                    borderColor: '#00d9ff',
                    backgroundColor: 'rgba(0, 217, 255, 0.1)',
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y'
                },
                {
                    label: 'Calls',
                    data: callData,
                    borderColor: '#ff00ff',
                    backgroundColor: 'rgba(255, 0, 255, 0.1)',
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: { color: '#a0a0a0', font: { size: 12 } }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#a0a0a0', maxTicksLimit: 12 },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Tokens', color: '#00d9ff' },
                    ticks: { color: '#a0a0a0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Calls', color: '#ff00ff' },
                    ticks: { color: '#a0a0a0' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

function renderCostByModelChart(costData) {
    const ctx = document.getElementById('chart-cost-by-model');
    if (!ctx || typeof Chart === 'undefined') return;

    if (_costByModelChart) _costByModelChart.destroy();

    const models = costData.models || [];
    if (!models.length) return;

    const labels = models.map(m => m.name);
    const inputCosts = models.map(m => m.input_cost);
    const outputCosts = models.map(m => m.output_cost);

    _costByModelChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Input Cost',
                    data: inputCosts,
                    backgroundColor: 'rgba(0, 217, 255, 0.7)',
                    borderColor: '#00d9ff',
                    borderWidth: 1
                },
                {
                    label: 'Output Cost',
                    data: outputCosts,
                    backgroundColor: 'rgba(255, 0, 255, 0.7)',
                    borderColor: '#ff00ff',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    labels: { color: '#a0a0a0', font: { size: 12 } }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label + ': $' + context.raw.toFixed(6);
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: false,
                    title: { display: true, text: 'Cost ($)', color: '#a0a0a0' },
                    ticks: { color: '#a0a0a0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: { color: '#a0a0a0', font: { family: "'Fira Code', monospace", size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function renderTokensByModelChart(tokensData) {
    const ctx = document.getElementById('chart-tokens-by-model');
    if (!ctx || typeof Chart === 'undefined') return;

    if (_tokensByModelChart) _tokensByModelChart.destroy();

    const models = tokensData.models || [];
    if (!models.length) return;

    const labels = models.map(m => m.name);
    const inputTokens = models.map(m => m.prompt_tokens);
    const outputTokens = models.map(m => m.completion_tokens);

    _tokensByModelChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Input Tokens',
                    data: inputTokens,
                    backgroundColor: 'rgba(0, 217, 255, 0.7)',
                    borderColor: '#00d9ff',
                    borderWidth: 1
                },
                {
                    label: 'Output Tokens',
                    data: outputTokens,
                    backgroundColor: 'rgba(255, 200, 0, 0.7)',
                    borderColor: '#ffc800',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    labels: { color: '#a0a0a0', font: { size: 12 } }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label + ': ' + formatNumber(context.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: false,
                    title: { display: true, text: 'Tokens', color: '#a0a0a0' },
                    ticks: { color: '#a0a0a0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: { color: '#a0a0a0', font: { family: "'Fira Code', monospace", size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function renderModelUsageTable(summary) {
    const tbody = document.getElementById('usage-model-tbody');
    if (!tbody) return;

    const byModel = summary.by_model || {};
    const models = Object.entries(byModel).map(([name, data]) => ({
        name,
        calls: data.calls || 0,
        prompt_tokens: data.prompt_tokens || 0,
        completion_tokens: data.completion_tokens || 0,
        tokens: data.tokens || 0,
        cost: data.cost || 0
    }));

    // Sort by calls descending
    models.sort((a, b) => b.calls - a.calls);

    if (!models.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="placeholder-text">No model usage data yet</td></tr>';
        return;
    }

    tbody.innerHTML = models.map(m => `<tr>
        <td style="font-family: 'Fira Code', monospace; font-size: 0.8rem;">${m.name}</td>
        <td>${formatNumber(m.calls)}</td>
        <td>${formatNumber(m.prompt_tokens)}</td>
        <td>${formatNumber(m.completion_tokens)}</td>
        <td>${formatNumber(m.tokens)}</td>
        <td>${formatCost(m.cost)}</td>
    </tr>`).join('');
}

function renderRecentCallsTable(entries) {
    const tbody = document.getElementById('usage-recent-tbody');
    if (!tbody) return;

    if (!entries.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="placeholder-text">No API calls recorded yet</td></tr>';
        return;
    }

    tbody.innerHTML = entries.slice(0, 25).map(e => {
        const time = new Date(e.timestamp).toLocaleTimeString();
        const provider = e.provider || 'unknown';
        const source = e.source || 'chat';
        return `<tr>
            <td style="font-family: 'Fira Code', monospace; font-size: 0.8rem;">${time}</td>
            <td><span class="source-badge ${source}">${source}</span></td>
            <td><span class="provider-badge ${provider}">${provider}</span></td>
            <td style="font-family: 'Fira Code', monospace; font-size: 0.8rem;">${e.model || '?'}</td>
            <td>${formatNumber(e.prompt_tokens || 0)}${e.tokens_estimated ? ' ~' : ''}</td>
            <td>${formatNumber(e.completion_tokens || 0)}${e.tokens_estimated ? ' ~' : ''}</td>
            <td>${formatCost(e.input_cost || 0)}</td>
            <td>${formatCost(e.output_cost || 0)}</td>
        </tr>`;
    }).join('');
}

// ===== Arena Mode =====

let arenaSelectedModels = [];
let arenaAvailableModels = [];

function switchChatArenaMode(mode) {
    // Update dropdown items
    document.querySelectorAll('.tab-dropdown-item').forEach(item => {
        item.classList.toggle('active', item.dataset.subtab === mode);
    });

    // Update dropdown button label
    const btn = document.querySelector('.main-tab-dropdown .main-tab');
    if (btn) {
        const icons = { chat: '💬', agent: '🤖', arena: '⚔️' };
        const labels = { chat: 'Chat', agent: 'Agent', arena: 'Arena' };
        btn.innerHTML = `<span class="tab-icon">${icons[mode] || '💬'}</span>${labels[mode] || 'Chat'} <span class="dropdown-arrow">▾</span>`;
    }

    // Switch panel (this updates currentMainTab)
    switchMainTab(mode);

    // Re-render thread list to filter by mode
    if (typeof renderThreadList === 'function') {
        renderThreadList();

        // Auto-select first visible thread if current is no longer visible
        if (mode === 'chat' || mode === 'agent') {
            const visibleThreads = document.querySelectorAll('.thread-item');
            const currentVisible = document.querySelector(`.thread-item[data-thread-id="${currentThreadId}"]`);
            if (!currentVisible && visibleThreads.length > 0) {
                const firstId = visibleThreads[0].dataset.threadId;
                if (typeof switchThread === 'function') switchThread(firstId);
            } else if (visibleThreads.length === 0) {
                // No threads for this mode — clear chat
                currentThreadId = null;
                if (typeof toggleChatInput === 'function') toggleChatInput(false);
                const chatMessages = document.getElementById('chat-messages');
                if (chatMessages) chatMessages.innerHTML = '';
                document.getElementById('active-thread-title').textContent = 'No threads';
            }
        }
    }
}

function initializeArena() {
    // Send button
    const sendBtn = document.getElementById('arena-send');
    if (sendBtn) {
        sendBtn.addEventListener('click', sendArenaPrompt);
    }

    // Input enter key
    const input = document.getElementById('arena-input');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendArenaPrompt();
            }
        });
        input.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if (this.value === '') this.style.height = '';
        });
    }

    // Model add dropdown
    const addSelect = document.getElementById('arena-model-add');
    if (addSelect) {
        addSelect.addEventListener('change', () => {
            const modelId = addSelect.value;
            if (modelId && !arenaSelectedModels.includes(modelId)) {
                arenaSelectedModels.push(modelId);
                renderArenaChips();
            }
            addSelect.value = '';
        });
    }

    // Clear leaderboard
    const clearBtn = document.getElementById('arena-clear-leaderboard');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearArenaLeaderboard);
    }
}

async function loadArenaModels() {
    try {
        const res = await fetch('/api/registry/models/chat');
        if (!res.ok) return;
        const data = await res.json();
        arenaAvailableModels = data.models || [];

        // Populate add-model dropdown
        const addSelect = document.getElementById('arena-model-add');
        if (addSelect) {
            let html = '<option value="">+ Add Model...</option>';
            for (const m of arenaAvailableModels) {
                html += `<option value="${m.id}">${m.id} (${m.provider})</option>`;
            }
            addSelect.innerHTML = html;
        }

        // Populate evaluator dropdown
        const evalSelect = document.getElementById('arena-evaluator');
        if (evalSelect) {
            let html = '<option value="">No Evaluator</option>';
            for (const m of arenaAvailableModels) {
                html += `<option value="${m.id}">${m.id}</option>`;
            }
            evalSelect.innerHTML = html;
        }
    } catch (err) {
        console.error('Failed to load arena models:', err);
    }
}

function renderArenaChips() {
    const container = document.getElementById('arena-model-chips');
    if (!container) return;

    container.innerHTML = arenaSelectedModels.map(id => `
        <span class="arena-chip">
            ${id}
            <span class="chip-remove" onclick="removeArenaModel('${id}')">&times;</span>
        </span>
    `).join('');
}

function removeArenaModel(modelId) {
    arenaSelectedModels = arenaSelectedModels.filter(id => id !== modelId);
    renderArenaChips();
}

async function sendArenaPrompt() {
    const input = document.getElementById('arena-input');
    const prompt = input ? input.value.trim() : '';

    if (!prompt) return;
    if (arenaSelectedModels.length < 2) {
        alert('Please add at least 2 models to the arena.');
        return;
    }

    input.value = '';
    input.style.height = '';

    const evalSelect = document.getElementById('arena-evaluator');
    const evaluatorModelId = evalSelect ? evalSelect.value : '';

    // Show loading
    const responsesDiv = document.getElementById('arena-responses');
    const loadingHtml = `
        <div class="arena-battle-round">
            <div class="arena-prompt-bar"><strong>Prompt:</strong> ${escapeHtml(prompt)}</div>
            <div class="arena-cards-grid">
                ${arenaSelectedModels.map(id => `
                    <div class="arena-response-card">
                        <div class="card-header"><span class="card-model">${id}</span></div>
                        <div class="card-body"><div class="arena-loading"><div class="spinner"></div> Generating...</div></div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Remove placeholder if present
    const placeholder = responsesDiv.querySelector('.arena-placeholder');
    if (placeholder) placeholder.remove();

    responsesDiv.insertAdjacentHTML('beforeend', loadingHtml);
    responsesDiv.scrollTop = responsesDiv.scrollHeight;

    try {
        const res = await fetch('/api/arena/battle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt,
                model_ids: arenaSelectedModels,
                evaluator_model_id: evaluatorModelId || null
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || 'Battle failed');
        }

        // Replace the loading round with actual results
        const lastRound = responsesDiv.querySelector('.arena-battle-round:last-child');
        if (lastRound) {
            const cardsGrid = lastRound.querySelector('.arena-cards-grid');
            cardsGrid.innerHTML = data.responses.map(r => {
                const isWinner = r.model_id === data.winner_id;
                const scoreHtml = r.score !== null && r.score !== undefined
                    ? `<span class="card-score">${r.score}/10</span>`
                    : '';
                const badgeHtml = isWinner ? '<span class="card-badge">🏆 Winner</span>' : '';

                return `
                    <div class="arena-response-card ${isWinner ? 'winner' : ''}">
                        ${badgeHtml}
                        <div class="card-header">
                            <span class="card-model">${r.model_id}</span>
                            ${scoreHtml}
                        </div>
                        <div class="card-body">${escapeHtml(r.response)}</div>
                        <div class="card-provider">via ${r.provider}</div>
                    </div>
                `;
            }).join('');
        }

        // Update leaderboard from response
        if (data.leaderboard) {
            renderArenaLeaderboard(data.leaderboard);
        }

    } catch (err) {
        console.error('Arena battle failed:', err);
        const lastRound = responsesDiv.querySelector('.arena-battle-round:last-child');
        if (lastRound) {
            const cardsGrid = lastRound.querySelector('.arena-cards-grid');
            cardsGrid.innerHTML = `<div class="arena-response-card" style="border-color: var(--error);">
                <div class="card-body" style="color: var(--error);">Battle failed: ${escapeHtml(err.message)}</div>
            </div>`;
        }
    }
}

async function loadArenaLeaderboard() {
    try {
        const res = await fetch('/api/arena/leaderboard');
        const data = await res.json();
        renderArenaLeaderboard(data.models || {});
    } catch (err) {
        console.error('Failed to load leaderboard:', err);
    }
}

function renderArenaLeaderboard(modelsData) {
    const tbody = document.getElementById('arena-leaderboard-body');
    if (!tbody) return;

    const models = Object.entries(modelsData);
    if (!models.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="placeholder-text">No battles yet</td></tr>';
        return;
    }

    // Sort by wins desc, then win rate
    models.sort((a, b) => {
        if (b[1].wins !== a[1].wins) return b[1].wins - a[1].wins;
        const rateA = a[1].battles > 0 ? a[1].wins / a[1].battles : 0;
        const rateB = b[1].battles > 0 ? b[1].wins / b[1].battles : 0;
        return rateB - rateA;
    });

    tbody.innerHTML = models.map(([id, stats], i) => {
        const winRate = stats.battles > 0 ? ((stats.wins / stats.battles) * 100).toFixed(0) : 0;
        const barWidth = Math.min(winRate, 100);
        return `<tr>
            <td style="font-weight:600; color: var(--primary);">${i + 1}</td>
            <td style="font-size:0.78rem; font-family:'Fira Code',monospace;">${id}</td>
            <td style="color: var(--success); font-weight:600;">${stats.wins}</td>
            <td>${stats.battles}</td>
            <td>${winRate}%<span class="win-rate-bar" style="width:${barWidth * 0.5}px;"></span></td>
        </tr>`;
    }).join('');
}

async function clearArenaLeaderboard() {
    if (!confirm('Clear the entire arena leaderboard?')) return;

    try {
        await fetch('/api/arena/leaderboard', { method: 'DELETE' });
        renderArenaLeaderboard({});
    } catch (err) {
        console.error('Failed to clear leaderboard:', err);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
