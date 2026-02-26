// Misaka Cipher - Image Studio Mode
// Handles interactions with the Image Generation UI and APIs

function initializeImageStudio() {
    const generateBtn = document.getElementById('generate-image-btn');
    const loadingOverlay = document.getElementById('image-loading-overlay');
    const promptInput = document.getElementById('image-prompt-input');

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            // Basic validation
            if (!promptInput || !promptInput.value.trim()) {
                alert('Please enter a prompt first.');
                return;
            }

            // Collect parameters
            const model = document.getElementById('image-model-selector').value;
            const aspectRatio = document.getElementById('image-aspect-ratio')?.value;
            const customAr = document.getElementById('image-custom-aspect-ratio')?.value;
            const negPrompt = document.getElementById('image-negative-prompt')?.value;
            const seed = document.getElementById('image-seed')?.value;
            const quality = document.getElementById('image-quality')?.value;

            // Show loading
            if (loadingOverlay) loadingOverlay.style.display = 'flex';
            generateBtn.disabled = true;
            generateBtn.textContent = 'GENERATING...';

            // Call API
            fetch('/api/image/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: promptInput.value.trim(),
                    model: model,
                    n: 1,
                    aspect_ratio: aspectRatio === 'custom' ? customAr : aspectRatio,
                    negative_prompt: negPrompt,
                    seed: seed ? parseInt(seed) : null,
                    quality: quality || "standard"
                })
            })
                .then(response => response.json())
                .then(data => {
                    if (loadingOverlay) loadingOverlay.style.display = 'none';
                    generateBtn.disabled = false;
                    generateBtn.textContent = 'GENERATE';

                    if (data.success && data.images && data.images.length > 0) {
                        const imgData = data.images[0];
                        const viewer = document.getElementById('image-viewer-container');

                        // Hide empty state
                        const emptyState = viewer.querySelector('.empty-state-viewer');
                        if (emptyState) emptyState.style.display = 'none';

                        // Cleanup previous result
                        const existingImg = viewer.querySelector('.generated-result-container');
                        if (existingImg) existingImg.remove();

                        // Create result view
                        const container = document.createElement('div');
                        container.className = 'generated-result-container';
                        container.style.display = 'flex';
                        container.style.flexDirection = 'column';
                        container.style.alignItems = 'center';
                        container.style.gap = '1rem';
                        container.style.width = '100%';
                        container.style.height = '100%';

                        const img = document.createElement('img');
                        img.src = imgData.url;
                        img.className = 'generated-image-preview';
                        img.style.maxWidth = '100%';
                        img.style.maxHeight = '80vh';
                        img.style.objectFit = 'contain';
                        img.style.borderRadius = '8px';
                        img.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';

                        const meta = document.createElement('div');
                        meta.className = 'image-meta';
                        meta.innerHTML = `<span style="color:var(--text-secondary); font-size:0.9em;">Saved to: ${imgData.filename}</span>`;

                        container.appendChild(img);
                        container.appendChild(meta);
                        viewer.appendChild(container);

                    } else {
                        alert('Generation failed: ' + (data.error || 'Unknown error'));
                    }
                })
                .catch(err => {
                    if (loadingOverlay) loadingOverlay.style.display = 'none';
                    generateBtn.disabled = false;
                    generateBtn.textContent = 'GENERATE';
                    console.error(err);
                    alert('Error generating image: ' + err.message);
                });
        });
    }

    // Load models
    loadImageModels();

    // Model Selector Change
    const modelSelector = document.getElementById('image-model-selector');
    if (modelSelector) {
        modelSelector.addEventListener('change', () => {
            updateImageStudioControls();
        });
    }
}

async function loadImageModels() {
    const selector = document.getElementById('image-model-selector');
    if (!selector) return;

    // Ensure registry data is loaded
    if (typeof _registryData === 'undefined' || !_registryData) {
        if (typeof loadProviderSettings === 'function') {
            await loadProviderSettings();
        }
    }

    if (typeof _registryData === 'undefined' || !_registryData || !_registryData.providers) return;

    let html = '';
    const models = [];

    // Find all models with 'image' capability tag
    for (const [providerName, config] of Object.entries(_registryData.providers)) {
        if (!config.models) continue;
        for (const [key, info] of Object.entries(config.models)) {
            const caps = info.capabilities || [];
            if (caps.includes('image') || caps.includes('image_generation')) {
                models.push({
                    key: key,
                    id: info.id || key,
                    provider: providerName,
                    name: `${providerName}: ${info.id || key}`,
                    image_config: info.image_config
                });
            }
        }
    }

    if (models.length === 0) {
        html = '<option value="" disabled>No image models found</option>';
    } else {
        models.forEach(m => {
            html += `<option value="${m.key}" data-provider="${m.provider}">${m.name}</option>`;
        });
    }

    selector.innerHTML = html;

    // Trigger update for initial selection
    if (selector.value) {
        updateImageStudioControls();
    }
}

function updateImageStudioControls() {
    const selector = document.getElementById('image-model-selector');
    if (!selector || !selector.value) return;

    // Find model data
    const selectedKey = selector.value;
    const selectedOption = selector.options[selector.selectedIndex];
    const providerName = selectedOption.dataset.provider;

    if (typeof _registryData === 'undefined' || !_registryData || !_registryData.providers || !_registryData.providers[providerName]) return;

    const modelInfo = _registryData.providers[providerName].models[selectedKey];
    if (!modelInfo) return;

    const config = modelInfo.image_config || {};
    const sidebarContent = document.querySelector('.image-studio-sidebar .sidebar-content');

    // Remove existing dynamic controls
    sidebarContent.querySelectorAll('.dynamic-control').forEach(el => el.remove());

    // Insert new controls BEFORE the Prompt group
    const promptGroup = document.getElementById('image-prompt-input')?.closest('.control-group');

    // Helper to create control
    const createControl = (html) => {
        const div = document.createElement('div');
        div.className = 'control-group dynamic-control';
        div.style.marginTop = '1rem';
        div.innerHTML = html;
        if (promptGroup) {
            sidebarContent.insertBefore(div, promptGroup);
        } else {
            sidebarContent.appendChild(div);
        }
    };

    // Aspect Ratios
    if (config.aspect_ratios && config.aspect_ratios.length > 0) {
        const options = config.aspect_ratios.map(r => `<option value="${r}">${r}</option>`).join('');
        createControl(`
            <label>Aspect Ratio</label>
            <select class="term-select" style="width:100%;" id="image-aspect-ratio">
                ${options}
            </select>
            <div id="custom-ar-container" style="display:none; margin-top:0.5rem;">
                <input type="text" class="term-input" id="image-custom-aspect-ratio" placeholder="e.g. 21:9">
            </div>
        `);

        const arSelect = document.getElementById('image-aspect-ratio');
        const customContainer = document.getElementById('custom-ar-container');
        if (arSelect && customContainer) {
            arSelect.onchange = () => {
                customContainer.style.display = arSelect.value === 'custom' ? 'block' : 'none';
            };
            // Initial check
            customContainer.style.display = arSelect.value === 'custom' ? 'block' : 'none';
        }
    }

    // Negative Prompt
    if (config.supports_negative_prompt) {
        createControl(`
            <label>Negative Prompt</label>
            <textarea class="term-input" id="image-negative-prompt" rows="2" placeholder="Low quality, blurry..."></textarea>
        `);
    }

    // Seed
    if (config.supports_seed) {
        createControl(`
            <label>Seed (Optional)</label>
            <input type="number" class="term-input" id="image-seed" placeholder="Random">
        `);
    }

    // Quality
    if (config.quality_options && config.quality_options.length > 1) {
        const options = config.quality_options.map(q => `<option value="${q}">${q}</option>`).join('');
        createControl(`
            <label>Quality</label>
            <select class="term-select" style="width:100%;" id="image-quality">
                ${options}
            </select>
        `);
    }
}
