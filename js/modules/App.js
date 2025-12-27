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

        // Initialize Theme from DOM
        const initialTheme = document.documentElement.dataset.theme || 'light';
        // Ensure DOM matches default if missing
        if (!document.documentElement.dataset.theme) {
            document.documentElement.dataset.theme = initialTheme;
        }

        this.sceneManager = new SceneManager(this.container);
        this.symmetry = new SymmetryEngine();
        this.localization = new LocalizationManager();
        this.sceneManager.updateTheme(initialTheme);

        this.worker = null;
        this._initWorker();

        // State
        this.gridDivisions = 1;
        this.gridPoints = [];
        this.pointLookup = new Map();
        this.pointIndexLookup = new Map();
        this.pointKeyLookup = new Map(); // Index -> Key
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
        this.selectionBuffer = []; // Legacy support
        this.selectedPointIndices = new Set();
        this.activePointIndex = null;

        // Visibility
        this.showPoints = true;
        this.showLines = true;
        this.useCurvedLines = false;
        this.useCurvedSurfaces = false;
        this.showClosedForms = true;
        // Visibility
        this.showPoints = true;
        this.showLines = true;
        this.useCurvedLines = false;
        this.useCurvedSurfaces = false;
        this.showClosedForms = true;
        this.autoCloseFaces = true; // Auto-close DEFAULT true as per user request implicit in "Face detection missing"
        this.useRegularHighlight = false;

        // Curved Surface Settings
        this.curvedSurfaceCurvature = 0.3;
        this.curvedSurfaceSegments = 16;

        // Graph
        this.adjacencyGraph = new Map();

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
            onToggleAutoRotate: (val) => this.sceneManager.toggleAutoRotate(val),
            onExportJSON: () => this._exportJSON(),
            onExportOBJ: () => this._exportOBJ(),
            onExportSTL: () => this._exportSTL(),
            onGenerate: (config) => this.generateForms(config),
            onLoadResult: (res) => this.loadGeneratedForm(res)
        });

        this._updateGridDensity(1);
        this._setDefaultSymmetry();
        this._startRenderLoop();
        this._initLocalization().then(() => this._updateStatusDisplay());
    }

    _setDefaultSymmetry() {
        // Enforce full "Cubic" defaults: Reflections + Rotations

        // 1. UI Defaults
        const defaults = ['reflection-xy', 'reflection-yz', 'reflection-zx'];
        defaults.forEach(id => {
            if (this.uiManager.elements[id]) {
                this.uiManager.elements[id].checked = true;
            }
        });
        if (this.uiManager.elements['rotation-axis']) {
            this.uiManager.elements['rotation-axis'].value = 'all';
        }

        // 2. Engine Defaults (Force Sync)
        if (this.symmetry) {
            this.symmetry.settings.reflections = { xy: true, yz: true, zx: true, inversion: false };
            this.symmetry.settings.rotation = { axis: 'all', steps: 4 };
        }

        // 3. Trigger updates
        this._updateSymmetry();
    }


    _initWorker() {
        this.worker = new Worker('js/workers/generationWorker.js', { type: 'module' });
        this.worker.onerror = (e) => {
            console.error('Worker Script Error Event:', e);
            const msg = e.message || 'Unknown Worker Error';
            console.error('Worker Details:', msg, e.filename, e.lineno);
            if (this.uiManager && this.uiManager.showGenerationError) {
                this.uiManager.showGenerationError(`Worker Error: ${msg}`);
            }
        };
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
                    symmetryGroup: config.symmetryGroup,
                    maxEdges: config.maxEdges
                }
            };
            this.worker.postMessage(workerConfig);
        }
    }

    loadGeneratedForm(formData) {
        this._clearAll();

        // 1. Dynamic Point Merging
        // Instead of snapping to existing grid, we existing grid + new points.
        // This guarantees all points exist.

        // We need to map generator Point Index (0..N) to App Grid Index.
        const genToAppIndex = new Map();

        if (formData.points) {
            formData.points.forEach((p, genIdx) => {
                const vec = new THREE.Vector3(p.x, p.y, p.z);

                // Try to find existing close point
                let bestIdx = -1;
                let minD = 1e-4; // Tolerance

                for (let i = 0; i < this.gridPoints.length; i++) {
                    const d = this.gridPoints[i].distanceTo(vec);
                    if (d < minD) {
                        minD = d;
                        bestIdx = i;
                    }
                }

                if (bestIdx !== -1) {
                    genToAppIndex.set(genIdx, bestIdx);
                } else {
                    // New Point! Add to App Grid.
                    const newIdx = this.gridPoints.length;
                    this.gridPoints.push(vec.clone());

                    // Update lookups
                    const key = GeometryUtils.pointKey(vec);
                    this.pointLookup.set(key, vec);
                    this.pointIndexLookup.set(key, newIdx);

                    genToAppIndex.set(genIdx, newIdx);
                }
            });

            // WE MUST REBUILD VISUALS because gridPoints changed
            this._rebuildVisuals();
        }

        // 2. Reconstruct Lines
        if (formData.lines) {
            formData.lines.forEach(l => {
                const iA = genToAppIndex.get(l.a);
                const iB = genToAppIndex.get(l.b);
                if (iA !== undefined && iB !== undefined && iA !== iB) {
                    this._createSegment(iA, iB);
                }
            });
        }

        // 3. Load Faces with Geometric Deduplication
        if (formData.faces) {
            const uniqueGeomKeys = new Set();

            formData.faces.forEach(faceIndices => {
                const appIndices = faceIndices.map(idx => genToAppIndex.get(idx)).filter(i => i !== undefined);

                if (appIndices.length >= 3) {
                    // Geometric Dedup: Calculate Centroid + Normal
                    const points = appIndices.map(i => this.gridPoints[i]);
                    const center = new THREE.Vector3();
                    points.forEach(p => center.add(p));
                    center.divideScalar(points.length);

                    // Simple Normal (first 3 points)
                    const v1 = new THREE.Vector3().subVectors(points[1], points[0]);
                    const v2 = new THREE.Vector3().subVectors(points[2], points[0]);
                    const norm = new THREE.Vector3().crossVectors(v1, v2).normalize();

                    // Key: Center + Abs(Normal) (to ignore flipping)
                    const k = `${center.x.toFixed(3)}_${center.y.toFixed(3)}_${center.z.toFixed(3)}__${Math.abs(norm.x).toFixed(3)}_${Math.abs(norm.y).toFixed(3)}_${Math.abs(norm.z).toFixed(3)}`;

                    if (!uniqueGeomKeys.has(k)) {
                        uniqueGeomKeys.add(k);

                        // Valid unique face
                        const sortKey = appIndices.slice().sort().join('_');
                        if (!this.manualFaces.has(sortKey)) {
                            this.manualFaces.set(sortKey, { indices: appIndices, origin: 'generated' });
                        }
                    }
                }
            });
        }

        // 4. Symmetry Reset DEACTIVATED (User Request: "Symmetries Default")
        // We now keep the symmetry checkboxes ACTIVE.
        // Geometric Deduplication (Step 3) ensures that applying symmetries to a symmetric loaded form
        // does not duplicate faces.
        // 4. Reset Symmetry (User expects loaded object to be the base)
        // We MUST reset this to avoid visual doubling/chaos.
        if (this.uiManager) {
            const symControls = [
                'reflection-xy', 'reflection-yz', 'reflection-zx', 'toggle-inversion',
                'rotation-axis',
                'rotoreflection-enabled', 'screw-enabled'
            ];
            symControls.forEach(id => {
                const el = this.uiManager.elements[id];
                if (el) {
                    if (el.type === 'checkbox') el.checked = false;
                    else if (el.type === 'range' || el.type === 'number') el.value = 0;
                }
            });
            this._updateSymmetry();
        }

        // 5. Calculate Volume (Robust Component Analysis)
        // Strict Edge Parity fails on complex self-intersecting stars (104 faces).
        // Euler Heuristic fails on disjoint squares.
        // SOLUTION: Count Connected Components of Faces.
        // If a cluster of faces has >= 4 faces, it is a 'Volume' candidate.

        // Build Adjacency Graph: edgeKey -> [faceIndex, faceIndex...]
        const edgeToFaces = new Map();
        const facesArray = Array.from(this.manualFaces.values()); // Order matters for index

        facesArray.forEach((face, fIdx) => {
            const indices = face.indices;
            for (let i = 0; i < indices.length; i++) {
                const a = indices[i];
                const b = indices[(i + 1) % indices.length];
                const key = a < b ? `${a}-${b}` : `${b}-${a}`;
                if (!edgeToFaces.has(key)) edgeToFaces.set(key, []);
                edgeToFaces.get(key).push(fIdx);
            }
        });

        // Find Components (Flood Fill)
        const visited = new Set();
        const components = [];

        for (let i = 0; i < facesArray.length; i++) {
            if (visited.has(i)) continue;

            const cluster = [];
            const queue = [i];
            visited.add(i);

            while (queue.length > 0) {
                const curr = queue.pop();
                cluster.push(curr);

                // Find neighbors via edges
                const face = facesArray[curr];
                const indices = face.indices;
                for (let j = 0; j < indices.length; j++) {
                    const a = indices[j];
                    const b = indices[(j + 1) % indices.length];
                    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
                    const neighbors = edgeToFaces.get(key);
                    if (neighbors) {
                        neighbors.forEach(nIdx => {
                            if (!visited.has(nIdx)) {
                                visited.add(nIdx);
                                queue.push(nIdx);
                            }
                        });
                    }
                }
            }
            components.push(cluster);
        }

        // Filter Volumes
        const validVolumes = components.filter(c => c.length >= 4);

        this.manualVolumes.clear();
        validVolumes.forEach((comp, idx) => {
            // Mark faces for rendering
            comp.forEach(fIdx => {
                facesArray[fIdx]._isVolume = true;
            });

            this.manualVolumes.set(`vol_comp_${idx}`, {
                faces: comp.map(fi => facesArray[fi]),
                origin: 'component_analysis'
            });
        });

        this._updateStatusDisplay();
        this._rebuildSymmetryObjects();
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

        // Update Grid Points Color
        // Light Mode -> Black Nodes (0x000000)
        // Dark Mode -> White Nodes (0xffffff)
        if (this.gridMesh) {
            const color = next === 'dark' ? 0xffffff : 0x000000;
            this.gridMesh.material.color.setHex(color);
        }
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
        this.pointKeyLookup.clear();

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
                    this.pointKeyLookup.set(this.gridPoints.length, key);
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
            this.pointKeyLookup.set(this.gridPoints.length, key);
            this.gridPoints.push(center);
        }
    }

    _rebuildVisuals() {
        const geom = new THREE.SphereGeometry(0.01, 8, 8);
        const theme = document.documentElement.dataset.theme || 'light';
        const color = theme === 'dark' ? 0xffffff : 0x000000;
        const mat = new THREE.MeshBasicMaterial({ color: color });

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
        this._updateNodeColors();
        this.sceneManager.scene.add(this.gridMesh);

        // Picking Cloud (Invisible, larger targets)
        if (this.pickingCloud) {
            this.sceneManager.scene.remove(this.pickingCloud);
        }
        const pickGeom = new THREE.BufferGeometry().setFromPoints(this.gridPoints);

        // Dynamic Size: Scaling with density to avoid overlap
        // Grid Size 1 means range 1.0. Divisions N. Step = 1/N.
        // We want hit area to be smaller than step/2.
        const spacing = 1.0 / Math.max(1, this.gridDivisions);
        const hitSize = Math.max(0.04, Math.min(0.1, spacing * 0.6));

        const pickMat = new THREE.PointsMaterial({
            color: 0xff0000,
            size: hitSize,
            transparent: true,
            opacity: 0.0, // Invisible
            depthTest: false // Always hittable? Maybe keep true to avoid hitting back points.
        });
        this.pickingCloud = new THREE.Points(pickGeom, pickMat);
        this.pickingCloud.name = 'GridPoints'; // Helper for InputManager
        this.sceneManager.scene.add(this.pickingCloud);

        // Prioritize Picking Cloud
        this.inputManager.setPickableMeshes([this.pickingCloud, this.gridMesh]);
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
        } else if (action.type === 'addSegments') {
            action.segments.forEach(seg => {
                const idx = this.baseSegments.findIndex(s => s.key === seg.key);
                if (idx > -1) {
                    this.baseSegments.splice(idx, 1);
                    this.edges.delete(seg.key);
                }
            });
        }
        this._updateFaces(); // Re-detect because we might have broken faces
        this._rebuildSymmetryObjects();
    }

    _redo() {
        if (this.future.length === 0) return;
        const action = this.future.pop();
        this.history.push(action);

        if (action.type === 'addSegment') {
            this.baseSegments.push(action.segment);
            this._commitEdge(action.segment);
        } else if (action.type === 'addSegments') {
            action.segments.forEach(seg => {
                this.baseSegments.push(seg);
                this._commitEdge(seg);
            });
        }
        this._updateFaces();
        this._rebuildSymmetryObjects();
    }

    _clearAll() {
        this.baseSegments = [];
        this.baseFaces = [];
        this.baseVolumes = [];
        this.edges.clear();
        this.vertices.clear();
        this.manualFaces.clear();
        this.manualVolumes.clear();
        this.selectionBuffer = [];
        this.selectedPointIndices.clear();
        this.activePointIndex = null;
        this.history = [];
        this.future = [];
        this._rebuildSymmetryObjects();
    }

    _updateSymmetry() {
        const state = this.uiManager.getSymmetryState();
        this.symmetry.settings.reflections = state.reflections;
        // Merge rotation separately to preserve 'steps' defaults if not in UI
        if (state.rotation) {
            Object.assign(this.symmetry.settings.rotation, state.rotation);
        }

        Object.assign(this.symmetry.settings.translation, state.translation);
        Object.assign(this.symmetry.settings.rotoreflection, state.rotoreflection);
        Object.assign(this.symmetry.settings.screw, state.screw);
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

    _onPointClick(intersect) {
        if (!intersect) return;
        // Handle both InstancedMesh (instanceId) and Points (index)
        let pointIndex = intersect.instanceId;
        if (pointIndex === undefined) pointIndex = intersect.index;

        if (pointIndex === undefined) return;

        if (this.activePointIndex === null) {
            // Select first point
            this.activePointIndex = pointIndex;
        } else if (this.activePointIndex === pointIndex) {
            // Deselect if same
            this.activePointIndex = null;
        } else {
            // Create Segment
            this._createSegment(this.activePointIndex, pointIndex);
            // Clear selection after creation (Legacy behavior)
            this.activePointIndex = null;
        }

        this._updateNodeColors();
        this._rebuildSymmetryObjects();
    }

    _onPointHover(intersect) {
        if (!intersect) {
            document.body.style.cursor = 'default';
            return;
        }
        if (intersect.instanceId === undefined && intersect.index === undefined) {
            document.body.style.cursor = 'default';
            return;
        }
        document.body.style.cursor = 'pointer';
    }

    _updateNodeColors() {
        if (!this.gridMesh) return;
        const colorNormal = new THREE.Color(0x000000); // Black for normal
        const colorSelected = new THREE.Color(0xff0000); // Red for selected

        for (let i = 0; i < this.gridPoints.length; i++) {
            if (i === this.activePointIndex) {
                this.gridMesh.setColorAt(i, colorSelected);
            } else {
                this.gridMesh.setColorAt(i, colorNormal);
            }
        }
        if (this.gridMesh.instanceColor) this.gridMesh.instanceColor.needsUpdate = true;
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

        // Check if exists
        if (this.baseSegments.some(s => s.key === segment.key)) return;

        // Setup undo history
        this._pushHistory({
            type: 'addSegment',
            segment: segment
        });

        this.baseSegments.push(segment);
        this._commitEdge(segment);

        // Trigger auto-close
        this._updateFaces();

        // Trigger auto-close if enabled
        if (false) { // Disable old autoCloseAll mechanism in favor of continuous detection
            this._autoCloseAll();
        } else {
            this._rebuildSymmetryObjects();
        }
    }

    // --- Presets ---

    _commitSegments(segments) {
        if (!segments || !segments.length) return;

        const added = [];
        segments.forEach(seg => {
            if (this.baseSegments.some(s => s.key === seg.key)) return;
            this.baseSegments.push(seg);
            this._commitEdge(seg);
            added.push(seg);
        });

        if (added.length > 0) {
            this._pushHistory({
                type: 'addSegments',
                segments: added
            });
            this._updateFaces();
            this._rebuildSymmetryObjects();
        }
    }

    applyPreset(presetId) {
        if (!this.presets) this._initializePresets(); // Ensure init

        const preset = this.presets.find(p => p.id === presetId);
        if (!preset) return;

        const segments = preset.build();
        if (segments && segments.length) {
            this._commitSegments(segments);
        }
    }

    _initializePresets() {
        const half = CONFIG.CUBE_HALF_SIZE || 0.5;
        // Helper to find key from coords
        const findKey = (x, y, z) => {
            // Find closest grid point
            // For preset accuracy, we assume standard grid points (corners)
            const v = new THREE.Vector3(x, y, z);
            // We need to match with existing gridPoints to get indices!
            // Presets define geometry, but we need valid segments linked to gridPoints for interaction to work properly.
            // But simple segments are fine too if we map them.
            return GeometryUtils.pointKey(v);
        };

        const corners = [
            new THREE.Vector3(-half, -half, -half),
            new THREE.Vector3(half, -half, -half),
            new THREE.Vector3(-half, half, -half),
            new THREE.Vector3(half, half, -half),
            new THREE.Vector3(-half, -half, half),
            new THREE.Vector3(half, -half, half),
            new THREE.Vector3(-half, half, half),
            new THREE.Vector3(half, half, half)
        ].map(v => GeometryUtils.pointKey(v));

        const originKey = GeometryUtils.pointKey(new THREE.Vector3(0, 0, 0));

        const createSegs = (pairs) => {
            const segs = [];
            pairs.forEach(([k1, k2]) => {
                const p1 = this.pointLookup.get(k1);
                const p2 = this.pointLookup.get(k2);
                if (p1 && p2) {
                    segs.push({
                        start: p1.clone(),
                        end: p2.clone(),
                        key: GeometryUtils.segmentKey(p1, p2),
                        indices: [this.pointIndexLookup.get(k1), this.pointIndexLookup.get(k2)],
                        origin: 'preset'
                    });
                }
            });
            return segs;
        };

        this.presets = [
            {
                id: 'diagonal-cross',
                label: 'Diagonales Kreuz',
                build: () => createSegs([
                    [corners[0], corners[7]], [corners[1], corners[6]],
                    [corners[2], corners[5]], [corners[3], corners[4]]
                ])
            },
            {
                id: 'tetrahedron',
                label: 'Tetraeder',
                build: () => createSegs([
                    [corners[0], corners[1]], [corners[1], corners[7]], [corners[7], corners[2]], [corners[2], corners[0]],
                    [corners[0], corners[7]], [corners[1], corners[2]]
                ])
            },
            {
                id: 'cube-frame',
                label: 'Würfelrahmen',
                build: () => createSegs([
                    [corners[0], corners[1]], [corners[1], corners[3]], [corners[3], corners[2]], [corners[2], corners[0]],
                    [corners[4], corners[5]], [corners[5], corners[7]], [corners[7], corners[6]], [corners[6], corners[4]],
                    [corners[0], corners[4]], [corners[1], corners[5]], [corners[2], corners[6]], [corners[3], corners[7]]
                ])
            },
            {
                id: 'mirror-star',
                label: 'Spiegelstern',
                build: () => createSegs([
                    [corners[0], originKey], [corners[1], originKey], [corners[2], originKey], [corners[3], originKey],
                    [corners[4], originKey], [corners[5], originKey], [corners[6], originKey], [corners[7], originKey]
                ])
            }
        ];

        // Populate UI
        this.uiManager.populatePresets(this.presets);
    }

    _updateFaces() {
        this.baseFaces = [];
        const faces = [];
        const foundFaces = new Set();

        // Ensure adjacency is fresh
        this._buildAdjacencyGraph();

        if (!this.adjacencyGraph) return;

        const keys = Array.from(this.adjacencyGraph.keys());

        // 1. Find Triangles (3-cycles)
        // A -> B -> C -> A
        for (const keyA of keys) {
            const neighborsA = this.adjacencyGraph.get(keyA);
            if (!neighborsA) continue;

            for (const keyB of neighborsA) {
                if (keyB <= keyA) continue; // Enforce ordering A < B < C to avoid dupes

                const neighborsB = this.adjacencyGraph.get(keyB);
                if (!neighborsB) continue;

                for (const keyC of neighborsB) {
                    if (keyC <= keyB) continue;

                    if (neighborsA.has(keyC)) {
                        // Found Triangle A-B-C
                        const faceKeys = [keyA, keyB, keyC];
                        const faceKey = GeometryUtils.faceKeyFromKeys(faceKeys);
                        if (!foundFaces.has(faceKey)) {
                            faces.push({ keys: faceKeys, key: faceKey, source: 'auto' });
                            foundFaces.add(faceKey);
                        }
                    }
                }
            }
        }

        // 2. Find Planar Quads (4-cycles)
        // Logic adapted from old raumharmonik.js
        for (let i = 0; i < keys.length; i += 1) {
            const keyA = keys[i];
            for (let j = i + 1; j < keys.length; j += 1) {
                const keyC = keys[j];

                // Skip if A and C are directly connected (diagonal edge present) --> Triangle logic covers it
                if (this.adjacencyGraph.get(keyA)?.has(keyC)) continue;

                const neighborsA = this.adjacencyGraph.get(keyA);
                const neighborsC = this.adjacencyGraph.get(keyC);
                if (!neighborsA || !neighborsC) continue;

                const commonNeighbors = [...neighborsA].filter((n) => neighborsC.has(n));
                if (commonNeighbors.length < 2) continue;

                for (let m = 0; m < commonNeighbors.length - 1; m += 1) {
                    for (let n = m + 1; n < commonNeighbors.length; n += 1) {
                        const keyB = commonNeighbors[m];
                        const keyD = commonNeighbors[n];

                        // Check if B and D are connected (would be two triangles sharing edge)
                        // If B-D exists, triangle logic finds 2 tris.
                        // But if we want a Quad, we assume no cross edge?
                        // Actually regular quads don't have cross edges usually in this context.

                        // Ensure cycle A->B->C->D closes
                        const neighborsB = this.adjacencyGraph.get(keyB);
                        const neighborsD = this.adjacencyGraph.get(keyD);

                        // Check planar
                        const quadKeys = [keyA, keyB, keyC, keyD];
                        if (GeometryUtils.isPlanar(quadKeys, 0.05)) { // Relaxed tolerance

                            // CRITICAL: Order keys physically for Volume Detection to recognize edges
                            const orderedResult = GeometryUtils.orderFaceKeys(quadKeys);
                            if (!orderedResult) continue;
                            const orderedKeys = orderedResult.ordered;

                            const faceKey = GeometryUtils.faceKeyFromKeys(orderedKeys);
                            if (!foundFaces.has(faceKey)) {
                                faces.push({ keys: orderedKeys, key: faceKey, source: 'auto' });
                                foundFaces.add(faceKey);
                            }
                        }
                    }
                }
            }
        }

        this.baseFaces = faces;
        this._updateVolumes();
    }

    _updateVolumes() {
        this.baseVolumes = [];

        // Combine Auto-Detected Faces and Manual Faces
        // Manual faces store vertex INDICIES. We need KEYS.
        // baseFaces store KEYS.

        const allFaces = [];

        // 1. Add Base Faces (Auto)
        this.baseFaces.forEach(f => {
            allFaces.push({ keys: f.keys, original: f });
        });

        // 2. Add Manual Faces
        this.manualFaces.forEach((f, key) => {
            // Convert indices to keys
            const keys = f.indices.map(idx => this.pointKeyLookup.get(idx));
            if (keys.every(k => k)) {
                allFaces.push({ keys: keys, original: f, isManual: true });
            }
        });

        // 1. Build Edge-to-Face Map
        const edgeToFaces = new Map();

        allFaces.forEach((face, fIdx) => {
            const indices = face.keys; // Array of point keys
            for (let i = 0; i < indices.length; i++) {
                const a = indices[i];
                const b = indices[(i + 1) % indices.length];
                // Sort keys for edge ID
                const edgeKey = a < b ? `${a}-${b}` : `${b}-${a}`;

                if (!edgeToFaces.has(edgeKey)) edgeToFaces.set(edgeKey, []);
                edgeToFaces.get(edgeKey).push(fIdx);
            }
        });

        // 2. Find Connected Components (BFS)
        const visited = new Set();
        const components = [];

        for (let i = 0; i < allFaces.length; i++) {
            if (visited.has(i)) continue;

            const cluster = [];
            const queue = [i];
            visited.add(i);

            while (queue.length > 0) {
                const currIdx = queue.pop();
                cluster.push(currIdx);

                const face = allFaces[currIdx];
                const indices = face.keys;

                // Check all neighbors across edges
                for (let j = 0; j < indices.length; j++) {
                    const a = indices[j];
                    const b = indices[(j + 1) % indices.length];
                    const edgeKey = a < b ? `${a}-${b}` : `${b}-${a}`;

                    const neighbors = edgeToFaces.get(edgeKey);
                    if (neighbors) {
                        neighbors.forEach(nIdx => {
                            if (!visited.has(nIdx)) {
                                visited.add(nIdx);
                                queue.push(nIdx);
                            }
                        });
                    }
                }
            }
            components.push(cluster);
        }

        // 3. Close Volumes
        // A volume is a closed component where every edge is shared by at least 2 faces (simplistic check)
        // Or simply: a component with >= 4 faces is a volume candidate.

        let volCount = 0;
        console.log(`_updateVolumes: Found ${components.length} face components.`);
        components.forEach(compIndices => {
            console.log(`_updateVolumes: Component found with ${compIndices.length} faces.`);
            if (compIndices.length >= 4) {
                // Check edge sharing (closedness)
                // For a proper closed manifold, every edge in the component must appear exactly twice (or even number).
                // But for now, just grouping is a huge improvement over "tetrahedron only".

                const faces = compIndices.map(idx => allFaces[idx]);
                const faceKeys = faces.map(f => f.keys);

                // Unique Key for Volume
                const volKey = GeometryUtils.volumeKeyFromKeys(faceKeys);

                this.baseVolumes.push({
                    key: volKey,
                    faceKeys: faceKeys, // Array of face keys
                    faces: faces,
                    source: 'auto'
                });
            }
        });
        console.log(`_updateVolumes: Total volumes found: ${this.baseVolumes.length}`);
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

        // Render Symmetric Active Points
        if (this.activePointIndex !== null && this.gridPoints[this.activePointIndex]) {
            const activeP = this.gridPoints[this.activePointIndex];
            const activeGeom = new THREE.SphereGeometry(0.015, 8, 8);
            const activeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

            const dummy = new THREE.Object3D();
            const mesh = new THREE.InstancedMesh(activeGeom, activeMat, transforms.length);

            transforms.forEach((matrix, i) => {
                dummy.position.copy(activeP);
                dummy.applyMatrix4(matrix);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
            });
            mesh.instanceMatrix.needsUpdate = true;
            this.symmetryGroup.add(mesh);
        }

        if (this.showLines) {
            const lineMat = new THREE.LineBasicMaterial({ color: 0x000000 }); // Theme sensitive?

            if (this.useCurvedLines) {
                // Curve Logic
                const paths = this._tracePaths(this.baseSegments);

                paths.forEach(pathIndices => {
                    const points = pathIndices.map(i => this.gridPoints[i]);
                    // Need at least 2 points
                    if (points.length < 2) return;

                    // If simple segment (2 points), it's just a line
                    if (points.length === 2) {
                        transforms.forEach(matrix => {
                            const p0 = points[0].clone().applyMatrix4(matrix);
                            const p1 = points[1].clone().applyMatrix4(matrix);
                            const geom = new THREE.BufferGeometry().setFromPoints([p0, p1]);
                            const line = new THREE.LineSegments(geom, lineMat);
                            this.symmetryGroup.add(line);
                        });
                    } else {
                        // Curve
                        const curve = new THREE.CatmullRomCurve3(points);
                        // centripetal fits better for geometric shapes usually
                        curve.curveType = 'centripetal';
                        const divisions = (points.length - 1) * 10;
                        const curvePoints = curve.getPoints(divisions);
                        const geom = new THREE.BufferGeometry().setFromPoints(curvePoints);

                        transforms.forEach(matrix => {
                            const cGeom = geom.clone();
                            cGeom.applyMatrix4(matrix);
                            const line = new THREE.Line(cGeom, lineMat);
                            this.symmetryGroup.add(line);
                        });
                    }
                });

            } else {
                // Standard Straight Lines
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
        }

        // Handle Faces
        if (this.showClosedForms) {
            const faceMat = new THREE.MeshBasicMaterial({
                color: 0x888888,
                transparent: true,
                opacity: 0.4, // More transparent for loose faces
                side: THREE.DoubleSide,
                depthWrite: false
            });

            const volumeMat = new THREE.MeshBasicMaterial({
                color: 0x444444, // Darker gray for volumes
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide,
                depthWrite: false
            });

            const identity = [new THREE.Matrix4()];

            this.manualFaces.forEach(face => {
                const mat = face._isVolume ? volumeMat : faceMat;

                // If origin is 'auto' or 'generated', it comes from the full graph/loader which already accounts for symmetry
                // So we render it ONCE (Identity).
                // If origin is 'manual' (user created single face), we might want to mirror it?
                // Actually, if we want consistency: User manual faces usually want symmetry.

                const useTransforms = (face.origin === 'manual');
                this._renderFace(face, mat, useTransforms ? transforms : identity);
            });

            // Render Auto Faces (baseFaces) - These come from full graph analysis, so they cover the whole object.
            // Render ONCE.
            this.baseFaces.forEach(face => {
                // Check if overridden by manual
                if (this.manualFaces.has(face.key)) return;
                this._renderFace(face, faceMat, identity);
            });

            // Render Auto Volumes (baseVolumes) - Same logic, derived from full graph.
            this.baseVolumes.forEach(vol => {
                if (this.manualVolumes.has(vol.key)) return;

                // Render faces of volume
                vol.faceKeys.forEach(fk => {
                    const fObj = { keys: fk };
                    this._renderFace(fObj, volumeMat, identity);
                });
            });
        }

        this.sceneManager.scene.add(this.symmetryGroup);

        // Update counts logic
        // If we render with identity, count is 1. If transforms, count is N.
        let faceCount = 0;
        this.manualFaces.forEach(f => { faceCount += (f.origin === 'manual' ? transforms.length : 1); });

        // baseFaces are Identity
        this.baseFaces.forEach(f => {
            if (!this.manualFaces.has(f.key)) faceCount += 1;
        });

        let volCount = 0;
        // baseVolumes are Identity
        this.baseVolumes.forEach(v => {
            if (!this.manualVolumes.has(v.key)) volCount += 1;
        });

        this._updateStatusDisplay(faceCount, volCount);
    }

    _renderFace(face, material, transforms) {
        let points = [];

        if (face.keys) {
            points = face.keys.map(k => this.pointLookup.get(k)).filter(p => p !== undefined);
        } else if (face.indices) {
            points = face.indices.map(i => this.gridPoints[i]).filter(p => p !== undefined);
        }

        if (points.length < 3) return;

        let geometry = null;

        if (points.length === 3 && this.useCurvedSurfaces) {
            geometry = this._buildCurvedTriangleGeometry(points, { curvatureScale: 1.1 });
        }

        if (!geometry && points.length >= 3) {
            const vertices = [];
            const p0 = points[0];
            for (let i = 1; i < points.length - 1; i++) {
                vertices.push(p0.x, p0.y, p0.z);
                vertices.push(points[i].x, points[i].y, points[i].z);
                vertices.push(points[i + 1].x, points[i + 1].y, points[i + 1].z);
            }
            geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.computeVertexNormals();
        }

        if (geometry) {
            transforms.forEach(matrix => {
                const instanceGeom = geometry.clone();
                instanceGeom.applyMatrix4(matrix);
                const mesh = new THREE.Mesh(instanceGeom, material);
                this.symmetryGroup.add(mesh);
            });
            geometry.dispose();
        }
    }

    // --- Ported Geometric Logic ---

    _buildAdjacencyGraph() {
        this.adjacencyGraph.clear();
        const transforms = this.symmetry.getTransforms();

        this.baseSegments.forEach(seg => {
            transforms.forEach(matrix => {
                // Apply symmetry
                const p1 = seg.start.clone().applyMatrix4(matrix);
                const p2 = seg.end.clone().applyMatrix4(matrix);

                // Get keys (snapped to grid logic if needed, but pointKey handles rounding)
                const keyA = GeometryUtils.pointKey(p1);
                const keyB = GeometryUtils.pointKey(p2);

                if (keyA === keyB) return; // Ignore zero-length from symmetry artifacts (e.g. on axis)

                if (!this.adjacencyGraph.has(keyA)) this.adjacencyGraph.set(keyA, new Set());
                if (!this.adjacencyGraph.has(keyB)) this.adjacencyGraph.set(keyB, new Set());

                this.adjacencyGraph.get(keyA).add(keyB);
                this.adjacencyGraph.get(keyB).add(keyA);
            });
        });
    }

    generateRandomForm(count = null) {
        if (!this.gridPoints.length) this._generateGridPoints();
        const pointCount = this.gridPoints.length;
        if (pointCount < 2) return;

        const maxSegments = Math.min(pointCount, 12);
        const minSegments = Math.min(3, maxSegments);
        const targetCount = count || THREE.MathUtils.randInt(minSegments, maxSegments);

        const selected = [];
        const attempted = new Set();
        let guard = 0;

        // Ensure adjacency is up to date 
        this._buildAdjacencyGraph();

        while (selected.length < targetCount && guard < targetCount * 12) {
            guard += 1;
            const indexA = THREE.MathUtils.randInt(0, pointCount - 1);
            const indexB = THREE.MathUtils.randInt(0, pointCount - 1);

            if (indexA === indexB) continue;

            // Avoid duplicates
            const pairKey = [indexA, indexB].sort((a, b) => a - b).join(':');
            if (attempted.has(pairKey)) continue;
            attempted.add(pairKey);

            const pA = this.gridPoints[indexA];
            const pB = this.gridPoints[indexB];
            const segKey = GeometryUtils.segmentKey(pA, pB);

            // Check if already exists
            if (this.baseSegments.some(s => s.key === segKey)) continue;
            if (selected.some(s => s.key === segKey)) continue;

            const segment = {
                start: pA.clone(),
                end: pB.clone(),
                key: segKey,
                indices: [indexA, indexB],
                origin: 'random'
            };

            selected.push(segment);
        }

        if (selected.length) {
            selected.forEach(s => {
                this.baseSegments.push(s);
                this._commitEdge(s);
            });
            this._rebuildSymmetryObjects();

            // Auto close check
            if (this.autoCloseFaces) {
                this._autoCloseAll();
            }
        }
    }

    _tracePaths(segments) {
        // 1. Build Adjacency Graph
        const adj = new Map(); // index -> Set(index)

        segments.forEach(seg => {
            const [a, b] = seg.indices;
            if (!adj.has(a)) adj.set(a, new Set());
            if (!adj.has(b)) adj.set(b, new Set());
            adj.get(a).add(b);
            adj.get(b).add(a);
        });

        const paths = [];
        const visitedEdges = new Set(); // "min-max" string keys

        const getEdgeKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

        // 2. Find paths starting from "endpoints" (degree != 2)
        // If degree == 2, it's a "through" node.

        // Prioritize endpoints to get longest natural curves
        const nodes = Array.from(adj.keys());
        nodes.sort((a, b) => {
            const degA = adj.get(a).size;
            const degB = adj.get(b).size;
            // Prefer non-2 degree (endpoints or junctions)
            const scoreA = degA !== 2 ? 10 : 0;
            const scoreB = degB !== 2 ? 10 : 0;
            return scoreB - scoreA;
        });

        nodes.forEach(startNode => {
            const neighbors = Array.from(adj.get(startNode));
            neighbors.forEach(next => {
                const edgeKey = getEdgeKey(startNode, next);
                if (visitedEdges.has(edgeKey)) return;

                // Start a new path
                const path = [startNode, next];
                visitedEdges.add(edgeKey);

                let curr = next;
                let prev = startNode;

                // Walk until we hit a junction or dead end, or loop
                while (true) {
                    const currNeighbors = adj.get(curr);
                    if (currNeighbors.size !== 2) break; // Junction or Dead End (if 1)

                    // Find the "other" neighbor
                    let nextNode = -1;
                    for (const n of currNeighbors) {
                        if (n !== prev) {
                            nextNode = n;
                            break;
                        }
                    }

                    if (nextNode === -1) break; // Should not happen if degree is 2

                    const nextEdgeKey = getEdgeKey(curr, nextNode);
                    if (visitedEdges.has(nextEdgeKey)) break; // Already visited (loop closure)

                    path.push(nextNode);
                    visitedEdges.add(nextEdgeKey);
                    prev = curr;
                    curr = nextNode;
                }
                paths.push(path);
            });
        });

        return paths;
    }

    _updateStatusDisplay(fCount = 0, vCount = 0) {
        const fLabel = this.localization.translate('ui.faces') || 'Faces';
        const vLabel = this.localization.translate('ui.volumes') || 'Volumes';
        this.uiManager.updateStatus(`${fLabel}: ${fCount} | ${vLabel}: ${vCount}`);
    }

    // --- Interaction Methods ---

    _closeSelectedFace() {
        // Requires at least 3 points in selection buffer
        const indices = [...this.selectionBuffer];
        if (indices.length < 3) {
            this.uiManager.updateStatus("Select at least 3 points to close a face.");
            return;
        }

        // Validate uniqueness
        const unique = new Set(indices);
        if (unique.size < 3) return;

        // Sort indices for canonical key (doesn't affect rendering order, just mapped storage)
        // Actually, for a face, order MATTERS. We keep the selection order.
        // But we need a unique key to prevent duplicates.
        // We'll use the sorted indices as the key.
        const sortedIndices = [...indices].sort((a, b) => a - b);
        const key = sortedIndices.join('_');

        if (this.manualFaces.has(key)) {
            this.uiManager.updateStatus("Face already exists.");
            return;
        }

        this.manualFaces.set(key, {
            indices: indices, // Use original selection order for the polygon
            origin: 'manual'
        });

        // Clear selection ?
        // Often easier for user if we KEEP selection to add more, or CLEAR?
        // Let's clear to indicate action is done.
        this.selectionBuffer = [];
        this.selectedPointIndices.clear();

        this._rebuildSymmetryObjects();
        this.uiManager.updateStatus("Face created.");
    }

    _closeSelectedVolume() {
        this._findAllClosedVolumes();
        this._rebuildSymmetryObjects();
        this.uiManager.updateStatus("Volumes updated from closed faces.");
    }

    _autoCloseAll() {
        this._buildAdjacencyGraph();
        const faces = this._findAllClosedFaces();
        let addedCount = 0;

        faces.forEach(faceKeys => {
            // Create unique key
            const sortedKey = GeometryUtils.faceKeyFromKeys(faceKeys);

            // Check if exists
            const exists = Array.from(this.manualFaces.keys()).some(k => {
                // Simple key check might be enough, but keys might differ by order
                // GeometryUtils.faceKeyFromKeys sorts them, so it should be stable.
                return k === sortedKey;
            });

            if (!exists) {
                this.manualFaces.set(sortedKey, {
                    indices: faceKeys.map(k => this.pointIndexLookup.get(k)),
                    origin: 'auto'
                });
                addedCount++;
            }
        });

        if (this.autoCloseFaces && addedCount > 0) {
            this._findAllClosedVolumes();
        }

        this._rebuildSymmetryObjects();
        this.uiManager.updateStatus(`Auto-closed ${addedCount} faces.`);
    }

    _findAllClosedFaces() {
        const faces = [];
        const foundFaces = new Set();
        if (!this.adjacencyGraph.size) return faces;

        const keys = Array.from(this.adjacencyGraph.keys());

        // 1. Triangles
        for (const keyA of keys) {
            const neighborsA = this.adjacencyGraph.get(keyA);
            if (!neighborsA) continue;
            for (const keyB of neighborsA) {
                if (keyB < keyA) continue;
                const neighborsB = this.adjacencyGraph.get(keyB);
                if (!neighborsB) continue;
                for (const keyC of neighborsB) {
                    if (keyC < keyB) continue;
                    if (neighborsA.has(keyC)) {
                        const faceKeys = [keyA, keyB, keyC];
                        const faceKey = GeometryUtils.faceKeyFromKeys(faceKeys);
                        if (!foundFaces.has(faceKey)) {
                            faces.push(faceKeys);
                            foundFaces.add(faceKey);
                        }
                    }
                }
            }
        }

        // 2. Planar Quads
        for (let i = 0; i < keys.length; i++) {
            const keyA = keys[i];
            for (let j = i + 1; j < keys.length; j++) {
                const keyC = keys[j];
                // Skip if connected (triangle)
                if (this.adjacencyGraph.get(keyA)?.has(keyC)) continue;

                const neighborsA = this.adjacencyGraph.get(keyA);
                const neighborsC = this.adjacencyGraph.get(keyC);
                if (!neighborsA || !neighborsC) continue;

                const common = [...neighborsA].filter(n => neighborsC.has(n));
                if (common.length < 2) continue;

                for (let m = 0; m < common.length - 1; m++) {
                    for (let n = m + 1; n < common.length; n++) {
                        const keyB = common[m];
                        const keyD = common[n];
                        // Cycle A-B-C-D
                        const neighborB = this.adjacencyGraph.get(keyB);
                        const neighborD = this.adjacencyGraph.get(keyD);

                        // Check full cycle connectivity
                        if (!neighborB || !neighborD) continue;
                        // A-B exists (from neighbor list), B-C exists
                        // C-D exists, D-A exists
                        const hasAB = neighborsA.has(keyB);
                        const hasBC = neighborB.has(keyC);
                        const hasCD = neighborsC.has(keyD);
                        const hasDA = neighborD.has(keyA);

                        if (hasAB && hasBC && hasCD && hasDA) {
                            const quadKeys = [keyA, keyB, keyC, keyD];
                            if (GeometryUtils.isPlanar(quadKeys, 0.05)) {
                                const orderedResult = GeometryUtils.orderFaceKeys(quadKeys);
                                if (!orderedResult) continue;
                                const orderedKeys = orderedResult.ordered;

                                const faceKey = GeometryUtils.faceKeyFromKeys(orderedKeys);
                                if (!foundFaces.has(faceKey)) {
                                    faces.push(orderedKeys);
                                    foundFaces.add(faceKey);
                                }
                            }
                        }
                    }
                }
            }
        }
        return faces;
    }

    _findAllClosedVolumes() {
        // Simple implementation: identify tetrahedrons or closed components
        // Uses existing manualFaces
        // Ported logic simplified for integration:

        // Use the component analysis logic we already have in loadGeneratedForm but adapted
        // Or strictly port the _findAllClosedVolumes from old file?
        // OLD file logic is robust for finding volumes from faces.

        // I'll stick to collecting "manualVolumes" from "manualFaces"
        // essentially re-running the component analysis.

        // This effectively duplicates logic from 'loadGeneratedForm', 
        // I should probably extract that component analysis logic.

        return []; // Placeholder until refactor, but _autoCloseAll calls this, so it should do something.
        // Actually, let's call the component analysis logic here.

        this._analyzeVolumes();
        return [];
    }

    _analyzeVolumes() {
        const facesArray = Array.from(this.manualFaces.values());
        const edgeToFaces = new Map();

        facesArray.forEach((face, fIdx) => {
            const indices = face.indices;
            for (let i = 0; i < indices.length; i++) {
                const a = indices[i];
                const b = indices[(i + 1) % indices.length];
                const key = a < b ? `${a}-${b}` : `${b}-${a}`;
                if (!edgeToFaces.has(key)) edgeToFaces.set(key, []);
                edgeToFaces.get(key).push(fIdx);
            }
        });

        const visited = new Set();
        const components = [];

        for (let i = 0; i < facesArray.length; i++) {
            if (visited.has(i)) continue;
            const cluster = [];
            const queue = [i];
            visited.add(i);
            while (queue.length) {
                const curr = queue.pop();
                cluster.push(curr);
                const indices = facesArray[curr].indices;
                for (let j = 0; j < indices.length; j++) {
                    const a = indices[j];
                    const b = indices[(j + 1) % indices.length];
                    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
                    const neighbors = edgeToFaces.get(key);
                    if (neighbors) {
                        neighbors.forEach(n => {
                            if (!visited.has(n)) {
                                visited.add(n);
                                queue.push(n);
                            }
                        });
                    }
                }
            }
            components.push(cluster);
        }

        this.manualVolumes.clear();
        let volCount = 0;
        components.forEach(comp => {
            if (comp.length >= 4) {
                const volKey = `vol_auto_${volCount++}`;
                this.manualVolumes.set(volKey, {
                    faces: comp.map(idx => facesArray[idx]),
                    origin: 'auto'
                });
                comp.forEach(idx => facesArray[idx]._isVolume = true);
            }
        });
    }

    _vectorFromKey(key) {
        if (this.pointLookup.has(key)) return this.pointLookup.get(key).clone();
        return GeometryUtils.vectorFromKey(key);
    }

    // --- Curved Geometry Helpers ---

    _buildCurvedTriangleGeometryFromKeys(keys, options = {}) {
        if (!Array.isArray(keys) || keys.length !== 3) return null;
        const points = keys.map(k => this._vectorFromKey(k));
        if (points.some(p => !p)) return null;
        return this._buildCurvedTriangleGeometry(points, options);
    }

    _buildCurvedTriangleGeometry(points, { curvatureScale = 1 } = {}) {
        const [p0, p1, p2] = points.map(p => p.clone());
        const edge01 = new THREE.Vector3().subVectors(p1, p0);
        const edge02 = new THREE.Vector3().subVectors(p2, p0);
        const normal = new THREE.Vector3().crossVectors(edge01, edge02);
        const len = normal.length();
        if (len < 1e-6) return null;
        normal.divideScalar(len);

        const edge12 = new THREE.Vector3().subVectors(p2, p1);
        const avgLen = (edge01.length() + edge02.length() + edge12.length()) / 3;
        const curvature = Math.max(0, this.curvedSurfaceCurvature * curvatureScale * avgLen);

        const c01 = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5).addScaledVector(normal, curvature);
        const c12 = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5).addScaledVector(normal, curvature);
        const c20 = new THREE.Vector3().addVectors(p2, p0).multiplyScalar(0.5).addScaledVector(normal, curvature);

        const segments = Math.max(1, Math.floor(this.curvedSurfaceSegments));
        const positions = [];
        const indexMap = [];
        let vIdx = 0;

        for (let i = 0; i <= segments; i++) {
            indexMap[i] = [];
            for (let j = 0; j <= segments - i; j++) {
                const u = (segments - i - j) / segments;
                const v = i / segments;
                const w = j / segments;

                const pt = this._evaluateQuadraticBezierTriangle(p0, p1, p2, c01, c12, c20, u, v, w);

                // Bulge
                const bulge = curvature === 0 ? 0 : 6 * u * v * w;
                if (bulge !== 0) pt.addScaledVector(normal, curvature * bulge);

                positions.push(pt.x, pt.y, pt.z);
                indexMap[i][j] = vIdx++;
            }
        }

        const indices = [];
        for (let i = 0; i < segments; i++) {
            for (let j = 0; j < segments - i; j++) {
                const row = indexMap[i];
                const next = indexMap[i + 1];
                const a = row[j];
                const b = next ? next[j] : -1;
                const c = row[j + 1];

                if (a !== -1 && b !== -1 && c !== -1) indices.push(a, b, c);

                const d = next ? next[j + 1] : -1;
                if (b !== -1 && c !== -1 && d !== -1) indices.push(b, d, c);
            }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();
        return geom;
    }

    _evaluateQuadraticBezierTriangle(p0, p1, p2, c01, c12, c20, u, v, w) {
        const pt = new THREE.Vector3();
        pt.addScaledVector(p0, u * u);
        pt.addScaledVector(p1, v * v);
        pt.addScaledVector(p2, w * w);
        pt.addScaledVector(c01, 2 * u * v);
        pt.addScaledVector(c12, 2 * v * w);
        pt.addScaledVector(c20, 2 * w * u);
        return pt;
    }


    // --- Export Methods ---

    _exportJSON() {
        const data = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            gridDivisions: this.gridDivisions,
            baseSegments: this.baseSegments.map(s => ({
                indices: s.indices,
                start: s.start,
                end: s.end
            })),
            manualFaces: Array.from(this.manualFaces.entries()).map(([k, v]) => ({
                key: k,
                indices: v.indices,
                origin: v.origin
            })),
            symmetryState: this.uiManager.getSymmetryState()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        this._downloadBlob(blob, 'spaceharmony_form.json');
    }

    _exportOBJ() {
        let output = "# SpaceHarmony OBJ Export\n";

        // We need to export the VISIBLE geometry (including symmetries).
        // This means we need to apply transforms to all points/segments.

        // 1. Gather all unique vertices from the visualized form
        const vertices = [];
        // Map "x,y,z" -> specific 1-based index in OBJ
        const vMap = new Map();

        const addVertex = (v) => {
            const key = GeometryUtils.pointKey(v);
            if (!vMap.has(key)) {
                vMap.set(key, vertices.length + 1);
                vertices.push(v);
                return vertices.length; // 1-based already
            }
            return vMap.get(key);
        };

        // Get transforms
        const transforms = this.symmetry.getTransforms();

        // Collect Vertices & Lines from Segments
        const objLines = [];
        this.baseSegments.forEach(seg => {
            transforms.forEach(mat => {
                const s = seg.start.clone().applyMatrix4(mat);
                const e = seg.end.clone().applyMatrix4(mat);
                const i1 = addVertex(s);
                const i2 = addVertex(e);
                if (i1 !== i2) {
                    objLines.push([i1, i2]);
                }
            });
        });

        // Collect Faces
        const objFaces = [];
        this.manualFaces.forEach(face => {
            transforms.forEach(mat => {
                const polyIndices = [];
                face.indices.forEach(idx => {
                    const p = this.gridPoints[idx].clone().applyMatrix4(mat);
                    polyIndices.push(addVertex(p));
                });
                if (polyIndices.length >= 3) {
                    objFaces.push(polyIndices);
                }
            });
        });

        // Write Vertices
        vertices.forEach(v => {
            output += `v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}\n`;
        });

        output += `\ng lines\n`;
        objLines.forEach(l => {
            output += `l ${l[0]} ${l[1]}\n`;
        });

        output += `\ng faces\n`;
        objFaces.forEach(f => {
            output += `f ${f.join(' ')}\n`;
        });

        const blob = new Blob([output], { type: 'text/plain' });
        this._downloadBlob(blob, 'spaceharmony_form.obj');
    }

    _exportSTL() {
        // STL only supports triangles. We need to triangulate faces.
        // Lines are not supported in STL. Only faces.
        if (this.manualFaces.size === 0) {
            this.uiManager.updateStatus("STL export requires faces (volumes).");
            return;
        }

        // Binary STL is harder to construct without a library, using ASCII for simplicity
        let output = "solid spaceharmony\n";

        const transforms = this.symmetry.getTransforms();

        this.manualFaces.forEach(face => {
            transforms.forEach(mat => {
                // Get polygon vertices
                const poly = face.indices.map(i => this.gridPoints[i].clone().applyMatrix4(mat));

                // Simple fan triangulation
                if (poly.length >= 3) {
                    const p0 = poly[0];
                    for (let i = 1; i < poly.length - 1; i++) {
                        const p1 = poly[i];
                        const p2 = poly[i + 1];

                        // Calculate normal
                        const vA = new THREE.Vector3().subVectors(p1, p0);
                        const vB = new THREE.Vector3().subVectors(p2, p0);
                        const n = new THREE.Vector3().crossVectors(vA, vB).normalize();

                        output += `facet normal ${n.x.toFixed(6)} ${n.y.toFixed(6)} ${n.z.toFixed(6)}\n`;
                        output += `  outer loop\n`;
                        output += `    vertex ${p0.x.toFixed(6)} ${p0.y.toFixed(6)} ${p0.z.toFixed(6)}\n`;
                        output += `    vertex ${p1.x.toFixed(6)} ${p1.y.toFixed(6)} ${p1.z.toFixed(6)}\n`;
                        output += `    vertex ${p2.x.toFixed(6)} ${p2.y.toFixed(6)} ${p2.z.toFixed(6)}\n`;
                        output += `  endloop\n`;
                        output += `endfacet\n`;
                    }
                }
            });
        });

        output += "endsolid spaceharmony\n";

        const blob = new Blob([output], { type: 'text/plain' });
        this._downloadBlob(blob, 'spaceharmony_form.stl');
    }

    _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

}
