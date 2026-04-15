/**
 * Aethvion Suite — 3D Models View (Unified Foundry v14.2)
 * 
 * Handles search, filtering, and interaction for 3D generation models.
 */

(function () {
    'use strict';

    const View3DModels = {
        init() {
            this.bindEvents();
            this.updateStatus();
            this.checkInstallStatus('trellis-2');
        },

        bindEvents() {
            const searchInput = document.getElementById('td-model-search');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => this.filterModels(e.target.value));
            }

            const refreshBtn = document.getElementById('refresh-3d-models');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => this.refresh());
            }

            const btnInstallFull = document.getElementById('btn-install-full');
            const btnRunTrellis = document.getElementById('btn-run-trellis');

            if (btnInstallFull) {
                btnInstallFull.addEventListener('click', () => this.handleUnifiedInstall('trellis-2'));
            }

            if (btnRunTrellis) {
                btnRunTrellis.addEventListener('click', () => this.handleRunModel('trellis-2'));
            }
        },

        filterModels(query) {
            const q = query.toLowerCase();
            document.querySelectorAll('.td-gen-card').forEach(card => {
                const name = card.querySelector('.td-gen-name').textContent.toLowerCase();
                const visible = name.includes(q);
                card.style.display = visible ? 'flex' : 'none';
            });
        },

        async updateStatus() {
            const statusText = document.getElementById('td-engine-status');
            if (!statusText) return;
            try {
                const res = await fetch('/api/3d/status');
                if (res.ok) statusText.textContent = '3D Foundry Active';
            } catch (e) {
                statusText.textContent = '3D Hub Offline';
            }
        },
        
        async checkInstallStatus(modelId) {
            const btnInstall = document.getElementById(`btn-install-full`);
            const btnRun = document.getElementById(`btn-run-trellis`);
            
            if (!btnInstall || !btnRun) return;

            try {
                const res = await fetch(`/api/3d/install_status/${modelId}`);
                if (!res.ok) throw new Error('Status check failed');
                
                const data = await res.json();
                
                // Unified check: must be fully installed with weights
                const isFullyReady = data.installed && data.weights_installed;
                
                btnInstall.style.display = isFullyReady ? 'none' : 'block';
                btnRun.style.display = isFullyReady ? 'block' : 'none';
                
            } catch (e) {
                console.error(`[View3DModels] Failed to load install status for ${modelId}:`, e);
            }
        },

        async handleUnifiedInstall(modelId) {
            const btnFull = document.getElementById('btn-install-full');
            const progressContainer = document.getElementById('trellis-install-progress-container');
            const logContainer = document.getElementById('trellis-install-log-container');
            const logElement = document.getElementById('trellis-install-log');

            if (btnFull) btnFull.style.display = 'none';
            if (progressContainer) progressContainer.style.display = 'block';
            if (logContainer) logContainer.style.display = 'block';
            if (logElement) logElement.textContent = '[Foundry] Beginning Unified 3D Deployment...\n';

            try {
                // PHASE 1: Engine & Environment
                const phase1Success = await this.installEnginePhase(modelId);
                if (!phase1Success) return;

                // PHASE 2: Model Weights
                await this.installWeightsPhase(modelId);

            } catch (e) {
                console.error(`[View3DModels] Unified Install Error:`, e);
                window.showToast(`Deployment failed: ${e.message}`, 'error');
                if (btnFull) btnFull.style.display = 'block';
            }
        },

        async installEnginePhase(modelId) {
            const logElement = document.getElementById('trellis-install-log');
            const bar = document.getElementById('engine-bar');
            const percent = document.getElementById('engine-percent');
            const text = document.getElementById('engine-text');

            if (text) text.textContent = '1. Environment & Engine Factory (Active)';
            
            try {
                const res = await fetch(`/api/3d/install/${modelId}`, { method: 'POST' });
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

                        if (msg.line) {
                            logElement.textContent += msg.line + '\n';
                            logElement.scrollTop = logElement.scrollHeight;
                            
                            // Estimate progress based on major milestones in backend logs
                            if (msg.line.includes('environment')) { bar.style.width = '30%'; percent.textContent = '30%'; }
                            if (msg.line.includes('repository')) { bar.style.width = '50%'; percent.textContent = '50%'; }
                            if (msg.line.includes('dependencies')) { bar.style.width = '75%'; percent.textContent = '75%'; }
                        } else if (msg.done) {
                            if (msg.success) {
                                if (bar) bar.style.width = '100%';
                                if (percent) percent.textContent = '100%';
                                if (text) text.textContent = '1. Environment & Engine Factory (Ready)';
                                return true;
                            } else {
                                throw new Error(msg.error || 'Engine setup failed');
                            }
                        }
                    }
                }
            } catch (e) {
                throw e;
            }
        },

        async installWeightsPhase(modelId) {
            const logElement = document.getElementById('trellis-install-log');
            const bar = document.getElementById('weights-bar');
            const percent = document.getElementById('weights-percent');
            const text = document.getElementById('weights-text');
            const weightContainer = document.getElementById('progress-weights');

            if (weightContainer) weightContainer.style.opacity = '1';
            if (text) text.textContent = '2. HuggingFace Model Weights (Active)';

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
                                if (json.line) {
                                    if (json.line.includes('\r')) {
                                        const lines = logElement.textContent.split('\n');
                                        lines[lines.length - 1] = json.line.split('\r').pop();
                                        logElement.textContent = lines.join('\n');
                                    } else {
                                        logElement.textContent += json.line + '\n';
                                    }
                                    logElement.scrollTop = logElement.scrollHeight;
                                    
                                    const matches = json.line.match(/(\d+)%/g);
                                    if (matches && bar && percent) {
                                        const p = matches[matches.length - 1].replace('%', '') + '%';
                                        bar.style.width = p;
                                        percent.textContent = p;
                                    }
                                }
                                if (json.done) {
                                    if (json.success) {
                                        if (bar) bar.style.width = '100%';
                                        if (percent) percent.textContent = '100%';
                                        if (text) text.textContent = '2. HuggingFace Model Weights (Ready)';
                                        
                                        setTimeout(() => {
                                            document.getElementById('trellis-install-progress-container').style.display = 'none';
                                            document.getElementById('trellis-install-log-container').style.display = 'none';
                                            window.showToast('Deployment complete! Foundry is ready.', 'success');
                                            this.checkInstallStatus(modelId);
                                        }, 1500);
                                    } else {
                                        throw new Error(json.error || 'Weight download failed');
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                }
            } catch (e) {
                throw e;
            }
        },

        handleRunModel(modelId) {
            window.showToast(`Warming up foundation weights...`, 'info');
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
                window.showToast('Foundry refreshed.', 'success');
            }, 800);
        }
    };

    document.addEventListener('panelLoaded', (e) => {
        if (e.detail.tabName === '3d-models') View3DModels.init();
    });
    window.View3DModels = View3DModels;
})();
