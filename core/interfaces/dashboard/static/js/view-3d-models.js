/**
 * Aethvion Suite — 3D Models View
 * 
 * Handles search, filtering, and interaction for 3D generation models.
 */

(function () {
    'use strict';

    const View3DModels = {
        init() {
            console.log('[View3DModels] Initializing...');
            this.bindEvents();
            this.updateStatus();
            this.checkInstallStatus('trellis-2');
        },

        bindEvents() {
            // Search filtering (if still applicable)
            const searchInput = document.getElementById('td-model-search');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => this.filterModels(e.target.value));
            }

            // Refresh button
            const refreshBtn = document.getElementById('refresh-3d-models');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    this.refresh();
                });
            }

            // Trellis Actions
            const btnInstallTrellis = document.getElementById('btn-install-trellis');
            const btnInstallWeights = document.getElementById('btn-install-trellis-weights');
            const btnRunTrellis = document.getElementById('btn-run-trellis');

            if (btnInstallTrellis) {
                btnInstallTrellis.addEventListener('click', () => this.installModel('trellis-2'));
            }

            if (btnInstallWeights) {
                btnInstallWeights.addEventListener('click', () => this.installWeights('trellis-2'));
            }

            if (btnRunTrellis) {
                btnRunTrellis.addEventListener('click', () => this.handleRunModel('trellis-2'));
            }
        },

        filterModels(query) {
            const q = query.toLowerCase();
            document.querySelectorAll('.td-gen-card').forEach(card => {
                const name = card.querySelector('.td-gen-name').textContent.toLowerCase();
                const desc = card.querySelector('.td-gen-desc').textContent.toLowerCase();
                const visible = name.includes(q) || desc.includes(q);
                card.style.display = visible ? 'flex' : 'none';
            });
        },

        async updateStatus() {
            const statusText = document.getElementById('td-engine-status');
            if (!statusText) return;

            try {
                // Check overall 3D engine status via backend
                const res = await fetch('/api/3d/status');
                if (res.ok) {
                    statusText.textContent = '3D Hub Active';
                } else {
                    throw new Error('Status failed');
                }
            } catch (e) {
                statusText.textContent = '3D Hub Offline';
                statusText.parentElement.querySelector('.td-status-dot').style.background = 'var(--error)';
            }
        },
        
        async checkInstallStatus(modelId) {
            const btnInstall = document.getElementById(`btn-install-trellis`);
            const btnWeights = document.getElementById(`btn-install-trellis-weights`);
            const btnRun = document.getElementById(`btn-run-trellis`);
            
            if (!btnInstall || !btnWeights || !btnRun) return;

            try {
                const res = await fetch(`/api/3d/install_status/${modelId}`);
                if (!res.ok) throw new Error('Status check failed');
                
                const data = await res.json();
                
                // data now expected: { installed: bool, weights_installed: bool }
                btnInstall.style.display = data.installed ? 'none' : 'block';
                
                if (data.installed) {
                    btnWeights.style.display = data.weights_installed ? 'none' : 'block';
                    btnRun.style.display = data.weights_installed ? 'block' : 'none';
                } else {
                    btnWeights.style.display = 'none';
                    btnRun.style.display = 'none';
                }
            } catch (e) {
                console.error(`[View3DModels] Failed to load install status for ${modelId}:`, e);
            }
        },

        async installWeights(modelId) {
            const btnWeights = document.getElementById(`btn-install-trellis-weights`);
            const progress = document.getElementById('trellis-install-progress');
            const terminalContainer = document.getElementById('trellis-install-log-container');
            const terminal = document.getElementById('trellis-install-log');

            if (!btnWeights) return;

            btnWeights.style.display = 'none';
            if (progress) {
                progress.style.display = 'block';
                progress.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading weights (12GB)...';
            }
            if (terminalContainer) terminalContainer.style.display = 'block';
            if (terminal) terminal.textContent = '[System] Initiating HuggingFace weight download...\n';

            try {
                const response = await fetch(`/api/3d/install_weights/${modelId}`, { method: 'POST' });
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const parts = buffer.split('\n\n');
                    buffer = parts.pop();

                    for (const part of parts) {
                        if (part.startsWith('data: ')) {
                            try {
                                const json = JSON.parse(part.substring(6));
                                if (json.line && terminal) {
                                    // Handle carriage returns by splitting/replacing to ensure vertical stacking
                                    const cleanLine = json.line.replace(/\r/g, '\n');
                                    terminal.textContent += cleanLine + '\n';
                                    terminal.scrollTop = terminal.scrollHeight;
                                    
                                    // Try to parse percentage
                                    const procText = document.getElementById('trellis-progress-text');
                                    const procInner = document.getElementById('trellis-progress-inner');
                                    const procPercent = document.getElementById('trellis-progress-percent');
                                    
                                    // Match "X%" pattern
                                    const match = json.line.match(/(\d+)%/);
                                    if (match && procInner && procPercent) {
                                        const p = match[1] + '%';
                                        procInner.style.width = p;
                                        procPercent.textContent = p;
                                    }
                                    if (procText) {
                                        // Update text if it's a "Fetching" or "Downloading" line
                                        if (json.line.includes('Fetching') || json.line.includes('Downloading')) {
                                            const cleanLine = json.line.split('...')[0].trim();
                                            if (cleanLine.length > 5) procText.textContent = cleanLine + '...';
                                        }
                                    }
                                }
                                if (json.done) {
                                    if (json.success) {
                                        window.showToast('Weights installed successfully!', 'success');
                                        this.checkInstallStatus(modelId);
                                    } else {
                                        throw new Error(json.error || 'Weight download failed');
                                    }
                                }
                            } catch (e) { console.warn("SSE parse error", e); }
                        }
                    }
                }
            } catch (e) {
                console.error(`[View3DModels] Installation failed for ${modelId}:`, e);
                window.showToast('Weight download failed: ' + e.message, 'error');
                btnWeights.style.display = 'block';
            } finally {
                if (progress) progress.style.display = 'none';
            }
        },

        async installModel(modelId) {
            const btnInstall = document.getElementById(`btn-install-trellis`);
            const btnRun = document.getElementById(`btn-run-trellis`);
            const progress = document.getElementById('trellis-install-progress');
            const logContainer = document.getElementById('trellis-install-log-container');
            const logElement = document.getElementById('trellis-install-log');
            
            if (btnInstall && progress) {
                btnInstall.style.display = 'none';
                progress.style.display = 'block';
            }
            
            if (logContainer && logElement) {
                logContainer.style.display = 'block';
                logElement.textContent = '';
            }
            
            try {
                const res = await fetch(`/api/3d/install/${modelId}`, {
                    method: 'POST'
                });
                
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const parts = buffer.split('\n\n');
                    buffer = parts.pop();

                    for (const part of parts) {
                        if (!part.startsWith('data: ')) continue;
                        let msg;
                        try { msg = JSON.parse(part.slice(6)); } catch { continue; }

                        if (msg.line !== undefined) {
                            if (logElement) {
                                logElement.textContent += msg.line + '\\n';
                                logElement.scrollTop = logElement.scrollHeight;
                            }
                        } else if (msg.done) {
                            if (msg.success) {
                                window.showToast(`Successfully installed ${modelId}`, 'success');
                                if (progress) progress.style.display = 'none';
                                if (logContainer) logContainer.style.display = 'none';
                                if (btnInstall) btnInstall.style.display = 'none';
                                if (btnRun) btnRun.style.display = 'block';
                            } else {
                                throw new Error(msg.error || 'Installation failed');
                            }
                        }
                    }
                }
            } catch (e) {
                console.error(`[View3DModels] Installation failed for ${modelId}:`, e);
                window.showToast(`Failed to install ${modelId}: ${e.message}`, 'error');
                if (progress) progress.style.display = 'none';
                if (btnInstall) btnInstall.style.display = 'block';
            }
        },

        handleRunModel(modelId) {
            window.showToast(`Loading workspace for ${modelId}...`, 'info');
            
            // Set the model input if the workspace is already loaded
            const select = document.getElementById('tg-model-select');
            if (select) {
                select.value = modelId;
            } else {
                // Wait for the panel to load and then set it
                document.addEventListener('panelLoaded', function autoSelectModel(e) {
                    if (e.detail.tabName === '3d-gen') {
                        setTimeout(() => {
                            const newSelect = document.getElementById('tg-model-select');
                            if (newSelect) newSelect.value = modelId;
                        }, 50);
                        document.removeEventListener('panelLoaded', autoSelectModel);
                    }
                });
            }

            // Switch to the workspace tab
            if (typeof switchMainTab === 'function') {
                switchMainTab('3d-gen');
            } else {
                const sidebarTab = document.querySelector('.main-tab[data-maintab="3d-gen"]');
                if (sidebarTab) sidebarTab.click();
            }
        },

        refresh() {
            const icon = document.querySelector('#refresh-3d-models i');
            if (icon) icon.classList.add('fa-spin');
            
            setTimeout(() => {
                this.checkInstallStatus('trellis-2');
                this.updateStatus();
                if (icon) icon.classList.remove('fa-spin');
                window.showToast('3D Hub refreshed.', 'success');
            }, 800);
        }
    };

    // Initialize when panel is loaded
    document.addEventListener('panelLoaded', (e) => {
        if (e.detail.tabName === '3d-models') {
            View3DModels.init();
        }
    });

    window.View3DModels = View3DModels;

})();
