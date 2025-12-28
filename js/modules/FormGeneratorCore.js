/**
 * FormGeneratorCore.js
 * 
 * Core logic for generating forms. 
 * Platform-agnostic: Works in Node.js (CLI) and Browser (Web Worker).
 * 
 * @version 2.0.0
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';
import { SymmetryEngine } from './SymmetryEngine.js';
import { GeometryUtils } from './GeometryUtils.js';

/**
 * Line represents a connection between two points by their indices in a point array.
 */
export class Line {
    constructor(a, b) {
        this.a = a;
        this.b = b;
    }
}

export class Form {
    constructor() {
        this.points = []; // Array<THREE.Vector3>
        this.lines = [];  // Array<Line>
        this.metadata = {};
    }
}

export function generateForm(gridSize, pointDensity, options = {}) {
    const form = new Form();
    const gridPoints = _defineGrid(gridSize, pointDensity, options);

    let pathResult;
    // Handle options: standard spread or nested generationOptions
    const symGroup = options.symmetryGroup || (options.generationOptions && options.generationOptions.symmetryGroup);
    const mode = options.mode || (options.generationOptions && options.generationOptions.mode);

    const symmetry = new SymmetryEngine();

    if (symGroup || mode === 'maxRegular') {
        const groupKey = symGroup || 'cubic';
        pathResult = _generateSymmetricForm(gridPoints, { symmetryGroup: groupKey }, symmetry);
    } else {
        pathResult = _generateLinePath(gridPoints, options);
    }

    form.points = pathResult.points;
    form.lines = pathResult.lines;

    // --- Completion Step (The "Lawful" part) ---
    // Try to complete the form into closed surfaces/volumes
    // This mimics the original 'completeSurfacesAndVolumes' logic
    if (options.completeForm !== false) { // Default to true
        _completeForm(form, { maxEdges: options.maxEdges || 60 });
        // console.log(`[FormGen] After complete: P=${form.points.length}, L=${form.lines.length}`);
    }

    // --- Scaling to SpaceHarmony System (Target Grid Size 3) ---
    const targetGridSize = options.targetGridSize || 1;
    // Target Grid Size of 1 means range -0.5 to 0.5 (Scale of SpaceHarmony)
    const sourceSpan = gridSize > 1 ? gridSize - 1 : 1;
    const scaleFactor = targetGridSize / sourceSpan;

    // Optimization: Scale points in place. Indices in lines remain valid.
    for (let i = 0; i < form.points.length; i++) {
        form.points[i].multiplyScalar(scaleFactor);
    }

    // Validation & Metadata
    const validationResults = _validateForm(form);
    if (pathResult.symmetryInfo) {
        validationResults.symmetryProperties = pathResult.symmetryInfo.type;
        validationResults.seedShape = pathResult.symmetryInfo.seed;
    }

    // Attach detected faces (arrays of point indices)
    let faces = validationResults.closedLoops || [];

    // ENFORCE SYMMETRY: Removed obsolete manual face symmetrization block. 
    // Symmetry is now guaranteed by _generateSymmetricForm logic.
    if (faces.length > 0 && options.symmetryGroup && !pathResult.symmetryInfo) {
        // Pass - we do not attempt to re-symmetrize a non-symmetric path result here.
        // If the user wanted symmetry, they should have used mode=maxRegular or provided symmetryGroup to generationOptions.
    }

    form.faces = faces;

    // Store metadata
    form.metadata = _generateMetaData(form, { gridSize, pointDensity, ...options }, validationResults);
    form.metadata.coordinateSystem = "raumharmonik";
    form.metadata.scaledTo = `gridSize${targetGridSize}`;

    // console.log(`[FormGen] Final Faces: ${form.faces.length}`);

    return form;
}

function _generateMetaData(form, options, validationResults) {
    const id = options.id || Date.now();
    let sourceName = "Random Generator v2.0";
    if (validationResults.symmetryProperties) {
        sourceName = "Symmetric Generator";
    }
    const notes = `Start: ${validationResults.seedShape || 'N/A'}, Group: ${validationResults.symmetryProperties || 'None'}`;

    return {
        "id": id,
        "name": `SH_Form_${id}`,
        "generatedAt": new Date().toISOString(),
        "gridSize": options.gridSize,
        "pointDensity": options.pointDensity - 1,
        "pointCount": form.points.length,
        "lineCount": form.lines.length,
        "faceCount": validationResults.faces,
        "volumeCount": validationResults.volumes,
        "isClosed": validationResults.volumes > 0, // Simplified definition
        "isConnected": validationResults.isConnected,
        "symmetry": validationResults.symmetryProperties || "N/A",
        "source": sourceName,
        "notes": notes
    };
}

function _generateSymmetricForm(gridPoints, options, symmetryEngine) {
    const groupKey = options.symmetryGroup || 'cubic';

    // Get transformations from SymmetryEngine
    const transforms = symmetryEngine.getSymmetryGroup(groupKey);

    if (!transforms || transforms.length === 0) {
        console.error(`Symmetry group '${groupKey}' not found or empty.`);
        return { points: [], lines: [] };
    }

    if (gridPoints.length < 2) return { points: [], lines: [] };

    // Seed Path Generation
    // Allow multi-segment seed to increase chance of incidence
    // Default to 1-2 segments for simple forms, more for complex if requested
    const minLen = options.seedMinLength || 1;
    const maxLen = options.seedMaxLength || 2;
    const pathLength = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));

    const points = [];
    const lines = [];
    const usedIndices = new Set();

    // 1. Pick Start
    let currentIdx = Math.floor(Math.random() * gridPoints.length);
    usedIndices.add(currentIdx);
    points.push(gridPoints[currentIdx].clone());

    // 2. Walk
    for (let i = 0; i < pathLength; i++) {
        // Find valid next point (any different point, or restrict to "straight" lines?)
        // _generateLinePath uses _isStraightLine. Let's use it for cleaner forms.
        const currentPos = gridPoints[currentIdx];
        const candidates = [];

        // Optimization: Don't scan ALL points if grid is huge, but it's small (3x3x3=27).
        for (let j = 0; j < gridPoints.length; j++) {
            if (j !== currentIdx) { // Allow revisiting used points? Maybe not immediate backtrack.
                if (_isStraightLine(currentPos, gridPoints[j])) {
                    candidates.push(j);
                }
            }
        }

        if (candidates.length === 0) break;

        const nextIdx = candidates[Math.floor(Math.random() * candidates.length)];

        points.push(gridPoints[nextIdx].clone());
        lines.push(new Line(points.length - 2, points.length - 1)); // connect prev to curr

        currentIdx = nextIdx;
        usedIndices.add(currentIdx);
    }

    if (lines.length === 0) return { points: [], lines: [], symmetryInfo: null };

    // Apply Transformations
    _applySymmetryGroup({ points, lines }, transforms);

    return {
        points: points,
        lines: lines,
        symmetryInfo: { type: groupKey, seed: 'randomPath' }
    };
}

/**
 * Applies symmetry matrices to the form, expanding points and lines.
 * Uses index-based logic to avoid duplication.
 */
function _applySymmetryGroup(formObj, matrices) {
    const initialLines = [...formObj.lines];
    const initialPoints = formObj.points;

    // Map to track unique points: key -> newIndex
    const pointMap = new Map();
    const getKey = (p) => GeometryUtils.pointKey(p);

    // Register initial points
    initialPoints.forEach((p, i) => {
        pointMap.set(getKey(p), i);
    });

    const findOrCreatePoint = (p) => {
        const key = getKey(p);
        if (pointMap.has(key)) return pointMap.get(key);

        const newIndex = formObj.points.length;
        formObj.points.push(p.clone());
        pointMap.set(key, newIndex);
        return newIndex;
    };

    // Set to track unique lines: "min-max" indices
    const lineSet = new Set();
    const getLineKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

    // Register initial lines
    initialLines.forEach(l => lineSet.add(getLineKey(l.a, l.b)));

    // Apply matrices
    for (const line of initialLines) {
        const p1Original = initialPoints[line.a];
        const p2Original = initialPoints[line.b];

        for (const matrix of matrices) {
            const newP1Pos = p1Original.clone().applyMatrix4(matrix);
            const newP2Pos = p2Original.clone().applyMatrix4(matrix);

            const idx1 = findOrCreatePoint(newP1Pos);
            const idx2 = findOrCreatePoint(newP2Pos);

            if (idx1 !== idx2) {
                const lKey = getLineKey(idx1, idx2);
                if (!lineSet.has(lKey)) {
                    lineSet.add(lKey);
                    formObj.lines.push(new Line(idx1, idx2));
                }
            }
        }
    }
}

function _defineGrid(gridSize, pointDensity, options = {}) {
    const points = [];
    const half = (gridSize - 1) / 2;
    if (pointDensity < 1) pointDensity = 1;

    // 1. Standard Cartesian Grid
    const steps = [];
    if (pointDensity === 1) {
        steps.push(0);
    } else {
        for (let i = 0; i < pointDensity; i++) {
            steps.push(-half + i * (gridSize - 1) / (pointDensity - 1));
        }
    }

    // Add Cartesian points
    for (const x of steps) {
        for (const y of steps) {
            for (const z of steps) {
                points.push(new THREE.Vector3(x, y, z));
                // 2. Inject Icosahedral Symmetry Points (Golden Ratio)
                // If we are in Icosahedral mode, we replace the Cartesian grid entirely with the Smart Grid.
                // Standard Cartesian points (unless they are the cube corners) create chaos under 5-fold symmetry.

                const symGroup = options.symmetryGroup || (options.generationOptions && options.generationOptions.symmetryGroup);

                if (symGroup === 'icosahedral') {
                    // Clear any points generated by the Cartesian step above (or skip it? cleaner to clear or return here).
                    // Let's reset points to empty to be safe and exclusive.
                    points.length = 0;

                    const phi = (1 + Math.sqrt(5)) / 2; // Golden Ratio ~1.618

                    // Match GridSystem.js logic:
                    // Points are normalized to a sphere of radius 'half'.
                    // When global scaleFactor (0.5) is applied, they land at radius 0.5.
                    const radius = (half > 0 ? half : 1.0);

                    // Raw Icosahedron Vertices (0, ±1, ±phi)
                    const icoRaw = [
                        new THREE.Vector3(0, 1, phi), new THREE.Vector3(0, 1, -phi), new THREE.Vector3(0, -1, phi), new THREE.Vector3(0, -1, -phi),
                        new THREE.Vector3(1, phi, 0), new THREE.Vector3(1, -phi, 0), new THREE.Vector3(-1, phi, 0), new THREE.Vector3(-1, -phi, 0),
                        new THREE.Vector3(phi, 0, 1), new THREE.Vector3(phi, 0, -1), new THREE.Vector3(-phi, 0, 1), new THREE.Vector3(-phi, 0, -1)
                    ];

                    const addPoints = (vectors, scaleMultiplier = 1.0) => {
                        vectors.forEach(v => {
                            // Normalize and scale to grid radius
                            const p = v.clone().normalize().multiplyScalar(radius * scaleMultiplier);

                            // Deduplicate
                            let exists = false;
                            for (let existing of points) {
                                if (existing.distanceToSquared(p) < 0.0001) { exists = true; break; }
                            }
                            if (!exists) points.push(p);
                        });
                    };

                    // 1. Always add Icosahedron
                    addPoints(icoRaw);

                    // 2. Add Dodecahedron if Density > 2 (GridDivisions >= 2)
                    // Density 1 (Div 1) -> Pts 2.
                    // Density 2 (Div 2) -> Pts 3.
                    // Let's include Dodeca starting at Density 3 (Div 2) to keep Density 1 very clean.
                    // Wait, UI Density 1 -> code pointDensity 2.
                    // UI Density 2 -> code pointDensity 3.
                    if (pointDensity > 2) {
                        // Dodecahedron Vertices
                        const one_phi = 1 / phi;
                        // (0, ±1/phi, ±phi)
                        const recRaw = [
                            new THREE.Vector3(0, one_phi, phi), new THREE.Vector3(0, one_phi, -phi), new THREE.Vector3(0, -one_phi, phi), new THREE.Vector3(0, -one_phi, -phi),
                            new THREE.Vector3(one_phi, phi, 0), new THREE.Vector3(one_phi, -phi, 0), new THREE.Vector3(-one_phi, phi, 0), new THREE.Vector3(-one_phi, -phi, 0),
                            new THREE.Vector3(phi, 0, one_phi), new THREE.Vector3(phi, 0, -one_phi), new THREE.Vector3(-phi, 0, one_phi), new THREE.Vector3(-phi, 0, -one_phi)
                        ];
                        // Cube Vertices (±1, ±1, ±1)
                        const cubeRaw = [];
                        for (let x of [-1, 1]) for (let y of [-1, 1]) for (let z of [-1, 1]) cubeRaw.push(new THREE.Vector3(x, y, z));

                        const dodRaw = [...recRaw, ...cubeRaw];

                        addPoints(dodRaw, 0.85); // Fit inside
                        // addPoints(dodRaw, 1.0); // Align corners? Maybe noise. Let's stick to GridSystem logic (0.85).
                        // Actually, if we want them to find the Corner-aligned form, we need Dodeca at 1.0.
                        // But user complained about "Breaking Frame".
                        // Frame usually visualizes the 0.85 Dodeca (if density=2)? 
                        // Or the Cube Framework?
                        // If we omit 1.0 Dodeca, we never find the form connecting cube corners perfectly.
                        // Let's respect "Breaking Frame" and only add inside ones for now.
                    }
                }
            }
        }
    }

    return points;
}

function _generateLinePath(gridPoints, options) {
    const points = [];
    const lines = [];

    // Track used grid references to avoid self-intersection loops on the exact same points immediately 
    // strictly speaking, we want to allow path to cross itself but maybe avoid immediate backtrack?
    // The original logic used a Set of usedPoints to strictly visit unique points. Let's keep that behavior.

    const usedIndices = new Set();

    if (gridPoints.length < 2) return { points: [], lines: [] };

    // Pick start
    let currentIdx = Math.floor(Math.random() * gridPoints.length);
    usedIndices.add(currentIdx);

    // We add the cloned point to our result list
    points.push(gridPoints[currentIdx].clone());
    // Map grid index to our result point index (0)
    let currentResultIdx = 0;

    // We need to map grid indices (source) to result indices (path sequence)
    // The original logic created a path where points are just a list.
    // If indices are used for lines, we need to know the index in `points` array.
    // In a simple path, points[i] connects to points[i+1].

    const minSteps = options.minSteps || 3;
    const maxSteps = options.maxSteps || 20;
    const steps = minSteps + Math.floor(Math.random() * (maxSteps - minSteps + 1));

    for (let i = 0; i < steps; i++) {
        const currentPos = gridPoints[currentIdx];

        // Find valid candidates
        const candidates = [];
        for (let j = 0; j < gridPoints.length; j++) {
            if (!usedIndices.has(j)) {
                if (_isStraightLine(currentPos, gridPoints[j])) {
                    candidates.push(j);
                }
            }
        }

        if (candidates.length === 0) break;

        const nextIdx = candidates[Math.floor(Math.random() * candidates.length)];

        // Add point
        points.push(gridPoints[nextIdx].clone());
        const nextResultIdx = points.length - 1;

        // Add line
        lines.push(new Line(currentResultIdx, nextResultIdx));

        // Advance
        currentIdx = nextIdx;
        currentResultIdx = nextResultIdx;
        usedIndices.add(currentIdx);
    }

    return { points, lines };
}

function _isStraightLine(p1, p2) {
    const dx = Math.abs(p1.x - p2.x);
    const dy = Math.abs(p1.y - p2.y);
    const dz = Math.abs(p1.z - p2.z);

    const eps = 1e-6;
    const deltas = [dx, dy, dz].filter(d => d > eps);

    if (deltas.length === 0) return false; // same point
    if (deltas.length === 1) return true; // along axis

    // Check diagonal: all non-zero deltas must be equal
    const first = deltas[0];
    return deltas.every(d => Math.abs(d - first) < eps);
}

function _validateForm(form) {
    const { points, lines } = form;
    if (points.length < 3 || lines.length < 2) {
        return { faces: 0, volumes: 0, isConnected: false, closedLoops: [] };
    }

    // Build adjacency list (using indices)
    const adj = new Map();
    // Initialize
    for (let i = 0; i < points.length; i++) adj.set(i, []);

    lines.forEach(l => {
        const { a, b } = l;
        if (a !== b && a < points.length && b < points.length) {
            // Check duplicates
            if (!adj.get(a).includes(b)) adj.get(a).push(b);
            if (!adj.get(b).includes(a)) adj.get(b).push(a);
        }
    });

    const cycles = [];
    const cycleSet = new Set(); // hash to deduplicate: "sorted_indices"

    // Detect loops of length 3 (triangles) and 4 (squares)
    // iterate all vertices
    for (let i = 0; i < points.length; i++) {
        const neighbors = adj.get(i);
        if (!neighbors) continue;

        // pairs of neighbors
        for (let j = 0; j < neighbors.length; j++) {
            for (let k = j + 1; k < neighbors.length; k++) {
                const n1 = neighbors[j];
                const n2 = neighbors[k];

                // Check Triangle (3-cycle): n1 connected to n2 directly?
                if (adj.get(n1).includes(n2)) {
                    // Found 3-cycle: i - n1 - n2 - i
                    const cycle = [i, n1, n2].sort((a, b) => a - b);
                    const key = cycle.join('-');
                    if (!cycleSet.has(key)) {
                        cycleSet.add(key);
                        cycles.push(cycle); // storing indices
                    }
                }

                // Check Square (4-cycle): do n1 and n2 have a common neighbor X (other than i)?
                // n1 neighbors:
                const neighbors1 = adj.get(n1);
                for (const x of neighbors1) {
                    if (x === i) continue; // back to start
                    if (x === n2) continue; // this would be the triangle check above

                    // Does n2 connect to x?
                    if (adj.get(n2).includes(x)) {
                        // Found 4-cycle: i - n1 - x - n2 - i

                        // CHECK FOR GHOST FACE:
                        // If there is a diagonal connection (i-x or n1-n2), this 4-cycle is actually 2 triangles.
                        // We should NOT count the outer loop as a face.
                        const hasDiag1 = adj.get(i).includes(x);
                        const hasDiag2 = adj.get(n1).includes(n2);

                        if (hasDiag1 || hasDiag2) continue; // Skip composite face

                        const cycle = [i, n1, x, n2].sort((a, b) => a - b);
                        const key = cycle.join('-');
                        if (!cycleSet.has(key)) {
                            cycleSet.add(key);
                            cycles.push(cycle);
                        }
                    }
                }
            }
        }
    }

    // Volume Check (Closed Shells)
    // We pass the detected cycles (faces) to find closed volumes (e.g. Cubes, Tetrahedrons)

    // 3. Detect Pentagons (5-cycles) - Essential for Icosahedral
    // Iterate points again or re-use logic? Iterating points is safer.
    // Optimization: Only check if we are in Icosahedral mode? No, geometry is universal.
    for (let i = 0; i < points.length; i++) {
        const neighbors = adj.get(i);
        if (!neighbors) continue;

        // Depth-first search for length 5? Or nested loops?
        // Nested loops (like before) are rigid but predictable.
        // A -> B -> C -> D -> E -> A

        // Let's use simplified DFS for specific length to avoid 5-level nesting indentation hell
        const findPath = (curr, start, depth, path) => {
            if (depth === 5) {
                if (adj.get(curr).includes(start)) {
                    // Found cycle
                    const cycle = [...path].sort((a, b) => a - b);
                    const key = cycle.join('-');
                    if (!cycleSet.has(key)) {
                        // Check planarity
                        // Need point vectors
                        const vecPoints = cycle.map(idx => points[idx]);
                        if (GeometryUtils.isPlanar(vecPoints, 0.05)) { // Assuming isPlanar accepts array of Vectors
                            cycleSet.add(key);
                            cycles.push(cycle);
                        }
                    }
                }
                return;
            }

            const neis = adj.get(curr);
            for (const n of neis) {
                if (n > start && !path.includes(n)) { // Enforce ordering > start to dedupe rotations, uniques
                    findPath(n, start, depth + 1, [...path, n]);
                }
            }
        };

        // Trigger search
        // We only need to find cycles starting at 'i' where 'i' is the smallest index in the cycle to avoid dupes/rotations
        // findPath enforces n > start
        findPath(i, i, 1, [i]);
    }

    const volumes = _detectVolumeShells(cycles);

    // Connectivity Check (BFS)
    const visited = new Set();
    if (points.length > 0) {
        const stack = [0];
        visited.add(0);
        while (stack.length) {
            const curr = stack.pop();
            const neighbors = adj.get(curr);
            if (neighbors) {
                for (const n of neighbors) {
                    if (!visited.has(n)) {
                        visited.add(n);
                        stack.push(n);
                    }
                }
            }
        }
    }
    const isConnected = (visited.size === points.length);

    return {
        faces: cycles.length,
        volumes: volumes,
        isConnected,
        // Optional: Return cycle vertices for debug/viz if needed, but currently just counting
        closedLoops: cycles
    };
}

/**
 * Detects Closed 3D Shells (Volumes).
 * Analyzes the graph of Faces to find connected components that form a closed manifold.
 * A component is "closed" if every edge in it belongs to at least 2 faces.
 * 
 * @param {Array<Array<number>>} faces Array of face indices
 * @returns {number} Count of closed volumes
 */
function _detectVolumeShells(faces) {
    if (!faces || faces.length < 4) return 0;

    // 1. Build Edge Table: EdgeKey -> [FaceIndices]
    const edgeToFaces = new Map();
    faces.forEach((face, fIdx) => {
        for (let i = 0; i < face.length; i++) {
            const a = face[i];
            const b = face[(i + 1) % face.length];
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            if (!edgeToFaces.has(key)) edgeToFaces.set(key, []);
            edgeToFaces.get(key).push(fIdx);
        }
    });

    // 2. Build Face Adjacency (undirected)
    const faceAdjacency = new Map(); // fIdx -> Set(fIdx)
    for (let i = 0; i < faces.length; i++) faceAdjacency.set(i, new Set());

    edgeToFaces.forEach((faceIndices, edgeKey) => {
        // Connect all faces sharing this edge
        for (let i = 0; i < faceIndices.length; i++) {
            for (let j = i + 1; j < faceIndices.length; j++) {
                const f1 = faceIndices[i];
                const f2 = faceIndices[j];
                faceAdjacency.get(f1).add(f2);
                faceAdjacency.get(f2).add(f1);
            }
        }
    });

    // 3. Find Components
    const visited = new Set();
    let closedShells = 0;

    for (let i = 0; i < faces.length; i++) {
        if (visited.has(i)) continue;

        const componentFaces = [];
        const queue = [i];
        visited.add(i);

        while (queue.length > 0) {
            const curr = queue.pop();
            componentFaces.push(curr);
            const neighbors = faceAdjacency.get(curr);
            if (neighbors) {
                neighbors.forEach(n => {
                    if (!visited.has(n)) {
                        visited.add(n);
                        queue.push(n);
                    }
                });
            }
        }

        // 4. Check if Component is Closed
        // Rule: Every edge used by this component must be shared by at least 2 faces WITHIN this component.
        // If any edge has only 1 face in this component, it has a "hole".

        // Collect all edges used by this component
        const componentEdges = new Map(); // EdgeKey -> count
        let isClosed = true;

        componentFaces.forEach(fIdx => {
            const face = faces[fIdx];
            for (let k = 0; k < face.length; k++) {
                const a = face[k];
                const b = face[(k + 1) % face.length];
                const key = a < b ? `${a}-${b}` : `${b}-${a}`;
                componentEdges.set(key, (componentEdges.get(key) || 0) + 1);
            }
        });

        // Check counts
        for (const count of componentEdges.values()) {
            if (count < 2) {
                isClosed = false;
                break;
            }
        }

        // Minimum faces for a volume is 4 (Tetrahedron)
        if (isClosed && componentFaces.length >= 4) {
            closedShells++;
        }
    }

    return closedShells;
}

/**
 * Tries to add segments to complete faces and volumes.
 * Ported/Adapted from old/raumharmonik.js completeSurfacesAndVolumes
 */
function _completeForm(form, options = {}) {
    // Reduced default from 60 to 24 to prevent "too many faces"
    const maxEdges = options.maxEdges || 24;

    // Helper to find index of point
    // We assume form.points are unique references? No, they might be clones.
    // We need robust lookup.
    const pointKeyMap = new Map();
    form.points.forEach((p, i) => pointKeyMap.set(GeometryUtils.pointKey(p), i));

    const getPointKey = (idx) => GeometryUtils.pointKey(form.points[idx]);
    const getKeyFromVec = (v) => GeometryUtils.pointKey(v);

    // Build Adjacency
    const adjacency = new Map(); // index -> Set(index)
    const lineSet = new Set();
    const getLineKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

    form.lines.forEach(l => {
        if (!adjacency.has(l.a)) adjacency.set(l.a, new Set());
        if (!adjacency.has(l.b)) adjacency.set(l.b, new Set());
        adjacency.get(l.a).add(l.b);
        adjacency.get(l.b).add(l.a);
        lineSet.add(getLineKey(l.a, l.b));
    });

    const addLine = (a, b) => {
        const key = getLineKey(a, b);
        if (lineSet.has(key)) return false;
        if (form.lines.length >= maxEdges) return false;

        lineSet.add(key);
        form.lines.push(new Line(a, b));

        if (!adjacency.has(a)) adjacency.set(a, new Set());
        if (!adjacency.has(b)) adjacency.set(b, new Set());
        adjacency.get(a).add(b);
        adjacency.get(b).add(a);
        return true;
    };

    // 1. Detect Faces and add closing edges for "almost faces"
    // The old logic iterated existing edges and looked for a 3rd point.
    // It also added edges where "triangle logic" suggested a face.
    // Simplified: Look for 2 connected edges (A-B, B-C) and check if A-C closes a valid face (planar/area check).

    // Iterating all connected triplets is expensive. 
    // Let's stick to the key logic: FIND FACES first.

    // We iterate existing adjacency to find potential triangles.
    // A-B exists. B-C exists. Check A-C.

    // Actually, the goal is to ADD missing segments.
    // If we have A-B and B-C, should we add A-C?
    // Only if it forms a "nice" face (small area? regular?).
    // Old code checked `areaVec.lengthSq() > 1e-6` (not zero) and added it if missing.
    // It essentially triangulated the graph.

    const nodes = Array.from(adjacency.keys());

    for (const keyB of nodes) {
        if (form.lines.length >= maxEdges) break;

        const neighbors = Array.from(adjacency.get(keyB));
        for (let i = 0; i < neighbors.length; i++) {
            for (let j = i + 1; j < neighbors.length; j++) {
                const keyA = neighbors[i];
                const keyC = neighbors[j];

                // Potential triangle A-B-C
                // Check if A-C exists
                if (adjacency.get(keyA)?.has(keyC)) continue; // Already closed

                // Start simple: Always close triangles if maxEdges not reached
                // This effectively creates a truss structure
                addLine(keyA, keyC);
                if (form.lines.length >= maxEdges) break;
            }
            if (form.lines.length >= maxEdges) break;
        }
    }

    // 2. Volume Completion (Tetrahedrons)
    // If we have a triangle A-B-C, and a point D connected to A,B,C...
    // The old logic looked for "Missing" edges in a set of 4 points.

    // Let's re-scan adjacency for triangles.
    // For each triangle A-B-C:
    //   Find D such that D connects to A and B. 
    //   Check connection to C. If missing, ADD D-C.

    // Re-build faces list from current state
    const currentFaces = [];
    nodes.forEach(a => {
        const nA = adjacency.get(a);
        if (!nA) return;
        nA.forEach(b => {
            if (b <= a) return;
            const nB = adjacency.get(b);
            if (!nB) return;
            nB.forEach(c => {
                if (c <= b) return;
                if (nA.has(c)) {
                    currentFaces.push([a, b, c]);
                }
            });
        });
    });

    currentFaces.forEach(face => {
        if (form.lines.length >= maxEdges) return;
        const [a, b, c] = face;

        // Find a point D that is connected to at least 2 of (a,b,c)
        nodes.forEach(d => {
            if (d === a || d === b || d === c) return;
            const conA = adjacency.get(d)?.has(a);
            const conB = adjacency.get(d)?.has(b);
            const conC = adjacency.get(d)?.has(c);

            const count = (conA ? 1 : 0) + (conB ? 1 : 0) + (conC ? 1 : 0);

            if (count >= 2) {
                // If connected to 2, connect to the 3rd to make a tetrahedron
                if (!conA) addLine(d, a);
                else if (!conB) addLine(d, b);
                else if (!conC) addLine(d, c);
            }
        });
    });
}
