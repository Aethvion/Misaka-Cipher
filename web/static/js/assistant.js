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
    let typingSpeed = 20; // Default typing speed
    let contextHistoryLimit = 5; // Default pairs
    let messageHistory = [];
    let currentEmotion = 'default';

    // Load initial settings
    async function loadAssistantSettings() {
        try {
            const res = await fetch('/api/preferences/get?key=assistant');
            if (res.ok) {
                const data = await res.json();
                if (data.value) {
                    isAssistantEnabled = data.value.enabled !== undefined ? data.value.enabled : true;
                    typingSpeed = data.value.typing_speed !== undefined ? data.value.typing_speed : 20;
                    contextHistoryLimit = data.value.context_limit !== undefined ? data.value.context_limit : 5;
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

    // Add typing effect message
    function typeMessage(role, content, asMarkdown = false, finalEmotion = 'default') {
        const div = document.createElement('div');
        div.className = `misaka-d-message ${role}`;
        messagesArea.appendChild(div);
        scrollToBottom();

        // Apply target emotion immediately so it shows before typing begins
        setEmotion(finalEmotion);

        if (typingSpeed <= 0) {
            setEmotion(finalEmotion);
            if (asMarkdown && typeof marked !== 'undefined') {
                div.innerHTML = marked.parse(content);
            } else {
                div.textContent = content;
            }
            if (asMarkdown && typeof hljs !== 'undefined') {
                div.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
            }
            if (finalEmotion === 'default' || finalEmotion.startsWith('happy') || finalEmotion === 'wink') {
                triggerWink(1500);
            }
            scrollToBottom();
            return Promise.resolve();
        }

        // Typing animation
        const isNegative = ['angry', 'crying', 'pout', 'error', 'exhausted'].includes(finalEmotion);
        let talkingFaces = ['default', 'happy_closedeyes_smilewithteeth', 'happy_closedeyes_widesmile', 'thinking', 'wink'];

        // If a specific positive/neutral emotion is requested, weight it heavily in the talking animation
        if (!isNegative && finalEmotion !== 'default') {
            talkingFaces = [finalEmotion, finalEmotion, finalEmotion, 'happy_closedeyes_smilewithteeth', 'happy_closedeyes_widesmile'];
        }

        // Parse the Markdown to HTML *before* typing so we don't expose raw markdown syntax
        let parsedHTML = content;
        if (asMarkdown && typeof marked !== 'undefined') {
            parsedHTML = marked.parse(content);
        }

        let charIndex = 0;

        return new Promise(resolve => {
            const typeInterval = setInterval(() => {
                if (charIndex >= parsedHTML.length) {
                    clearInterval(typeInterval);
                    setEmotion(finalEmotion);

                    div.innerHTML = parsedHTML;

                    if (asMarkdown && typeof hljs !== 'undefined') {
                        div.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
                    }

                    if (!isNegative && (finalEmotion === 'default' || finalEmotion.startsWith('happy') || finalEmotion === 'wink')) {
                        triggerWink(1500);
                    }

                    scrollToBottom();
                    resolve();
                    return;
                }

                // Instantly advance past HTML tags so they are rendered as markup, not typed text
                if (parsedHTML[charIndex] === '<') {
                    while (charIndex < parsedHTML.length && parsedHTML[charIndex] !== '>') {
                        charIndex++;
                    }
                }
                charIndex++;

                div.innerHTML = parsedHTML.substring(0, charIndex);
                scrollToBottom();

                // Calculate expression change interval based on message length (aim for 2-4 changes usually, max 6)
                const numChanges = content.length < 50 ? 2 : content.length < 200 ? 3 : content.length < 500 ? 4 : 6;
                const expressionInterval = Math.max(10, Math.floor(content.length / numChanges));

                // Dynamic facial expressions while typing based on text length
                if (charIndex % expressionInterval === 0 && charIndex < content.length - 5) {
                    if (!isNegative) {
                        let randomFace = talkingFaces[Math.floor(Math.random() * talkingFaces.length)];
                        // Avoid picking the exact same face twice in a row to ensure visible movement
                        while (randomFace === currentEmotion && talkingFaces.length > 1) {
                            randomFace = talkingFaces[Math.floor(Math.random() * talkingFaces.length)];
                        }
                        setEmotion(randomFace);
                    } else {
                        setEmotion(charIndex % (expressionInterval * 2) === 0 ? 'pout' : finalEmotion);
                    }
                }

            }, typingSpeed);
        });
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

        // Keep history reasonably short to save tokens (e.g. 5 pairs = 10 messages)
        const maxMessages = contextHistoryLimit * 2;
        if (messageHistory.length > maxMessages) {
            messageHistory = messageHistory.slice(-maxMessages);
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
                let targetEmotion = 'default';
                // Globally replace ALL emotion tags so they don't leak into the typed response
                const emotionRegex = /\[Emotion:\s*([a-zA-Z0-9_]+)\]/ig;
                let match;
                while ((match = emotionRegex.exec(responseText)) !== null) {
                    targetEmotion = match[1].toLowerCase(); // capture the very last emotion tag specified
                }
                // Strip all tags out
                responseText = responseText.replace(/\[Emotion:\s*[a-zA-Z0-9_]+\]/ig, '').trim();

                messageHistory.push({ role: 'assistant', content: responseText }); // Save cleaned text
                await typeMessage('misaka', responseText, true, targetEmotion);
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
        if (e.detail) {
            if (e.detail.enabled !== undefined) {
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
            if (e.detail.typing_speed !== undefined) {
                typingSpeed = e.detail.typing_speed;
            }
            if (e.detail.context_limit !== undefined) {
                contextHistoryLimit = e.detail.context_limit;
            }
        }
    });

    // Initialize
    loadAssistantSettings();
});
