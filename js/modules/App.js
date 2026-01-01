import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';
import { CONFIG } from './Config.js';
import { SceneManager } from './SceneManager.js';
import { InputManager } from './InputManager.js';
import { UIManager } from './UIManager.js';
import { SymmetryEngine } from './SymmetryEngine.js';
import { GeometryUtils } from './GeometryUtils.js';
import { LocalizationManager } from './LocalizationManager.js';
import { GridSystem } from './GridSystem.js';
import { Taxonomy } from './Taxonomy.js';

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
        this.gridSystem = new GridSystem(); // Initialize GridSystem
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
        this.showCurvedLines = false;
        this.showCurvedSurfaces = false;
        this.convexity = 0.0; // 0=Convex (Midpoints), 1=Concave (Vertices)
        this.curveTension = 0.0;
        this.curvedSurfaceCurvature = 0.0;
        this.activePointIndex = null;

        // Visibility
        this.showPoints = true;
        this.showLines = true;
        this.selectedPointIndices = new Set(); // Auto-close DEFAULT true as per user request implicit in "Face detection missing"
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

        // Material Cache for Performance & Theme Support
        // Material Cache for Performance & Theme Support
        this.materials = {
            line: new THREE.LineBasicMaterial({ color: 0x000000 }),
            face: new THREE.MeshPhongMaterial({
                color: 0x888888, // Darker gray
                transparent: true, opacity: 0.60,
                side: THREE.DoubleSide, depthWrite: true, flatShading: true,
                shininess: 80, specular: 0x888888 // Higher shininess + stronger specular for "chiselled" look
            }),
            volume: new THREE.MeshPhongMaterial({
                color: 0x666666, // Even darker for volumes
                transparent: true, opacity: 0.70,
                side: THREE.DoubleSide, depthWrite: true, flatShading: true,
                shininess: 100, specular: 0xaaaaaa
            }),
            traceLine: new THREE.LineBasicMaterial({
                color: 0x666666, transparent: true, opacity: 0.5
            }),
            traceFace: new THREE.MeshBasicMaterial({
                color: 0xaaaaaa, transparent: true, opacity: 0.2,
                side: THREE.DoubleSide, depthWrite: false
            })
        };

        this.uiManager = new UIManager(document.body, {
            onThemeToggle: () => this._toggleTheme(),
            onUndo: () => this._undo(),
            onRedo: () => this._redo(),
            onClear: () => this._clearAll(),
            onSystemChange: (val) => this._updateSystem(val),
            onDensityChange: (val) => this._updateGridDensity(val),
            onSymmetryChange: () => this._updateSymmetry(),
            onCloseFace: () => this._closeSelectedFace(),
            onCloseVolume: () => this._closeSelectedVolume(),
            onAutoCloseAll: () => this._autoCloseAll(),
            onTogglePoints: (val) => this._updateVisibility('points', val),
            onToggleLines: (val) => this._updateVisibility('lines', val),
            onToggleCurvedLines: (val) => this._updateVisibility('curvedLines', val),
            onToggleCurvedSurfaces: (v) => { this.useCurvedSurfaces = v; this._rebuildSymmetryObjects(); },
            onCurveConvexityChange: (val) => {
                this.convexity = parseFloat(val);
                this.curveTension = this.convexity * 0.5; // 0.0 -> 0.5
                this.curvedSurfaceCurvature = this.convexity * 0.6; // 0.0 -> 0.6
                this._rebuildSymmetryObjects();
            },
            onToggleShowClosed: (val) => this._updateVisibility('closedForms', val),
            onToggleCubeFrame: (val) => { if (this.sceneManager.cubeFrame) this.sceneManager.cubeFrame.visible = val; },
            onToggleAutoClose: (val) => { this.autoCloseFaces = val; },
            onToggleColorHighlights: (val) => { this.useRegularHighlight = val; this._rebuildSymmetryObjects(); },
            onToggleAutoRotate: () => this.sceneManager.toggleAutoRotate(),
            onExportJSON: () => this._exportJSON(),
            onExportOBJ: () => this._exportOBJ(),
            onExportSTL: () => this._exportSTL(),
            onExportPNG: () => this._exportPNG(),
            onImportJSON: () => this._importJSON(),
            onRandomForm: () => this._randomForm(),
            onGenerate: (config) => this.generateForms(config),
            onGenerateSystematic: (config) => {
                // Large count to "Ensure" we find all (Systematic usually < 100 for n=2)
                this.generateForms({ ...config, count: 500 });
            },
            onLoadResult: (res) => this.loadGeneratedForm(res),
            onViewZ: () => this.sceneManager.setView('z', this.gridSystem.system),
            onViewIso: () => this.sceneManager.setView('iso'),
            onViewOverview: () => this.sceneManager.setView('overview'),
            onCollectSystematic: (dens) => this.collectAllSystematicForms(dens),
            onOpenLibrary: () => this.uiManager.openLibrary(this),
            onSaveToLibrary: () => this.saveCurrentToLibrary()
        });

        this._updateGridDensity(1);
        this._setDefaultSymmetry();
        this._startRenderLoop();
        this._initLocalization().then(() => this._updateStatusDisplay());
    }

    _updateSystem(system) {
        this.gridSystem.setSystem(system);

        // Reset symmetry defaults based on system
        if (system === 'icosahedral') {
            // Reset traditional cubic reflections as they don't apply well to Ih
            this.symmetry.settings.reflections = {
                xy: false, yz: false, zx: false,
                xy_diag: false, yz_diag: false, zx_diag: false
            };
            // Disable Cubic Rotations (90 deg) as they generate out-of-grid points in Ih
            this.symmetry.settings.rotation = { axis: 'none', steps: 0 };

            this.uiManager.updateSymmetryUI('icosahedral');
            if (this.uiManager.elements['toggle-full-icosa']) {
                this.uiManager.elements['toggle-full-icosa'].checked = true;
                // Force update internal symmetry engine state immediately
                this.uiManager.triggerChange('toggle-full-icosa');
            }
            // Force closed forms on for better visibility of tessellations
            this.showClosedForms = true;
            if (this.uiManager.elements['toggle-show-closed']) {
                this.uiManager.elements['toggle-show-closed'].checked = true;
            }
        } else if (system === 'tetrahedral') {
            // Tetrahedral Defaults
            // Use DIAGONAL symmetries for Td
            this.symmetry.settings.reflections = {
                xy: false, yz: false, zx: false,
                xy_diag: true, yz_diag: true, zx_diag: true
            };
            this.uiManager.updateSymmetryUI('tetrahedral');

            // Update UI checkboxes to match
            ['reflection-xy-diag', 'reflection-yz-diag', 'reflection-zx-diag'].forEach(id => {
                const el = this.uiManager.elements[id];
                if (el) el.checked = true;
            });
            ['reflection-xy', 'reflection-yz', 'reflection-zx', 'toggle-inversion'].forEach(id => {
                const el = this.uiManager.elements[id];
                if (el) el.checked = false;
            });

            // Enable 180-degree rotations (2 steps) for Tetrahedral Td symmetry
            // This maps (1,1,1) -> (1,-1,-1) without generating the Dual (which needs 90 deg / 4 steps)
            if (this.uiManager.elements['rotation-axis']) {
                this.uiManager.elements['rotation-axis'].value = 'all';
            }
            this.symmetry.settings.rotation = { axis: 'all', steps: 2 };
        } else {
            // Cubic defaults
            this.symmetry.settings.reflections = { xy: true, yz: true, zx: true };
            this.uiManager.updateSymmetryUI('cubic');
        }

        if (this.sceneManager) {
            this.sceneManager.updateFrame(system);
        }

        // Full Cleanup of old forms
        this._clearState();

        this._generateGridPoints();
        this._rebuildVisuals();
        this._clearAll();
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
        // Cache bust the worker to ensure new generator logic is loaded
        this.worker = new Worker(`js/workers/generationWorker.js?v=${Date.now()}`, { type: 'module' });
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
                minVolumes: config.minVolumes || 0,
                gridSize: 3, // Keep internal grid size 3 for generator logic

                // Correct Density logic based on System Type to ensure Worker Grid matches App Grid
                // Cubic System: Worker expects 'Point Count' (Divisions + 1)
                // Tetrahedral/Icosahedral: Worker implementation expects 'Layers/Divisions' (Divisions)
                pointDensity: (this.gridSystem.system === 'cubic') ? (this.gridDivisions + 1) : this.gridDivisions,
                options: {
                    mode: config.mode,
                    // FORCE Correct Symmetry Group if System is Tetrahedral
                    // Users might have stale UI state or presets.
                    symmetryGroup: (this.gridSystem.system === 'tetrahedral') ? 'tetrahedral' : config.symmetryGroup,
                    maxEdges: config.maxEdges,
                    // User Request: ALWAYS 1 Single Connection (Edge Orbit)
                    seedMinLength: 1,
                    seedMaxLength: 1
                }
            };
            this.worker.postMessage(workerConfig);
        }
    }

    loadGeneratedForm(formData) {
        this._clearAll();

        // 0. Auto-Density Scaling (Improve Visualization)
        // If the form was generated with a higher density (e.g. Icosahedral forced to 4),
        // we must upgrade the view so the points don't look like floating chaos.
        if (this.currentSystem === 'icosahedral') {
            const densitySlider = this.uiManager.elements['grid-density'];
            if (densitySlider) {
                const currentVal = parseInt(densitySlider.value, 10);
                if (currentVal < 4) {
                    console.log('[App] Auto-upgrading density to 4 for Icosahedral form visualization');
                    densitySlider.value = "4";
                    // Trigger update
                    // We can use triggerChange if available, or manually dispatch
                    if (this.uiManager.triggerChange) {
                        this.uiManager.triggerChange('grid-density');
                    } else {
                        densitySlider.dispatchEvent(new Event('input'));
                    }
                    // Force immediate update of internal state if strictly needed before processing points
                    this.gridDivisions = 3; // 4 - 1
                    this._updateGrid();
                }
            }
        }

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
        // Strict Check: A component is a volume ONLY if it is closed (Watertight).
        // Rule: Every edge in the component must participate in at least 2 faces of the component.
        const validVolumes = components.filter(c => {
            if (c.length < 4) return false;

            // Build edge count map for THIS component
            const localEdges = new Map();
            c.forEach(fIdx => {
                const face = facesArray[fIdx];
                const indices = face.indices;
                for (let k = 0; k < indices.length; k++) {
                    const a = indices[k];
                    const b = indices[(k + 1) % indices.length];
                    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
                    localEdges.set(key, (localEdges.get(key) || 0) + 1);
                }
            });

            // If any edge has count < 2, the component has a hole
            for (const count of localEdges.values()) {
                if (count < 2) return false;
            }
            return true;
        });

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
            // Do not change material color here. Instance colors handle the theme.
            this.gridMesh.material.color.setHex(0xffffff);
        }

        // Rebuild visuals with new theme colors
        this._updateNodeColors();
        this._rebuildSymmetryObjects();
    }

    _updateGridDensity(val) {
        this.gridDivisions = Math.max(1, Math.floor(val));
        this._generateGridPoints();
        this._rebuildVisuals();
        this._clearAll();
    }

    _clearState() {
        this.baseSegments = [];
        this.edges.clear();
        this.manualFaces.clear();
        this.baseFaces = [];
        this.baseVolumes = [];
        this.manualVolumes.clear();
        this.activePointIndex = null;
        this.selectedPointIndices.clear();

        // Also clear history? Probably yes, as undoing across system switch is dangerous.
        this.history = [];
        this.future = [];

        // Visuals will be rebuilt by caller
    }

    _generateGridPoints() {
        this.gridPoints = [];
        this.pointLookup.clear();
        this.pointIndexLookup.clear();
        this.pointKeyLookup.clear();

        // Delegate generation to GridSystem
        const rawPoints = this.gridSystem.generatePoints(this.gridDivisions, CONFIG.CUBE_HALF_SIZE);

        // Map to internal lookup structures
        rawPoints.forEach(p => {
            const key = GeometryUtils.pointKey(p);
            // Avoid duplicates (GridSystem should handle it, but double check)
            if (!this.pointLookup.has(key)) {
                this.pointLookup.set(key, p);
                this.pointIndexLookup.set(key, this.gridPoints.length);
                this.pointKeyLookup.set(this.gridPoints.length, key);
                this.gridPoints.push(p);
            }
        });
    }

    _rebuildVisuals() {
        const geom = new THREE.SphereGeometry(0.01, 8, 8);
        const theme = document.documentElement.dataset.theme || 'light';
        // Base material color must be White so instance colors (setColorAt) are unmodified.
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });

        if (this.gridMesh) {
            this.sceneManager.scene.remove(this.gridMesh);
        }

        this.gridMesh = new THREE.InstancedMesh(geom, mat, this.gridPoints.length);
        this.gridMesh.renderOrder = 999; // Ensure points render on top of transparent faces
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
        const hitSize = Math.max(0.04, Math.min(0.1, spacing * 0.4)); // Tighter hit area

        const pickMat = new THREE.PointsMaterial({
            color: 0xff0000,
            size: hitSize,
            transparent: true,
            opacity: 0.0, // Invisible
            depthTest: false // Always hittable, ignores occlusion
        });
        this.pickingCloud = new THREE.Points(pickGeom, pickMat);
        this.pickingCloud.name = 'GridPoints'; // Helper for InputManager
        this.sceneManager.scene.add(this.pickingCloud);

        // Prioritize Picking Cloud
        this.inputManager.setPickableMeshes([this.pickingCloud, this.gridMesh]);
    }

    async collectAllSystematicForms(density) {
        console.log(`Starting Collection for P(${density})...`);
        const collection = new Map(); // Hash -> Form Data
        let index = 0;
        let exhausted = false;

        // UI Feedback
        const originalStatus = document.getElementById('status-display')?.innerText;
        const updateStatus = (msg) => {
            const el = document.getElementById('status-display');
            if (el) el.innerText = msg;
        };

        try {
            while (!exhausted) {
                updateStatus(`Collecting Form #${index + 1}... (Unique: ${collection.size})`);

                // Wrap worker call in a promise
                const result = await new Promise((resolve, reject) => {
                    this._collectionResolve = resolve;
                    this._collectionReject = reject;

                    this.worker.postMessage({
                        type: 'generate',
                        config: {
                            gridSize: 3,
                            pointDensity: density,
                            mode: 'systematic',
                            gridSize: 3,
                            options: {
                                index: index,
                                symmetryGroup: 'cubic' // Default systematic
                            }
                        }
                    });
                });

                if (result.metadata && result.metadata.exhausted) {
                    exhausted = true;
                    console.log("Systematic Generation Exhausted.");
                } else {
                    // Classify/Deduplicate
                    const entry = {
                        index: index,
                        name: result.metadata.name,
                        cGeo: result.metadata.cGeo,
                        vProfile: result.metadata.vProfile,
                        eProfile: result.metadata.eProfile,
                        convex: result.metadata.convex,
                        faces: result.metadata.faceCount,
                        volumes: result.metadata.volumeCount,
                        symmetry: result.metadata.symmetry
                    };

                    const hash = `${result.metadata.cGeo}-${result.metadata.vProfile}`;

                    if (!collection.has(hash)) {
                        collection.set(hash, entry);
                    }
                    index++;

                    if (index > 1000) exhausted = true;
                }
            }
        } catch (e) {
            console.error("Collection Failed:", e);
        } finally {
            this._collectionResolve = null;
            this._collectionReject = null;
            updateStatus(originalStatus || "Ready");
        }

        // Export
        const manifest = {
            density: density,
            gridSize: this.settings ? this.settings.gridSize : 3,
            timestamp: new Date().toISOString(),
            count: collection.size,
            forms: Array.from(collection.values())
        };

        console.log("Collection Complete:", manifest);

        // Try Save to Server
        this._saveCollection(`FormCollection_P${density}`, manifest);
    }

    async _saveCollection(name, data) {
        try {
            const res = await fetch('/api/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, data })
            });
            if (res.ok) {
                console.log("Saved to Server Library");
                if (this.uiManager.showNotification) this.uiManager.showNotification("Collection Saved to Library!");
                return;
            }
        } catch (e) {
            console.warn("Server not available, downloading file instead.", e);
        }
        // Fallback
        this._downloadJSON(data, `${name}.json`);
    }

    async fetchLibrary() {
        // 1. Try Dynamic API (Local Server Node.js)
        try {
            const res = await fetch('/api/collections');
            if (res.ok) return await res.json();
        } catch (e) { /* Ignore network errors */ }

        // 2. Try Static Index (GitHub Pages / VS Code Live Server)
        try {
            // Note: 'collections/index.json' must be maintained by the server
            const res = await fetch('collections/index.json');
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn("Library not accessible (neither API nor Index found).");
        }

        return [];
    }

    async deleteCollection(filename) {
        try {
            await fetch('/api/collections/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });
            return true;
        } catch (e) { return false; }
    }

    async renameCollection(oldName, newName) {
        try {
            await fetch('/api/collections/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldName, newName })
            });
            return true;
        } catch (e) { return false; }
    }

    // ... existing library methods ...

    async saveCurrentToLibrary() {
        // Prepare Data
        let data = {};

        // If we have a structured generated form, use it
        // Or if we have manual state.
        // For simplicity, let's export the current state as a standard JSON representation
        // similar to 'export-json'.

        // Reuse export logic?
        const exportData = {
            metadata: {
                timestamp: new Date().toISOString(),
                type: 'manual_save',
                faceCount: this.manualFaces.size
            },
            points: this.gridPoints.filter((_, i) => this.selectedPointIndices.has(i)).map(p => ({ x: p.x, y: p.y, z: p.z })),
            // TODO: We need robust edge reconstruction from Scene or internal state if manual mode.
            // For now, let's assume if 'this.currentForm' exists (from generator), we use that.
            // If not, we might be limited.
        };

        // Better: Use `_generateExportJSON` logic if it exists (it was planned/impl in `app_old`).
        // Let's implement a simple serializer if needed.
        // Actually, let's check if we have `this.currentForm`.

        if (this.currentForm) {
            data = this.currentForm;
        } else {
            // Fallback for manual drawing
            // We reconstruct a basic object
            data = {
                points: Array.from(this.selectedPointIndices).map(i => this.gridPoints[i]),
                lines: Array.from(this.edges.values()).map(e => ({ a: e.a, b: e.b })),
                faces: Array.from(this.manualFaces.values())
            };
        }

        // Generate Taxonomy-based Name
        let defaultName = data.name;

        if (!defaultName) {
            const fCount = (data.faces && data.faces.length) || 0;
            const vCount = (data.points && data.points.length) || (data.vertices && data.vertices.length) || 0;
            const eCount = (data.lines && data.lines.length) || (data.edges && data.edges.length) || 0;

            if (fCount > 0) defaultName = `P_${fCount}F_${vCount}V`;
            else if (eCount > 0) defaultName = `L_${eCount}E_${vCount}V`;
            else if (vCount > 0) defaultName = `V_${vCount}Points`;
            else defaultName = `Form_${new Date().getTime()}`;

            // Symmetry Prefix
            const sym = (this.currentForm && (this.currentForm.symmetryName || this.currentForm.symmetryGroup)) || data.symmetryGroup;
            if (sym) defaultName = `${sym}_${defaultName}`;
        }

        // Use Custom Modal with Taxonomy Help
        this.uiManager.openSaveModal(defaultName, async (name) => {
            await this._saveCollection(name, data);
        });
    }

    async loadFromLibrary(filename) {
        try {
            // Load via static file
            // encode filename?
            const res = await fetch(`/collections/${filename}`);
            if (!res.ok) throw new Error("File not found");
            const data = await res.json();

            console.log("Loaded:", data);

            // Check if Manifest (Collection) or Single Form
            if (data.forms && Array.isArray(data.forms)) {
                // It's a collection.
                if (confirm(`This is a collection of ${data.count} forms. Load the first one?`)) {
                    this._loadFormToCanvas(data.forms[0]);
                }
            } else {
                // Single Form
                this._loadFormToCanvas(data);
            }

            // Close Library UI if open?
            const modal = document.getElementById('library-modal');
            if (modal) modal.style.display = 'none';

        } catch (e) {
            console.error("Load failed", e);
            alert("Error loading file: " + e.message);
        }
    }

    _loadFormToCanvas(form) {
        this._clearCanvas();
        // Set points
        // Helper to visualize simple form object
        // We reuse logic from `_onWorkerMessage` or `_updateGeometry`?

        // We need to map form points back to GridSystem indices?
        // Or just render them raw?
        // Ideally, we snap them to grid if they match.
        // For visual consistency, let's just render lines/faces via SceneManager directly
        // OR try to re-hydrate App state.

        // Re-hydration is hard if density differs.
        // Let's assume standard grid.

        // Simplest: Use SceneManager to render raw mesh for now?
        // Or attempt full rehydration.
        // If it came from Generator, it has `points`, `lines` (indices), `faces` (indices).

        // Let's try to set `this.currentForm` and trigger render?
        // We lack the `Systematic` renderer for arbitrary form.

        // Let's try to pass it to `_onWorkerMessage` handler logic?
        // `_onWorkerMessage` expects {type:'success', data: form}.
        // Let's mimic that.

        this._displayGeneratedForm(form);
    }

    _displayGeneratedForm(form) {
        // Verify points match grid?
        // Just call SceneManager helper?
        // `SceneManager.updateGeometry(points, lines, faces/volumes)`

        // Map indices to Vector3
        // If form.points are objects {x,y,z}, use them.

        // Reconstruct lines/faces with Vector3s
        const points = form.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
        const lines = (form.lines || []).map(l => ({
            start: points[l.a],
            end: points[l.b]
        }));

        // Volumes/Faces
        // SceneManager expects specific structure.
        // Let's look at `SceneManager.updateGeometry`.
        // It's not visible here, but assumed it exists or we use `addMesh`.

        // We'll reuse `_onWorkerMessage` logic which calls `this.sceneManager.updateGeometry`.
        // But `_onWorkerMessage` logic is complex (deduplication of lines etc).

        // Shortcut: Use `sceneManager.clear()` and then add components.
        this.sceneManager.clear();
        this.sceneManager.addPoints(points);
        this.sceneManager.addLines(lines);

        // Faces
        if (form.faces) {
            const faceMeshes = form.faces.map(f => {
                return f.vertices.map(vi => points[vi]); // Array of vectors
            });
            this.sceneManager.addFaces(faceMeshes); // Check signature
        }

        this.currentForm = form;

        // Update stats
        if (this.uiManager.elements['face-count']) {
            this.uiManager.elements['face-count'].textContent = `Faces: ${form.faces ? form.faces.length : 0}`;
        }
    }

    _downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    _updateNodeColors() {
        if (!this.gridMesh) return;

        const theme = document.documentElement.dataset.theme || 'light';
        const baseColor = new THREE.Color(theme === 'dark' ? 0xffffff : 0x000000);
        const activeColor = new THREE.Color(0xff0000);

        const starColor = new THREE.Color(0xffaa00); // Orange-Gold for Stars

        for (let i = 0; i < this.gridPoints.length; i++) {
            if (i === this.activePointIndex) {
                this.gridMesh.setColorAt(i, activeColor);
            } else {
                this.gridMesh.setColorAt(i, baseColor);
            }
        }
        if (this.gridMesh.instanceColor) this.gridMesh.instanceColor.needsUpdate = true;
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
        } else if (action.type === 'replaceSegments') {
            // Undo Replace: Clear current, Restore previous
            this.baseSegments = [];
            this.edges.clear();
            action.previousSegments.forEach(seg => {
                this.baseSegments.push(seg);
                this._commitEdge(seg);
            });
        }
        this._updateFaces();
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
        } else if (action.type === 'replaceSegments') {
            // Redo Replace: Clear current (which was previous), Restore new
            this.baseSegments = [];
            this.edges.clear();
            action.newSegments.forEach(seg => {
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
        if (what === 'curvedLines') this.showCurvedLines = val;
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
            try {
                this._createSegment(this.activePointIndex, pointIndex);
                // Clear selection after creation (Legacy behavior)
                this.activePointIndex = null;
            } catch (e) {
                console.error(e);
                alert("Error creating segment: " + e.message);
                this.activePointIndex = null; // Reset anyway
            }
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

        // Generalized DFS Cycle Detection (Lengths 3 to 12)
        // Supports Triangles, Squares, Pentagons, Hexagons, Octagons, Decagons
        const MAX_CYCLE_LEN = 12;

        for (const startKey of keys) {
            // Optimization: Only start searches from nodes that have sufficient neighbors
            const neighbors = this.adjacencyGraph.get(startKey);
            if (!neighbors || neighbors.size < 2) continue;

            const findCycles = (currKey, depth, path) => {
                const currNeighbors = this.adjacencyGraph.get(currKey);
                if (!currNeighbors) return;

                // Check for closure (cycle found)
                if (depth >= 3) {
                    if (currNeighbors.has(startKey)) {
                        // Found cycle: [...path, currKey] -> startKey
                        const cycleKeys = [...path, currKey];

                        // Elementary Check: Verify no internal chords exist in the cycle
                        // A cycle is elementary if NO two non-adjacent vertices are connected by an edge.
                        let isElementary = true;
                        for (let m = 0; m < cycleKeys.length; m++) {
                            for (let n = m + 2; n < cycleKeys.length; n++) {
                                // Adjacent or Wrapping Check
                                if (m === 0 && n === cycleKeys.length - 1) continue; // First and Last are adjacent

                                const u = cycleKeys[m];
                                const v = cycleKeys[n];
                                if (this.adjacencyGraph.get(u)?.has(v)) {
                                    isElementary = false;
                                    break;
                                }
                            }
                            if (!isElementary) break;
                        }

                        if (isElementary) {
                            // Planarity Check
                            if (GeometryUtils.isPlanar(cycleKeys, 0.05)) {
                                // Order keys physically
                                const orderedResult = GeometryUtils.orderFaceKeys(cycleKeys);
                                if (orderedResult) {
                                    const faceKey = GeometryUtils.faceKeyFromKeys(orderedResult.ordered);
                                    if (!foundFaces.has(faceKey)) {
                                        faces.push({ keys: orderedResult.ordered, key: faceKey, source: 'auto' });
                                        foundFaces.add(faceKey);
                                    }
                                }
                            }
                        }
                    }
                }

                // Recurse
                // Canonical Ordering: Only visit nodes > startKey to prevent duplicate permutations
                if (depth < MAX_CYCLE_LEN) {
                    for (const nextKey of currNeighbors) {
                        if (nextKey > startKey) {
                            if (!path.includes(nextKey)) {
                                findCycles(nextKey, depth + 1, [...path, currKey]);
                            }
                        }
                    }
                }
            };

            // Start DFS
            // path starts empty as we pass startKey implicitly as 'previous'? 
            // No, my logic above uses path to store visited.
            // Call: current, depth, path-so-far (excluding current)
            // Actually, let's path include startKey?
            // "path" in findCycles argument is "path leading to curr".
            // Initial call: curr=neighbor, depth=2, path=[startKey]

            for (const neighbor of neighbors) {
                if (neighbor > startKey) {
                    findCycles(neighbor, 2, [startKey]);
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

        // 1. Reset Volume Flags
        this.baseFaces.forEach(f => f._isVolume = false);
        this.manualFaces.forEach(f => f._isVolume = false);

        // 2. Add Base Faces (Auto)
        this.baseFaces.forEach(f => {
            allFaces.push({ keys: f.keys, original: f });
        });

        // 3. Add Manual Faces
        this.manualFaces.forEach((f, key) => {
            // Convert indices to keys
            const keys = f.indices.map(idx => this.pointKeyLookup.get(idx));
            if (keys.every(k => k)) {
                allFaces.push({ keys: keys, original: f, isManual: true });
            }
        });

        // 4. Build Edge-to-Face Map
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
            // console.log(`_updateVolumes: Component found with ${compIndices.length} faces.`);
            if (compIndices.length >= 4) {
                // Check edge sharing (closedness)
                // For a proper closed manifold, every edge in the component must appear exactly twice (or even number).
                // But for now, just grouping is a huge improvement over "tetrahedron only".

                const faces = compIndices.map(idx => allFaces[idx]);
                const faceKeys = faces.map(f => f.keys);

                // Use simple heuristic: Connected component >= 4 faces is a "Volume".
                // We mark the underlying faces as Volume Faces so they render with Volume Material.

                // Mark faces
                faces.forEach(f => {
                    if (f.original) f.original._isVolume = true;
                });

                // Unique Key for Volume
                const volKey = GeometryUtils.volumeKeyFromKeys(faceKeys);

                this.baseVolumes.push({
                    key: volKey,
                    faceKeys: faceKeys, // Array of face keys
                    faces: faces, // Wrapper objects
                    source: 'auto'
                });
            }
        });
        console.log(`_updateVolumes: Total volumes found: ${this.baseVolumes.length}`);
    }


    _rebuildSymmetryObjects() {
        const uiState = this.uiManager.getSymmetryState();

        let transforms;
        if (this.gridSystem.system === 'icosahedral') {
            transforms = this.symmetry.getGroupMatrices('icosahedral');
        } else if (this.gridSystem.system === 'tetrahedral') {
            transforms = this.symmetry.getGroupMatrices('tetrahedral');
        } else {
            transforms = this.symmetry.getTransforms();
        }

        // Clean up old
        if (this.symmetryGroup) {
            this.sceneManager.scene.remove(this.symmetryGroup);
            this.symmetryGroup.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                // Don't dispose cached materials
            });
            this.symmetryGroup = null;
        }
        this.symmetryGroup = new THREE.Group();

        // --- Update Cache Materials for Theme ---
        const theme = document.documentElement.dataset.theme || 'light';
        const isDark = theme === 'dark';

        // 1. Line
        this.materials.line.color.setHex(isDark ? 0xffffff : 0x000000);

        // 2. Face
        this.materials.face.color.setHex(isDark ? 0x444444 : 0x999999);
        this.materials.face.specular.setHex(isDark ? 0x888888 : 0x111111);
        this.materials.face.shininess = isDark ? 80 : 30;

        // 3. Volume
        this.materials.volume.color.setHex(isDark ? 0x555555 : 0x777777);
        this.materials.volume.specular.setHex(isDark ? 0xaaaaaa : 0x222222);
        this.materials.volume.shininess = isDark ? 100 : 30;

        // 4. Trace Line (Add Glow in Dark Mode)
        this.materials.traceLine.color.setHex(isDark ? 0x888888 : 0x666666);
        this.materials.traceLine.blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;

        // 5. Trace Face
        this.materials.traceFace.blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;

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
            const lineMat = this.materials.line;

            if (this.showCurvedLines) {
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
                        const curvePoints = this._getCurvePoints(points);
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
        // Handle Faces
        const faceMat = this.materials.face;
        const volumeMat = this.materials.volume;
        const identity = [new THREE.Matrix4()];

        if (this.showClosedForms) {

            this.manualFaces.forEach(face => {
                const mat = face._isVolume ? volumeMat : faceMat;

                // If origin is 'auto' or 'generated', it comes from the full graph/loader which already accounts for symmetry
                // So we render it ONCE (Identity).
                // If origin is 'manual' (user created single face), we might want to mirror it?
                // Actually, if we want consistency: User manual faces usually want symmetry.
                const useTransforms = (face.origin === 'manual');
                this._renderFace(face, mat, useTransforms ? transforms : identity);
            });

            // Render Auto Faces (baseFaces)
            this.baseFaces.forEach(face => {
                if (this.manualFaces.has(face.key)) return;
                this._renderFace(face, face._isVolume ? volumeMat : faceMat, identity); // Auto faces already include symmetry if graph built fully? No, graph assumes base symmetry?
                // Actually, auto-faces are built from the graph. The graph is built from base segments + manual connections?
                // In current architecture, adjacency graph is just BASE segments.
                // So auto-faces need transforms too!
                this._renderFace(face, face._isVolume ? volumeMat : faceMat, transforms);
            });
        }

        // --- Generative Connections (Trace) ---
        this._addGenerativeGeometry(this.symmetryGroup);


        // Render Auto Volumes (baseVolumes) - DEPRECATED
        // We do NOT render volumes separately anymore to avoid Z-Fighting.
        // Faces that are part of a volume are already marked (_isVolume = true)
        // and are rendered in the loop above with volumeMat.
        /*
        if (this.showClosedForms) {
            this.baseVolumes.forEach(vol => {
                if (this.manualVolumes.has(vol.key)) return;
                vol.faceKeys.forEach(fk => {
                    const fObj = { keys: fk };
                    this._renderFace(fObj, volumeMat, identity);
                });
            });
        }
        */

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


    _addGenerativeGeometry(group) {
        const state = this.uiManager.getSymmetryState();
        if (!state) return;

        // Line Material for Traces
        const traceLineMat = this.materials.traceLine;

        // Face Material for Traces (Extruded Volumes)
        const traceFaceMat = this.materials.traceFace;

        // Helper to extrude base geometry
        const extrudeStep = (matrixPrev, matrixCurr) => {
            // 1. Extrude Segments (Lines)
            this.baseSegments.forEach(seg => {
                // Connect Start
                const s1 = seg.start.clone().applyMatrix4(matrixPrev);
                const s2 = seg.start.clone().applyMatrix4(matrixCurr);
                // Connect End
                const e1 = seg.end.clone().applyMatrix4(matrixPrev);
                const e2 = seg.end.clone().applyMatrix4(matrixCurr);

                const pts = [s1, s2, e1, e2];
                const geom = new THREE.BufferGeometry().setFromPoints(pts);
                const lines = new THREE.LineSegments(geom, traceLineMat);
                group.add(lines);
            });

            // 2. Extrude Faces (Volumes) - Only if showClosedForms is on
            if (this.showClosedForms) {
                const processFace = (face) => {
                    const indices = face.indices; // Use grid indices for simplicity references
                    const points = indices.map(idx => this.gridPoints[idx]);

                    // Create Side Quads
                    for (let i = 0; i < points.length; i++) {
                        const pA = points[i];
                        const pB = points[(i + 1) % points.length];

                        const v1 = pA.clone().applyMatrix4(matrixPrev); // Bottom-Left
                        const v2 = pB.clone().applyMatrix4(matrixPrev); // Bottom-Right
                        const v3 = pB.clone().applyMatrix4(matrixCurr); // Top-Right
                        const v4 = pA.clone().applyMatrix4(matrixCurr); // Top-Left

                        // Quad: v1-v2-v3-v4
                        // Triangulate: v1-v2-v3, v1-v3-v4
                        const verts = [
                            v1, v2, v3,
                            v1, v3, v4
                        ];
                        const geom = new THREE.BufferGeometry().setFromPoints(verts);
                        geom.computeVertexNormals();
                        const mesh = new THREE.Mesh(geom, traceFaceMat);
                        group.add(mesh);
                    }
                };

                // Extrude Manual Faces
                this.manualFaces.forEach(face => processFace(face));
                // Extrude Auto Faces
                this.baseFaces.forEach(face => {
                    // Need to map keys back to points. Auto faces have 'keys' property.
                    if (face.points) { // If pre-resolved
                        // ... logic
                    } else if (face.keys) {
                        const points = face.keys.map(k => this._vectorFromKey(k));
                        if (points.every(p => p)) {
                            // Same logic as processFace but with points
                            for (let i = 0; i < points.length; i++) {
                                const pA = points[i];
                                const pB = points[(i + 1) % points.length];
                                const v1 = pA.clone().applyMatrix4(matrixPrev);
                                const v2 = pB.clone().applyMatrix4(matrixPrev);
                                const v3 = pB.clone().applyMatrix4(matrixCurr);
                                const v4 = pA.clone().applyMatrix4(matrixCurr);
                                const verts = [v1, v2, v3, v1, v3, v4];
                                const geom = new THREE.BufferGeometry().setFromPoints(verts);
                                geom.computeVertexNormals();
                                const mesh = new THREE.Mesh(geom, traceFaceMat);
                                group.add(mesh);
                            }
                        }
                    }
                });
            }
        };


        // --- Translation Connect ---
        const t = state.translation;
        if (t.connect && t.axis !== 'none' && t.count > 0) {
            const axes = t.axis === 'all' ? ['x', 'y', 'z'] : [t.axis];
            axes.forEach(ax => {
                const stepVec = new THREE.Vector3();
                if (ax === 'x') stepVec.set(t.step, 0, 0);
                if (ax === 'y') stepVec.set(0, t.step, 0);
                if (ax === 'z') stepVec.set(0, 0, t.step);

                const mStep = new THREE.Matrix4().makeTranslation(stepVec.x, stepVec.y, stepVec.z);
                const mStepNeg = new THREE.Matrix4().makeTranslation(-stepVec.x, -stepVec.y, -stepVec.z);

                // Positive Direction
                let prev = new THREE.Matrix4();
                for (let i = 1; i <= t.count; i++) {
                    const curr = prev.clone().multiply(mStep);
                    extrudeStep(prev, curr);
                    prev = curr;
                }
                // Negative Direction (also visualized in SymmetryEngine)
                let prevNeg = new THREE.Matrix4();
                for (let i = 1; i <= t.count; i++) {
                    const curr = prevNeg.clone().multiply(mStepNeg);
                    extrudeStep(prevNeg, curr);
                    prevNeg = curr;
                }
            });
        }

        // --- Screw Connect ---
        const s = state.screw;
        if (s.connect && s.enabled && s.axis !== 'none' && s.count > 0) {
            const mRot = this.symmetry._rotationMatrix(s.axis, THREE.MathUtils.degToRad(s.angleDeg));
            const mTrans = this.symmetry._translationMatrix(s.axis, s.distance);
            const mStep = mTrans.clone().multiply(mRot); // Screw Step
            // Negative Screw
            const mRotNeg = this.symmetry._rotationMatrix(s.axis, -THREE.MathUtils.degToRad(s.angleDeg));
            const mTransNeg = this.symmetry._translationMatrix(s.axis, -s.distance);
            const mStepNeg = mTransNeg.clone().multiply(mRotNeg);

            let prev = new THREE.Matrix4();
            for (let i = 1; i <= s.count; i++) {
                const curr = prev.clone().multiply(mStep);
                extrudeStep(prev, curr);
                prev = curr;
            }

            let prevNeg = new THREE.Matrix4();
            for (let i = 1; i <= s.count; i++) {
                const curr = prevNeg.clone().multiply(mStepNeg);
                extrudeStep(prevNeg, curr);
                prevNeg = curr;
            }
        }

        // --- Rotoreflection Connect ---
        const r = state.rotoreflection;
        if (r.connect && r.enabled && r.axis !== 'none' && r.count > 0) {
            const mRot = this.symmetry._rotationMatrix(r.axis, THREE.MathUtils.degToRad(r.angleDeg));
            const mRef = this.symmetry._reflectionMatrix(r.plane);
            const mStep = mRef.clone().multiply(mRot);

            let prev = new THREE.Matrix4();
            for (let i = 1; i <= r.count; i++) {
                const curr = prev.clone().multiply(mStep);
                extrudeStep(prev, curr);
                prev = curr;
            }
        }
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
        let transforms;
        if (this.gridSystem.system === 'icosahedral') {
            transforms = this.symmetry.getGroupMatrices('icosahedral');
        } else if (this.gridSystem.system === 'tetrahedral') {
            transforms = this.symmetry.getGroupMatrices('tetrahedral');
        } else {
            transforms = this.symmetry.getTransforms();
        }

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
        // Sort keys to ensure stable canonical ordering comparisons
        keys.sort();

        // 3. Unified Cycle Detection (DFS) for Lengths 3-6
        // Supports Triangles, Squares, Pentagons, Hexagons

        for (const startKey of keys) {
            const rootNeighbors = this.adjacencyGraph.get(startKey);
            if (!rootNeighbors || rootNeighbors.size < 2) continue;

            // DFS Function
            const findCycles = (currKey, depth, path) => {
                // Check Loop Closure
                if (depth >= 3) {
                    if (this.adjacencyGraph.get(currKey).has(startKey)) {
                        // Found Cycle
                        const cycle = [...path];
                        // Canonical Key: Sorted Keys
                        const sortedCycle = [...cycle].sort();
                        const faceID = GeometryUtils.faceKeyFromKeys(sortedCycle);

                        if (!foundFaces.has(faceID)) {
                            // Check Planarity
                            if (GeometryUtils.isPlanar(cycle, 0.1)) {
                                // Check Elementary (No internal chords)
                                // Exception: Allow internal chords for Pentagons (Length 5) to support Dodecahedron+Star
                                let isElementary = true;
                                if (cycle.length !== 5) {
                                    for (let m = 0; m < cycle.length; m++) {
                                        for (let n = m + 2; n < cycle.length; n++) {
                                            if (m === 0 && n === cycle.length - 1) continue; // Adjacent wrap

                                            const u = cycle[m];
                                            const v = cycle[n];

                                            // Check if edge u-v exists in graph
                                            if (this.adjacencyGraph.get(u)?.has(v)) {
                                                isElementary = false;
                                                break;
                                            }
                                        }
                                        if (!isElementary) break;
                                    }
                                }

                                if (isElementary) {
                                    // Order the face for rendering (if needed)
                                    // GeometryUtils.orderFaceKeys computes normal and correct winding
                                    const orderedResult = GeometryUtils.orderFaceKeys(cycle);
                                    if (orderedResult) {
                                        faces.push(orderedResult.ordered);
                                        foundFaces.add(faceID);
                                    }
                                }
                            }
                        }
                    }
                }

                // Recurse (Max Depth 8)
                if (depth < 8) {
                    const neighbors = this.adjacencyGraph.get(currKey);
                    if (neighbors) {
                        for (const nextKey of neighbors) {
                            // Canonical Ordering Constraint:
                            // Only visit nodes strictly larger than StartKey.
                            // This ensures we only find the cycle when starting from its 'smallest' node.
                            if (nextKey > startKey) {
                                // Avoid immediate backtrack and loops in current path
                                if (!path.includes(nextKey)) {
                                    findCycles(nextKey, depth + 1, [...path, nextKey]);
                                }
                            }
                        }
                    }
                }
            };

            // Start DFS
            findCycles(startKey, 1, [startKey]);
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
        const transforms = this.symmetry.getTransforms();

        // 1. Gather all unique vertices from the visualized form
        const vertices = [];
        // Map "x,y,z" -> specific 1-based index in OBJ
        const vMap = new Map();

        const addUniqueVertex = (v) => {
            // Precision for key to avoid micro-gaps
            const key = `${v.x.toFixed(6)}_${v.y.toFixed(6)}_${v.z.toFixed(6)}`;
            if (!vMap.has(key)) {
                vMap.set(key, vertices.length + 1);
                vertices.push(v);
                return vertices.length; // 1-based already
            }
            return vMap.get(key);
        };

        const finalLines = [];

        // 2. Generate Lines (Straight or Curved)
        if (this.showCurvedLines) {
            // _tracePaths expects segment objects with .indices
            const paths = this._tracePaths(this.baseSegments);
            paths.forEach(pathIndices => {
                // pathIndices is [i1, i2, i3...]
                const points = pathIndices.map(i => this.gridPoints[i]);
                const curvePoints = this._getCurvePoints(points);

                transforms.forEach(mat => {
                    const transformedPoints = curvePoints.map(p => p.clone().applyMatrix4(mat));
                    const indices = transformedPoints.map(p => addUniqueVertex(p));

                    // OBJ uses 'l v1 v2 v3 ...' for polylines
                    if (indices.length > 1) {
                        finalLines.push(`l ${indices.join(' ')}`);
                    }
                });
            });
        } else {
            this.baseSegments.forEach(seg => {
                transforms.forEach(mat => {
                    const p1 = seg.start.clone().applyMatrix4(mat);
                    const p2 = seg.end.clone().applyMatrix4(mat);
                    const i1 = addUniqueVertex(p1);
                    const i2 = addUniqueVertex(p2);
                    if (i1 !== i2) {
                        finalLines.push(`l ${i1} ${i2}`);
                    }
                });
            });
        }

        // 3. Collect Faces
        // 3. Collect Faces
        const objFaces = [];
        this.manualFaces.forEach(face => {
            const indices = face.indices;
            const facePoints = indices.map(idx => this.gridPoints[idx]);

            let curvedGeom = null;
            // Only support curved export for triangles as per current rendering logic
            // Check this.useCurvedSurfaces (correct property)
            if (this.useCurvedSurfaces && facePoints.length === 3) {
                // curvatureScale 1.1 matches _renderFace logic
                curvedGeom = this._buildCurvedTriangleGeometry(facePoints, { curvatureScale: 1.1 });
            }

            if (curvedGeom) {
                // Export Dense Mesh (Vertices + Faces)
                const attrPos = curvedGeom.getAttribute('position');
                const index = curvedGeom.getIndex();

                transforms.forEach(mat => {
                    // Map local geometry indices to global OBJ vertex indices
                    const localIndices = [];
                    for (let i = 0; i < attrPos.count; i++) {
                        const p = new THREE.Vector3().fromBufferAttribute(attrPos, i);
                        p.applyMatrix4(mat);
                        localIndices.push(addUniqueVertex(p));
                    }

                    // Add Faces from Geometry
                    if (index) {
                        for (let i = 0; i < index.count; i += 3) {
                            objFaces.push([
                                localIndices[index.getX(i)],
                                localIndices[index.getX(i + 1)],
                                localIndices[index.getX(i + 2)]
                            ]);
                        }
                    } else {
                        for (let i = 0; i < attrPos.count; i += 3) {
                            objFaces.push([
                                localIndices[i],
                                localIndices[i + 1],
                                localIndices[i + 2]
                            ]);
                        }
                    }
                });
                // Cleanup
                curvedGeom.dispose();
            } else {
                // Standard Polygon Export
                transforms.forEach(mat => {
                    const polyIndices = [];
                    facePoints.forEach(pt => {
                        const p = pt.clone().applyMatrix4(mat);
                        polyIndices.push(addUniqueVertex(p));
                    });

                    if (polyIndices.length >= 3) {
                        objFaces.push(polyIndices);
                    }
                });
            }
        });

        // 4. Write Output
        vertices.forEach(v => {
            output += `v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}\n`;
        });

        output += `\ng lines\n`;
        finalLines.forEach(lineStr => {
            output += `${lineStr}\n`;
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

    _exportPNG() {
        const currentSize = new THREE.Vector2();
        this.sceneManager.renderer.getSize(currentSize);
        this.sceneManager.renderer.setSize(1024, 1024);
        this.sceneManager.render();
        const dataURL = this.sceneManager.renderer.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = 'space_harmony_export.png';
        link.click();
        this.sceneManager.renderer.setSize(currentSize.x, currentSize.y);
        this.sceneManager.render();
    }

    _randomForm() {
        // Backup current state
        const previousSegments = [...this.baseSegments];

        // Clear geometry (but NOT history)
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
        this.future = []; // Clear redo stack on new action

        // Enable basic symmetry
        this.symmetry.settings.reflections.xy = true;
        this.symmetry.settings.reflections.yz = true;
        this.symmetry.settings.reflections.zx = true;
        this._updateSymmetry();

        const count = 12;
        const newSegments = [];

        for (let i = 0; i < count; i++) {
            const idx1 = Math.floor(Math.random() * this.gridPoints.length);
            const p1 = this.gridPoints[idx1];
            // Find nearby
            const neighbors = [];
            this.gridPoints.forEach((p, idx2) => {
                if (idx1 === idx2) return;
                const d = p.distanceTo(p1);
                if (Math.abs(d - 1.0) < 0.05 || Math.abs(d - Math.SQRT2) < 0.05) {
                    neighbors.push(idx2);
                }
            });
            if (neighbors.length > 0) {
                const idx2 = neighbors[Math.floor(Math.random() * neighbors.length)];
                const p2 = this.gridPoints[idx2];
                const segment = {
                    key: GeometryUtils.segmentKey(p1, p2),
                    indices: [idx1, idx2],
                    start: p1,
                    end: p2,
                    layer: 0
                };
                this.baseSegments.push(segment);
                this._commitEdge(segment);
                newSegments.push(segment);
            }
        }

        // Push History
        this._pushHistory({
            type: 'replaceSegments',
            previousSegments: previousSegments,
            newSegments: newSegments
        });

        this._updateFaces();
        this._rebuildSymmetryObjects();
    }

    _importJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    this._loadJSON(data);
                } catch (err) {
                    console.error(err);
                    alert("Invalid JSON");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    _loadJSON(data) {
        this._clearAll();
        if (data.gridDivisions) this._updateGridDensity(data.gridDivisions);
        if (data.baseSegments) {
            data.baseSegments.forEach(s => {
                if (s.start && s.end) {
                    const idx1 = this._findNearestPointIndex(s.start);
                    const idx2 = this._findNearestPointIndex(s.end);
                    if (idx1 !== -1 && idx2 !== -1) {
                        const segment = {
                            key: GeometryUtils.segmentKey(this.gridPoints[idx1], this.gridPoints[idx2]),
                            indices: [idx1, idx2],
                            start: this.gridPoints[idx1],
                            end: this.gridPoints[idx2],
                            layer: 0
                        };
                        this.baseSegments.push(segment);
                        this._commitEdge(segment);
                    }
                }
            });
        }
        this._updateFaces();
        this._rebuildSymmetryObjects();
    }

    _findNearestPointIndex(vec) {
        let minDist = 0.001;
        let idx = -1;
        const v = new THREE.Vector3(vec.x, vec.y, vec.z);
        this.gridPoints.forEach((p, i) => {
            const d = p.distanceTo(v);
            if (d < minDist) {
                minDist = d;
                idx = i;
            }
        });
        return idx;
    }
    _getCurvePoints(points) {
        if (points.length < 2) return [];
        if (points.length === 2) return points;

        let targetPoints = [];
        const isClosed = points[0].distanceTo(points[points.length - 1]) < 0.001;

        // Calculate Midpoints (Convex Target)
        // Midpoint i corresponds to Edge i (P_i -> P_i+1)
        // We match P_i to M_i?
        // If val=0 (Convex), we want M_i. If val=1 (Concave), we want P_i.

        let convexPoints = []; // Midpoints

        if (isClosed) {
            for (let i = 0; i < points.length - 1; i++) {
                convexPoints.push(
                    new THREE.Vector3().addVectors(points[i], points[i + 1]).multiplyScalar(0.5)
                );
            }
            convexPoints.push(convexPoints[0]); // Close loop
        } else {
            // Open: Keep ends?
            // If we interpolate endpoints, midpoint of Start? Start has no "previous".
            // We fix endpoints.
            convexPoints.push(points[0]);
            for (let i = 0; i < points.length - 1; i++) {
                convexPoints.push(
                    new THREE.Vector3().addVectors(points[i], points[i + 1]).multiplyScalar(0.5)
                );
            }
            convexPoints.push(points[points.length - 1]);
        }

        // Interpolate
        // convexPoints might have different length map in open case?
        // Open case: points len N, convex len N+1?
        // Open: P0 .. PN-1. (N points)
        // Midpoints: M0..MN-2. (N-1 edges).
        // My Logic: P0, M0..MN-2, PN-1. (N+1 points).
        // Vertices: P0, P1..PN-2, PN-1. (N points).
        // We need same count to Lerp.
        // If Concave(1), we just return points.
        // If Convex(0), we return "P0, M..."
        // Smooth morph requires consistent topology.
        // Use CatmullRom on DIFFERENT sets of points?
        // No, must lerp points BEFORE curve gen for stability?
        // Actually, if I just Lerp the points I HAVE.
        // If Open:
        // P0 (Fixed).
        // P1 -> M0 ? (Shifted left) or M1 (Shifted right)?
        // P1 is between M0 and M1.

        // Simpler approach for slider:
        // Lerp position P_i towards `(P_prev + P_next)/2` (Laplacian smoothing).
        // This is robust and preserves count.
        // Val 0 (Convex/Smooth) -> Fully smooothed (Average).
        // Val 1 (Concave/Sharp) -> Original P_i.

        // Loop handling:
        for (let i = 0; i < points.length; i++) {
            const P = points[i];
            let smoothed;

            if (isClosed) {
                // Wrap indices
                // i=0, prev=N-2 (since N-1 is duplicate of 0).
                // Actually points includes duplicate start/end.
                // Unique points are 0..N-2.
                // P_0 == P_last.

                let prevIdx, nextIdx;
                if (i === 0) { prevIdx = points.length - 2; nextIdx = 1; }
                else if (i === points.length - 1) { prevIdx = points.length - 2; nextIdx = 1; } // Should match 0 result
                else { prevIdx = i - 1; nextIdx = i + 1; }

                const Prev = points[prevIdx];
                const Next = points[nextIdx];
                smoothed = new THREE.Vector3().addVectors(Prev, Next).multiplyScalar(0.5);
            } else {
                // Open
                if (i === 0 || i === points.length - 1) {
                    smoothed = P.clone(); // Fix endpoints
                } else {
                    smoothed = new THREE.Vector3().addVectors(points[i - 1], points[i + 1]).multiplyScalar(0.5);
                }
            }

            // Lerp
            const result = new THREE.Vector3().copy(smoothed).lerp(P, this.convexity);
            targetPoints.push(result);
        }

        const curve = new THREE.CatmullRomCurve3(targetPoints);
        curve.curveType = 'catmullrom';
        // Tension: 0.0 (Convex/Smooth) -> 0.5 (Concave/Sharp)
        curve.tension = (this.curveTension !== undefined) ? this.curveTension : 0.5;

        // Note: Laplacian smoothing shrinks the shape (Convex Hull property).
        // The user's "Midpoint" strategy also shrank the shape (Chaikin).
        // This should be visually similar and supports continuous slider.

        const divisions = (points.length - 1) * 12;
        return curve.getPoints(divisions);
    }

    _startRenderLoop() {
        this._animate();
    }

    _animate() {
        requestAnimationFrame(this._animate.bind(this));

        // Auto-Rotate
        if (this.sceneManager.controls && this.sceneManager.controls.autoRotate) {
            this.sceneManager.controls.update();
        }

        this.sceneManager.render();
    }
}
