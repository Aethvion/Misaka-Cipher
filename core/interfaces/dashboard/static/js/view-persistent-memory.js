// Aethvion Suite - Persistent Memory View
// Handles management of the cross-thread persistent JSON memory store.

const PersistentMemory = {
    async init() {
        console.log("PersistentMemory: Initializing...");
        await this.load();
        
        // Refresh button
        const refreshBtn = document.getElementById('refresh-persistent-memory-btn');
        if (refreshBtn) {
            refreshBtn.onclick = () => this.load();
        }
    },

    async load() {
        const grid = document.getElementById('persistent-memory-grid');
        if (grid) grid.innerHTML = '<div class="loading-placeholder">Loading topics...</div>';

        try {
            const response = await fetch('/api/memory/persistent');
            if (!response.ok) throw new Error("Failed to load persistent memory");
            const data = await response.json();
            this.render(data);
        } catch (err) {
            console.error("PersistentMemory load error:", err);
            if (grid) grid.innerHTML = `<p class="error-text">Error: ${err.message}</p>`;
        }
    },

    render(memory) {
        const grid = document.getElementById('persistent-memory-grid');
        if (!grid) return;

        const topics = Object.keys(memory).sort();
        if (topics.length === 0) {
            grid.innerHTML = `
                <div class="empty-state-notice" style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px dashed var(--border);">
                    <i class="fas fa-brain" style="font-size: 3rem; opacity: 0.2; margin-bottom: 1rem;"></i>
                    <h3>No persistent insights found</h3>
                    <p style="color: var(--text-secondary);">The AI will populate this as it learns from your conversations.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = topics.map(topic => {
            const data = memory[topic];
            const content = typeof data === 'object' ? (data.content || '') : data;
            const updated = typeof data === 'object' ? data.updated_at : null;
            const safeTopic = topic.replace(/"/g, '&quot;');
            
            return `
                <div class="memory-card" data-topic="${safeTopic}" style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; display: flex; flex-direction: column;">
                    <div class="card-header" style="padding: 1rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.1);">
                        <div>
                            <h4 style="margin: 0; color: var(--primary); font-family: 'Orbitron', sans-serif; font-size: 0.9rem;">${topic}</h4>
                            ${updated ? `<div style="font-size: 0.7rem; color: var(--text-tertiary); margin-top: 4px;">Last updated: ${new Date(updated).toLocaleString()}</div>` : ''}
                        </div>
                        <div class="card-actions">
                            <button class="icon-btn xs-btn edit-btn" onclick="PersistentMemory.editTopic('${safeTopic}')" title="Edit Topic"><i class="fas fa-edit"></i></button>
                            <button class="icon-btn xs-btn danger delete-btn" onclick="PersistentMemory.deleteTopic('${safeTopic}')" title="Delete Topic"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>
                    <div class="card-body" style="padding: 1rem; flex: 1; max-height: 300px; overflow-y: auto; font-size: 0.85rem; line-height: 1.5; color: var(--text-secondary); white-space: pre-wrap;">${content}</div>
                </div>
            `;
        }).join('');
    },

    async deleteTopic(topic) {
        if (!confirm(`Are you sure you want to delete "${topic}"?`)) return;

        try {
            const response = await fetch(`/api/memory/persistent/${encodeURIComponent(topic)}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast(`Deleted topic: ${topic}`, 'info');
                await this.load();
            } else {
                throw new Error("Delete failed");
            }
        } catch (err) {
            showToast("Failed to delete topic: " + err.message, 'error');
        }
    },

    async editTopic(topic) {
        const card = document.querySelector(`.memory-card[data-topic="${topic}"]`);
        if (!card) return;

        const body = card.querySelector('.card-body');
        const currentContent = body.innerText;

        // Replace body with textarea
        body.innerHTML = `
            <textarea style="width: 100%; height: 200px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--primary); border-radius: 4px; padding: 0.5rem; font-family: inherit; font-size: 0.85rem; outline: none; resize: vertical;">${currentContent}</textarea>
        `;

        // Change actions to Save/Cancel
        const actions = card.querySelector('.card-actions');
        const originalHtml = actions.innerHTML;
        actions.innerHTML = `
            <button class="icon-btn xs-btn primary save-btn" onclick="PersistentMemory.saveTopic('${topic.replace(/"/g, '&quot;')}')" title="Save"><i class="fas fa-save"></i></button>
            <button class="icon-btn xs-btn secondary cancel-btn" onclick="PersistentMemory.cancelEdit('${topic.replace(/"/g, '&quot;')}', \`${currentContent.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\`)" title="Cancel"><i class="fas fa-times"></i></button>
        `;
    },

    cancelEdit(topic, content) {
        this.load(); // Quickest way to reset
    },

    async saveTopic(topic) {
        const card = document.querySelector(`.memory-card[data-topic="${topic}"]`);
        if (!card) return;

        const textarea = card.querySelector('textarea');
        const newContent = textarea.value;

        try {
            const response = await fetch('/api/memory/persistent/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic, content: newContent })
            });

            if (response.ok) {
                showToast(`Updated topic: ${topic}`, 'success');
                await this.load();
            } else {
                throw new Error("Update failed");
            }
        } catch (err) {
            showToast("Failed to update topic: " + err.message, 'error');
        }
    }
};

// Hook into the main tabs
document.addEventListener('DOMContentLoaded', () => {
    // We listen for tab switches
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const panel = mutation.target;
                if (panel.id === 'persistent-memory-panel' && panel.style.display !== 'none') {
                    PersistentMemory.init();
                }
            }
        });
    });

    const panel = document.getElementById('persistent-memory-panel');
    if (panel) {
        observer.observe(panel, { attributes: true });
    }
});
