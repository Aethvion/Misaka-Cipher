let audioPlayerState = {
    currentSource: 'output', // 'input' or 'output'
    inputAudio: null, // base64 or URL
    outputAudio: null, // base64 or URL
    inputMeta: { title: 'INPUT AUDIO', info: 'Local File' },
    outputMeta: { title: 'GENERATED RESULT', info: 'Not generated yet' },
    isPlaying: false
};

function setupAudioDropzone(dropzoneId, inputId, previewId, filenameId, base64Callback) {
    const dropzone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const filenameLabel = document.getElementById(filenameId);
    const dropzoneText = dropzone.querySelector('.dropzone-text');

    if (!dropzone || !input) return;

    dropzone.onclick = () => input.click();

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--primary)';
    });

    dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border)';
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleAudioFile(e.dataTransfer.files[0]);
        }
    });

    input.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleAudioFile(e.target.files[0]);
        }
    };

    function handleAudioFile(file) {
        if (!file.type.startsWith('audio/')) {
            showNotification('Please upload an audio file.', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.style.display = 'block';
            filenameLabel.textContent = file.name;
            if (dropzoneText) dropzoneText.style.display = 'none';

            audioPlayerState.inputAudio = e.target.result;
            audioPlayerState.inputMeta = {
                title: 'INPUT: ' + file.name.toUpperCase(),
                info: `${(file.size / 1024 / 1024).toFixed(2)} MB | ${file.type.split('/')[1].toUpperCase()}`
            };

            // Show result area and switch to input immediately on upload
            const resultArea = document.getElementById('audio-result-area');
            if (resultArea) resultArea.style.display = 'flex';

            // Hide transcription area if it was showing previous results
            const transArea = document.getElementById('audio-transcription-display');
            if (transArea) transArea.style.display = 'none';

            switchAudioSource('input');

            base64Callback(e.target.result);
        };
        reader.readAsDataURL(file);
    }
}

function switchAudioSource(source) {
    audioPlayerState.currentSource = source;

    const tabInput = document.getElementById('audio-tab-input');
    const tabOutput = document.getElementById('audio-tab-output');
    const corePlayer = document.getElementById('audio-core-player');

    if (source === 'input') {
        tabInput?.classList.add('active');
        tabOutput?.classList.remove('active');
        if (audioPlayerState.inputAudio) {
            corePlayer.src = audioPlayerState.inputAudio;
            updatePlayerMetadata(audioPlayerState.inputMeta);
        }
    } else {
        tabOutput?.classList.add('active');
        tabInput?.classList.remove('active');
        if (audioPlayerState.outputAudio) {
            corePlayer.src = audioPlayerState.outputAudio;
            updatePlayerMetadata(audioPlayerState.outputMeta);
        }
    }

    // Reset play state when switching source
    audioPlayerState.isPlaying = false;
    updatePlayPauseUI();
}

function updatePlayerMetadata(meta) {
    const titleEl = document.getElementById('audio-result-title');
    const infoEl = document.getElementById('audio-result-info');
    if (titleEl) titleEl.textContent = meta.title;
    if (infoEl) infoEl.textContent = meta.info;
}

function updatePlayPauseUI() {
    const btn = document.getElementById('audio-play-pause');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (audioPlayerState.isPlaying) {
        icon.className = 'fas fa-pause';
        document.querySelectorAll('.audio-bar').forEach(bar => bar.classList.add('active'));
    } else {
        icon.className = 'fas fa-play';
        document.querySelectorAll('.audio-bar').forEach(bar => bar.classList.remove('active'));
    }
}

function setupPremiumPlayer() {
    const corePlayer = document.getElementById('audio-core-player');
    const playPauseBtn = document.getElementById('audio-play-pause');
    const rewindBtn = document.getElementById('audio-rewind');
    const forwardBtn = document.getElementById('audio-fastforward');
    const progressBar = document.getElementById('audio-progress-bar');
    const progressFill = document.getElementById('audio-progress-fill');
    const timeDisplay = document.getElementById('audio-time-display');
    const volumeSlider = document.getElementById('audio-volume');
    const tabInput = document.getElementById('audio-tab-input');
    const tabOutput = document.getElementById('audio-tab-output');

    if (!corePlayer) return;

    // Play/Pause
    playPauseBtn.onclick = () => {
        if (!corePlayer.src) {
            showNotification('No audio loaded.', 'warning');
            return;
        }
        if (corePlayer.paused) {
            corePlayer.play();
            audioPlayerState.isPlaying = true;
        } else {
            corePlayer.pause();
            audioPlayerState.isPlaying = false;
        }
        updatePlayPauseUI();
    };

    // Rewind/Forward
    rewindBtn.onclick = () => corePlayer.currentTime = Math.max(0, corePlayer.currentTime - 10);
    forwardBtn.onclick = () => corePlayer.currentTime = Math.min(corePlayer.duration, corePlayer.currentTime + 10);

    // Progress Bar
    corePlayer.ontimeupdate = () => {
        const pct = (corePlayer.currentTime / corePlayer.duration) * 100;
        if (progressFill) progressFill.style.width = pct + '%';

        const cur = formatTime(corePlayer.currentTime);
        const dur = formatTime(corePlayer.duration || 0);
        if (timeDisplay) timeDisplay.textContent = `${cur} / ${dur}`;
    };

    progressBar.onclick = (e) => {
        const rect = progressBar.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        corePlayer.currentTime = pos * corePlayer.duration;
    };

    // Volume
    volumeSlider.oninput = (e) => corePlayer.volume = e.target.value;

    // Tabs
    if (tabInput) tabInput.onclick = () => switchAudioSource('input');
    if (tabOutput) tabOutput.onclick = () => switchAudioSource('output');

    // Extra Actions
    const downloadBtn = document.getElementById('audio-download');
    if (downloadBtn) {
        downloadBtn.onclick = () => {
            if (!corePlayer.src) return;
            const a = document.createElement('a');
            a.href = corePlayer.src;
            a.download = (audioPlayerState.currentSource === 'input' ? 'input' : 'result') + '_audio';
            a.click();
        };
    }

    const copyBtn = document.getElementById('audio-copy-link');
    if (copyBtn) {
        copyBtn.onclick = () => {
            if (!corePlayer.src) return;
            navigator.clipboard.writeText(corePlayer.src);
            showNotification('Link copied to clipboard.', 'success');
        };
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

function initializeAudioStudio() {
    setupAudioDropzone('audio-input-dropzone', 'audio-input-file', 'audio-input-preview', 'audio-input-filename', (b64) => currentAudioInputBase64 = b64);
    setupPremiumPlayer();

    const modeToggles = document.querySelectorAll('input[name="audio_mode"]');
    modeToggles.forEach(r => r.addEventListener('change', () => {
        const mode = document.querySelector('input[name="audio_mode"]:checked').value;
        const uploadGroup = document.getElementById('audio-upload-group');
        const promptInput = document.getElementById('audio-prompt-input');

        uploadGroup.style.display = (mode === 'stt' || mode === 'edit') ? 'block' : 'none';

        if (mode !== 'tts') {
            const vg = document.getElementById('audio-voice-group');
            if (vg) vg.style.display = 'none';
        }

        if (mode === 'tts') {
            promptInput.placeholder = "Enter text to convert to speech...";
        } else if (mode === 'stt') {
            promptInput.placeholder = "Upload audio to transcribe...";
            promptInput.value = "";
        } else if (mode === 'music') {
            promptInput.placeholder = "Describe the music style, mood, or instruments...";
        } else {
            promptInput.placeholder = "Enter prompt or instructions...";
        }

        loadAudioModels();
    }));

    const processBtn = document.getElementById('process-audio-btn');
    const loadingOverlay = document.getElementById('audio-loading-overlay');
    const promptInput = document.getElementById('audio-prompt-input');
    const resultArea = document.getElementById('audio-result-area');
    const transArea = document.getElementById('audio-transcription-display');
    const transText = document.getElementById('audio-transcription-text');

    if (processBtn) {
        processBtn.onclick = async () => {
            const prompt = promptInput?.value.trim() || '';
            const mode = document.querySelector('input[name="audio_mode"]:checked').value;

            if ((mode === 'tts' || mode === 'music') && !prompt) {
                showNotification('Please enter a prompt or text.', 'warning');
                return;
            }
            if ((mode === 'stt' || mode === 'edit') && !currentAudioInputBase64) {
                showNotification('Please upload an audio file for this mode.', 'warning');
                return;
            }

            const checkedModels = Array.from(document.querySelectorAll('.audio-model-checkbox:checked')).map(cb => {
                return { key: cb.value, provider: cb.dataset.provider, isLocal: cb.dataset.local === 'true' };
            });

            if (checkedModels.length === 0) {
                showNotification('Please select a model.', 'warning');
                return;
            }

            loadingOverlay.style.display = 'flex';
            processBtn.disabled = true;
            processBtn.textContent = 'PROCESSING...';

            const m = checkedModels[0];
            const selectedVoice = document.getElementById('audio-voice-select')?.value || null;

            try {
                const response = await fetch('/api/audio/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: prompt,
                        model: m.key,
                        mode: mode,
                        provider: m.provider,
                        voice: selectedVoice || undefined,
                        input_audio: currentAudioInputBase64
                    })
                });

                const data = await response.json();
                loadingOverlay.style.display = 'none';
                processBtn.disabled = false;
                processBtn.textContent = 'PROCESS';

                if (data.success) {
                    if (mode === 'stt') {
                        resultArea.style.display = 'flex';
                        transArea.style.display = 'flex';
                        transText.textContent = data.text;
                        promptInput.value = data.text;

                        // Switch to input source so they can listen to what was transcribed
                        switchAudioSource('input');

                        showNotification('Transcription completed.', 'success');
                    } else {
                        resultArea.style.display = 'flex';
                        transArea.style.display = 'none';
                        audioPlayerState.outputAudio = data.audio || data.audio_url;
                        audioPlayerState.outputMeta = {
                            title: mode === 'music' ? 'GENERATED MUSIC' : 'GENERATED SPEECH',
                            info: `${m.provider}: ${m.key} | ${data.format || (data.audio ? 'MP3' : 'WAV')}`
                        };
                        switchAudioSource('output');
                        showNotification('Audio generation completed.', 'success');
                    }
                } else {
                    showNotification(data.error || 'Processing failed.', 'error');
                }
            } catch (err) {
                loadingOverlay.style.display = 'none';
                processBtn.disabled = false;
                processBtn.textContent = 'PROCESS';
                console.error(err);
                showNotification('Error processing audio: ' + err.message, 'error');
            }
        };
    }

    // The actual call to load models is deferred slightly to allow UI paint
    setTimeout(() => {
        loadAudioModels();
    }, 100);
}

async function loadAudioModels() {
    const checklist = document.getElementById('audio-model-checklist');
    if (!checklist) return;

    // Check if registry is ready, if not, wait for it asynchronously WITHOUT blocking this call
    if (typeof _registryData === 'undefined' || !_registryData) {
        if (typeof window.loadProviderSettings === 'function') {
            window.loadProviderSettings().then(() => loadAudioModels());
            return;
        }
        return;
    }
    
    if (typeof _registryData === 'undefined' || !_registryData || !_registryData.providers) return;

    const mode = document.querySelector('input[name="audio_mode"]:checked').value;
    let html = '';
    const models = [];

    for (const [providerName, config] of Object.entries(_registryData.providers)) {
        if (!config.models) continue;
        const providerLabel = config.name
            || providerName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        for (const [key, info] of Object.entries(config.models)) {
            const caps = (info.capabilities || []).map(c => c.toUpperCase());

            // Match TTS-capable models: VOICEOUTPUT (API), TTS (local audio), AUDIO (generic)
            // Match STT-capable models: VOICEINPUT (API), STT (local audio)
            const isTTS = caps.includes('VOICEOUTPUT') || caps.includes('TTS') || caps.includes('AUDIO');
            const isSTT = caps.includes('VOICEINPUT') || caps.includes('STT');

            const isAudioModel =
                (mode === 'tts' && isTTS) ||
                (mode === 'stt' && isSTT);

            if (!isAudioModel) continue;

            const audioConfig = info.audio_config || {};
            if (mode === 'stt' && audioConfig.supports_stt === false) continue;
            if (mode === 'tts' && audioConfig.supports_tts === false) continue;

            // Built-in voice list for API models (stored in audio_config.voices)
            const builtInVoices = audioConfig.voices || [];

            models.push({
                key,
                provider: providerName,
                providerLabel,
                name: info.name || key,
                builtInVoices,
                isLocal: providerName === 'audio_models',
            });
        }
    }

    if (models.length === 0) {
        const modeLabel = mode === 'tts' ? 'TTS' : 'STT';
        html = `<div style="color:var(--text-secondary); font-size:0.85em; padding: 10px; text-align: center;">No ${modeLabel} models found. Register one in Audio Models or Model Registry.</div>`;
    } else {
        models.forEach((m, idx) => {
            const displayName = m.isLocal ? `Local: ${m.name}` : `${m.providerLabel}: ${m.name}`;
            html += `<label class="checklist-item" style="display:flex; align-items:center; gap:8px; padding:6px 10px; cursor:pointer; font-size: 0.85rem; border-bottom: 1px solid var(--border-light);">
                <input type="radio" name="selected_audio_model" class="audio-model-checkbox"
                    value="${m.key}" data-provider="${m.provider}"
                    data-local="${m.isLocal}" data-voices='${JSON.stringify(m.builtInVoices)}'
                    ${idx === 0 ? 'checked' : ''}>
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayName}</span>
            </label>`;
        });
    }

    checklist.innerHTML = html;

    // Wire voice loading whenever selection changes
    checklist.querySelectorAll('.audio-model-checkbox').forEach(cb => {
        cb.addEventListener('change', () => _loadVoicesForSelectedModel());
    });

    // Load voices for the initially-selected model
    if (mode === 'tts') _loadVoicesForSelectedModel();
}

async function _loadVoicesForSelectedModel() {
    const voiceGroup = document.getElementById('audio-voice-group');
    const voiceSelect = document.getElementById('audio-voice-select');
    if (!voiceGroup || !voiceSelect) return;

    const checked = document.querySelector('.audio-model-checkbox:checked');
    if (!checked) { voiceGroup.style.display = 'none'; return; }

    const isLocal = checked.dataset.local === 'true';
    const builtInVoices = JSON.parse(checked.dataset.voices || '[]');

    if (isLocal) {
        // Fetch voices from the local audio API
        try {
            const modelId = checked.value;
            const res = await fetch(`/api/audio/local/voices/${modelId}`);
            if (res.ok) {
                const data = await res.json();
                const voices = data.voices || [];
                if (voices.length > 0) {
                    voiceSelect.innerHTML = voices.map(v =>
                        `<option value="${v.id || v.name}">${v.name}</option>`
                    ).join('');
                    voiceGroup.style.display = 'block';
                    return;
                }
            }
        } catch (e) { /* fall through */ }
        // No voices available — hide the dropdown
        voiceGroup.style.display = 'none';

    } else if (builtInVoices.length > 0) {
        // API model with known voice list (e.g. OpenAI tts-1)
        voiceSelect.innerHTML = builtInVoices.map(v =>
            `<option value="${v}">${v}</option>`
        ).join('');
        voiceGroup.style.display = 'block';

    } else {
        voiceGroup.style.display = 'none';
    }
}

if (typeof registerTabInit === 'function') {
    registerTabInit('audio', initializeAudioStudio);
} else {
    window.addEventListener('load', () => {
        if (typeof registerTabInit === 'function') {
            registerTabInit('audio', initializeAudioStudio);
        }
    });
}
