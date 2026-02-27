// Misaka Cipher - Files View
// Handles interacting with the local workspace files table

let currentFiles = [];
let currentViewMode = 'grid'; // 'grid' or 'list'
let excludeFolders = false;
let currentSort = { key: 'name', dir: 'asc' };

document.addEventListener('DOMContentLoaded', () => {
    // Setup event listeners for the files page
    document.getElementById('refresh-files')?.addEventListener('click', loadFiles);
    document.getElementById('file-search')?.addEventListener('input', renderFiles);
    document.getElementById('type-filter')?.addEventListener('change', renderFiles);

    // New Feature Listeners
    document.getElementById('exclude-folders-toggle')?.addEventListener('change', handleExcludeFoldersChange);
    document.getElementById('sort-filter')?.addEventListener('change', handleSortDropdownChange);

    // View toggles
    document.getElementById('view-grid-btn')?.addEventListener('click', () => setViewMode('grid'));
    document.getElementById('view-list-btn')?.addEventListener('click', () => setViewMode('list'));

    // Load preferences
    loadPreferences();
});

async function loadPreferences() {
    try {
        const response = await fetch('/api/preferences/get?key=files_exclude_folders');
        if (response.ok) {
            const data = await response.json();
            if (data && data.value !== null) {
                excludeFolders = data.value;
                const toggle = document.getElementById('exclude-folders-toggle');
                if (toggle) toggle.checked = excludeFolders;
            }
        }
    } catch (e) { console.error("Could not load preferences", e); }
}

async function handleExcludeFoldersChange(e) {
    excludeFolders = e.target.checked;
    renderFiles();
    try {
        await fetch('/api/preferences/files_exclude_folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'files_exclude_folders', value: excludeFolders })
        });
    } catch (e) { console.error("Could not save preference", e); }
}

function handleSortDropdownChange(e) {
    const val = e.target.value; // e.g., 'name_asc', 'date_desc'
    const parts = val.split('_');
    currentSort = { key: parts[0], dir: parts[1] };
    renderFiles();
}

function handleSortHeaderClick(key) {
    if (currentSort.key === key) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort = { key: key, dir: 'asc' };
    }

    // Sync dropdown if exists
    const dd = document.getElementById('sort-filter');
    if (dd) {
        dd.value = `${currentSort.key}_${currentSort.dir}`;
    }

    renderFiles();
}

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

    // First, Filter
    let filteredFiles = currentFiles.filter(file => {
        if (excludeFolders && file.is_dir) return false;

        const matchesSearch = file.filename.toLowerCase().includes(searchQuery) ||
            file.path.toLowerCase().includes(searchQuery);
        const matchesType = !typeFilter || file.file_type === typeFilter;
        return matchesSearch && matchesType;
    });

    if (filteredFiles.length === 0) {
        container.innerHTML = '<p class="placeholder-text">No files match your filters.</p>';
        return;
    }

    // Second, Sort
    filteredFiles.sort((a, b) => {
        let valA, valB;
        switch (currentSort.key) {
            case 'name':
                valA = a.filename.toLowerCase();
                valB = b.filename.toLowerCase();
                break;
            case 'path':
                valA = a.path.toLowerCase();
                valB = b.path.toLowerCase();
                break;
            case 'size':
                valA = a.is_dir ? -1 : a.size_bytes;
                valB = b.is_dir ? -1 : b.size_bytes;
                break;
            case 'date':
                valA = new Date(a.created_at).getTime();
                valB = new Date(b.created_at).getTime();
                break;
            default:
                valA = a.filename.toLowerCase();
                valB = b.filename.toLowerCase();
        }

        if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    // Render
    if (currentViewMode === 'grid') {
        container.innerHTML = filteredFiles.map(file => `
            <div class="file-card" onclick="openExplorer('${file.path.replace(/'/g, "\\'")}')" title="${file.path}">
                <div class="file-icon">${getFileHTML(file)}</div>
                <div class="file-name">${file.filename}</div>
                <div class="file-meta">
                    <div class="text-truncate" style="max-width: 100%;" title="${file.path}">${file.domain}/${file.path}</div>
                    <div>${file.is_dir ? 'Folder' : formatFileSize(file.size_bytes)}</div>
                    <div>${formatDate(file.created_at)}</div>
                </div>
            </div>
        `).join('');
    } else {
        const getSortIcon = (key) => {
            if (currentSort.key !== key) return '<i class="fas fa-sort"></i>';
            return currentSort.dir === 'asc' ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>';
        };
        const getSortClass = (key) => currentSort.key === key ? 'sortable active-sort' : 'sortable';

        container.innerHTML = `
            <table class="data-table" style="width: 100%;">
                <thead>
                    <tr>
                        <th style="width: 60px; text-align: center;">Icon</th>
                        <th class="${getSortClass('name')}" onclick="handleSortHeaderClick('name')">Name ${getSortIcon('name')}</th>
                        <th class="${getSortClass('path')}" onclick="handleSortHeaderClick('path')">Path ${getSortIcon('path')}</th>
                        <th class="${getSortClass('size')}" onclick="handleSortHeaderClick('size')">Size ${getSortIcon('size')}</th>
                        <th class="${getSortClass('date')}" onclick="handleSortHeaderClick('date')">Date ${getSortIcon('date')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredFiles.map(file => `
                        <tr class="file-list-row" onclick="openExplorer('${file.path.replace(/'/g, "\\'")}')" style="cursor: pointer;">
                            <td style="text-align: center; padding: 4px;">${getFileHTML(file)}</td>
                            <td style="font-weight: 500; color: var(--text-primary);">${file.filename}</td>
                            <td class="text-truncate" style="max-width: 250px; color: var(--text-secondary);" title="${file.domain}/${file.path}">${file.domain}/${file.path}</td>
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

function getFileHTML(file) {
    if (file.is_dir) return '📁';

    // Check if image
    const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    if (imgExts.includes(file.file_type)) {
        // use serve endpoint
        return `<img src="/api/workspace/files/serve?path=${encodeURIComponent(file.path)}" alt="${file.filename}" class="image-preview" loading="lazy" />`;
    }

    const icons = {
        'pdf': '📄',
        'txt': '📝',
        'csv': '📊',
        'json': '🔧',
        'markdown': '📝',
        'md': '📝',
        'html': '🌐',
        'mp3': '🎵',
        'wav': '🎵',
        'py': '🐍',
        'js': '📜'
    };
    return icons[file.file_type] || '📄';
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
