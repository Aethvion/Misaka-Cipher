// Misaka Cipher - Files View
// Handles interacting with the local workspace files table

let currentFiles = [];
let currentViewMode = 'grid'; // 'grid' or 'list'

document.addEventListener('DOMContentLoaded', () => {
    // Setup event listeners for the files page
    document.getElementById('refresh-files')?.addEventListener('click', loadFiles);
    document.getElementById('file-search')?.addEventListener('input', renderFiles);
    document.getElementById('type-filter')?.addEventListener('change', renderFiles);

    // View toggles
    document.getElementById('view-grid-btn')?.addEventListener('click', () => setViewMode('grid'));
    document.getElementById('view-list-btn')?.addEventListener('click', () => setViewMode('list'));
});

function setViewMode(mode) {
    currentViewMode = mode;

    const gridBtn = document.getElementById('view-grid-btn');
    const listBtn = document.getElementById('view-list-btn');
    const container = document.getElementById('files-grid');

    if (gridBtn && listBtn && container) {
        if (mode === 'grid') {
            gridBtn.classList.add('active');
            listBtn.classList.remove('active');
            container.classList.remove('files-list-view');
            container.classList.add('files-grid-view');
        } else {
            listBtn.classList.add('active');
            gridBtn.classList.remove('active');
            container.classList.remove('files-grid-view');
            container.classList.add('files-list-view');
        }
    }

    renderFiles();
}

async function loadFiles() {
    try {
        const url = '/api/workspace/files';

        const response = await fetch(url);
        const data = await response.json();

        const grid = document.getElementById('files-grid');
        if (!grid) return;

        if (data.count === 0) {
            grid.innerHTML = '<p class="placeholder-text">No files yet. Ask Misaka to create reports, analysis, or other outputs!</p>';
            renderStats({}, 0);
            return;
        }

        currentFiles = data.files || [];

        renderStats(data.stats || {}, data.count || 0);
        renderFiles();

    } catch (error) {
        console.error('Files load error:', error);
        const grid = document.getElementById('files-grid');
        if (grid) {
            grid.innerHTML = '<p class="placeholder-text" style="color: var(--danger);">Error loading files</p>';
        }
    }
}

function renderStats(stats, totalCount) {
    document.getElementById('file-total-count').textContent = `${totalCount} files mapped`;

    const bar = document.getElementById('file-stats-bar');
    const legend = document.getElementById('file-stats-legend');

    if (!bar || !legend) return;

    const colors = {
        'json': '#eab308',
        'txt': '#9ca3af',
        'md': '#3b82f6',
        'markdown': '#3b82f6',
        'csv': '#10b981',
        'pdf': '#ef4444',
        'html': '#f97316',
        'py': '#3b82f6', // Python blue
        'js': '#fbbf24'  // JS yellow
    };

    let barHtml = '';
    let legendHtml = '';

    // Sort stats by percentage descending
    const sortedStats = Object.entries(stats).sort((a, b) => b[1] - a[1]);

    for (const [ext, percentage] of sortedStats) {
        if (percentage > 0) {
            const color = colors[ext] || `hsl(${Math.random() * 360}, 70%, 50%)`;
            barHtml += `<div style="width: ${percentage}%; background-color: ${color};" title="${ext}: ${percentage}%"></div>`;
            legendHtml += `
                <div style="display: flex; align-items: center; gap: 4px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${color};"></div>
                    <span>${ext.toUpperCase()}: ${percentage}%</span>
                </div>
            `;
        }
    }

    bar.innerHTML = barHtml || '<div style="width: 100%; background-color: var(--border);"></div>';
    legend.innerHTML = legendHtml || '<span>No data</span>';
}

function renderFiles() {
    const container = document.getElementById('files-grid');
    if (!container) return;

    if (currentFiles.length === 0) {
        container.innerHTML = '<p class="placeholder-text">No files found.</p>';
        return;
    }

    const searchQuery = (document.getElementById('file-search')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('type-filter')?.value || '';

    let filteredFiles = currentFiles.filter(file => {
        const matchesSearch = file.filename.toLowerCase().includes(searchQuery) ||
            file.path.toLowerCase().includes(searchQuery);
        const matchesType = !typeFilter || file.file_type === typeFilter;
        return matchesSearch && matchesType;
    });

    if (filteredFiles.length === 0) {
        container.innerHTML = '<p class="placeholder-text">No files match your filters.</p>';
        return;
    }

    if (currentViewMode === 'grid') {
        container.innerHTML = filteredFiles.map(file => `
            <div class="file-card" onclick="openExplorer('${file.path}')" title="${file.path}">
                <div class="file-icon">${getFileIcon(file.file_type, file.is_dir)}</div>
                <div class="file-name">${file.filename}</div>
                <div class="file-meta">
                    <div class="text-truncate" style="max-width: 100%;" title="${file.path}">${file.domain}/${file.path}</div>
                    <div>${file.is_dir ? 'Folder' : formatFileSize(file.size_bytes)}</div>
                    <div>${formatDate(file.created_at)}</div>
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = `
            <table class="data-table" style="width: 100%;">
                <thead>
                    <tr>
                        <th style="width: 40px;"></th>
                        <th>Name</th>
                        <th>Path</th>
                        <th>Size</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredFiles.map(file => `
                        <tr class="file-list-row" onclick="openExplorer('${file.path}')" style="cursor: pointer;">
                            <td style="text-align: center;">${getFileIcon(file.file_type, file.is_dir)}</td>
                            <td style="font-weight: 500; color: var(--text-primary);">${file.filename}</td>
                            <td class="text-truncate" style="max-width: 200px; color: var(--text-secondary);" title="${file.domain}/${file.path}">${file.domain}/${file.path}</td>
                            <td style="color: var(--text-secondary);">${file.is_dir ? '--' : formatFileSize(file.size_bytes)}</td>
                            <td style="color: var(--text-secondary);">${formatDate(file.created_at)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
}

async function openExplorer(pathStr) {
    try {
        const response = await fetch('/api/workspace/explorer/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: pathStr })
        });

        if (!response.ok) {
            console.error('Failed to open explorer');
        }
    } catch (e) {
        console.error('Explorer open error:', e);
    }
}

function getFileIcon(type, isDir) {
    if (isDir) return '📁';

    const icons = {
        'pdf': '📄',
        'txt': '📝',
        'csv': '📊',
        'json': '🔧',
        'markdown': '📝',
        'md': '📝',
        'html': '🌐',
        'png': '🖼️',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'mp3': '🎵',
        'wav': '🎵',
        'py': '🐍',
        'js': '📜'
    };
    return icons[type] || '📄';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
