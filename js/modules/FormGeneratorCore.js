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
import { ConvexHull } from './ConvexHull.js';
import { Taxonomy } from './Taxonomy.js';

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

export function generateForm(gridSize = 3, pointDensity = 2, options = {}) {
    const form = new Form();
    const gridPoints = _defineGrid(gridSize, pointDensity, options);

    let pathResult;
    // Handle options: standard spread or nested generationOptions
    const symGroup = options.symmetryGroup || (options.generationOptions && options.generationOptions.symmetryGroup);
    const mode = options.mode || (options.generationOptions && options.generationOptions.mode);

    const symmetry = new SymmetryEngine();

    // New Systematic Mode
    if (mode === 'systematic') {
        return _generateSystematic(gridSize, pointDensity, options);
    }

    if (symGroup || mode === 'maxRegular') {
        const groupKey = symGroup || 'cubic';
        // Pass options to get index for Shell Cycling
        pathResult = _generateSymmetricForm(gridPoints, { ...options, symmetryGroup: groupKey }, symmetry);
    } else {
        pathResult = _generateLinePath(gridPoints, options);
    }

    form.points = pathResult.points;
    form.lines = pathResult.lines;

    // --- Completion Step (The "Lawful" part) ---
    const isSimpleAndLowDensity = (Number(options.minFaces || 0) < 30 && (Number(options.pointDensity || 1) <= 1));

    if (options.completeForm !== false) {
        const completionOpts = { maxEdges: options.maxEdges || 60 };

        // Universal Smart Constraint
        // We ALWAYS enforce the Shell Distance if available.
        // This ensures that even in Complex Mode, we generate consistent "Crystalline" structures
        // rather than organic hairballs. This matches "All possible node connections" (systematic).
        if (pathResult && pathResult.symmetryInfo && pathResult.symmetryInfo.distSq) {
            completionOpts.allowedDistSq = pathResult.symmetryInfo.distSq;
        }

        _completeForm(form, completionOpts);
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
        validationResults.debugP = pathResult.symmetryInfo.debugP; // Pass debugP to metadata
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
    form.metadata = _generateMetaData(form, { gridSize, pointDensity, ...options }, validationResults, isSimpleAndLowDensity);
    form.metadata.coordinateSystem = "raumharmonik";
    form.metadata.scaledTo = `gridSize${targetGridSize}`;

    // console.log(`[FormGen] Final Faces: ${form.faces.length}`);

    return form;
}

function _generateMetaData(form, options, validationResults, isSimpleAndLowDensity) {
    const id = options.id || Date.now();
    let sourceName = "Random Generator v2.0";
    if (validationResults.symmetryProperties) {
        sourceName = "Symmetric Generator";
    }
    const notes = `Start: ${validationResults.seedShape || 'N/A'}, Group: ${validationResults.symmetryProperties || 'None'}`;
    const debugP = validationResults.debugP || '?';
    const debugStr = (validationResults.debugStrategy === 'strict') ? 'STRICT' : 'RLX';

    return {
        "id": id,
        "name": `Form #${options.index !== undefined ? options.index + 1 : id} [${debugStr}-P${debugP}-${isSimpleAndLowDensity ? 'SMPL' : 'CPLX'}]`,
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

    if (gridPoints.length < 2) return { points: [], lines: [] };

    // 1. Pick Start
    let currentIdx = Math.floor(Math.random() * gridPoints.length);
    usedIndices.add(currentIdx);
    points.push(gridPoints[currentIdx].clone());

    // Strategy: Universal Shell Selector
    // We select ONE shell based on the index.
    // We force the random walk to use ONLY that edge length.
    // This finding strategy works for Simple forms (Platonic) AND Complex forms (Stars, Inter-shell connections).
    // Because symmetry preserves distance, a path of constant edge length is highly likely to close into a symmetric orbit (Polyhedron).

    // Strategy: Hybrid Discovery
    // 1. Analyze Distances (Shells)
    const shells = new Map();
    const startP = gridPoints[currentIdx];

    for (let k = 0; k < gridPoints.length; k++) {
        if (k === currentIdx) continue;
        const d = startP.distanceToSquared(gridPoints[k]);
        if (d < 0.0001) continue;
        let found = false;
        for (let key of shells.keys()) {
            if (Math.abs(key - d) < 0.01) { shells.get(key).push(k); found = true; break; }
        }
        if (!found) shells.set(d, [k]);
    }

    const sortedShells = Array.from(shells.entries()).sort((a, b) => a[0] - b[0]);
    const totalShells = sortedShells.length;

    // 2. Decide Strategy based on Index
    // Phase 1: Exhaust Strict Shells (Perfect Solids)
    // Phase 2: Relaxed/Mixed Shells (Complex/Organic Forms)
    const requestedIndex = options.index || 0;

    // Force Relaxed Mode FAST.
    // Index 0, 1, 2 = Strict (Find the ~3 Perfect Solids).
    // Index 3+ = Relaxed (Find Variants).
    // This prevents "Stuck in Solids" loop.
    const useStrict = requestedIndex < 3;

    let targetDistSq = 0;
    let shellIndex = -1;

    if (useStrict) {
        shellIndex = requestedIndex % totalShells;
        const target = sortedShells[shellIndex];
        targetDistSq = target ? target[0] : 0;
    }

    // 3. Walk
    for (let i = 0; i < pathLength; i++) {
        const currentPos = gridPoints[currentIdx];
        const candidates = [];

        for (let j = 0; j < gridPoints.length; j++) {
            if (j !== currentIdx) {
                const d = currentPos.distanceToSquared(gridPoints[j]);

                if (useStrict) {
                    // Strict Shell Constraint
                    if (Math.abs(d - targetDistSq) < 0.01) {
                        candidates.push(j);
                    }
                } else {
                    // Relaxed Constraint (Phase 2)
                    // Allow ANY connection within a reasonable max radius (e.g. 1.5x max shell?)
                    // Or just any shell? 
                    // Let's filter slightly to avoid cross-grid chaos lines, but allow mixing shells.
                    // Actually, just allowing any neighbor in the 'shells' map is good.
                    // Tetrahedron edge length squared is 8.0 (from 1,1,1 to 1,-1,-1).
                    // So 4.0 was too small! Increased to 12.0 to be safe.
                    if (d < 12.0) {
                        candidates.push(j);
                    }
                }
            }
        }

        if (candidates.length === 0) break;

        const nextIdx = candidates[Math.floor(Math.random() * candidates.length)];
        const nextPoint = gridPoints[nextIdx];

        points.push(nextPoint.clone());
        lines.push(new Line(i, i + 1));

        currentIdx = nextIdx;
        usedIndices.add(currentIdx);
    }

    if (lines.length === 0) return { points: [], lines: [], symmetryInfo: null };

    // Apply Transformations
    _applySymmetryGroup({ points, lines }, transforms);

    return {
        points: points,
        lines: lines,
        symmetryInfo: {
            type: options.symmetryGroup,
            seed: 'random-walk',
            strategy: useStrict ? 'strict' : 'relaxed',
            shell: shellIndex,
            distSq: useStrict ? targetDistSq : null, // Pass distSq ONLY if strict
            debugP: gridPoints.length,
            debugS: totalShells
        }
    };
}

/**
 * NEW: Systematic Generation of Symmetric Forms (Generalized)
 * 
 * 1. Enumerates all unique connection pairs in P(n).
 * 2. Generates edge orbit under full symmetry.
 * 3. Detects Faces (Cycles) directly from the wireframe (allowing Stars/Planes).
 * 4. Filters duplicates via Taxonomy.
 */
function _generateSystematic(gridSize, pointDensity, options) {
    const symmetry = new SymmetryEngine();
    // Default to cubic if not specified, but respect options
    const rawGroup = options.symmetryGroup || 'cubic';
    // Ensure we map 'tetrahedral' correctly if passed
    const matrices = symmetry.getSymmetryGroup(rawGroup);

    // 1. Generate Master Grid Points
    // Respect user density but enforce minimum 2 (Corners) to ensure volume.
    // If pointDensity is 1 (center only), we force 2 to get at least a cube.
    // 1. Generate Master Grid Points
    // Respect user density. Used to force min 2, but new parity logic (d*2) ensures density 1 is valid (d=2).
    const effectiveDensity = Math.max(1, pointDensity || 1);
    const gridPoints = _defineGrid(gridSize, effectiveDensity, options);

    // 2. Identify Target Pair based on 'options.index'
    const pairs = [];
    const pairSet = new Set();

    let pairAttempts = 0;

    for (let i = 0; i < gridPoints.length; i++) {
        for (let j = i + 1; j < gridPoints.length; j++) {
            const p1 = gridPoints[i];
            const p2 = gridPoints[j];
            pairAttempts++;

            // Canonicalize this pair under symmetry
            // Find "Smallest" pair in the orbit
            const sig = _getArgminPairSignature(p1, p2, matrices);

            if (!pairSet.has(sig.key)) {
                pairSet.add(sig.key);
                pairs.push(sig); // { key, p1, p2 } representative
            }
        }
    }

    // Sort pairs to strictly define "Form #1, #2..."
    // Sort by Length, then coordinates
    pairs.sort((a, b) => {
        const d = a.distSq - b.distSq;
        if (Math.abs(d) > 0.001) return d;
        return a.key.localeCompare(b.key);
    });

    const targetPair = pairs[options.index || 0];

    const form = new Form();
    if (!targetPair) {
        // Out of bounds - Stop generation
        form.metadata = { exhausted: true };
        return form;
    }

    // 3. Generate Full Edge Orbit
    const startLine = { points: [targetPair.p1, targetPair.p2], lines: [new Line(0, 1)] };
    // Create temp form structure for symmetry engine
    const tempForm = { points: [targetPair.p1, targetPair.p2], lines: [new Line(0, 1)] };

    // Use custom apply to get all edges
    _applySymmetryGroup(tempForm, matrices);

    // 4. GENERALIZED FACE DETECTION (Replaces Convex Hull)
    // We now have a symmetric wireframe. We need to find the faces (cycles).
    form.points = tempForm.points;
    form.lines = tempForm.lines;

    // Use internal validation to find cycles (Triangles, Squares, Pentagons)
    // strict=false? We want to find ALL valid planar loops.
    // _validateForm logic finds 3, 4, 5 cycles and checks planarity.
    // This is perfect for Stars and Planes.
    const validation = _validateForm(form);
    const rawFaces = validation.closedLoops || [];

    // FILTER: Remove distinct "Internal" faces that are occluded on both sides.
    // This removes "Hallucinated" cross-sections (like the squares inside an octahedron)
    // while keeping Open Surfaces and Star Spikes.
    const filteredFaces = _filterInternalFaces(rawFaces, form.points);
    form.faces = filteredFaces;

    // 5. Taxonomy & Naming
    // Taxonomy expects { vertices: [], faces: [[i,j,k],...] }
    const mockResult = {
        vertices: form.points,
        faces: form.faces
    };

    const classInfo = Taxonomy.classify(mockResult, { n: gridSize - 1 });

    form.metadata = {
        ...classInfo, // vProfile, eProfile, cGeo, name
        isClosed: validation.volumes > 0,
        volumeCount: validation.volumes,
        faceCount: form.faces.length // Override taxonomy face count if it parses differently
    };

    // Standard properties
    form.metadata.symmetry = "Oh (Cubic)";
    // Convexity Check: Simple check if volumeCount=1 and faceCount matches Euler?
    // Actually, let's leave 'convex' undefined or false unless we check it.
    // Taxonomy might tell us if it's a known solid.
    form.metadata.convex = (validation.volumes === 1 && validation.isConnected && form.faces.length > 3); // Rough heuristic

    // Scaling: Normalize to SpaceHarmony unit (approx -0.5 to 0.5)
    // Points are on integer grid [-1, 0, 1] (size 2). Scale by 0.5 to get size 1.
    const scaleFactor = 0.5;
    form.points.forEach(p => p.multiplyScalar(scaleFactor));

    return form;
}

/**
 * Filter out faces that are "Internal" (Occluded on both sides).
 * Retains visible surfaces (One or both sides clear).
 */
function _filterInternalFaces(faceIndicesArray, points) {
    if (!faceIndicesArray || faceIndicesArray.length === 0) return [];

    const visibleFaces = [];
    const ray = new THREE.Ray();
    const tri = new THREE.Triangle();
    const target = new THREE.Vector3();

    // Pre-compute geometric faces for intersection tests
    // Using simple Triangles. For Squares/Pentagons, we check specific sub-triangles or average plane?
    // Robust approach: Treat every face as a collection of triangles (Fan) for blocking.
    const blockers = [];
    faceIndicesArray.forEach((indices, fIdx) => {
        const p0 = points[indices[0]];
        for (let i = 1; i < indices.length - 1; i++) {
            blockers.push({
                a: p0,
                b: points[indices[i]],
                c: points[indices[i + 1]],
                parentIdx: fIdx
            });
        }
    });

    // Also include Point Blockers? (Vertices blocking squares in Octahedron)
    // Ray-Point intersection is finicky. 
    // But usually faces share vertices, so we hit the neighbor face at distance 0.
    // We only care about hits at distance > epsilon (Self-intersection) OR hits at some distance.

    // Actually, for the Octahedron Square:
    // Center (0,0,0). Ray (0,0,1).
    // Target is Vertex (0,0,1).
    // This vertex is part of 4 faces.
    // The ray hits the common edge/vertex of those faces.
    // triangle.intersect() handles edge/vertex hits? Yes.

    faceIndicesArray.forEach((indices, myIdx) => {
        // 1. Calc Center & Normal
        const center = new THREE.Vector3();
        indices.forEach(i => center.add(points[i]));
        center.divideScalar(indices.length);

        // Normal: (p1-p0) x (p2-p0)
        const p0 = points[indices[0]];
        const p1 = points[indices[1]];
        const p2 = points[indices[2]]; // Assume at least 3
        const v1 = new THREE.Vector3().subVectors(p1, p0);
        const v2 = new THREE.Vector3().subVectors(p2, p0);
        const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();

        if (normal.lengthSq() < 0.1) {
            // Degenerate normal? Keep it or toss?
            return;
        }

        // 2. Check Both Directions
        // Offset center slightly to avoid self-intersection with own edges
        const bias = 0.001;
        const origin = center.clone();

        const checkDir = (dir) => {
            ray.set(origin, dir);

            // Check against all blockers (except those belonging to me?)
            // If we hit our own face, it's at dist~0 (if non-convex) or because of origin.
            // But we start at Center.
            // If the face is convex planar, Ray won't hit itself.

            let minD = Infinity;

            for (const b of blockers) {
                if (b.parentIdx === myIdx) continue; // Don't block self

                tri.set(b.a, b.b, b.c);
                // Using backfaceCulling = false to hit ANY side of the blocker
                const hit = ray.intersectTriangle(tri.a, tri.b, tri.c, false, target);

                if (hit) {
                    const d = origin.distanceTo(hit);
                    // If d is HUGE (infinity), ignore.
                    // If d is very small? 
                    // In Octahedron, Center to Vertex is 1.0.
                    // If d < bias, ignore?
                    if (d > bias) {
                        if (d < minD) minD = d;
                    }
                }
            }
            return (minD < Infinity);
        };

        let blockedA = false;
        let blockedB = false;

        // Check +Normal
        blockedA = checkDir(normal);

        // Check -Normal
        if (blockedA) {
            const negNormal = normal.clone().negate();
            blockedB = checkDir(negNormal);
        }

        // If NOT both blocked, keep it
        if (!(blockedA && blockedB)) {
            visibleFaces.push(indices);
        }
    });

    return visibleFaces;
}

function _getArgminPairSignature(p1, p2, matrices) {
    // Find lexicographically smallest representation of the pair (u,v)
    // applied to all symmetries.
    // Key format: "dsq|x1,y1,z1|x2,y2,z2" (sorted p1<p2)

    let minKey = null;
    let minP1 = null;
    let minP2 = null;

    const distSq = p1.distanceToSquared(p2);

    matrices.forEach(m => {
        const t1 = p1.clone().applyMatrix4(m);
        const t2 = p2.clone().applyMatrix4(m);

        // Round to avoid float noise
        [t1, t2].forEach(v => {
            v.x = Math.round(v.x * 1000) / 1000;
            v.y = Math.round(v.y * 1000) / 1000;
            v.z = Math.round(v.z * 1000) / 1000;
        });

        // Sort points
        let a, b;
        if (GeometryUtils.pointKey(t1) < GeometryUtils.pointKey(t2)) { a = t1; b = t2; }
        else { a = t2; b = t1; }

        const key = `${GeometryUtils.pointKey(a)}>${GeometryUtils.pointKey(b)}`;

        if (minKey === null || key < minKey) {
            minKey = key;
            minP1 = a;
            minP2 = b;
        }
    });

    return { key: minKey, distSq, p1: minP1, p2: minP2 };
}

/**
 * Applies symmetry matrices to the form, expanding points and lines.
 * Uses index-based logic to avoid duplication.
 */
function _applySymmetryGroup(formObj, matrices) {
    const initialLines = [...formObj.lines];
    const initialPoints = formObj.points;

    // Robust Merge: Use distance check instead of string keys
    // Critical for Icosahedral floats
    const EPSILON_SQ = 0.001 * 0.001;

    const findPointIndex = (p) => {
        for (let i = 0; i < formObj.points.length; i++) {
            if (formObj.points[i].distanceToSquared(p) < EPSILON_SQ) {
                return i;
            }
        }
        return -1;
    };

    const findOrCreatePoint = (p) => {
        const idx = findPointIndex(p);
        if (idx !== -1) return idx;

        const newIndex = formObj.points.length;
        formObj.points.push(p.clone());
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

    const symGroup = options.symmetryGroup || (options.generationOptions && options.generationOptions.symmetryGroup);

    if (symGroup === 'icosahedral') {
        const minF = Number(options.minFaces || 0);
        // "Simple Mode" only applies if Density is 1 (Standard Platonic).
        // If Density > 1, we want variety/complex forms regardless of face count setting.
        const isSimple = (minF < 30 && pointDensity <= 1);

        // Alternate Grid Base Type for Simple Mode Variety
        const idx = options.index || 0;
        const useDodeca = isSimple && (idx % 2 !== 0);

        const phi = (1 + Math.sqrt(5)) / 2;
        const radius = (half > 0 ? half : 1.0);

        const addPoints = (vectors, scaleMultiplier = 1.0) => {
            vectors.forEach(v => {

                // Align with App: Icosahedron radius = radius * sqrt(3)
                const p = v.clone().normalize().multiplyScalar(radius * scaleMultiplier * Math.sqrt(3));
                let exists = false;
                for (let existing of points) {
                    if (existing.distanceToSquared(p) < 0.0001) { exists = true; break; }
                }
                if (!exists) points.push(p);
            });
        };

        const icoRaw = [
            new THREE.Vector3(0, 1, phi), new THREE.Vector3(0, 1, -phi), new THREE.Vector3(0, -1, phi), new THREE.Vector3(0, -1, -phi),
            new THREE.Vector3(1, phi, 0), new THREE.Vector3(1, -phi, 0), new THREE.Vector3(-1, phi, 0), new THREE.Vector3(-1, -phi, 0),
            new THREE.Vector3(phi, 0, 1), new THREE.Vector3(phi, 0, -1), new THREE.Vector3(-phi, 0, 1), new THREE.Vector3(-phi, 0, -1)
        ];

        const one_phi = 1 / phi;
        const recRaw = [
            new THREE.Vector3(0, one_phi, phi), new THREE.Vector3(0, one_phi, -phi), new THREE.Vector3(0, -one_phi, phi), new THREE.Vector3(0, -one_phi, -phi),
            new THREE.Vector3(one_phi, phi, 0), new THREE.Vector3(one_phi, -phi, 0), new THREE.Vector3(-one_phi, phi, 0), new THREE.Vector3(-one_phi, -phi, 0),
            new THREE.Vector3(phi, 0, one_phi), new THREE.Vector3(phi, 0, -one_phi), new THREE.Vector3(-phi, 0, one_phi), new THREE.Vector3(-phi, 0, -one_phi)
        ];
        const cubeRaw = [];
        for (let x of [-1, 1]) for (let y of [-1, 1]) for (let z of [-1, 1]) cubeRaw.push(new THREE.Vector3(x, y, z));
        const dodRaw = [...recRaw, ...cubeRaw];

        // CONCENTRIC SHELL GENERATION
        const density = Math.max(1, pointDensity);

        for (let i = 1; i <= density; i++) {
            const s = i / density;

            if (isSimple) {
                if (useDodeca) {
                    addPoints(dodRaw, s);
                } else {
                    addPoints(icoRaw, s);
                }
            } else {
                // Complex/High Density: MIX THEM!
                // Add Ico
                addPoints(icoRaw, s);
                // Add Dodeca explicitly to encourage cross-connections
                addPoints(dodRaw, s);
            }
        }

    } else if (symGroup === 'tetrahedral') {
        // IVM / FCC Lattice Implementation (Mirrors GridSystem.js)
        // We multiply density by 2 to ensure 'd' is even, guaranteeing corners (1,1,1) are included.
        const density = Math.max(1, pointDensity) * 2;
        const half = (gridSize - 1) / 2;
        const radius = (half > 0 ? half : 1.0);

        // Match GridSystem logic: step = scale / density
        const step = radius / density;
        for (let x = -density; x <= density; x++) {
            for (let y = -density; y <= density; y++) {
                for (let z = -density; z <= density; z++) {
                    if ((Math.abs(x) + Math.abs(y) + Math.abs(z)) % 2 === 0) {

                        // Gradual/Shell Filter (Match GridSystem)
                        if (pointDensity < 4.0) {
                            const d = density;
                            const h = d / 2;
                            const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);

                            // Key Structural Groups
                            const isCenter = (ax === 0 && ay === 0 && az === 0);
                            const isOuterFrame = (ax === d || ay === d || az === d);
                            const isHalfShell = (ax === h || ay === h || az === h);

                            const isCorner = (ax === d && ay === d && az === d);
                            const isFaceCenter = ((ax === d && ay === 0 && az === 0) || (ay === d && ax === 0 && az === 0) || (az === d && ax === 0 && ay === 0));
                            const isVE = ((ax === h && ay === h && az === 0) || (ax === h && az === h && ay === 0) || (ay === h && az === h && ax === 0));

                            if (pointDensity <= 1.5) {
                                if (!isCenter && !isCorner && !isFaceCenter && !isVE) continue;
                            } else if (pointDensity <= 2.5) {
                                const isEdgeMid = ((ax === d && ay === d && az === 0) || (ax === d && az === d && ay === 0) || (ay === d && az === d && ax === 0));
                                const isSubCorner = (ax === h && ay === h && az === h);
                                if (!isCenter && !isCorner && !isFaceCenter && !isVE && !isEdgeMid && !isSubCorner) continue;
                            } else {
                                if (!isOuterFrame && !isHalfShell && !isCenter) continue;
                            }
                        }

                        points.push(new THREE.Vector3(x, y, z).multiplyScalar(step));
                    }
                }
            }
        }
    } else {
        // 2. Standard Cartesian Grid (Default)
        const steps = [];
        if (pointDensity === 1) {
            steps.push(0);
        } else {
            for (let i = 0; i < pointDensity; i++) {
                steps.push(-half + i * (gridSize - 1) / (pointDensity - 1));
            }
        }

        for (const x of steps) {
            for (const y of steps) {
                for (const z of steps) {
                    points.push(new THREE.Vector3(x, y, z));
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

    // Unified Cycle Detection (Lengths 3 to 12)
    // Supports Triangles, Squares, Pentagons, Hexagons, Octagons, Decagons
    // iterate all vertices
    for (let i = 0; i < points.length; i++) {
        // Optimization: Only start searches from nodes that have neighbors
        const rootNeighbors = adj.get(i);
        if (!rootNeighbors || rootNeighbors.length < 2) continue;

        const findCycles = (curr, start, depth, path) => {
            // Check for loop closure
            // We only care about cycles of length 3 to 12
            if (depth >= 3) {
                if (adj.get(curr).includes(start)) {
                    // Found a cycle closed back to start
                    const cycle = [...path]; // Preserves winding order for planarity check?
                    // Actually, sorting indices creates a canonical Key, but destroys winding for Normal calc.
                    // However, we need a canonical Key to deduplicate (Triangle 1-2-3 is same as 2-3-1).
                    // We store "Sorted Indices" as key.
                    // But we keep "Winding Order" for Geom check?
                    // GeometryUtils.isPlanar handles point cloud, so order less critical there but helps.

                    const sortedCycle = [...cycle].sort((a, b) => a - b);
                    const key = sortedCycle.join('-');

                    if (!cycleSet.has(key)) {
                        // Check Planarity & Validity
                        // Use original path for points to keep potential winding
                        const vecPoints = cycle.map(idx => points[idx]);

                        // Planarity Check
                        // Relaxed tolerance for larger faces (accumulated error)
                        if (GeometryUtils.isPlanar(vecPoints, 0.1)) {
                            // Check for internal diagonals (Ghost Faces)
                            // A 4-cycle might be 2 fused triangles.
                            // A 5-cycle might be a triangle + quad.
                            // We reject cycles that contain "internal chords" (edges between non-adjacent vertices).
                            // e.g. Square 1-2-3-4. If 1-3 exists, it's 2 triangles. Reject Square.

                            let isElementary = true;
                            // Check all non-adjacent pairs in the cycle
                            for (let m = 0; m < cycle.length; m++) {
                                for (let n = m + 2; n < cycle.length; n++) {
                                    // Adjacent if n == m+1 or (m=0, n=len-1)
                                    if (m === 0 && n === cycle.length - 1) continue;

                                    const u = cycle[m];
                                    const v = cycle[n];
                                    if (adj.get(u).includes(v)) {
                                        isElementary = false;
                                        break;
                                    }
                                }
                                if (!isElementary) break;
                            }

                            if (isElementary) {
                                cycleSet.add(key);
                                cycles.push(sortedCycle);
                            }
                        }
                    }
                }
            }

            // Recurse (Max Depth 12)
            if (depth < 12) {
                const neighbors = adj.get(curr);
                for (const n of neighbors) {
                    // Enforce Canonical Ordering: only visit nodes > start (except for closure check handled above)
                    // This prevents finding the same cycle N times (rotations) AND reverse cycles.
                    // Path must strictly follow nodes > start? 
                    // No, that restricts the graph traversal too much (e.g. 1 -> 10 -> 2 -> 1). 2 > 1 is true. 2 < 10 is true.
                    // The standard canonical restriction is: Start node is the Smallest node in the cycle.
                    // So we only visit n if n > start.
                    if (n > start) {
                        // And don't revisit nodes in current path
                        if (!path.includes(n)) {
                            findCycles(n, start, depth + 1, [...path, n]);
                        }
                    }
                }
            }
        };

        // Start DFS from i
        // path starts with [i]
        findCycles(i, i, 1, [i]);
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
            const key = a < b ? `${a} -${b} ` : `${b} -${a} `;
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
                const key = a < b ? `${a} -${b} ` : `${b} -${a} `;
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
    const getLineKey = (a, b) => (a < b ? `${a} -${b} ` : `${b} -${a} `);

    form.lines.forEach(l => {
        if (!adjacency.has(l.a)) adjacency.set(l.a, new Set());
        if (!adjacency.has(l.b)) adjacency.set(l.b, new Set());
        adjacency.get(l.a).add(l.b);
        adjacency.get(l.b).add(l.a);
        lineSet.add(getLineKey(l.a, l.b));
    });

    const addLine = (a, b) => {
        if (form.lines.length >= maxEdges) return false;

        // Shell Constraint
        if (options.allowedDistSq) {
            const distSq = form.points[a].distanceToSquared(form.points[b]);
            // Tolerance 0.1 (squared) covers minor float drift but excludes different edge types
            if (Math.abs(distSq - options.allowedDistSq) > 0.1) return false;
        }

        const key = getLineKey(a, b);
        if (lineSet.has(key)) return false;

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
