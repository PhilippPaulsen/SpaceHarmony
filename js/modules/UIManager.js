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
            'face-count',
            'btn-generator', 'generator-modal', 'gen-close', 'gen-start', 'gen-symmetry', 'gen-count', 'gen-minfaces', 'gen-results', 'gen-status'
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

        // Generator UI
        this._bindClick('btn-generator', (e) => this._toggleModal('generator-modal', true));
        this._bindClick('gen-close', (e) => this._toggleModal('generator-modal', false));
        this.elements['gen-start']?.addEventListener('click', () => {
            const config = {
                symmetryGroup: this._getValue('gen-symmetry'),
                count: this._getValue('gen-count'),
                minFaces: this._getValue('gen-minfaces')
            };
            if (this.callbacks['onGenerate']) this.callbacks['onGenerate'](config);
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

    // ... (existing populatePresets)

    setGenerationLoading(isLoading) {
        const btn = this.elements['gen-start'];
        const status = this.elements['gen-status'];
        if (isLoading) {
            if (btn) btn.disabled = true;
            if (status) status.textContent = "Generating... please wait.";
        } else {
            if (btn) btn.disabled = false;
        }
    }

    showGenerationResults(results) {
        this.setGenerationLoading(false);
        const container = this.elements['gen-results'];
        const status = this.elements['gen-status'];
        if (status) status.textContent = `Generated ${results.length} forms.`;

        if (!container) return;
        container.innerHTML = '';

        results.forEach((res, idx) => {
            const div = document.createElement('div');
            div.style.background = 'rgba(255,255,255,0.05)';
            div.style.padding = '10px';
            div.style.borderRadius = '4px';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';

            const info = document.createElement('div');
            // Basic metadata display
            const faces = res.metadata ? res.metadata.faceCount : '?';
            const sym = res.metadata ? res.metadata.symmetry : '?';
            info.innerHTML = `<strong>#${idx + 1}</strong> - Faces: ${faces} <br><small>${sym}</small>`;

            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.textContent = 'Load';
            btn.style.padding = '4px 8px';
            btn.onclick = () => {
                if (this.callbacks['onLoadResult']) this.callbacks['onLoadResult'](res);
                this._toggleModal('generator-modal', false);
            };

            div.appendChild(info);
            div.appendChild(btn);
            container.appendChild(div);
        });
    }

    showGenerationError(msg) {
        this.setGenerationLoading(false);
        const status = this.elements['gen-status'];
        if (status) status.textContent = "Error: " + msg;
    }

    _toggleModal(id, show) {
        const el = this.elements[id];
        if (el) el.style.display = show ? 'flex' : 'none';
    }
}
