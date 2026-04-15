/**
 * Aethvion Suite — 3D Models View (Unified Models View v14.2)
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

            const btnInstall = document.getElementById('btn-install-full');
            const btnRun = document.getElementById('btn-run-trellis');
            const btnFix = document.getElementById('btn-fix-trellis');
            const btnFixContainer = document.getElementById('trellis-fix-container');

            if (btnInstall) {
                btnInstall.addEventListener('click', () => this.handleUnifiedInstall('trellis-2'));
            }

            if (btnRun) {
                btnRun.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleRunModel('trellis-2');
                });
            }

            if (btnFix) {
                btnFix.addEventListener('click', () => this.handleRepair('trellis-2'));
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
                if (res.ok) statusText.textContent = '3D Service: Online';
            } catch (e) {
                statusText.textContent = '3D Service: Offline';
            }
        },

        async checkInstallStatus(modelId) {
            const btnInstall = document.getElementById(`btn-install-full`);
            const btnRun = document.getElementById(`btn-run-trellis`);
            const fixContainer = document.getElementById('trellis-fix-container');

            if (!btnInstall || !btnRun) return;

            try {
                const res = await fetch(`/api/3d/install_status/${modelId}?t=${Date.now()}`);
                if (!res.ok) throw new Error('Status check failed');

                const data = await res.json();

                const isFullyReady = data.installed && data.weights_installed;

                btnInstall.style.display = isFullyReady ? 'none' : 'block';
                btnRun.style.display = isFullyReady ? 'block' : 'none';
                if (fixContainer) fixContainer.style.display = isFullyReady ? 'block' : 'none';

                if (isFullyReady && modelId === 'trellis-2') {
                    this.startHealthPolling(modelId);
                }

            } catch (e) {
                console.error(`[View3DModels] Failed to load install status:`, e);
            }
        },

        async handleRepair(modelId) {
            if (!confirm('This will wipe the current engine deployment and re-initialize the environment. Weights will be preserved. Proceed?')) return;

            const fixContainer = document.getElementById('trellis-fix-container');
            if (fixContainer) fixContainer.style.display = 'none';

            try {
                // 1. Terminate any zombie workers first
                await fetch(`/api/3d/stop/${modelId}`, { method: 'POST' });

                // 2. Trigger fresh installation flow
                await this.handleUnifiedInstall(modelId);

                window.showToast('Repair sequence complete.', 'success');
            } catch (e) {
                console.error('Repair failed:', e);
                window.showToast(`Repair failed: ${e.message}`, 'error');
                if (fixContainer) fixContainer.style.display = 'block';
            }
        },

        pollInterval: null,
        startHealthPolling(modelId) {
            if (this.pollInterval) return;

            const badge = document.getElementById('trellis-health-badge');
            const statusDot = document.querySelector('.td-status-dot');
            const statusText = document.getElementById('td-engine-status');

            const check = async () => {
                try {
                    const res = await fetch(`/api/3d/health/${modelId}`);
                    const data = await res.json();

                    if (!badge) return;

                    if (data.status === 'online') {
                        badge.innerHTML = '<i class="fas fa-check-circle" style="color:#4ade80;"></i> Trellis 2 (WIP) is Ready';
                        badge.style.borderColor = 'rgba(74, 222, 128, 0.4)';
                        badge.style.color = '#4ade80';
                        badge.style.animation = 'none';
                        badge.classList.remove('pulse-amber');
                        badge.style.boxShadow = '0 0 10px rgba(74, 222, 128, 0.2)';

                        if (statusDot) statusDot.style.background = '#4ade80';
                        if (statusText) statusText.textContent = 'Running';

                        // Stop polling once we're online
                        clearInterval(this.pollInterval);
                        this.pollInterval = null;

                    } else if (data.status === 'launching') {
                        const vram = data.vram_used > 0
                            ? ` (${data.vram_used.toFixed(1)} / ${data.vram_total.toFixed(1)} GB VRAM)`
                            : '';
                        badge.innerHTML = `<i class="fas fa-spinner fa-spin" style="color:#fb923c;"></i> Loading VRAM…${vram}`;
                        badge.style.borderColor = 'rgba(251, 146, 60, 0.4)';
                        badge.style.color = '#fb923c';
                        badge.classList.add('pulse-amber');

                        if (statusDot) statusDot.style.background = '#fb923c';
                        if (statusText) statusText.textContent = 'Launching';

                    } else if (data.status === 'failed') {
                        badge.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:#f87171;"></i> Load failed — check worker.log';
                        badge.style.borderColor = 'rgba(248, 113, 113, 0.4)';
                        badge.style.color = '#f87171';
                        badge.classList.remove('pulse-amber');

                        if (statusDot) statusDot.style.background = '#f87171';
                        if (statusText) statusText.textContent = 'Failed';

                        // Stop polling on failure
                        clearInterval(this.pollInterval);
                        this.pollInterval = null;

                    } else {
                        badge.innerHTML = '<i class="fas fa-power-off"></i> Offline';
                        badge.style.borderColor = 'rgba(255,255,255,0.1)';
                        badge.style.color = 'var(--text-tertiary)';
                        badge.classList.remove('pulse-amber');

                        if (statusDot) statusDot.style.background = 'gray';
                        if (statusText) statusText.textContent = 'Idle';
                    }
                } catch (e) { }
            };

            // Inject pulse animation if not exists
            if (!document.getElementById('td-hub-styles')) {
                const style = document.createElement('style');
                style.id = 'td-hub-styles';
                style.innerHTML = `
                    @keyframes pulse-amber {
                        0% { opacity: 0.6; box-shadow: 0 0 0px rgba(251, 146, 60, 0); }
                        50% { opacity: 1.0; box-shadow: 0 0 15px rgba(251, 146, 60, 0.3); }
                        100% { opacity: 0.6; box-shadow: 0 0 0px rgba(251, 146, 60, 0); }
                    }
                    .pulse-amber { animation: pulse-amber 2s infinite ease-in-out; }
                `;
                document.head.appendChild(style);
            }

            check();
            this.pollInterval = setInterval(check, 3000);
        },

        async handleUnifiedInstall(modelId) {
            const btnFull = document.getElementById('btn-install-full');
            const progressContainer = document.getElementById('trellis-install-progress-container');
            const logContainer = document.getElementById('trellis-install-log-container');
            const logElement = document.getElementById('trellis-install-log');

            if (btnFull) btnFull.style.display = 'none';
            if (progressContainer) progressContainer.style.display = 'block';
            if (logContainer) logContainer.style.display = 'block';
            if (logElement) logElement.textContent = '[System] Initiating Core Installation...\n';

            try {
                // PHASE 1: Core Files & Environment
                const phase1Success = await this.installModelPhase(modelId);
                if (!phase1Success) return;

                // PHASE 2: Model Weights
                await this.installWeightsPhase(modelId);

            } catch (e) {
                console.error(`[View3DModels] Unified Install Error:`, e);
                window.showToast(`Deployment failed: ${e.message}`, 'error');
                if (btnFull) btnFull.style.display = 'block';
            }
        },

        async installModelPhase(modelId) {
            const logElement = document.getElementById('trellis-install-log');
            const bar = document.getElementById('engine-bar');
            const percent = document.getElementById('engine-percent');
            const text = document.getElementById('engine-text');

            if (text) text.textContent = '1. Environment & Core Files (Active)';

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
                                if (text) text.textContent = '1. Environment & Core Files (Ready)';
                                return true;
                            } else {
                                throw new Error(msg.error || 'Model setup failed');
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
                                            window.showToast('Installation complete! Trellis 2 is ready.', 'success');
                                            this.checkInstallStatus(modelId);
                                        }, 1500);
                                    } else {
                                        throw new Error(json.error || 'Weight download failed');
                                    }
                                }
                            } catch (e) { }
                        }
                    }
                }
            } catch (e) {
                throw e;
            }
        },

        async handleRunModel(modelId) {
            const label = modelId === 'trellis-2' ? 'Trellis 2 (WIP)' : modelId;
            window.showToast(`Launching ${label}…`, 'info');

            try {
                const res = await fetch(`/api/3d/launch/${modelId}`);
                const data = await res.json();

                if (!data.success) {
                    window.showToast(`Launch failed: ${data.error}`, 'error');
                    return;
                }

                // Process started — begin polling for model-load progress
                this.startHealthPolling(modelId);

            } catch (e) {
                window.showToast(`Could not reach launch endpoint: ${e.message}`, 'error');
            }
        },

        refresh() {
            const icon = document.querySelector('#refresh-3d-models i');
            if (icon) icon.classList.add('fa-spin');
            setTimeout(() => {
                this.checkInstallStatus('trellis-2');
                this.updateStatus();
                if (icon) icon.classList.remove('fa-spin');
                window.showToast('3D Models refreshed.', 'success');
            }, 800);
        }
    };

    document.addEventListener('panelLoaded', (e) => {
        if (e.detail.tabName === '3d-models') View3DModels.init();
    });
    window.View3DModels = View3DModels;
})();
