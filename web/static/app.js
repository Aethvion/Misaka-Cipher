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
    await loadPackages();

    // Initialize thread management (from threads.js)
    if (typeof initThreadManagement === 'function') {
        initThreadManagement();
    }

    // Refresh status every 5 seconds
    setInterval(loadSystemStatus, 5000);

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
            actions: data.actions_taken,
            tools: data.tools_forged,
            agents: data.agents_spawned
        });

        // Reload files if any were created
        if (currentMainTab === 'files') {
            loadFiles();
        }
    } else if (data.type === 'agent_step') {
        addMessage('agent_step', data.content, {
            title: data.title,
            agent_name: data.agent_name,
            status: data.status,
            trace_id: data.trace_id
        });
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
    } else if (sender === 'agent_step') {
        const title = metadata.title || 'Agent Action';
        const agentName = metadata.agent_name || 'Agent';
        const status = metadata.status || 'completed';
        const isError = status === 'failed';

        html = `
            <details class="agent-step-details" ${isError ? 'open' : ''}>
                <summary class="agent-step-summary ${isError ? 'error' : ''}">
                    <span class="step-icon">${isError ? '⚠️' : '🤖'}</span>
                    <span class="step-title">${title}</span>
                    <span class="step-agent">${agentName}</span>
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

async function loadPackages() {
    await loadPendingPackages();
    await loadInstalledPackages();
    await loadDeniedPackages();
}

async function loadPendingPackages() {
    try {
        const response = await fetch('/api/packages/pending');
        const data = await response.json();

        const container = document.getElementById('pending-packages-list');
        const countBadge = document.getElementById('pending-count');

        if (!data.pending || data.pending.length === 0) {
            container.innerHTML = '<p class="placeholder-text">No pending package requests</p>';
            countBadge.textContent = '0';
            return;
        }

        countBadge.textContent = data.pending.length;
        container.innerHTML = data.pending.map(pkg => renderPackageCard(pkg)).join('');

        // Attach event listeners to buttons
        container.querySelectorAll('.approve-btn').forEach(btn => {
            btn.addEventListener('click', () => approvePackage(btn.dataset.package));
        });
        container.querySelectorAll('.deny-btn').forEach(btn => {
            btn.addEventListener('click', () => denyPackage(btn.dataset.package));
        });

    } catch (error) {
        console.error('Error loading pending packages:', error);
    }
}

async function loadInstalledPackages() {
    try {
        const response = await fetch('/api/packages/installed');
        const data = await response.json();

        const container = document.getElementById('installed-packages-list');
        const countBadge = document.getElementById('installed-count');

        if (!data.installed || data.installed.length === 0) {
            container.innerHTML = '<p class="placeholder-text">No packages installed via this system</p>';
            countBadge.textContent = '0';
            return;
        }

        countBadge.textContent = data.installed.length;
        container.innerHTML = data.installed.map(pkg => `
            <div class="package-card installed">
                <div class="package-header">
                    <h3>📦 ${pkg.name}</h3>
                    <span class="package-version">v${pkg.version}</span>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading installed packages:', error);
    }
}

async function loadDeniedPackages() {
    try {
        const response = await fetch('/api/packages/denied');
        const data = await response.json();

        const container = document.getElementById('denied-packages-list');
        const countBadge = document.getElementById('denied-count');

        if (!data.denied || data.denied.length === 0) {
            container.innerHTML = '<p class="placeholder-text">No denied packages</p>';
            countBadge.textContent = '0';
            return;
        }

        countBadge.textContent = data.denied.length;
        container.innerHTML = data.denied.map(pkg => `
            <div class="package-card denied">
                <div class="package-header">
                    <h3>📦 ${pkg}</h3>
                    <span class="denied-label">DENIED</span>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading denied packages:', error);
    }
}

function renderPackageCard(pkg) {
    const meta = pkg.metadata || {};
    const safetyLevel = meta.safety_level || 'UNKNOWN';
    const safetyScore = meta.safety_score || 0;
    const safetyColor = {
        'HIGH': '#10b981',
        'MEDIUM': '#f59e0b',
        'LOW': '#f97316',
        'UNKNOWN': '#ef4444'
    }[safetyLevel];

    const safetyEmoji = {
        'HIGH': '🟢',
        'MEDIUM': '🟡',
        'LOW': '🟠',
        'UNKNOWN': '🔴'
    }[safetyLevel];

    const barWidth = (safetyScore / 100) * 100;

    return `
        <div class="package-card pending">
            <div class="package-header">
                <h3>📦 ${pkg.name}</h3>
            </div>
            
            <div class="safety-rating" style="border-color: ${safetyColor}">
                <div class="safety-bar-container">
                    <div class="safety-bar" style="width: ${barWidth}%; background-color: ${safetyColor}"></div>
                </div>
                <div class="safety-label">
                    Safety Rating: ${Math.round(safetyScore)}/100 (${safetyLevel}) ${safetyEmoji}
                </div>
            </div>
            
            <div class="package-info">
                <div class="info-row">
                    <span class="info-label">Version:</span>
                    <span>${meta.version || 'unknown'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Downloads:</span>
                    <span>${formatNumber(meta.downloads_last_month || 0)}/month</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Last Update:</span>
                    <span>${meta.last_release ? formatDate(meta.last_release) : 'unknown'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Total Releases:</span>
                    <span>${meta.total_releases || 0}</span>
                </div>
            </div>
            
            <div class="package-request-info">
                <div class="info-row">
                    <span class="info-label">Requested by:</span>
                    <span class="code">${pkg.requested_by}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Reason:</span>
                    <span>${pkg.reason}</span>
                </div>
            </div>
            
            ${meta.dependencies && meta.dependencies.length > 0 ? `
                <div class="package-dependencies">
                    <span class="info-label">Dependencies (${meta.dependencies.length}):</span>
                    <div class="dependencies-list">${meta.dependencies.slice(0, 5).join(', ')}${meta.dependencies.length > 5 ? '...' : ''}</div>
                </div>
            ` : ''}
            
            ${meta.safety_reasons && meta.safety_reasons.length > 0 ? `
                <div class="safety-factors">
                    <span class="info-label">Safety Factors:</span>
                    <ul class="safety-reasons">
                        ${meta.safety_reasons.map(reason => `<li>${reason}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            <div class="package-actions">
                <button class="approve-btn" data-package="${pkg.name}">✓ Approve & Install</button>
                <button class="deny-btn" data-package="${pkg.name}">✗ Deny</button>
            </div>
        </div>
    `;
}

async function approvePackage(packageName) {
    if (!confirm(`Install package "${packageName}"? This will run pip install.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/packages/approve/${packageName}`, {
            method: 'POST'
        });
        const data = await response.json();

        if (data.success) {
            alert(`✓ Package "${packageName}" installed successfully!`);
            await loadPackages(); // Refresh all package lists
        } else {
            alert(`✗ Failed to install "${packageName}": ${data.message}`);
        }
    } catch (error) {
        console.error('Error approving package:', error);
        alert(`Error approving package: ${error.message}`);
    }
}

async function denyPackage(packageName) {
    if (!confirm(`Deny package "${packageName}"? This will prevent it from being requested again.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/packages/deny/${packageName}`, {
            method: 'POST'
        });
        const data = await response.json();

        if (data.success) {
            alert(`Package "${packageName}" denied.`);
            await loadPackages(); // Refresh all package lists
        } else {
            alert(`Failed to deny "${packageName}": ${data.message}`);
        }
    } catch (error) {
        console.error('Error denying package:', error);
        alert(`Error denying package: ${error.message}`);
    }
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 30) return `${diffDays} days ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
}
