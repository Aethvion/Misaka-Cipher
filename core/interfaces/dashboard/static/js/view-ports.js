/**
 * Port Manager Dashboard View Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // Only init if the port manager panel exists (it should)
    const portsPanel = document.getElementById('ports-panel');
    if (!portsPanel) return;

    const refreshBtn = document.getElementById('refresh-ports-btn');
    const tbody = document.getElementById('ports-tbody');
    const countBadge = document.getElementById('ports-count-badge');

    async function fetchPorts() {
        try {
            refreshBtn.classList.add('loading');
            refreshBtn.innerHTML = '<span class="icon spinner"></span> Refreshing...';
            
            const response = await fetch('/api/system/ports');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const portsData = await response.json();
            renderPortsTable(portsData);
        } catch (error) {
            console.error('Error fetching registered ports:', error);
            tbody.innerHTML = `<tr><td colspan="3" class="error-msg">Failed to load port data. Is the server running?</td></tr>`;
            countBadge.textContent = 'Error';
            countBadge.className = 'badge danger';
        } finally {
            refreshBtn.classList.remove('loading');
            refreshBtn.innerHTML = '<span class="icon">🔄</span> Refresh';
        }
    }

    function renderPortsTable(portsData) {
        tbody.innerHTML = '';
        const entries = Object.entries(portsData);
        
        if (entries.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="empty-msg">No dynamic ports currently registered.</td></tr>`;
            countBadge.textContent = '0 Active';
            countBadge.className = 'badge warning';
            return;
        }

        // Sort by port number ascending
        entries.sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
        
        let rowHtml = '';
        for (const [port, moduleName] of entries) {
            rowHtml += `
            <tr>
                <td style="font-weight: bold; color: var(--text-primary);">${escapeHtml(moduleName)}</td>
                <td style="font-family: monospace; color: var(--accent-light);">:${port}</td>
                <td>
                    <a href="http://localhost:${port}" target="_blank" class="action-btn subtle small-btn">
                        Open <span class="icon">↗</span>
                    </a>
                </td>
            </tr>`;
        }
        
        tbody.innerHTML = rowHtml;
        countBadge.textContent = `${entries.length} Active`;
        countBadge.className = 'badge success';
    }

    // Utility to prevent XSS
    function escapeHtml(unsafe) {
        return (unsafe || '').toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Auto-refresh when the tab is clicked or manual refresh
    refreshBtn.addEventListener('click', fetchPorts);
    
    // Listen to tab changes globally to fetch data when opened
    document.querySelectorAll('.main-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.maintab === 'ports') {
                fetchPorts();
            }
        });
    });

    // Initial fetch
    fetchPorts();
});
