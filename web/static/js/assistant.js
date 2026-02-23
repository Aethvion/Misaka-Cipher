/**
 * Misaka Cipher Personal Assistant logic
 */

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('misaka-assistant-container');
    const avatar = document.getElementById('misaka-avatar');
    const imgBubble = document.getElementById('misaka-img');
    const imgDialog = document.getElementById('misaka-img-dialog');
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
    let currentEmotion = 'default';

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
        chatWindow.classList.remove('collapsed');
        avatar.classList.add('hidden');
        input.focus();
        scrollToBottom();
    });

    closeBtn.addEventListener('click', () => {
        chatWindow.classList.add('collapsed');
        avatar.classList.remove('hidden');
    });

    // Set Emotion Image
    function setEmotion(emotion) {
        currentEmotion = emotion;
        const url = `/static/images/misakacipher/misakacipher_${emotion}.png`;
        if (imgBubble) imgBubble.src = url;
        if (imgDialog) imgDialog.src = url;
    }

    // Winking Animation
    function triggerWink(duration = 1000) {
        if (imgBubble) imgBubble.src = IMG_WINK;
        if (imgDialog) imgDialog.src = IMG_WINK;
        setTimeout(() => {
            setEmotion(currentEmotion); // Restore current emotion instead of default
        }, duration);
    }

    // Scroll to bottom
    function scrollToBottom() {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    // Add message to UI
    function appendMessage(role, content, asMarkdown = false) {
        const div = document.createElement('div');
        div.className = `misaka-d-message ${role}`;

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

        // Gather current UI context
        let activeTabId = 'unknown';
        let activeTabName = 'Unknown Tab';
        const activePanel = document.querySelector('.main-tab-panel:not([style*="display: none"])');
        if (activePanel) {
            activeTabId = activePanel.id;
            const navBtn = document.querySelector(`.nav-btn.active`);
            if (navBtn) {
                activeTabName = navBtn.textContent.trim();
            }
        }

        try {
            const res = await fetch('/api/assistant/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: messageHistory,
                    ui_context: {
                        active_tab_id: activeTabId,
                        active_tab_name: activeTabName
                    }
                })
            });

            removeTyping();

            if (res.ok) {
                const data = await res.json();
                let responseText = data.response;

                // Parse emotion tag: [Emotion: <emotion>]
                const emotionMatch = responseText.match(/\[Emotion:\s*([a-zA-Z0-9_]+)\]/i);
                if (emotionMatch && emotionMatch[1]) {
                    setEmotion(emotionMatch[1].toLowerCase());
                    // Remove the tag from the text displayed to the user
                    responseText = responseText.replace(emotionMatch[0], '').trim();
                } else {
                    setEmotion('default');
                }

                appendMessage('misaka', responseText, true);
                messageHistory.push({ role: 'assistant', content: responseText }); // Save cleaned text

                // Only wink if she's happy or default so it doesn't look weird when she's angry or crying
                if (currentEmotion === 'default' || currentEmotion.startsWith('happy') || currentEmotion === 'wink') {
                    triggerWink(1500);
                }
            } else {
                const err = await res.json();
                appendMessage('system', `Error: ${err.detail || 'Failed to connect.'}`);
                setEmotion('error');
                // Don't save failed attempts to context
                messageHistory.pop();
            }

        } catch (error) {
            console.error("Assistant chat error:", error);
            removeTyping();
            appendMessage('system', 'Connection error. Is the server running?');
            setEmotion('error');
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
                avatar.classList.remove('hidden');
            }
        }
    });

    // Initialize
    loadAssistantSettings();
});
