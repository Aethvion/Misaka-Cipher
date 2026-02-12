// ===== THREAD MANAGEMENT =====

let currentThreadId = 'default';
let threads = {};
let threadMessages = {}; // Store messages per thread

// Initialize thread management
function initThreadManagement() {
    // Initialize with default thread
    threads['default'] = {
        id: 'default',
        title: 'Main Thread',
        task_ids: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // Initialize message storage for default thread
    threadMessages['default'] = [];

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

    // Render initial thread list
    renderThreadList();

    // Show initial welcome message
    addMessageToThread('default', 'system', 'Misaka Cipher Nexus Portal initialized. Ask me anything - I\'ll autonomously coordinate agents, forge tools, and query your knowledge base.');
    renderThreadMessages();
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // Initialize message storage for new thread
    threadMessages[threadId] = [];

    renderThreadList();
    switchThread(threadId);
}

// Switch to a different thread
function switchThread(threadId) {
    if (currentThreadId === threadId) return;

    currentThreadId = threadId;

    // Update active thread in UI
    document.querySelectorAll('.thread-item').forEach(item => {
        item.classList.toggle('active', item.dataset.threadId === threadId);
    });

    // Update chat header
    const thread = threads[threadId];
    if (thread) {
        document.getElementById('active-thread-title').textContent = thread.title;
    }

    // Render messages for this thread
    renderThreadMessages();

    // Try to load thread history from server (will gracefully handle 404)
    loadThreadMessages(threadId);
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
        messageContent = `<strong>Misaka:</strong> ${content}`;

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

    // If this is the current thread, render it
    if (threadId === currentThreadId) {
        renderThreadMessages();
    }
}

// Load messages for a thread from server
async function loadThreadMessages(threadId) {
    try {
        const response = await fetch(`/api/tasks/thread/${threadId}`);

        // Handle 404 for local-only threads
        if (response.status === 404) {
            console.log(`Thread ${threadId} not found on server (local-only thread)`);
            return;
        }

        const data = await response.json();

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

    Object.values(threads).forEach(thread => {
        const taskCount = thread.task_ids ? thread.task_ids.length : 0;
        const status = getThreadStatus(thread);

        const threadItem = document.createElement('div');
        threadItem.className = `thread-item ${thread.id === currentThreadId ? 'active' : ''}`;
        threadItem.dataset.threadId = thread.id;

        threadItem.innerHTML = `
            <div class="thread-title">${thread.title}</div>
            <div class="thread-meta">
                <span class="thread-task-count">${taskCount} task${taskCount !== 1 ? 's' : ''}</span>
                <span class="thread-status ${status}">${status}</span>
            </div>
        `;

        threadsList.appendChild(threadItem);
    });
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
                thread_id: messageThreadId
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
