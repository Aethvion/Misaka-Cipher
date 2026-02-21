// Misaka Cipher - Core
// Handles WebSocket connections, global UI state, and initialization

// Global variables
let chatWs = null;
let logsWs = null;
let agentsWs = null;
let currentMainTab = 'chat';
let prevChatArenaMode = 'chat'; // Used to resume chat/arena

document.addEventListener('DOMContentLoaded', () => {
    initializeWebSockets();
    const refreshMemory = document.getElementById('refresh-memory-btn');
    if (refreshMemory) refreshMemory.addEventListener('click', loadMemoryData);

    initializeUI();
    initDevMode();
    loadInitialData();
});

// ===== WebSocket Management =====

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
    if (typeof handleChatMessage === 'function') chatWs.onmessage = handleChatMessage;

    // Logs WebSocket
    logsWs = new WebSocket(`${wsProtocol}//${wsHost}/ws/logs`);
    if (typeof handleLogMessage === 'function') logsWs.onmessage = handleLogMessage;

    // Agents WebSocket
    agentsWs = new WebSocket(`${wsProtocol}//${wsHost}/ws/agents`);
    if (typeof handleAgentsUpdate === 'function') agentsWs.onmessage = handleAgentsUpdate;
}

function updateConnectionStatus(connected) {
    const indicator = document.getElementById('status-indicator');
    if (!indicator) return;
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

    // Auto-resize textarea
    if (chatInput) {
        chatInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if (this.value === '') this.style.height = '';
        });
    }

    // Files filters
    const domainFilter = document.getElementById('domain-filter');
    const typeFilter = document.getElementById('type-filter');
    const refreshFilesList = document.getElementById('refresh-files');

    if (domainFilter) domainFilter.addEventListener('change', loadFiles);
    if (typeFilter) typeFilter.addEventListener('change', loadFiles);
    if (refreshFilesList) refreshFilesList.addEventListener('click', loadFiles);

    // Tools forge button
    const forgeBtn = document.getElementById('forge-tool-button');
    if (forgeBtn) {
        forgeBtn.addEventListener('click', () => {
            alert('Tool forging via UI coming soon! For now, use the chat: "Create a tool to..."');
        });
    }

    // Voice Mode Toggle
    const voiceButton = document.getElementById('voice-mode-toggle');
    if (voiceButton) {
        voiceButton.addEventListener('click', () => {
            voiceButton.classList.toggle('active');
            const isActive = voiceButton.classList.contains('active');

            if (isActive) {
                voiceButton.innerHTML = '<i class="fas fa-stop"></i>';
                voiceButton.style.color = 'var(--accent)';
                if (typeof addMessage === 'function') addMessage('system', 'Voice mode activated (Simulation)');
            } else {
                voiceButton.innerHTML = '<i class="fas fa-microphone"></i>';
                voiceButton.style.color = '';
                if (typeof addMessage === 'function') addMessage('system', 'Voice mode deactivated');
            }
        });
    }

    // Add File Button
    const addFileBtn = document.querySelector('.add-file-btn');
    if (addFileBtn) {
        addFileBtn.addEventListener('click', () => {
            alert('File upload coming soon!');
        });
    }

    // Package tab switching
    document.querySelectorAll('.package-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.packagetab;

            document.querySelectorAll('.package-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.packagetab === tabName);
            });

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
            if (dropdownWrapper) dropdownWrapper.classList.remove('open');
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        if (dropdownWrapper) dropdownWrapper.classList.remove('open');
    });

    if (typeof initializeArena === 'function') initializeArena();
    if (typeof initializeImageStudio === 'function') initializeImageStudio();
}

function switchMainTab(tabName, save = true) {
    currentMainTab = tabName;
    if (save && typeof savePreference === 'function') savePreference('active_tab', tabName);

    // Update tab buttons
    document.querySelectorAll('.main-tab').forEach(tab => {
        if (tab.closest('.main-tab-dropdown')) {
            const categories = ['chat', 'agent', 'image', 'arena', 'aiconv', 'advaiconv'];
            const isActive = categories.includes(tabName);

            if (tab.classList.contains('split-main-action')) {
                tab.classList.toggle('active', isActive);

                if (isActive) {
                    tab.dataset.maintab = tabName;
                    let icon = '💬';
                    let label = 'Chat';
                    if (tabName === 'agent') { icon = '🤖'; label = 'Agent'; }
                    if (tabName === 'image') { icon = '🎨'; label = 'Image'; }
                    if (tabName === 'arena') { icon = '⚔️'; label = 'Arena'; }
                    if (tabName === 'aiconv') { icon = '🎭'; label = 'AI Conv'; }
                    if (tabName === 'advaiconv') { icon = '🧪'; label = 'Adv AI Conv'; }
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

    // Load data for tab dynamically
    if (tabName === 'files' && typeof loadFiles === 'function') loadFiles();
    else if (tabName === 'tools' && typeof loadTools === 'function') loadTools();
    else if (tabName === 'settings' && typeof loadProviderSettings === 'function') loadProviderSettings();
    else if (tabName === 'usage' && typeof loadUsageDashboard === 'function') loadUsageDashboard();
    else if (tabName === 'arena' && typeof loadArenaModels === 'function') {
        loadArenaModels();
        if (typeof loadArenaLeaderboard === 'function') loadArenaLeaderboard();
    }
    else if (tabName === 'aiconv' && typeof loadArenaModels === 'function') loadArenaModels();
    else if (tabName === 'status' && typeof loadSystemStatusTab === 'function') loadSystemStatusTab();

    // Update layout based on mode
    updateChatLayout();
}

function updateChatLayout() {
    const layout = document.querySelector('.three-column-layout');
    if (!layout) return;

    const agentsCol = document.querySelector('.agents-column');
    const showAgents = currentMainTab === 'agent';

    if (agentsCol) agentsCol.style.display = showAgents ? 'flex' : 'none';
    layout.style.gridTemplateColumns = showAgents ? '15% 1fr 20%' : '15% 1fr';
}

// ===== Initial Data Rendering =====
async function loadInitialData() {
    if (typeof loadPreferences === 'function') await loadPreferences();
    if (typeof loadHeaderStatus === 'function') await loadHeaderStatus();
    if (typeof loadSystemStatusTab === 'function') await loadSystemStatusTab();
    if (typeof loadTools === 'function') await loadTools();
    if (typeof loadPackages === 'function') loadPackages();
    if (typeof loadMemoryData === 'function') loadMemoryData();
    if (typeof loadChatModels === 'function') loadChatModels();

    if (typeof initThreadManagement === 'function') {
        initThreadManagement();
    }

    if (typeof loadSystemStatus === 'function') setInterval(loadSystemStatus, 5000);
    if (typeof loadPackages === 'function') setInterval(loadPackages, 10000);
}

// ===== Global Modal Handlers =====

function openCustomModal(htmlContent) {
    let modalOverlay = document.getElementById('global-modal-overlay');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'global-modal-overlay';
        modalOverlay.className = 'modal-overlay';
        document.body.appendChild(modalOverlay);

        // click outside to close
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    modalOverlay.innerHTML = htmlContent;
    modalOverlay.style.display = 'flex';
}

function closeModal() {
    const modalOverlay = document.getElementById('global-modal-overlay');
    if (modalOverlay) {
        modalOverlay.style.display = 'none';
        modalOverlay.innerHTML = '';
    }
}
