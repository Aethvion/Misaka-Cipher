class SpecterEngine {
    constructor(containerId) {
        this.containerId = containerId;
        this.app = null;
        this.currentModel = null;
        this.params = {};
        this.layers = {}; // Map of layer names to Pixi objects

        this.onLoadingComplete = null;
        this.onModelLoaded = null;
    }

    async init() {
        const container = document.getElementById(this.containerId);

        this.app = new PIXI.Application({
            width: window.innerWidth,
            height: window.innerHeight,
            backgroundColor: 0x0f111a,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });

        container.appendChild(this.app.view);

        // Handle resize
        window.addEventListener('resize', () => {
            this.app.renderer.resize(window.innerWidth, window.innerHeight);
        });

        // Expose updateParam globally for UI
        window.updateParam = (key, val) => this.setParam(key, parseFloat(val));
        window.resetParams = () => this.resetParams();

        if (this.onLoadingComplete) this.onLoadingComplete();
    }

    async loadModel(configPath) {
        console.log(`[Specter] Loading model: ${configPath}`);
        try {
            const response = await fetch(configPath);
            const config = await response.json();

            // Clear current model
            if (this.currentModel) {
                this.app.stage.removeChildren();
            }

            this.currentModel = config;
            this.params = config.params || {};
            this.layers = {};

            // Load textures
            const baseDir = configPath.substring(0, configPath.lastIndexOf('/'));
            const textures = {};

            for (const part of config.parts) {
                const texPath = `${baseDir}/${part.texture}`;
                textures[part.id] = await PIXI.Assets.load(texPath);
            }

            // Create layers based on draw order
            const sortedParts = [...config.parts].sort((a, b) => (a.z || 0) - (b.z || 0));

            for (const part of sortedParts) {
                const sprite = new PIXI.Sprite(textures[part.id]);
                sprite.anchor.set(0.5);
                sprite.x = part.x || 0;
                sprite.y = part.y || 0;
                sprite.scale.set(part.scale || 1);

                this.app.stage.addChild(sprite);
                this.layers[part.id] = sprite;
            }

            // Center stage
            this.app.stage.x = this.app.screen.width / 2;
            this.app.stage.y = this.app.screen.height / 2;

            if (this.onModelLoaded) this.onModelLoaded(config);

            // Start update loop
            this.app.ticker.add((delta) => this.update(delta));

        } catch (e) {
            console.error("[Specter] Model load failed:", e);
        }
    }

    setParam(key, val) {
        if (this.params[key]) {
            this.params[key].value = val;
            const valEl = document.getElementById(`val-${key}`);
            if (valEl) valEl.textContent = val.toFixed(2);
        }
    }

    resetParams() {
        Object.keys(this.params).forEach(key => {
            this.params[key].value = this.params[key].default || 0;
            // Update UI
            const input = document.querySelector(`input[oninput*="${key}"]`);
            if (input) input.value = this.params[key].value;
            const valEl = document.getElementById(`val-${key}`);
            if (valEl) valEl.textContent = this.params[key].value.toFixed(2);
        });
    }

    update(delta) {
        if (!this.currentModel) return;

        // Apply parameter logic
        // This is a simplified version where we map params to layer properties
        for (const mapping of (this.currentModel.mappings || [])) {
            const param = this.params[mapping.param];
            const layer = this.layers[mapping.layer];

            if (param && layer) {
                const val = param.value;

                if (mapping.type === 'rotation') {
                    layer.rotation = mapping.base + (val * mapping.multiplier);
                } else if (mapping.type === 'scale') {
                    layer.scale.set(mapping.base + (val * mapping.multiplier));
                } else if (mapping.type === 'position_x') {
                    layer.x = mapping.base + (val * mapping.multiplier);
                } else if (mapping.type === 'position_y') {
                    layer.y = mapping.base + (val * mapping.multiplier);
                } else if (mapping.type === 'alpha') {
                    layer.alpha = mapping.base + (val * mapping.multiplier);
                }
            }
        }
    }
}
