export class UIManager {
    constructor(container, callbacks = {}) {
        this.container = container || document.body;
        this.callbacks = callbacks;

        this.elements = {};
        this._cacheElements();
        this._bindEvents();
    }

    _cacheElements() {
        const ids = [
            'theme-toggle',
            'undo-button', 'redo-button', 'clear-button', 'random-form-button',
            'import-json-button', 'export-json-button', 'export-obj-button', 'export-stl-button',
            'preset-select',
            'grid-density',
            'toggle-points', 'toggle-lines', 'toggle-curved-lines', 'toggle-curved-surfaces',
            'close-face-button', 'close-volume-button', 'auto-close-all-button',
            'toggle-show-closed', 'toggle-auto-close', 'toggle-color-highlights',
            'reflection-xy', 'reflection-yz', 'reflection-zx', 'toggle-inversion',
            'rotation-axis',
            'rotoreflection-axis', 'rotoreflection-plane', 'rotoreflection-angle', 'rotoreflection-count', 'rotoreflection-enabled',
            'translation-axis', 'translation-count', 'translation-step',
            'screw-axis', 'screw-angle', 'screw-distance', 'screw-count', 'screw-enabled',
            'face-count'
        ];

        ids.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });

        // Also cache sliders for output updates
        this.sliders = Array.from(document.querySelectorAll('.slider-wrapper input[type="range"]'));
    }

    _bindEvents() {
        this._bindClick('theme-toggle', 'onThemeToggle');
        this._bindClick('undo-button', 'onUndo');
        this._bindClick('redo-button', 'onRedo');
        this._bindClick('clear-button', 'onClear');
        this._bindClick('random-form-button', 'onRandomForm');

        // Import/Export
        this._bindClick('import-json-button', 'onImportJSON'); // Logic might need hidden file input
        this._bindClick('export-json-button', 'onExportJSON');
        this._bindClick('export-obj-button', 'onExportOBJ');
        this._bindClick('export-stl-button', 'onExportSTL');

        this._bindChange('preset-select', 'onPresetChange');

        this._bindInput('grid-density', 'onDensityChange');

        // Toggles
        this._bindChange('toggle-points', 'onTogglePoints');
        this._bindChange('toggle-lines', 'onToggleLines');
        this._bindChange('toggle-curved-lines', 'onToggleCurvedLines');
        this._bindChange('toggle-curved-surfaces', 'onToggleCurvedSurfaces');

        // Shapes
        this._bindClick('close-face-button', 'onCloseFace');
        this._bindClick('close-volume-button', 'onCloseVolume');
        this._bindClick('auto-close-all-button', 'onAutoCloseAll');

        this._bindChange('toggle-show-closed', 'onToggleShowClosed');
        this._bindChange('toggle-auto-close', 'onToggleAutoClose');
        this._bindChange('toggle-color-highlights', 'onToggleColorHighlights');

        // Symmetry
        this._bindChange('reflection-xy', 'onSymmetryChange');
        this._bindChange('reflection-yz', 'onSymmetryChange');
        this._bindChange('reflection-zx', 'onSymmetryChange');
        this._bindChange('toggle-inversion', 'onSymmetryChange');

        this._bindChange('rotation-axis', 'onSymmetryChange');

        // Complex Symmetries (Rotoreflection, Translation, Screw)
        // We can bind them all to a generic change handler that reads current state
        const complexIds = [
            'rotoreflection-axis', 'rotoreflection-plane', 'rotoreflection-angle', 'rotoreflection-count', 'rotoreflection-enabled',
            'translation-axis', 'translation-count', 'translation-step',
            'screw-axis', 'screw-angle', 'screw-distance', 'screw-count', 'screw-enabled'
        ];
        complexIds.forEach(id => {
            this._bindChange(id, 'onSymmetryChange');
            this._bindInput(id, 'onSymmetryChange'); // For sliders to update live? maybe debounce
        });

        // Sliders output update
        this.sliders.forEach(slider => {
            slider.addEventListener('input', () => this._updateSliderOutput(slider));
        });
    }

    _bindClick(id, callbackName) {
        if (this.elements[id] && this.callbacks[callbackName]) {
            this.elements[id].addEventListener('click', (e) => this.callbacks[callbackName](e));
        }
    }

    _bindChange(id, callbackName) {
        if (this.elements[id] && this.callbacks[callbackName]) {
            this.elements[id].addEventListener('change', (e) => this.callbacks[callbackName](this._getValue(id), e));
        }
    }

    _bindInput(id, callbackName) {
        if (this.elements[id] && this.callbacks[callbackName]) {
            this.elements[id].addEventListener('input', (e) => this.callbacks[callbackName](this._getValue(id), e));
        }
    }

    _getValue(id) {
        const el = this.elements[id];
        if (!el) return null;
        if (el.type === 'checkbox') return el.checked;
        if (el.type === 'number' || el.type === 'range') return parseFloat(el.value);
        return el.value;
    }

    _updateSliderOutput(input) {
        const output = input.parentElement?.querySelector('output');
        if (!output) return;
        const suffix = input.id.includes('angle') ? '°' : '';
        const precision = input.step && Number(input.step) < 1 ? 1 : 0;
        const value = Number.parseFloat(input.value);
        output.textContent = precision ? value.toFixed(1) + suffix : Math.round(value) + suffix;
    }

    getSymmetryState() {
        // Helper to gather all symmetry ui state
        return {
            reflections: {
                xy: this._getValue('reflection-xy'),
                yz: this._getValue('reflection-yz'),
                zx: this._getValue('reflection-zx'),
                inversion: this._getValue('toggle-inversion')
            },
            rotation: {
                axis: this._getValue('rotation-axis')
            },
            translation: {
                axis: this._getValue('translation-axis'),
                count: this._getValue('translation-count'),
                step: this._getValue('translation-step')
            },
            rotoreflection: {
                enabled: this._getValue('rotoreflection-enabled'),
                axis: this._getValue('rotoreflection-axis'),
                plane: this._getValue('rotoreflection-plane'),
                angle: this._getValue('rotoreflection-angle'),
                count: this._getValue('rotoreflection-count')
            },
            screw: {
                enabled: this._getValue('screw-enabled'),
                axis: this._getValue('screw-axis'),
                angle: this._getValue('screw-angle'),
                distance: this._getValue('screw-distance'),
                count: this._getValue('screw-count')
            }
        };
    }

    updateStatus(text) {
        if (this.elements['face-count']) {
            this.elements['face-count'].textContent = text;
        }
    }

    populatePresets(presets) {
        const select = this.elements['preset-select'];
        if (!select) return;
        select.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select Preset...';
        select.appendChild(defaultOption);

        presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.name;
            select.appendChild(option);
        });
    }
}
