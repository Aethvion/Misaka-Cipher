/**
 * Misaka Cipher Companion - Refined Frontend Logic v2.1
 */

let misakaChatHistory = [];
const MISAKA_MAX_HISTORY = 6;
let isMisakaTyping = false;

async function initializeMisakaCipher() {
    console.log("Initializing Misaka Cipher Companion...");

    const chatMessages = document.getElementById('misaka-chat-messages');
    const chatInput = document.getElementById('misaka-chat-input');
    const sendBtn = document.getElementById('send-misaka-msg');

    if (!chatMessages || !chatInput || !sendBtn) return;

    // Load expressions
    await loadExpressions();

    // Load Memory
    await refreshMisakaMemory();

    // Event Listeners
    sendBtn.onclick = () => sendMisakaMessage();
    chatInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMisakaMessage();
        }
    };
}

async function loadExpressions() {
    try {
        const response = await fetch('/api/misakacipher/expressions');
        const expressions = await response.json();
    } catch (e) {
        console.error("Error loading expressions:", e);
    }
}

async function refreshMisakaMemory() {
    try {
        const response = await fetch('/api/misakacipher/memory');
        const data = await response.json();

        const baseViewer = document.getElementById('misaka-base-info-viewer');
        const dynamicViewer = document.getElementById('misaka-dynamic-memory-viewer');

        if (baseViewer) baseViewer.textContent = JSON.stringify(data.base_info, null, 4);
        if (dynamicViewer) dynamicViewer.textContent = JSON.stringify(data.memory, null, 4);
    } catch (e) {
        console.error("Error refreshing Misaka memory:", e);
    }
}

async function sendMisakaMessage() {
    if (isMisakaTyping) return;

    const chatInput = document.getElementById('misaka-chat-input');
    const text = chatInput.value.trim();
    if (!text) return;

    // 1. UI: Add User Message
    addMisakaMessage('user', text);
    chatInput.value = '';

    // 2. Prepare Payload
    const payload = {
        message: text,
        history: misakaChatHistory
    };

    // 3. UI: Loading State
    const statusLine = document.getElementById('misaka-status-line');
    if (statusLine) statusLine.textContent = "Processing neural paths...";

    try {
        const response = await fetch('/api/misakacipher/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "API Error");
        }

        const data = await response.json();

        // 4. Update History
        misakaChatHistory.push({ role: 'user', content: text });
        misakaChatHistory.push({ role: 'assistant', content: data.response });

        if (misakaChatHistory.length > MISAKA_MAX_HISTORY) {
            misakaChatHistory = misakaChatHistory.slice(-MISAKA_MAX_HISTORY);
        }

        // 5. UI: Add Assistant Message with Typing Animation (Handles in-context expressions)
        await addAssistantMessageTyped(data.response);

        // 6. UI: Update Memory if needed
        if (data.memory_updated) {
            await refreshMisakaMemory();
            if (statusLine) statusLine.textContent = "Memory synchronized.";
            setTimeout(() => {
                if (statusLine) statusLine.textContent = "Neural core engaged.";
            }, 3000);
        } else {
            if (statusLine) statusLine.textContent = "Neural core engaged.";
        }

    } catch (e) {
        console.error("Chat Error:", e);
        addMisakaMessage('assistant', "I encountered a neural desync. Please try again.");
    }
}

function renderMarkdown(text) {
    if (typeof marked !== 'undefined') {
        if (typeof marked.parse === 'function') return marked.parse(text);
        if (typeof marked === 'function') return marked(text);
    }
    return text.replace(/\n/g, '<br>'); // Simple fallback
}

function addMisakaMessage(role, text) {
    const container = document.getElementById('misaka-chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `chat-message ${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    if (role === 'assistant') {
        const cleanText = text.replace(/<memory_update>[\s\S]*?<\/memory_update>/gi, '')
            .replace(/\[Emotion:\s*\w+\]/gi, '').trim();
        bubble.innerHTML = renderMarkdown(cleanText);
    } else {
        bubble.textContent = text;
    }

    div.appendChild(bubble);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

/**
 * Strips metadata and handles in-context expressions.
 */
async function addAssistantMessageTyped(fullText) {
    const container = document.getElementById('misaka-chat-messages');
    if (!container) return;

    isMisakaTyping = true;

    const div = document.createElement('div');
    div.className = 'chat-message assistant';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble typing-glow';
    div.appendChild(bubble);
    container.appendChild(div);

    // 1. Strip memory updates first
    let remainingText = fullText.replace(/<memory_update>[\s\S]*?<\/memory_update>/gi, '').trim();

    // 2. Parse triggers and compute clean text
    let triggers = [];
    const emotionRegex = /\[Emotion:\s*(\w+)\]/gi;
    let match;
    let cleanText = "";
    let lastIndex = 0;

    while ((match = emotionRegex.exec(remainingText)) !== null) {
        cleanText += remainingText.substring(lastIndex, match.index);
        triggers.push({
            pos: cleanText.length,
            emotion: match[1].toLowerCase()
        });
        lastIndex = emotionRegex.lastIndex;
    }
    cleanText += remainingText.substring(lastIndex);

    // 3. Fetch current speed preference
    let speed = 20;
    try {
        const res = await fetch('/api/preferences');
        if (res.ok) {
            const prefs = await res.json();
            if (prefs.misakacipher && prefs.misakacipher.typing_speed !== undefined) {
                speed = prefs.misakacipher.typing_speed;
            }
        }
    } catch (e) {
        console.warn("Could not fetch typing speed, using default.");
    }

    const delay = Math.max(5, 100 - speed);

    if (speed >= 98) {
        // Final expression if any
        if (triggers.length > 0) updateMisakaExpression(triggers[triggers.length - 1].emotion);
        bubble.innerHTML = renderMarkdown(cleanText);
        container.scrollTop = container.scrollHeight;
        isMisakaTyping = false;
        return;
    }

    // 4. Typing Loop
    let currentVisibleText = "";
    const characters = Array.from(cleanText); // Handle emojis etc
    let triggerIdx = 0;

    for (let i = 0; i < characters.length; i++) {
        // Check for expression trigger at this EXACT point
        while (triggerIdx < triggers.length && triggers[triggerIdx].pos <= i) {
            updateMisakaExpression(triggers[triggerIdx].emotion);
            triggerIdx++;
        }

        currentVisibleText += characters[i];

        // Render Markdown
        bubble.innerHTML = renderMarkdown(currentVisibleText);

        // Auto-scroll
        container.scrollTop = container.scrollHeight;

        await new Promise(r => setTimeout(r, delay));
    }

    // Final check for any trailing triggers
    while (triggerIdx < triggers.length) {
        updateMisakaExpression(triggers[triggerIdx].emotion);
        triggerIdx++;
    }

    bubble.innerHTML = renderMarkdown(cleanText);
    bubble.classList.remove('typing-glow');
    container.scrollTop = container.scrollHeight;

    isMisakaTyping = false;
}

function updateMisakaExpression(expression) {
    const img = document.getElementById('misaka-expression-img');
    if (!img) return;

    const path = `/static/misakacipher/expressions/misakacipher_${expression}.png`;

    const tempImg = new Image();
    tempImg.onload = () => {
        img.src = path;
        // Pulse effect removed per user request
    };
    tempImg.onerror = () => {
        img.src = "/static/misakacipher/expressions/misakacipher_default.png";
    };
    tempImg.src = path;
}

window.initializeMisakaCipher = initializeMisakaCipher;
