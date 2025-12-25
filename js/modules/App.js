import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';
import { CONFIG } from './Config.js';
import { SceneManager } from './SceneManager.js';
import { InputManager } from './InputManager.js';
import { UIManager } from './UIManager.js';
import { SymmetryEngine } from './SymmetryEngine.js';
import { GeometryUtils } from './GeometryUtils.js';
import { LocalizationManager } from './LocalizationManager.js';

export class App {
    constructor() {
        this.container = document.querySelector('#canvas-container');
        if (!this.container) {
            console.error('Canvas container not found!');
            return;
        }

        this.sceneManager = new SceneManager(this.container);
        this.symmetry = new SymmetryEngine();
        this.localization = new LocalizationManager();

        this.worker = null;
        this._initWorker();

        // State
        this.gridDivisions = 1;
        this.gridPoints = [];
        this.pointLookup = new Map();
        this.pointIndexLookup = new Map();
        this.edges = new Map(); // key -> Edge
        this.vertices = new Map(); // key -> Vertex
        this.manualFaces = new Map();
        this.manualVolumes = new Map();
        this.baseSegments = []; // Array of segment objects {start, end, key, ...}

        this.history = [];
        this.future = [];

        this.vertexUsage = new Map();
        this.vertexIdCounter = 0;
        this.edgeIdCounter = 0;
        this.cubeBounds = new THREE.Box3(
            new THREE.Vector3(-CONFIG.CUBE_HALF_SIZE, -CONFIG.CUBE_HALF_SIZE, -CONFIG.CUBE_HALF_SIZE),
            new THREE.Vector3(CONFIG.CUBE_HALF_SIZE, CONFIG.CUBE_HALF_SIZE, CONFIG.CUBE_HALF_SIZE)
        );

        // Selection
        this.selectionBuffer = []; // Array of indices
        this.selectedPointIndices = new Set();

        // Visibility
        this.showPoints = true;
        this.showLines = true;
        this.useCurvedLines = false;
        this.useCurvedSurfaces = false;
        this.showClosedForms = true;
        this.autoCloseFaces = false;
        this.useRegularHighlight = false;

        // Managers
        this.inputManager = new InputManager(this.container, this.sceneManager, {
            onClick: (intersect, pointer) => this._onPointClick(intersect),
            onHover: (intersect) => this._onPointHover(intersect)
        });

        this.uiManager = new UIManager(document.body, {
            onThemeToggle: () => this._toggleTheme(),
            onUndo: () => this._undo(),
            onRedo: () => this._redo(),
            onClear: () => this._clearAll(),
            onDensityChange: (val) => this._updateGridDensity(val),
            onSymmetryChange: () => this._updateSymmetry(),
            onCloseFace: () => this._closeSelectedFace(),
            onCloseVolume: () => this._closeSelectedVolume(),
            onAutoCloseAll: () => this._autoCloseAll(),
            onTogglePoints: (val) => this._updateVisibility('points', val),
            onToggleLines: (val) => this._updateVisibility('lines', val),
            onToggleCurvedLines: (val) => this._updateVisibility('curvedLines', val),
            onToggleCurvedSurfaces: (val) => this._updateVisibility('curvedSurfaces', val),
            onToggleShowClosed: (val) => this._updateVisibility('closedForms', val),
            onToggleAutoClose: (val) => { this.autoCloseFaces = val; },
            onToggleColorHighlights: (val) => { this.useRegularHighlight = val; this._rebuildSymmetryObjects(); },
            onExportJSON: () => this._exportJSON(),
            onExportOBJ: () => this._exportOBJ(),
            onExportSTL: () => this._exportSTL(),
            onGenerate: (config) => this.generateForms(config),
            onLoadResult: (res) => this.loadGeneratedForm(res)
        });

        this._updateGridDensity(1);
        this._startRenderLoop();
        this._initLocalization().then(() => this._updateStatusDisplay());
    }

    _initWorker() {
        this.worker = new Worker('js/workers/generationWorker.js', { type: 'module' });
        this.worker.onmessage = (e) => {
            const { type, results, message, current, total } = e.data;
            if (type === 'success') {
                console.log('Generated forms:', results);
                if (this.uiManager.showGenerationResults) {
                    this.uiManager.showGenerationResults(results);
                }
            } else if (type === 'progress') {
                if (this.uiManager.updateGenerationProgress) {
                    this.uiManager.updateGenerationProgress(current, total);
                }
            } else {
                console.error('Worker error:', message);
                if (this.uiManager.showGenerationError) {
                    this.uiManager.showGenerationError(message);
                }
            }
        };
    }

    generateForms(config) {
        if (this.worker) {
            if (this.uiManager.setGenerationLoading) this.uiManager.setGenerationLoading(true);
            const workerConfig = {
                count: config.count || 5,
                minFaces: config.minFaces || 0,
                gridSize: 3, // Keep internal grid size 3 for generator logic
                pointDensity: this.gridDivisions + 1, // Match App density
                options: {
                    mode: config.mode,
                    symmetryGroup: config.symmetryGroup
                }
            };
            this.worker.postMessage(workerConfig);
        }
    }

    loadGeneratedForm(formData) {
        this._clearAll();

        // Simple reconstruction
        if (formData.lines) {
            formData.lines.forEach(l => {
                const start = new THREE.Vector3(l.start.x, l.start.y, l.start.z);
                const end = new THREE.Vector3(l.end.x, l.end.y, l.end.z);

                // Find grid points to snap to? 
                // The generator uses grid points.
                // We can match them to this.gridPoints

                const findP = (v) => {
                    let best = null, minD = 1e-6;
                    for (let gp of this.gridPoints) {
                        const d = gp.distanceTo(v);
                        if (d < minD) { minD = d; best = gp; }
                    }
                    return best;
                };

                const p1 = findP(start);
                const p2 = findP(end);

                if (p1 && p2) {
                    // Create segment manually
                    // We need indices
                    const i1 = this.pointIndexLookup.get(GeometryUtils.pointKey(p1));
                    const i2 = this.pointIndexLookup.get(GeometryUtils.pointKey(p2));
                    if (i1 !== undefined && i2 !== undefined) {
                        this._createSegment(i1, i2);
                    }
                }
            });
        }
        this._updateStatusDisplay();
    }

    async _initLocalization() {
        // Basic language detection
        const params = new URLSearchParams(window.location.search);
        const lang = params.get('lang') || (navigator.language.startsWith('de') ? 'de' : 'en');
        await this.localization.setLocale(lang);
    }

    _startRenderLoop() {
        this.sceneManager.renderer.setAnimationLoop(() => {
            this.sceneManager.render();
        });
    }

    _toggleTheme() {
        const root = document.documentElement;
        const current = root.dataset.theme === 'dark' ? 'dark' : 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        root.dataset.theme = next;
        this.sceneManager.updateTheme(next);
    }

    _updateGridDensity(val) {
        this.gridDivisions = Math.max(1, Math.floor(val));
        this._generateGridPoints();
        this._rebuildVisuals();
        this._clearAll();
    }

    _generateGridPoints() {
        this.gridPoints = [];
        this.pointLookup.clear();
        this.pointIndexLookup.clear();

        const count = this.gridDivisions;
        const step = (CONFIG.CUBE_HALF_SIZE * 2) / count;

        const positions = [];
        for (let i = 0; i <= count; i++) {
            positions.push(parseFloat((-CONFIG.CUBE_HALF_SIZE + step * i).toFixed(5)));
        }

        positions.forEach(x => {
            positions.forEach(y => {
                positions.forEach(z => {
                    const point = new THREE.Vector3(x, y, z);
                    const key = GeometryUtils.pointKey(point);
                    this.pointLookup.set(key, point);
                    this.pointIndexLookup.set(key, this.gridPoints.length);
                    this.gridPoints.push(point);
                });
            });
        });

        const hasCenter = positions.some(v => Math.abs(v) < 1e-6);
        if (!hasCenter && this.gridDivisions > 1) {
            const center = new THREE.Vector3(0, 0, 0);
            const key = GeometryUtils.pointKey(center);
            this.pointLookup.set(key, center);
            this.pointIndexLookup.set(key, this.gridPoints.length);
            this.gridPoints.push(center);
        }
    }

    _rebuildVisuals() {
        const geom = new THREE.SphereGeometry(0.01, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });

        if (this.gridMesh) {
            this.sceneManager.scene.remove(this.gridMesh);
        }

        this.gridMesh = new THREE.InstancedMesh(geom, mat, this.gridPoints.length);
        const dummy = new THREE.Object3D();

        this.gridPoints.forEach((p, i) => {
            dummy.position.copy(p);
            dummy.updateMatrix();
            this.gridMesh.setMatrixAt(i, dummy.matrix);
        });
        this.gridMesh.instanceMatrix.needsUpdate = true;
        this.sceneManager.scene.add(this.gridMesh);

        this.inputManager.setPickableMeshes([this.gridMesh]);
    }

    _onPointClick(intersect) {
        if (!intersect) return;
        const instanceId = intersect.instanceId;
        if (instanceId === undefined) return;

        const pointIndex = instanceId;
        const lastIndex = this.selectionBuffer.length > 0 ? this.selectionBuffer[this.selectionBuffer.length - 1] : null;

        this.selectionBuffer.push(pointIndex);
        this.selectedPointIndices.add(pointIndex);

        if (lastIndex !== null && lastIndex !== pointIndex) {
            this._createSegment(lastIndex, pointIndex);
        }

        // Update Selection Visuals (highlighting)
        // For now, simpler implementation:
        this._rebuildSymmetryObjects();
    }

    _onPointHover(intersect) {
        // Optional: highlight point
    }

    _createSegment(indexA, indexB) {
        const pointA = this.gridPoints[indexA];
        const pointB = this.gridPoints[indexB];
        if (!pointA || !pointB) return;

        const segment = {
            start: pointA.clone(),
            end: pointB.clone(),
            key: GeometryUtils.segmentKey(pointA, pointB),
            indices: [indexA, indexB],
            origin: 'manual'
        };

        // Setup undo history
        this._pushHistory({
            type: 'addSegment',
            segment: segment
        });

        this.baseSegments.push(segment);
        this._commitEdge(segment);
        this._rebuildSymmetryObjects();
    }

    _commitEdge(segment) {
        if (!segment) return;
        const key = segment.key;
        if (this.edges.has(key)) return;

        // Simplified vertex/edge usage tracking
        this.edges.set(key, segment);
    }

    _pushHistory(action) {
        this.history.push(action);
        this.future = [];
    }

    _undo() {
        if (this.history.length === 0) return;
        const action = this.history.pop();
        this.future.push(action);

        if (action.type === 'addSegment') {
            const idx = this.baseSegments.findIndex(s => s.key === action.segment.key);
            if (idx > -1) {
                this.baseSegments.splice(idx, 1);
                this.edges.delete(action.segment.key);
            }
            // Remove from selection buffer if it was the last action?
            // Selection state is tricky to undo perfectly without storing it.
            // For now, we just rebuild.
        }
        this._rebuildSymmetryObjects();
    }

    _redo() {
        if (this.future.length === 0) return;
        const action = this.future.pop();
        this.history.push(action);

        if (action.type === 'addSegment') {
            this.baseSegments.push(action.segment);
            this._commitEdge(action.segment);
        }
        this._rebuildSymmetryObjects();
    }

    _clearAll() {
        this.baseSegments = [];
        this.edges.clear();
        this.vertices.clear();
        this.manualFaces.clear();
        this.manualVolumes.clear();
        this.selectionBuffer = [];
        this.selectedPointIndices.clear();
        this.history = [];
        this.future = [];
        this._rebuildSymmetryObjects();
    }

    _updateSymmetry() {
        const state = this.uiManager.getSymmetryState();
        this.symmetry.settings.reflections = state.reflections;
        this.symmetry.settings.rotation = state.rotation;
        this.symmetry.settings.translation = state.translation;
        this.symmetry.settings.rotoreflection = state.rotoreflection;
        this.symmetry.settings.screw = state.screw;
        this._rebuildSymmetryObjects();
    }

    _updateVisibility(what, val) {
        if (what === 'points') this.showPoints = val;
        if (what === 'lines') this.showLines = val;
        if (what === 'curvedLines') this.useCurvedLines = val;
        if (what === 'curvedSurfaces') this.useCurvedSurfaces = val;
        if (what === 'closedForms') this.showClosedForms = val;

        this._rebuildSymmetryObjects();

        // Direct update for simple props
        if (what === 'points') {
            if (this.gridMesh) this.gridMesh.visible = val;
        }
    }

    _rebuildSymmetryObjects() {
        // 1. Remove old symmetry group
        if (this.symmetryGroup) {
            this.sceneManager.scene.remove(this.symmetryGroup);
        }

        this.symmetryGroup = new THREE.Group();

        // 2. Generate Copies
        // Transform segments
        const transforms = this.symmetry.getTransforms();

        if (this.showLines) {
            const lineMat = new THREE.LineBasicMaterial({ color: 0x000000 }); // Theme sensitive?
            const points = [];

            this.baseSegments.forEach(seg => {
                transforms.forEach(matrix => {
                    const start = seg.start.clone().applyMatrix4(matrix);
                    const end = seg.end.clone().applyMatrix4(matrix);
                    points.push(start, end);
                });
            });

            if (points.length > 0) {
                const geom = new THREE.BufferGeometry().setFromPoints(points);
                const lines = new THREE.LineSegments(geom, lineMat);
                this.symmetryGroup.add(lines);
            }
        }

        // Handle Curved Lines / Faces...
        // (Omitted for brevity in this step, but standard structure applies)

        this.sceneManager.scene.add(this.symmetryGroup);

        // Update UI Counts
        // Calculate faces/volumes
        const faceCount = 0; // Placeholder
        const volCount = 0;
        this._updateStatusDisplay();
    }

    _updateStatusDisplay() {
        const faceCount = 0; // Placeholder until implemented
        const volCount = 0; // Placeholder

        const fLabel = this.localization.translate('ui.faces') || 'Faces';
        const vLabel = this.localization.translate('ui.volumes') || 'Volumes';

        this.uiManager.updateStatus(`${fLabel}: ${faceCount} | ${vLabel}: ${volCount}`);
    }

    _closeSelectedFace() {
        // Stub
    }
    _closeSelectedVolume() {
        // Stub
    }
    _autoCloseAll() {
        // Stub
    }
    _exportJSON() {
        // Stub
    }
    _exportOBJ() {
        // Stub
    }
    _exportSTL() {
        // Stub
    }
}
