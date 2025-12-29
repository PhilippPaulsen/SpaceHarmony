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
            'view-z', 'view-iso', 'view-overview',
            'import-json-button', 'export-json-button', 'export-obj-button', 'export-png-button',
            'grid-density', 'toggle-auto-rotate', 'coord-system',
            'toggle-points', 'toggle-lines', 'toggle-show-closed', 'toggle-cube-frame',
            'toggle-curved-lines', 'toggle-curved-surfaces', 'curve-convexity',
            'reflection-xy', 'reflection-yz', 'reflection-zx', 'toggle-inversion',
            'toggle-full-icosa', 'cubic-symmetries', 'icosahedral-symmetries',
            'rotation-axis',
            'rotoreflection-axis', 'rotoreflection-plane', 'rotoreflection-angle', 'rotoreflection-count', 'rotoreflection-enabled', 'rotoreflection-connect',
            'translation-axis', 'translation-count', 'translation-step', 'translation-connect',
            'screw-axis', 'screw-angle', 'screw-distance', 'screw-count', 'screw-enabled', 'screw-connect',
            'face-count',
            'btn-generator', 'generator-modal', 'gen-close', 'gen-start', 'gen-systematic', 'gen-symmetry', 'gen-count', 'gen-minfaces', 'gen-minvolumes', 'gen-maxedges', 'gen-results', 'gen-status'
        ];

        ids.forEach(id => {
            this.elements[id] = document.getElementById(id);
            if (!this.elements[id]) console.warn(`UIManager: Element not found: ${id}`);
        });

        // Also cache sliders for output updates
        this.sliders = Array.from(document.querySelectorAll('.slider-wrapper input[type="range"]'));
    }

    _bindEvents() {
        console.log("UIManager: Binding events...");
        this._bindClick('theme-toggle', 'onThemeToggle');
        this._bindClick('undo-button', 'onUndo');
        this._bindClick('redo-button', 'onRedo');
        this._bindClick('clear-button', 'onClear');
        this._bindClick('random-form-button', 'onRandomForm');
        this._bindClick('view-z', 'onViewZ');
        this._bindClick('view-iso', 'onViewIso');
        this._bindClick('view-overview', 'onViewOverview');

        // Import/Export
        this._bindClick('import-json-button', 'onImportJSON');
        this._bindClick('export-json-button', 'onExportJSON');
        this._bindClick('export-obj-button', 'onExportOBJ');
        this._bindClick('export-png-button', 'onExportPNG');

        this._bindInput('grid-density', 'onDensityChange');
        this._bindChange('coord-system', 'onSystemChange');

        // Toggles
        this._bindChange('toggle-points', 'onTogglePoints');
        this._bindChange('toggle-lines', 'onToggleLines');
        this._bindChange('toggle-show-closed', 'onToggleShowClosed');
        this._bindChange('toggle-cube-frame', 'onToggleCubeFrame');

        // Curve Row
        this._bindChange('toggle-curved-lines', 'onToggleCurvedLines');
        this._bindChange('toggle-curved-surfaces', 'onToggleCurvedSurfaces');
        this._bindInput('curve-convexity', 'onCurveConvexityChange');

        // Shapes
        this._bindClick('close-face-button', 'onCloseFace');
        this._bindClick('close-volume-button', 'onCloseVolume');
        this._bindClick('auto-close-all-button', 'onAutoCloseAll');

        this._bindChange('toggle-show-closed', 'onToggleShowClosed');
        this._bindChange('toggle-auto-close', 'onToggleAutoClose');
        this._bindChange('toggle-color-highlights', 'onToggleColorHighlights');
        this._bindClick('toggle-auto-rotate', 'onToggleAutoRotate'); // Now in Header

        // Symmetry
        this._bindChange('reflection-xy', 'onSymmetryChange');
        this._bindChange('reflection-yz', 'onSymmetryChange');
        this._bindChange('reflection-zx', 'onSymmetryChange');
        this._bindChange('toggle-inversion', 'onSymmetryChange');
        this._bindChange('toggle-full-icosa', 'onSymmetryChange');

        this._bindChange('rotation-axis', 'onSymmetryChange');

        // Complex Symmetries
        const complexIds = [
            'rotoreflection-axis', 'rotoreflection-plane', 'rotoreflection-angle', 'rotoreflection-count', 'rotoreflection-enabled', 'rotoreflection-connect',
            'translation-axis', 'translation-count', 'translation-step', 'translation-connect',
            'screw-axis', 'screw-angle', 'screw-distance', 'screw-count', 'screw-enabled', 'screw-connect'
        ];
        complexIds.forEach(id => {
            this._bindChange(id, 'onSymmetryChange');
            this._bindInput(id, 'onSymmetryChange');
        });

        // Sliders output update
        this.sliders.forEach(slider => {
            slider.addEventListener('input', () => this._updateSliderOutput(slider));
        });

        // Generator UI
        if (this.elements['gen-preset']) {
            this.elements['gen-preset'].addEventListener('change', (e) => {
                const val = e.target.value;
                if (val === 'custom') return;

                // Presets
                if (val === 'platonic') {
                    this._setValue('gen-maxedges', 60); // Sufficient for Icosahedron (30 edges) + some buffer
                    this._setValue('gen-minfaces', 4);
                    this._setValue('gen-minvolumes', 1);
                    this._setValue('gen-count', 5);
                } else if (val === 'complex') {
                    this._setValue('gen-maxedges', 120);
                    this._setValue('gen-minfaces', 12);
                    this._setValue('gen-minvolumes', 1);
                    this._setValue('gen-count', 8);
                } else if (val === 'organic') {
                    this._setValue('gen-maxedges', 200);
                    this._setValue('gen-minfaces', 20);
                    this._setValue('gen-minvolumes', 0);
                    this._setValue('gen-count', 3);
                }
            });
        }

        this._bindClick('btn-generator', (e) => {
            // Auto-select symmetry based on current system
            const currentSys = document.getElementById('coord-system')?.value;
            const symSelect = this.elements['gen-symmetry'];
            const presetSelect = this.elements['gen-preset'];

            if (currentSys === 'icosahedral') {
                if (symSelect) symSelect.value = 'icosahedral';
                // Auto-pick 'platonic' for Ico mode as it's the most likely desired start
                if (presetSelect) {
                    presetSelect.value = 'platonic';
                    // Trigger change to set values
                    presetSelect.dispatchEvent(new Event('change'));
                }
            } else if (currentSys === 'cubic') {
                if (symSelect && symSelect.value === 'icosahedral') symSelect.value = 'cubic';
            }
            this._toggleModal('generator-modal', true);
        });
        this._bindClick('btn-collection', (e) => {
            this._toggleModal('generator-modal', true);
            // Optionally scroll to results?
            const results = this.elements['gen-results'];
            if (results) results.scrollIntoView({ behavior: 'smooth' });
        });
        this._bindClick('gen-close', (e) => this._toggleModal('generator-modal', false));
        this.elements['gen-start']?.addEventListener('click', () => {
            const config = {
                symmetryGroup: this._getValue('gen-symmetry'),
                count: this._getValue('gen-count'),
                minFaces: this._getValue('gen-minfaces'),
                minVolumes: this._getValue('gen-minvolumes'),
                maxEdges: this._getValue('gen-maxedges')
            };
            if (this.callbacks['onGenerate']) this.callbacks['onGenerate'](config);
        });
        this.elements['gen-systematic']?.addEventListener('click', () => {
            const config = {
                mode: 'systematic',
                symmetryGroup: 'cubic', // Systematic implies Cubic/Oh generally
                gridSize: 3
            };
            if (this.callbacks['onGenerateSystematic']) this.callbacks['onGenerateSystematic'](config);
        });
    }

    _setValue(id, val) {
        const el = this.elements[id];
        if (el) el.value = val;
    }

    _bindClick(id, action) {
        const el = this.elements[id];
        if (!el) return;

        if (typeof action === 'function') {
            el.addEventListener('click', (e) => {
                console.log(`UIManager: Clicked ${id} (internal)`);
                action(e);
            });
        } else if (typeof action === 'string' && this.callbacks[action]) {
            el.addEventListener('click', (e) => {
                console.log(`UIManager: Clicked ${id} (callback: ${action})`);
                this.callbacks[action](e);
            });
        }
    }

    _bindChange(id, action) {
        const el = this.elements[id];
        if (!el) return;

        if (typeof action === 'function') {
            el.addEventListener('change', (e) => {
                const val = this._getValue(id);
                action(val, e);
            });
        } else if (typeof action === 'string' && this.callbacks[action]) {
            el.addEventListener('change', (e) => {
                const val = this._getValue(id);
                this.callbacks[action](val, e);
            });
        }
    }

    _bindInput(id, action) {
        const el = this.elements[id];
        if (!el) return;

        if (typeof action === 'function') {
            el.addEventListener('input', (e) => action(this._getValue(id), e));
        } else if (typeof action === 'string' && this.callbacks[action]) {
            el.addEventListener('input', (e) => this.callbacks[action](this._getValue(id), e));
        }
    }

    _getValue(id) {
        const el = this.elements[id];
        if (!el) return null;
        if (el.type === 'checkbox') return el.checked;
        if (el.type === 'number' || el.type === 'range') return parseFloat(el.value);
        return el.value;
    }

    triggerChange(id) {
        const el = this.elements[id];
        if (el) {
            el.dispatchEvent(new Event('change'));
        }
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
                inversion: this._getValue('toggle-inversion'),
                fullIcosa: this._getValue('toggle-full-icosa')
            },
            rotation: {
                axis: this._getValue('rotation-axis')
            },
            translation: {
                axis: this._getValue('translation-axis'),
                count: this._getValue('translation-count'),
                step: this._getValue('translation-step'),
                connect: this._getValue('translation-connect')
            },
            rotoreflection: {
                enabled: this._getValue('rotoreflection-enabled'),
                axis: this._getValue('rotoreflection-axis'),
                plane: this._getValue('rotoreflection-plane'),
                angleDeg: this._getValue('rotoreflection-angle'),
                count: this._getValue('rotoreflection-count'),
                connect: this._getValue('rotoreflection-connect')
            },
            screw: {
                enabled: this._getValue('screw-enabled'),
                axis: this._getValue('screw-axis'),
                angleDeg: this._getValue('screw-angle'),
                distance: this._getValue('screw-distance'),
                count: this._getValue('screw-count'),
                connect: this._getValue('screw-connect')
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

        // Clear existing (except maybe first default?)
        select.innerHTML = '';

        // Add default option
        const defOpt = document.createElement('option');
        defOpt.value = 'none';
        defOpt.textContent = 'Preset wählen …';
        select.appendChild(defOpt);

        presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.label;
            select.appendChild(opt);
        });
    }

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

    updateGenerationProgress(current, total) {
        const status = this.elements['gen-status'];
        if (status) {
            const percent = Math.round((current / total) * 100);
            status.textContent = `Generating... ${current}/${total} (${percent}%)`;
        }
    }

    showGenerationResults(results) {
        this.setGenerationLoading(false);
        const container = this.elements['gen-results'];
        const status = this.elements['gen-status'];
        if (status) status.textContent = `Generated ${results.length} forms.`;

        if (status) status.textContent = `Generated ${results.length} forms.`;

        // If results are incremental (systematic), we might want to APPEND or replace?
        // Current logic replaces. For systematic, we get results incrementally?
        // App.js currently accumulates results in 'runSystematicGeneration'.
        // Let's assume 'results' here is the FULL list or the new batch.
        // For simplicity, we clear and rebuild (simpler for 50 items).

        if (!container) return;
        container.innerHTML = '';

        results.forEach((res, idx) => {
            const wrapper = document.createElement('div');
            wrapper.style.background = 'var(--surface-strong, #333)'; // Fallback to dark if var missing
            wrapper.style.padding = '8px';
            wrapper.style.borderRadius = '6px';
            wrapper.style.display = 'flex';
            wrapper.style.gap = '12px';
            wrapper.style.alignItems = 'center';
            wrapper.style.marginBottom = '8px';
            wrapper.style.border = '1px solid var(--border, #555)';

            // Thumbnail
            const thumbDiv = document.createElement('div');
            thumbDiv.style.width = '60px';
            thumbDiv.style.height = '60px';
            thumbDiv.style.background = '#ffffff'; // Solid white for contrast
            thumbDiv.style.borderRadius = '4px';
            thumbDiv.style.display = 'flex';
            thumbDiv.style.alignItems = 'center';
            thumbDiv.style.justifyContent = 'center';
            thumbDiv.innerHTML = this._generateThumbnailSVG(res);
            wrapper.appendChild(thumbDiv);

            // Info
            const info = document.createElement('div');
            info.style.flex = '1';
            const faces = res.metadata ? res.metadata.faceCount : '?';
            const volumes = res.metadata && res.metadata.volumeCount !== undefined ? res.metadata.volumeCount : 0;
            const sym = res.metadata ? res.metadata.symmetry : '?';
            info.innerHTML = `<div style="font-weight:600;font-size:0.9rem;">Form #${idx + 1}</div>
                              <div style="font-size:0.75rem;opacity:0.7;">Faces: ${faces} • Volumes: ${volumes} • ${sym}</div>`;
            wrapper.appendChild(info);

            // Action
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.textContent = 'Load';
            btn.style.padding = '6px 12px';
            btn.style.fontSize = '0.85rem';
            btn.onclick = () => {
                if (this.callbacks['onLoadResult']) this.callbacks['onLoadResult'](res);
                this._toggleModal('generator-modal', false);
            };
            wrapper.appendChild(btn);

            container.appendChild(wrapper);
        });
    }

    _generateThumbnailSVG(form) {
        // Simple Isometric projection
        // x_screen = (x - z) * cos(30)
        // y_screen = y + (x + z) * sin(30)  -- approx

        const points = form.points;
        const lines = form.lines;

        if (!points || points.length === 0) return '';

        // Project points
        const proj = points.map(p => {
            // ISO projection
            const isoX = (p.x - p.z) * 0.707;
            const isoY = p.y + (p.x + p.z) * 0.4; // simpler tilt
            return { x: isoX, y: -isoY }; // -y because SVG y goes down
        });

        // Compute bounds
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        proj.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });

        // Add padding
        const pad = 0.2;
        const width = Math.max(0.1, maxX - minX);
        const height = Math.max(0.1, maxY - minY);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const size = Math.max(width, height) * (1 + pad);

        const viewBox = `${cx - size / 2} ${cy - size / 2} ${size} ${size}`;

        let svg = `<svg viewBox="${viewBox}" width="100%" height="100%" style="overflow:visible;">`;

        // Styles
        const strokeColor = '#000000'; // Black lines on white background
        const strokeWidth = size * 0.03;

        lines.forEach(l => {
            const p1 = proj[l.a];
            const p2 = proj[l.b];
            svg += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="1" vector-effect="non-scaling-stroke" />`;
        });

        svg += '</svg>';
        return svg;
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

    updateSymmetryUI(system) {
        const cubicDiv = this.elements['cubic-symmetries'];
        const icoDiv = this.elements['icosahedral-symmetries'];

        if (system === 'icosahedral') {
            if (cubicDiv) cubicDiv.style.display = 'none';
            if (icoDiv) icoDiv.style.display = 'grid';
        } else {
            if (cubicDiv) cubicDiv.style.display = 'grid';
            if (icoDiv) icoDiv.style.display = 'none';
        }
    }

    showNotification(message, duration = 3000) {
        const id = 'ui-notification-toast';
        let toast = document.getElementById(id);
        if (!toast) {
            toast = document.createElement('div');
            toast.id = id;
            toast.style.position = 'fixed';
            toast.style.bottom = '20px';
            toast.style.left = '50%';
            toast.style.transform = 'translateX(-50%)';
            toast.style.background = 'rgba(0,0,0,0.85)';
            toast.style.color = '#fff';
            toast.style.padding = '10px 20px';
            toast.style.borderRadius = '20px'; // pill shape
            toast.style.fontFamily = 'sans-serif';
            toast.style.fontSize = '0.9rem';
            toast.style.zIndex = '10000';
            toast.style.transition = 'opacity 0.3s';
            toast.style.pointerEvents = 'none';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';

        if (this._toastTimeout) clearTimeout(this._toastTimeout);
        this._toastTimeout = setTimeout(() => {
            toast.style.opacity = '0';
        }, duration);
    }
}
