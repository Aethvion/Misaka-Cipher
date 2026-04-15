/**
 * Aethvion Suite - System Log Explorer
 * Dynamic log browsing and forensic analysis view for suite-wide monitoring.
 */

(function() {
    const ViewLogs = {
        init() {
            console.log('[ViewLogs] Initializing...');
            this.bindEvents();
            this.loadLogList();
        },

        bindEvents() {
            const refreshBtn = document.getElementById('refresh-logs');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    refreshBtn.querySelector('i').classList.add('fa-spin');
                    this.loadLogList().finally(() => {
                        setTimeout(() => refreshBtn.querySelector('i').classList.remove('fa-spin'), 600);
                        window.showToast('Log list refreshed.', 'success');
                    });
                });
            }
        },

        async loadLogList() {
            const listContainer = document.getElementById('log-file-list');
            if (!listContainer) return;

            try {
                const res = await fetch('/api/logs/list');
                const data = await res.json();
                
                if (!data.logs || data.logs.length === 0) {
                    listContainer.innerHTML = '<div class="log-empty-state">No log files found in data/logs/system</div>';
                    return;
                }

                listContainer.innerHTML = '';
                data.logs.forEach(log => {
                    const item = document.createElement('div');
                    item.className = 'log-file-item';
                    item.dataset.filename = log.name;
                    
                    const sizeKB = (log.size / 1024).toFixed(1);
                    
                    item.innerHTML = `
                        <div class="log-file-name">${log.name}</div>
                        <div class="log-file-info">
                            <span class="log-file-meta">${log.modified_pretty}</span>
                            <span class="log-file-meta">${sizeKB} KB</span>
                        </div>
                    `;
                    
                    item.addEventListener('click', () => this.selectLog(item, log.name));
                    listContainer.appendChild(item);
                });
            } catch (e) {
                console.error('[ViewLogs] Failed to load log list:', e);
                listContainer.innerHTML = '<div class="log-empty-state" style="color:var(--status-error);">Failed to load registry</div>';
            }
        },

        async selectLog(itemElement, filename) {
            // UI State
            document.querySelectorAll('.log-file-item').forEach(i => i.classList.remove('active'));
            itemElement.classList.add('active');
            
            const overlay = document.getElementById('log-empty-overlay');
            const header = document.getElementById('log-viewer-header');
            const contentArea = document.getElementById('log-content-area');
            const title = document.getElementById('active-log-title');

            if (overlay) overlay.style.display = 'none';
            if (header) header.style.display = 'flex';
            if (title) title.textContent = filename;
            
            contentArea.innerHTML = '<div class="partial-loading"><i class="fas fa-spinner fa-spin"></i> Reading log forensic data...</div>';

            try {
                const res = await fetch(`/api/logs/read/${filename}`);
                if (!res.ok) throw new Error('Failed to read log file');
                
                const data = await res.json();
                
                // Security: replace < and > for HTML safety if needed, 
                // but we trust our internal logs for now.
                contentArea.textContent = data.content;
                
                // Auto-scroll to bottom of log
                contentArea.scrollTop = contentArea.scrollHeight;
                
            } catch (e) {
                console.error('[ViewLogs] Failed to read log:', e);
                contentArea.innerHTML = `<div style="color:var(--status-error); padding: 1rem;">Error: ${e.message}</div>`;
            }
        }
    };

    // Integration with Aethvion Universal Tab System
    document.addEventListener('panelLoaded', (e) => {
        if (e.detail.tabName === 'logs') ViewLogs.init();
    });

    window.ViewLogs = ViewLogs;
})();
