/**
 * Misaka Cipher Companion - Frontend Logic
 */

let misakaChatHistory = [];
const MISAKA_MAX_HISTORY = 6; // 3 rounds (6 messages)

async function initializeMisakaCipher() {
    console.log("Initializing Misaka Cipher Companion...");

    const chatMessages = document.getElementById('misaka-chat-messages');
    const chatInput = document.getElementById('misaka-chat-input');
    const sendBtn = document.getElementById('send-misaka-msg');

    if (!chatMessages || !chatInput || !sendBtn) return;

    // Load expressions to cache or verify
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
        console.log(`Loaded ${expressions.length} expressions for Misaka.`);
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

        const data = await response.json();

        // 4. Update History
        misakaChatHistory.push({ role: 'user', content: text });
        misakaChatHistory.push({ role: 'assistant', content: data.response });

        // Truncate
        if (misakaChatHistory.length > MISAKA_MAX_HISTORY) {
            misakaChatHistory = misakaChatHistory.slice(-MISAKA_MAX_HISTORY);
        }

        // 5. UI: Add Assistant Message
        addMisakaMessage('assistant', data.response);

        // 6. UI: Update Expression
        updateMisakaExpression(data.expression);

        // 7. UI: Update Memory if needed
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
        updateMisakaExpression('error');
    }
}

function addMisakaMessage(role, text) {
    const container = document.getElementById('misaka-chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `chat-message ${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;

    div.appendChild(bubble);
    container.appendChild(div);

    // Auto-scroll
    container.scrollTop = container.scrollHeight;
}

function updateMisakaExpression(expression) {
    const img = document.getElementById('misaka-expression-img');
    if (!img) return;

    // Construct Path
    // Valid expressions: angry, blushing, bored, crying, default, error, exhausted, happy_closedeyes_smilewithteeth, happy_closedeyes_widesmile, pout, sleeping, surprised, thinking, wink
    const path = `/static/misakacipher/expressions/misakacipher_${expression}.png`;

    // Apply temporary filter for "transition"
    img.style.filter = "brightness(1.5) blur(2px)";

    const tempImg = new Image();
    tempImg.onload = () => {
        img.src = path;
        img.style.filter = "none";
        img.style.transform = "scale(1.05)";
        setTimeout(() => {
            img.style.transform = "scale(1)";
        }, 300);
    };
    tempImg.onerror = () => {
        console.warn(`Expression ${expression} not found, reverting to default.`);
        img.src = "/static/misakacipher/expressions/misakacipher_default.png";
        img.style.filter = "none";
    };
    tempImg.src = path;
}

// Hook into tab switching if needed, but core.js usually handles initialization
window.initializeMisakaCipher = initializeMisakaCipher;
