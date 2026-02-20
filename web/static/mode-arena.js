// Misaka Cipher - LLM Arena Mode
// Handles interactions with the Arena battle UI and leaderboard

let arenaSelectedModels = [];
let arenaAvailableModels = [];

function switchChatArenaMode(mode) {
    // Update dropdown items
    document.querySelectorAll('.tab-dropdown-item').forEach(item => {
        item.classList.toggle('active', item.dataset.subtab === mode);
    });

    // Update dropdown button label
    const btn = document.querySelector('.main-tab-dropdown .main-tab');
    if (btn) {
        const icons = { chat: '💬', agent: '🤖', arena: '⚔️', aiconv: '🎭' };
        const labels = { chat: 'Chat', agent: 'Agent', arena: 'Arena', aiconv: 'AI Conv' };
        btn.innerHTML = `<span class="tab-icon">${icons[mode] || '💬'}</span>${labels[mode] || 'Chat'} <span class="dropdown-arrow">▾</span>`;
    }

    // Switch panel
    if (typeof switchMainTab === 'function') switchMainTab(mode);

    // Re-render thread list to filter by mode
    if (typeof renderThreadList === 'function') {
        renderThreadList();

        // Auto-select first visible thread if current is no longer visible
        if (mode === 'chat' || mode === 'agent') {
            const visibleThreads = document.querySelectorAll('.thread-item');
            const currentThreadId = window.currentThreadId;
            const currentVisible = document.querySelector(`.thread-item[data-thread-id="${currentThreadId}"]`);
            if (!currentVisible && visibleThreads.length > 0) {
                const firstId = visibleThreads[0].dataset.threadId;
                if (typeof switchThread === 'function') switchThread(firstId);
            } else if (visibleThreads.length === 0) {
                // No threads for this mode — clear chat
                window.currentThreadId = null;
                if (typeof toggleChatInput === 'function') toggleChatInput(false);
                const chatMessages = document.getElementById('chat-messages');
                if (chatMessages) chatMessages.innerHTML = '';
                const activeThreadTitle = document.getElementById('active-thread-title');
                if (activeThreadTitle) activeThreadTitle.textContent = 'No threads';
            }
        }
    }
}

function initializeArena() {
    // Send button
    const sendBtn = document.getElementById('arena-send');
    if (sendBtn) {
        sendBtn.addEventListener('click', sendArenaPrompt);
    }

    // Input enter key
    const input = document.getElementById('arena-input');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendArenaPrompt();
            }
        });
        input.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if (this.value === '') this.style.height = '';
        });
    }

    // Clear leaderboard
    const clearBtn = document.getElementById('arena-clear-leaderboard');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearArenaLeaderboard);
    }
}

async function loadArenaModels() {
    try {
        const res = await fetch('/api/registry/models/chat');
        if (!res.ok) return;
        const data = await res.json();
        arenaAvailableModels = data.models || [];

        // Populate add-model dropdown
        const addSelect = document.getElementById('arena-model-add');
        if (addSelect) {
            let html = '<option value="">+ Add Model...</option>';
            for (const m of arenaAvailableModels) {
                const costHint = (m.input_cost_per_1m_tokens || m.output_cost_per_1m_tokens)
                    ? ` ($${m.input_cost_per_1m_tokens}/$${m.output_cost_per_1m_tokens})`
                    : '';
                html += `<option value="${m.id}" title="${m.description || ''}">${m.id}${costHint}</option>`;
            }
            addSelect.innerHTML = html;
        }

        // Pre-populate AI Conv dropdown
        const aiconvSelect = document.getElementById('aiconv-model-add');
        if (aiconvSelect) {
            let html = '<option value="">+ Add Model...</option>';
            for (const m of arenaAvailableModels) {
                const costHint = (m.input_cost_per_1m_tokens || m.output_cost_per_1m_tokens)
                    ? ` ($${m.input_cost_per_1m_tokens}/$${m.output_cost_per_1m_tokens})`
                    : '';
                html += `<option value="${m.id}" title="${m.description || ''}">${m.id}${costHint}</option>`;
            }
            aiconvSelect.innerHTML = html;
        }

        // Populate evaluator dropdown
        const evalSelect = document.getElementById('arena-evaluator');
        if (evalSelect) {
            let html = '<option value="">No Evaluator</option>';
            for (const m of arenaAvailableModels) {
                html += `<option value="${m.id}">${m.id}</option>`;
            }
            evalSelect.innerHTML = html;
        }
    } catch (err) {
        console.error('Failed to load arena models:', err);
    }
}

function renderArenaChips() {
    const container = document.getElementById('arena-model-chips');
    if (!container) return;

    container.innerHTML = arenaSelectedModels.map(id => `
        <span class="arena-chip">
            ${id}
            <span class="chip-remove" onclick="removeArenaModel('${id}')">&times;</span>
        </span>
    `).join('');
}

function removeArenaModel(modelId) {
    arenaSelectedModels = arenaSelectedModels.filter(id => id !== modelId);
    renderArenaChips();
}

async function sendArenaPrompt() {
    const input = document.getElementById('arena-input');
    const prompt = input ? input.value.trim() : '';

    if (!prompt) return;
    if (arenaSelectedModels.length < 2) {
        alert('Please add at least 2 models to the arena.');
        return;
    }

    input.value = '';
    input.style.height = '';

    const evalSelect = document.getElementById('arena-evaluator');
    const evaluatorModelId = evalSelect ? evalSelect.value : '';

    // Show loading
    const responsesDiv = document.getElementById('arena-responses');
    const loadingHtml = `
        <div class="arena-battle-round">
            <div class="arena-prompt-bar"><strong>Prompt:</strong> ${escapeHtml(prompt)}</div>
            <div class="arena-cards-grid">
                ${arenaSelectedModels.map(id => `
                    <div class="arena-response-card">
                        <div class="card-header"><span class="card-model">${id}</span></div>
                        <div class="card-body"><div class="arena-loading"><div class="spinner"></div> Generating...</div></div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Remove placeholder if present
    const placeholder = responsesDiv.querySelector('.arena-placeholder');
    if (placeholder) placeholder.remove();

    responsesDiv.insertAdjacentHTML('beforeend', loadingHtml);
    responsesDiv.scrollTop = responsesDiv.scrollHeight;

    try {
        const res = await fetch('/api/arena/battle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: prompt,
                model_ids: arenaSelectedModels,
                evaluator_model_id: evaluatorModelId || null
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || 'Battle failed');
        }

        // Replace the loading round with actual results
        const lastRound = responsesDiv.querySelector('.arena-battle-round:last-child');
        if (lastRound) {
            const cardsGrid = lastRound.querySelector('.arena-cards-grid');
            cardsGrid.innerHTML = data.responses.map(r => {
                const isWinner = r.model_id === data.winner_id;
                const scoreHtml = r.score !== null && r.score !== undefined
                    ? `<span class="card-score">${r.score}/10</span>`
                    : '';
                const badgeHtml = isWinner ? '<span class="card-badge">🏆 Winner</span>' : '';

                return `
                    <div class="arena-response-card ${isWinner ? 'winner' : ''}">
                        ${badgeHtml}
                        <div class="card-header">
                            <span class="card-model">${r.model_id}</span>
                            ${scoreHtml}
                        </div>
                        <div class="card-body">${escapeHtml(r.response)}</div>
                        <div class="card-provider">via ${r.provider}</div>
                    </div>
                `;
            }).join('');
        }

        // Update leaderboard from response
        if (data.leaderboard) {
            renderArenaLeaderboard(data.leaderboard);
        }

    } catch (err) {
        console.error('Arena battle failed:', err);
        const lastRound = responsesDiv.querySelector('.arena-battle-round:last-child');
        if (lastRound) {
            const cardsGrid = lastRound.querySelector('.arena-cards-grid');
            cardsGrid.innerHTML = `<div class="arena-response-card" style="border-color: var(--error);">
                <div class="card-body" style="color: var(--error);">Battle failed: ${escapeHtml(err.message)}</div>
            </div>`;
        }
    }
}

async function loadArenaLeaderboard() {
    try {
        const res = await fetch('/api/arena/leaderboard');
        const data = await res.json();
        renderArenaLeaderboard(data.models || {});
    } catch (err) {
        console.error('Failed to load leaderboard:', err);
    }
}

function renderArenaLeaderboard(modelsData) {
    const tbody = document.getElementById('arena-leaderboard-body');
    if (!tbody) return;

    const models = Object.entries(modelsData);
    if (!models.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="placeholder-text">No battles yet</td></tr>';
        return;
    }

    // Sort by wins desc, then win rate
    models.sort((a, b) => {
        if (b[1].wins !== a[1].wins) return b[1].wins - a[1].wins;
        const rateA = a[1].battles > 0 ? a[1].wins / a[1].battles : 0;
        const rateB = b[1].battles > 0 ? b[1].wins / b[1].battles : 0;
        return rateB - rateA;
    });

    tbody.innerHTML = models.map(([id, stats], i) => {
        const winRate = stats.battles > 0 ? ((stats.wins / stats.battles) * 100).toFixed(0) : 0;
        const barWidth = Math.min(winRate, 100);
        return `<tr>
            <td style="font-weight:600; color: var(--primary);">${i + 1}</td>
            <td style="font-size:0.78rem; font-family:'Fira Code',monospace;">${id}</td>
            <td style="color: var(--success); font-weight:600;">${stats.wins}</td>
            <td>${stats.battles}</td>
            <td>${winRate}%<span class="win-rate-bar" style="width:${barWidth * 0.5}px;"></span></td>
        </tr>`;
    }).join('');
}

async function clearArenaLeaderboard() {
    if (!confirm('Clear the entire arena leaderboard?')) return;

    try {
        await fetch('/api/arena/leaderboard', { method: 'DELETE' });
        renderArenaLeaderboard({});
    } catch (err) {
        console.error('Failed to clear leaderboard:', err);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
