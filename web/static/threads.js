// ===== THREAD MANAGEMENT =====

window.currentThreadId = 'default';
window.threads = {};
let threadMessages = {};
let isSettingsPanelOpen = false; // Store messages per thread

// Initialize thread management
// Initialize thread management
function initThreadManagement() {
    // Start with no selected thread
    currentThreadId = null;

    // Disable input initially
    toggleChatInput(false);

    // Load threads from API
    loadThreads();

    // Set up event listeners
    document.getElementById('new-thread-button').addEventListener('click', createNewThread);



    // Set up thread list click delegation
    document.getElementById('threads-list').addEventListener('click', (e) => {
        const threadItem = e.target.closest('.thread-item');
        if (threadItem) {
            const threadId = threadItem.dataset.threadId;
            switchThread(threadId);
        }
    });

    // Periodically refresh thread status
    setInterval(refreshThreadStatus, 3000);
}

// Load threads from API
async function loadThreads() {
    try {
        const response = await fetch('/api/tasks/threads');
        const data = await response.json();

        // Merge with existing threads (don't overwrite local-only threads like 'default')
        data.threads.forEach(thread => {
            if (!threads[thread.id]) {
                threads[thread.id] = thread;
                threadMessages[thread.id] = []; // Initialize message storage
            } else {
                // Update existing thread data (e.g. mode)
                threads[thread.id].mode = thread.mode;
            }
        });

        renderThreadList();

    } catch (error) {
        console.error('Failed to load threads:', error);
    }
}

// Create new thread
async function createNewThread() {
    const title = prompt('Enter thread title:', `Thread ${Object.keys(threads).length + 1}`);
    if (!title) return;

    const threadId = `thread-${Date.now()}`;

    // Create thread locally
    threads[threadId] = {
        id: threadId,
        title: title,
        task_ids: [],
        settings: { system_terminal_enabled: true },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // Initialize message storage for new thread
    threadMessages[threadId] = [];

    // Create thread on backend immediately so Mode toggles work
    try {
        await fetch('/api/tasks/thread/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                thread_id: threadId,
                title: title
            })
        });
    } catch (e) {
        console.error("Failed to create thread on backend:", e);
    }

    renderThreadList();
    switchThread(threadId);
}

// Switch to a different thread
function switchThread(threadId) {
    if (currentThreadId === threadId) return;

    currentThreadId = threadId;
    isSettingsPanelOpen = false; // Reset settings state for new thread

    // Enable input when thread is selected
    toggleChatInput(true);

    // Update active thread in UI INSTANTLY
    document.querySelectorAll('.thread-item').forEach(item => {
        const isActive = item.dataset.threadId === threadId;
        item.classList.toggle('active', isActive);

        // Handle settings toggle visibility immediately
        const settingsToggle = item.querySelector('.thread-settings-toggle');
        if (settingsToggle) {
            settingsToggle.style.display = isActive ? 'block' : 'none';
            settingsToggle.classList.remove('open'); // Ensure updated toggle is closed
        }

        // Close any open panels
        const settingsPanel = item.querySelector('.thread-settings-panel');
        if (settingsPanel) {
            settingsPanel.style.display = 'none';
        }
    });

    // Update chat header
    const thread = threads[threadId];
    if (thread) {
        document.getElementById('active-thread-title').textContent = thread.title;
    }

    // Render messages for this thread (initially empty)
    renderThreadMessages();

    // Fetch messages from server
    loadThreadMessages(threadId);

    // Update terminal visibility
    if (typeof updateTerminalVisibility === 'function') {
        updateTerminalVisibility();
    }
}

function toggleChatInput(enabled) {
    const input = document.getElementById('chat-input');
    const button = document.getElementById('send-button');

    if (input) {
        input.disabled = !enabled;
        if (button) button.disabled = !enabled;

        if (!enabled) {
            input.placeholder = "Select a thread to start chatting...";
            input.value = '';
            input.style.height = ''; // Reset height
        } else {
            input.placeholder = "Ask me anything... (e.g., 'Analyze TSLA stock outlook')";
        }
    }
}

// Render messages for current thread
function renderThreadMessages() {
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';

    // Get messages for current thread
    const messages = threadMessages[currentThreadId] || [];

    // Render each message
    messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.role}-message`;
        if (msg.taskId) {
            messageDiv.dataset.taskId = msg.taskId;
        }
        messageDiv.innerHTML = msg.html;
        chatMessages.appendChild(messageDiv);
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add message to specific thread
function addMessageToThread(threadId, role, content, taskId = null, taskData = null) {
    // Ensure thread message storage exists
    if (!threadMessages[threadId]) {
        threadMessages[threadId] = [];
    }

    let messageContent = '';

    if (role === 'user') {
        messageContent = `<strong>You:</strong> ${content}`;
    } else if (role === 'assistant') {
        let parsedContent = content;
        try {
            if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
                parsedContent = marked.parse(content);
            } else {
                console.warn("Marked library not loaded, using raw text");
            }
        } catch (e) {
            console.error("Markdown parsing failed:", e);
            parsedContent = content; // Fallback to raw text
        }

        // Wrap in a div to ensure block styles work correctly after the strong tag
        messageContent = `<strong>Misaka:</strong> <div style="display:inline-block; width:100%;">${parsedContent}</div>`;


        // Add expandable task details if available
        if (taskData) {
            messageContent += `
                <div class="task-details" style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">
                    <details>
                        <summary style="cursor: pointer;">Task Details</summary>
                        <div style="margin-top: 0.5rem; padding: 0.5rem; background: var(--bg-primary); border-radius: 4px;">
                            <div><strong>Task ID:</strong> ${taskData.id}</div>
                            <div><strong>Worker:</strong> ${taskData.worker_id || 'N/A'}</div>
                            <div><strong>Duration:</strong> ${taskData.result?.execution_time?.toFixed(2) || 'N/A'}s</div>
                            <div><strong>Actions:</strong> ${taskData.result?.actions_taken?.join(', ') || 'N/A'}</div>
                            ${taskData.result?.tools_forged?.length > 0 ? `<div><strong>Tools Forged:</strong> ${taskData.result.tools_forged.join(', ')}</div>` : ''}
                            ${taskData.result?.agents_spawned?.length > 0 ? `<div><strong>Agents Spawned:</strong> ${taskData.result.agents_spawned.join(', ')}</div>` : ''}
                        </div>
                    </details>
                </div>
            `;
        }
    } else if (role === 'system') {
        messageContent = `<strong>System:</strong> ${content}`;
    } else if (role === 'error') {
        messageContent = `<strong>Error:</strong> ${content}`;
    }

    const html = `<div class="message-content">${messageContent}</div>`;

    // Store message in thread
    threadMessages[threadId].push({
        role: role,
        content: content,
        taskId: taskId,
        taskData: taskData,
        html: html,
        timestamp: new Date().toISOString()
    });

    try {
        // If this is the current thread, render it
        if (threadId === currentThreadId) {
            renderThreadMessages();
        }
    } catch (e) {
        console.error("Error rendering messages:", e);
    }
}

// Load messages for a thread from server
async function loadThreadMessages(threadId) {
    try {
        const response = await fetch(`/api/tasks/thread/${threadId}`);

        // Handle 404 for local-only threads (expected and normal)
        if (response.status === 404) {
            // Silently return - local threads don't exist on backend
            return;
        }

        const data = await response.json();
        console.log(`Loaded messages for ${threadId}:`, data); // Debug logging

        // Clear existing messages for this thread
        threadMessages[threadId] = [];

        // Load tasks and their results
        if (data.tasks && data.tasks.length > 0) {
            data.tasks.forEach(task => {
                // Add user message
                addMessageToThread(threadId, 'user', task.prompt, task.id);

                // Add assistant response if completed
                if (task.status === 'completed' && task.result) {
                    addMessageToThread(threadId, 'assistant', task.result.response, task.id, task);
                } else if (task.status === 'failed') {
                    addMessageToThread(threadId, 'error', `Task failed: ${task.error}`, task.id);
                } else if (task.status === 'running') {
                    addMessageToThread(threadId, 'system', `Task is running... (Worker: ${task.worker_id})`, task.id);
                } else if (task.status === 'queued') {
                    addMessageToThread(threadId, 'system', `Task is queued...`, task.id);
                }
            });
        }

    } catch (error) {
        console.error('Failed to load thread messages:', error);
    }
}

// Render thread list
function renderThreadList() {
    const threadsList = document.getElementById('threads-list');
    threadsList.innerHTML = '';
    const template = document.getElementById('thread-item-template');

    Object.values(threads).forEach(thread => {
        const taskCount = thread.task_ids ? thread.task_ids.length : 0;

        // Clone template
        const clone = template.content.cloneNode(true);
        const threadItem = clone.querySelector('.thread-item');

        // Set ID and Active State
        threadItem.dataset.threadId = thread.id;
        const isActive = (thread.id === currentThreadId);
        if (isActive) threadItem.classList.add('active');

        // Populate Data
        clone.querySelector('.thread-title').textContent = thread.title;

        // Date/Meta
        const date = new Date(thread.updated_at || thread.created_at).toLocaleDateString();
        clone.querySelector('.thread-date').textContent = date;

        // Mode Badge
        const modeBadge = clone.querySelector('.thread-mode-badge');
        if (thread.mode === 'chat_only') {
            modeBadge.style.display = 'inline-block';
        } else {
            modeBadge.style.display = 'none';
        }

        // --- Settings Logic (Vertical Stack Foldout) ---
        const settingsToggle = clone.querySelector('.thread-settings-toggle');
        const settingsPanel = clone.querySelector('.thread-settings-panel');

        // Ensure inline style doesn't block class-based toggling
        settingsPanel.style.display = '';

        // Only show toggle if active
        if (isActive) {
            settingsToggle.style.display = 'block'; // Flex defined in CSS usually, but block works with flex container
            settingsToggle.style.display = 'flex';
        }

        // Toggle Click Handler
        settingsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            // Check based on class since display might vary (flex/block)
            const isOpen = settingsToggle.classList.contains('open');
            if (isOpen) {
                settingsPanel.classList.remove('open');
                settingsToggle.classList.remove('open');
                if (isActive) isSettingsPanelOpen = false;
            } else {
                settingsPanel.classList.add('open');
                settingsToggle.classList.add('open');
                if (isActive) isSettingsPanelOpen = true;
            }
        });

        // Restore State (Persistence across re-renders)
        if (isActive && isSettingsPanelOpen) {
            settingsPanel.classList.add('open');
            settingsToggle.classList.add('open');
        } else {
            settingsPanel.classList.remove('open');
            if (settingsToggle) settingsToggle.classList.remove('open');
        }

        // Initialize Settings Inputs
        const contextSelect = clone.querySelector('select[name="contextMode"]');
        const windowInput = clone.querySelector('.context-window-input');
        const chatOnlyToggle = clone.querySelector('.chat-only-toggle');

        // Context Mode (Dropdown)
        if (contextSelect) {
            contextSelect.value = (thread.settings && thread.settings.context_mode) || 'smart';
            contextSelect.addEventListener('change', () => {
                // Update local state temporarily for responsiveness
                if (!thread.settings) thread.settings = {};
                thread.settings.context_mode = contextSelect.value;
                saveThreadSettings(thread.id)
            });
        }

        // Window Size
        if (windowInput) {
            windowInput.value = (thread.settings && thread.settings.context_window) || 5;
            windowInput.addEventListener('change', () => saveThreadSettings(thread.id));
        }

        // Chat Only Checkbox
        if (chatOnlyToggle) {
            chatOnlyToggle.checked = (thread.mode === 'chat_only');
            chatOnlyToggle.addEventListener('change', (e) => {
                const newMode = e.target.checked ? 'chat_only' : 'auto';
                toggleThreadMode(thread.id, newMode);
            });
        }

        // Terminal Toggle
        const terminalToggle = clone.querySelector('.terminal-toggle');
        if (terminalToggle) {
            // Default to true if not set
            const isEnabled = (thread.settings && thread.settings.system_terminal_enabled !== false);
            terminalToggle.checked = isEnabled;

            terminalToggle.addEventListener('change', (e) => {
                if (!thread.settings) thread.settings = {};
                thread.settings.system_terminal_enabled = e.target.checked;
                saveThreadSettings(thread.id);

                // If active thread, update UI immediately
                if (isActive && typeof updateTerminalVisibility === 'function') {
                    updateTerminalVisibility();
                }
            });
        }

        // Prevent thread switch clicks inside panel
        settingsPanel.addEventListener('click', (e) => e.stopPropagation());

        // Delete Action
        clone.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete thread "${thread.title}"?`)) {
                deleteThread(thread.id);
            }
        });

        threadsList.appendChild(clone);
    });
}


// Delete a thread
async function deleteThread(threadId) {
    // Optimistic UI update
    const threadEl = document.querySelector(`.thread-item[data-thread-id="${threadId}"]`);
    if (threadEl) threadEl.remove();

    // If deleted current thread, switch to default
    if (currentThreadId === threadId) {
        switchThread('default');
    }

    delete threads[threadId];
    delete threadMessages[threadId];

    try {
        await fetch(`/api/tasks/thread/${threadId}`, { method: 'DELETE' });
    } catch (error) {
        console.error('Failed to delete thread:', error);
        alert('Failed to delete thread on server');
        loadThreads(); // Revert on failure
    }
}

// Toggle thread mode
async function toggleThreadMode(threadId, mode) {
    // Optimistic update
    if (threads[threadId]) {
        threads[threadId].mode = mode;
        renderThreadList();
    }

    try {
        await fetch(`/api/tasks/thread/${threadId}/mode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: mode })
        });
    } catch (error) {
        console.error('Failed to update thread mode:', error);
        // Revert
        if (threads[threadId]) {
            threads[threadId].mode = mode === 'chat_only' ? 'auto' : 'chat_only';
            renderThreadList();
        }
    }
}

// Get thread status based on tasks
function getThreadStatus(thread) {
    if (!thread.task_ids || thread.task_ids.length === 0) {
        return 'idle';
    }

    // Check if any tasks are running
    // This will be updated by refreshThreadStatus
    return thread.status || 'idle';
}

// Refresh thread status
async function refreshThreadStatus() {
    try {
        const response = await fetch('/api/tasks/queue/status');
        const data = await response.json();

        // Update thread statuses based on task statuses
        Object.keys(threads).forEach(threadId => {
            const thread = threads[threadId];
            if (!thread.task_ids || thread.task_ids.length === 0) {
                thread.status = 'idle';
                return;
            }

            // Check if any tasks are running
            const hasRunning = thread.task_ids.some(taskId => {
                // This is a simplified check - in reality we'd query task status
                return false; // Will be implemented with proper task tracking
            });

            thread.status = hasRunning ? 'running' : 'completed';
        });

        renderThreadList();

    } catch (error) {
        console.error('Failed to refresh thread status:', error);
    }
}

// Track active tasks by thread
let activeTasksByThread = {};

// Modified sendMessage to use task queue
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message) return;

    // Clear input
    input.value = '';

    // Store which thread this message belongs to
    const messageThreadId = currentThreadId;

    // Add user message to current thread
    addMessageToThread(messageThreadId, 'user', message);

    try {
        // Submit task to queue
        const response = await fetch('/api/tasks/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: message,
                thread_id: messageThreadId,
                thread_title: threads[messageThreadId]?.title // Send title to ensure backend has it
            })
        });

        const data = await response.json();

        // Track which thread this task belongs to
        activeTasksByThread[data.task_id] = messageThreadId;

        // Add system message showing task was queued
        addMessageToThread(messageThreadId, 'system', `Task ${data.task_id} queued. Status: ${data.status}`);

        // Start polling for task completion
        pollTaskStatus(data.task_id, messageThreadId);

    } catch (error) {
        console.error('Failed to submit task:', error);
        addMessageToThread(messageThreadId, 'error', `Failed to submit task: ${error.message}`);
    }
}

// Poll task status until completion
async function pollTaskStatus(taskId, threadId, maxAttempts = 60) {
    let attempts = 0;

    const poll = async () => {
        try {
            const response = await fetch(`/api/tasks/status/${taskId}`);
            const task = await response.json();

            if (task.status === 'completed') {
                // Task completed, add response to the correct thread
                addMessageToThread(threadId, 'assistant', task.result.response, taskId, task);
                delete activeTasksByThread[taskId];
                return;
            } else if (task.status === 'failed') {
                // Task failed
                addMessageToThread(threadId, 'error', `Task failed: ${task.error}`, taskId);
                delete activeTasksByThread[taskId];
                return;
            } else if (task.status === 'running' && attempts % 5 === 0) {
                // Update status every 5 attempts
                updateMessageInThread(threadId, taskId, `Task is running... (Worker: ${task.worker_id})`);
            }

            attempts++;
            if (attempts < maxAttempts) {
                setTimeout(poll, 1000); // Poll every second
            } else {
                addMessageToThread(threadId, 'error', `Task ${taskId} timed out`);
                delete activeTasksByThread[taskId];
            }

        } catch (error) {
            console.error('Failed to poll task status:', error);
        }
    };

    poll();
}

// Update existing message in a specific thread
function updateMessageInThread(threadId, taskId, content) {
    const messages = threadMessages[threadId] || [];
    const messageIndex = messages.findIndex(msg => msg.taskId === taskId);

    if (messageIndex !== -1) {
        messages[messageIndex].content = content;
        messages[messageIndex].html = `<div class="message-content"><strong>System:</strong> ${content}</div>`;

        // Re-render if this is the current thread
        if (threadId === currentThreadId) {
            renderThreadMessages();
        }
    }
}

// Save thread settings (auto-save)
async function saveThreadSettings(threadId) {
    const threadItem = document.querySelector(`.thread-item[data-thread-id="${threadId}"]`);
    if (!threadItem) return;

    // Fixed: Read from select dropdown
    const contextSelect = threadItem.querySelector(`select[name="contextMode"]`);
    let contextMode = 'smart';
    if (contextSelect) {
        contextMode = contextSelect.value;
    }

    // Fallback for radio if select not found (backward compatibility if template mismatch)
    if (!contextSelect) {
        const radioGroup = threadItem.querySelectorAll(`input[name="contextMode-${threadId}"]`);
        for (const radio of radioGroup) {
            if (radio.checked) {
                contextMode = radio.value;
                break;
            }
        }
    }

    const windowInput = threadItem.querySelector('.context-window-input');
    const contextWindow = windowInput ? parseInt(windowInput.value) : 5;

    // Terminal Setting
    const terminalToggle = threadItem.querySelector('.terminal-toggle');
    const terminalEnabled = terminalToggle ? terminalToggle.checked : true;

    // Update local state
    if (threads[threadId]) {
        threads[threadId].settings = {
            context_mode: contextMode,
            context_window: contextWindow,
            system_terminal_enabled: terminalEnabled
        };
    }

    try {
        await fetch(`/api/tasks/thread/${threadId}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: threads[threadId].settings })
        });
        // Silent success
    } catch (e) {
        console.error("Failed to save thread settings:", e);
    }
}
