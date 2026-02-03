// Misaka Cipher - Nexus Portal - Frontend JavaScript

// ===== CONFIGURATION =====
const WS_URL = `ws://${window.location.host}`;
const API_URL = '/api';

// ===== STATE =====
let chatSocket = null;
let logsSocket = null;
let agentsSocket = null;
let currentTraceId = null;
let isRecording = false;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initializeWebSockets();
    initializeEventListeners();
    updateStatus('online');
});

// ===== WEBSOCKET MANAGEMENT =====
function initializeWebSockets() {
    // Chat WebSocket
    chatSocket = new WebSocket(`${WS_URL}/ws/chat`);

    chatSocket.onopen = () => {
        console.log('Chat WebSocket connected');
        updateStatus('online');
    };

    chatSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleChatMessage(data);
    };

    chatSocket.onerror = () => {
        console.error('Chat WebSocket error');
        updateStatus('offline');
    };

    chatSocket.onclose = () => {
        console.log('Chat WebSocket disconnected');
        updateStatus('offline');
        // Reconnect after 3 seconds
        setTimeout(initializeWebSockets, 3000);
    };

    // Logs WebSocket
    logsSocket = new WebSocket(`${WS_URL}/ws/logs`);

    logsSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
            addLogEntry(data);
        }
    };

    // Agents WebSocket
    agentsSocket = new WebSocket(`${WS_URL}/ws/agents`);

    agentsSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'agents_update') {
            updateAgentsPanel(data.agents);
        }
    };
}

function updateStatus(status) {
    const indicator = document.getElementById('status-indicator');
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('.status-text');

    if (status === 'online') {
        dot.classList.remove('offline');
        text.textContent = 'Connected';
    } else {
        dot.classList.add('offline');
        text.textContent = 'Disconnected';
    }
}

// ===== EVENT LISTENERS =====
function initializeEventListeners() {
    // Send message on Enter
    const chatInput = document.getElementById('chat-input');
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Send button
    document.getElementById('send-button').addEventListener('click', sendMessage);

    // Voice button
    document.getElementById('voice-button').addEventListener('click', toggleVoiceRecording);

    // Tab switching
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            switchTab(targetTab);
        });
    });

    // Memory search
    document.getElementById('memory-search-button').addEventListener('click', searchMemory);
    document.getElementById('memory-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchMemory();
        }
    });
}

// ===== CHAT FUNCTIONALITY =====
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message) return;

    // Clear input
    input.value = '';

    // Add user message to chat
    appendChatMessage('user', message);

    // Send via WebSocket (preferred) or REST API (fallback)
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify({ message }));
    } else {
        // Fallback to REST API
        try {
            const response = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            const data = await response.json();
            handleChatMessage({ type: 'response', ...data });
        } catch (error) {
            console.error('Error sending message:', error);
            appendChatMessage('system', 'Error: Could not send message');
        }
    }
}

function handleChatMessage(data) {
    if (data.type === 'response' || data.type === 'chat_response') {
        currentTraceId = data.trace_id;
        appendChatMessage('ai', data.response, data.trace_id, data.actions);
    }
}

function appendChatMessage(role, content, traceId = null, actions = null) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;

    let messageHTML = `<div class="message-content">`;

    if (role === 'user') {
        messageHTML += `<strong>You:</strong> ${escapeHtml(content)}`;
    } else if (role === 'ai') {
        // Parse markdown for AI responses
        messageHTML += `<strong>Misaka:</strong><br>${marked.parse(content)}`;

        if (actions && actions.length > 0) {
            messageHTML += `<br><small style="color: var(--text-secondary);">Actions: ${actions.join(', ')}</small>`;
        }
    } else {
        messageHTML += content;
    }

    messageHTML += `</div>`;

    if (traceId) {
        messageHTML += `<span class="trace-id">Trace: ${traceId}</span>`;
    }

    messageDiv.innerHTML = messageHTML;

    // Syntax highlighting for code blocks
    messageDiv.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ===== VOICE INPUT =====
function toggleVoiceRecording() {
    const button = document.getElementById('voice-button');

    if (isRecording) {
        stopVoiceRecording();
    } else {
        startVoiceRecording();
    }
}

function startVoiceRecording() {
    const button = document.getElementById('voice-button');
    button.classList.add('recording');
    isRecording = true;

    // TODO: Implement actual voice recording
    // For now, show a placeholder
    appendChatMessage('system', 'Voice input not yet implemented. Coming soon!');

    setTimeout(() => {
        stopVoiceRecording();
    }, 3000);
}

function stopVoiceRecording() {
    const button = document.getElementById('voice-button');
    button.classList.remove('recording');
    isRecording = false;
}

// ===== AGENTS PANEL =====
function updateAgentsPanel(agents) {
    const agentsList = document.getElementById('agents-list');

    if (!agents || agents.length === 0) {
        agentsList.innerHTML = '<div class="no-agents">No active agents</div>';
        return;
    }

    agentsList.innerHTML = agents.map(agent => `
        <div class="agent-card">
            <div class="agent-name">${agent.name}</div>
            <div class="agent-status">Status: ${agent.status}</div>
            <div class="agent-status">Trace: ${agent.trace_id}</div>
        </div>
    `).join('');
}

// ===== TABS =====
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });

    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

// ===== MEMORY SEARCH =====
async function searchMemory() {
    const input = document.getElementById('memory-search');
    const query = input.value.trim();

    if (!query) return;

    const resultsContainer = document.getElementById('memory-results');
    resultsContainer.innerHTML = '<p class="placeholder-text">Searching...</p>';

    try {
        const response = await fetch(`${API_URL}/memory/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit: 10 })
        });

        const data = await response.json();

        if (data.results.length === 0) {
            resultsContainer.innerHTML = '<p class="placeholder-text">No memories found</p>';
            return;
        }

        resultsContainer.innerHTML = data.results.map(result => `
            <div class="memory-card">
                <div class="memory-summary">${escapeHtml(result.summary)}</div>
                <div class="memory-meta">
                    <span>Domain: ${result.domain}</span>
                    <span>Type: ${result.event_type}</span>
                    <span>Trace: ${result.trace_id}</span>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Memory search error:', error);
        resultsContainer.innerHTML = '<p class="placeholder-text">Search failed</p>';
    }
}

// ===== LOGS =====
function addLogEntry(log) {
    const logsContainer = document.getElementById('logs-container');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${log.level}`;

    const time = new Date(log.timestamp).toLocaleTimeString();

    logEntry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-level">${log.level.toUpperCase()}</span>
        <span class="log-message">${escapeHtml(log.message)}</span>
    `;

    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;

    // Limit log entries to 100
    while (logsContainer.children.length > 100) {
        logsContainer.removeChild(logsContainer.firstChild);
    }
}

// ===== UTILITY FUNCTIONS =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== SYSTEM STATUS MONITORING =====
async function fetchSystemStatus() {
    try {
        const response = await fetch(`${API_URL}/system/status`);
        const status = await response.json();
        console.log('System status:', status);
    } catch (error) {
        console.error('Status fetch error:', error);
    }
}

// Poll system status every 30 seconds
setInterval(fetchSystemStatus, 30000);
