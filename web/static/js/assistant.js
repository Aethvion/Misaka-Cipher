/**
 * Misaka Cipher Personal Assistant logic
 */

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('misaka-assistant-container');
    const avatar = document.getElementById('misaka-avatar');
    const img = document.getElementById('misaka-img');
    const chatWindow = document.getElementById('misaka-chat-window');
    const closeBtn = document.getElementById('misaka-close-btn');
    const messagesArea = document.getElementById('misaka-messages');
    const input = document.getElementById('misaka-input');
    const sendBtn = document.getElementById('misaka-send-btn');

    const IMG_DEFAULT = '/static/images/misakacipher/misakacipher_default.png';
    const IMG_WINK = '/static/images/misakacipher/misakacipher_wink.png';

    // State
    let isAssistantEnabled = false;
    let messageHistory = [];

    // Load initial settings
    async function loadAssistantSettings() {
        try {
            const res = await fetch('/api/preferences/get?key=assistant');
            if (res.ok) {
                const data = await res.json();
                if (data.value && data.value.enabled !== undefined) {
                    isAssistantEnabled = data.value.enabled;
                } else {
                    isAssistantEnabled = true; // default
                }
            } else {
                isAssistantEnabled = true;
            }
        } catch (e) {
            console.error("Failed to load assistant preferences", e);
            isAssistantEnabled = true;
        }

        if (isAssistantEnabled) {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    }

    // Toggle Chat Window
    avatar.addEventListener('click', () => {
        chatWindow.classList.toggle('collapsed');
        if (!chatWindow.classList.contains('collapsed')) {
            input.focus();
            scrollToBottom();
        }
    });

    closeBtn.addEventListener('click', () => {
        chatWindow.classList.add('collapsed');
    });

    // Winking Animation
    function triggerWink(duration = 1000) {
        img.src = IMG_WINK;
        setTimeout(() => {
            img.src = IMG_DEFAULT;
        }, duration);
    }

    // Scroll to bottom
    function scrollToBottom() {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    // Add message to UI
    function appendMessage(role, content, asMarkdown = false) {
        const div = document.createElement('div');
        div.className = `misaka-message ${role}`;

        if (asMarkdown && typeof marked !== 'undefined') {
            div.innerHTML = marked.parse(content);
        } else {
            div.textContent = content;
        }

        // Target specifically code blocks to highlight them if highlight.js exists
        if (asMarkdown && typeof hljs !== 'undefined') {
            div.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }

        messagesArea.appendChild(div);
        scrollToBottom();
    }

    // Add typing indicator
    function showTyping() {
        const div = document.createElement('div');
        div.id = 'misaka-typing-indicator';
        div.className = 'misaka-typing';
        div.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        messagesArea.appendChild(div);
        scrollToBottom();
    }

    function removeTyping() {
        const indicator = document.getElementById('misaka-typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    // Handle sending message
    async function sendMessage() {
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;

        // User message
        appendMessage('user', text);
        messageHistory.push({ role: 'user', content: text });

        // Keep history reasonably short to save tokens (e.g. last 10 pairs)
        if (messageHistory.length > 20) {
            messageHistory = messageHistory.slice(-20);
        }

        showTyping();

        try {
            const res = await fetch('/api/assistant/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: messageHistory })
            });

            removeTyping();

            if (res.ok) {
                const data = await res.json();
                appendMessage('misaka', data.response, true);
                messageHistory.push({ role: 'assistant', content: data.response });
                triggerWink(1500); // Wink when responding!
            } else {
                const err = await res.json();
                appendMessage('system', `Error: ${err.detail || 'Failed to connect.'}`);
                // Don't save failed attempts to context
                messageHistory.pop();
            }

        } catch (error) {
            console.error("Assistant chat error:", error);
            removeTyping();
            appendMessage('system', 'Connection error. Is the server running?');
            messageHistory.pop();
        }

        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
    }

    // Event Listeners for Input
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Listen for custom events to toggle visibility from settings
    window.addEventListener('assistantSettingsUpdated', (e) => {
        if (e.detail && e.detail.enabled !== undefined) {
            isAssistantEnabled = e.detail.enabled;
            if (isAssistantEnabled) {
                container.classList.remove('hidden');
                triggerWink();
            } else {
                container.classList.add('hidden');
                chatWindow.classList.add('collapsed');
            }
        }
    });

    // Initialize
    loadAssistantSettings();
});
