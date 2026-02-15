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

    // Initial load
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
    await loadPreferences(); // Load prefs FIRST
    await loadSystemStatus();
    await loadTools();        // Background
    loadPackages();     // Background
    loadMemoryData();   // Background

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
    const checkbox = document.getElementById('show-system-tools');
    if (checkbox) checkbox.checked = showSystemTools;

    await loadAllTools();
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

    // System Tools Toggle
    const systemToggle = document.getElementById('show-system-tools');
    if (systemToggle) {
        systemToggle.addEventListener('change', async (e) => {
            showSystemTools = e.target.checked;
            renderToolsTable();

            // Save preference
            try {
                await fetch('/api/preferences/set', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: 'show_system_tools',
                        value: showSystemTools
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
                
                <div class="table-responsive" style="overflow-x: auto;">
                    <table class="data-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="text-align: left; border-bottom: 1px solid var(--border); font-size: 0.9em;">
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

    // 1. Filter
    let filtered = allTools.filter(tool => {
        // System Tool Filter
        if (!showSystemTools && tool.is_system) return false;

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
        tbody.innerHTML = '<tr><td colspan="5" class="placeholder-text">No tools match your criteria</td></tr>';
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
                <td colspan="5">
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

function sendMessageOld() {
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

        addMessage('agent_step', data.content, {
            title: data.title,
            agent_name: data.agent_name,
            status: data.status,
            trace_id: data.trace_id
        });
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
        const agentName = metadata.agent_name || 'Agent';
        const status = metadata.status || 'completed';
        const isError = status === 'failed';

        // Use marked.parse for content but ensure it doesn't wrap everything in <p> if it's short
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
        // Support specific nested keys we care about
        if (key === 'package_sort.column') return this.data.package_sort?.column || defaultValue;
        if (key === 'package_sort.direction') return this.data.package_sort?.direction || defaultValue;
        if (key === 'package_filters.status') return this.data.package_filters?.status || defaultValue;
        if (key === 'package_filters.hide_system') return this.data.package_filters?.hide_system || defaultValue;
        if (key === 'package_filters.search') return this.data.package_filters?.search || defaultValue;

        return this.data[key] || defaultValue;
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

    const agentsPanel = document.getElementById('setting-agents-panel');
    if (agentsPanel) {
        const showAgents = prefs.get('ui_toggles.agents_panel', true);
        agentsPanel.checked = showAgents;
        toggleAgentsPanel(showAgents);
    }

    const hideSystem = document.getElementById('setting-hide-system-pkgs');
    if (hideSystem) hideSystem.checked = prefs.get('package_filters.hide_system', false);
}

function toggleAgentsPanel(show) {
    const agentsColumn = document.querySelector('.agents-column');
    const chatLayout = document.querySelector('.four-column-layout');

    if (show) {
        if (agentsColumn) agentsColumn.style.display = 'flex';
        if (chatLayout) chatLayout.style.gridTemplateColumns = '15% 20% 45% 20%';
    } else {
        if (agentsColumn) agentsColumn.style.display = 'none';
        if (chatLayout) chatLayout.style.gridTemplateColumns = '15% 20% 65% 0'; // Expand chat
    }
}

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

    const agentsPanel = document.getElementById('setting-agents-panel');
    if (agentsPanel) {
        agentsPanel.addEventListener('change', (e) => {
            const checked = e.target.checked;
            savePreference('ui_toggles.agents_panel', checked);
            toggleAgentsPanel(checked);
        });
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
                // Trigger change to update table
                mainToggle.dispatchEvent(new Event('change'));
            } else {
                // If main toggle not present (e.g. looking at settings tab), manually trigger reload
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

