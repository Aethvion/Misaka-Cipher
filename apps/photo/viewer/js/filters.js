/**
 * filters.js — Non-destructive CSS filters for Aethvion Photo layers
 */

export class FilterEngine {
    constructor(engine) {
        this.engine = engine;
    }

    setFilter(name, value) {
        const layer = this.engine.getActiveLayer();
        if (!layer) return;

        if (layer.filters.hasOwnProperty(name)) {
            layer.filters[name] = value;
            this.engine.render();
        }
    }

    reset() {
        const layer = this.engine.getActiveLayer();
        if (!layer) return;

        layer.filters = {
            brightness: 100,
            contrast: 100,
            saturate: 100,
            blur: 0,
            grayscale: 0,
            sepia: 0
        };
        this.engine.render();
    }
}
