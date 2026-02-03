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
    initializeUI();
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
    // Main tab switching
    document.querySelectorAll('.main-tab').forEach(tab => {
        tab.addEventListener('click', () => switchMainTab(tab.dataset.maintab));
    });

    // Chat input
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');

    sendButton.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Memory search
    document.getElementById('memory-search-button').addEventListener('click', searchMemory);
    document.getElementById('memory-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchMemory();
    });

    // Files filters
    document.getElementById('domain-filter').addEventListener('change', loadFiles);
    document.getElementById('type-filter').addEventListener('change', loadFiles);
    document.getElementById('refresh-files').addEventListener('click', loadFiles);

    // Tools forge button
    document.getElementById('forge-tool-button').addEventListener('click', () => {
        alert('Tool forging via UI coming soon! For now, use the chat: "Create a tool to..."');
    });
}

function switchMainTab(tabName) {
    currentMainTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.main-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.maintab === tabName);
    });

    // Update panels
    document.querySelectorAll('.main-tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(`${tabName}-panel`).classList.add('active');

    // Load data for tab
    if (tabName === 'files') {
        loadFiles();
    } else if (tabName === 'tools') {
        loadTools();
    }
}

// ===== Data Loading =====

async function loadInitialData() {
    await loadSystemStatus();
    await loadTools();

    // Refresh status every 5 seconds
    setInterval(loadSystemStatus, 5000);
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

async function loadTools() {
    try {
        const response = await fetch('/api/tools/list');
        const data = await response.json();

        const grid = document.getElementById('tools-grid');

        if (data.count === 0) {
            grid.innerHTML = '<p class="placeholder-text">No tools yet. The Forge will create them as needed!</p>';
            return;
        }

        grid.innerHTML = data.tools.map(tool => `
            <div class="tool-card">
                <div class="tool-header">
                    <div class="tool-name">${tool.name}</div>
                    <div class="tool-domain">${tool.domain}</div>
                </div>
                <div class="tool-description">${tool.description || 'No description'}</div>
                <div class="tool-params">
                    Parameters: ${Object.keys(tool.parameters || {}).length || 0}
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Tools load error:', error);
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

function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message || chatWs.readyState !== WebSocket.OPEN) return;

    // Add user message to UI
    addMessage('user', message);

    // Send via WebSocket
    chatWs.send(JSON.stringify({ message }));

    // Clear input
    input.value = '';
}

function handleChatMessage(event) {
    const data = JSON.parse(event.data);

    if (data.type === 'response') {
        addMessage('ai', data.response, {
            trace_id: data.trace_id,
            actions: data.actions_taken,
            tools: data.tools_forged,
            agents: data.agents_spawned
        });

        // Reload files if any were created
        if (currentMainTab === 'files') {
            loadFiles();
        }
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

        if (metadata.actions && metadata.actions.length > 0) {
            html += `<div class="action-pills">`;
            metadata.actions.forEach(action => {
                html += `<span class="action-pill">${action}</span>`;
            });
            html += `</div>`;
        }
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
    const log = JSON.parse(event.data);
    const container = document.getElementById('logs-container');

    const logDiv = document.createElement('div');
    logDiv.className = `log-entry ${log.level.toLowerCase()}`;
    logDiv.innerHTML = `
        <span class="log-time">${formatTime(log.timestamp)}</span>
        <span class="log-level">${log.level}</span>
        <span class="log-message">${log.message}</span>
    `;

    container.appendChild(logDiv);

    // Keep only last 100 logs
    while (container.children.length > 100) {
        container.removeChild(container.firstChild);
    }

    // Auto-scroll to bottom
    container.scrollTop = container.scrollHeight;
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
