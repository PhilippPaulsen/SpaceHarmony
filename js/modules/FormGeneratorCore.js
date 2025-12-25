/**
 * FormGeneratorCore.js
 * 
 * Core logic for generating forms. 
 * Platform-agnostic: Works in Node.js (CLI) and Browser (Web Worker).
 * 
 * @version 1.0.0
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';
import { SymmetryEngine } from './SymmetryEngine.js';
import { GeometryUtils } from './GeometryUtils.js';

export class Line {
    constructor(start, end) {
        this.start = start.clone();
        this.end = end.clone();
    }
}

export class Form {
    constructor() {
        this.points = [];
        this.lines = [];
        this.metadata = {};
    }
}

export function generateForm(gridSize, pointDensity, options = {}) {
    const form = new Form();
    const gridPoints = _defineGrid(gridSize, pointDensity);

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

    // --- Scaling to SpaceHarmony System (Target Grid Size 3) ---
    const targetGridSize = options.targetGridSize || 1;
    // Target Grid Size of 1 means range -0.5 to 0.5 (Scale of SpaceHarmony)
    const sourceSpan = gridSize > 1 ? gridSize - 1 : 1;
    const scaleFactor = targetGridSize / sourceSpan;

    const scaledPoints = pathResult.points.map(p => p.clone().multiplyScalar(scaleFactor));
    form.points = scaledPoints;

    // Index Map for reconstruction
    const pointKey = (p) => GeometryUtils.pointKey(p);
    const pointIndexMap = new Map();
    form.points.forEach((p, i) => pointIndexMap.set(pointKey(p), i));

    form.lines = [];
    if (pathResult.lines) {
        for (const l of pathResult.lines) {
            const startScaled = l.start.clone().multiplyScalar(scaleFactor);
            const endScaled = l.end.clone().multiplyScalar(scaleFactor);

            const p1 = _findClosestPoint(startScaled, form.points);
            const p2 = _findClosestPoint(endScaled, form.points);

            if (p1 && p2 && !p1.equals(p2)) {
                form.lines.push(new Line(p1, p2));
            }
        }
    }

    // Validation & Metadata
    const validationResults = _validateForm(form);
    if (pathResult.symmetryInfo) {
        validationResults.symmetryProperties = pathResult.symmetryInfo.type;
        validationResults.seedShape = pathResult.symmetryInfo.seed;
    }
    form.metadata = _generateMetaData(form, { gridSize, pointDensity, ...options }, validationResults);
    form.metadata.coordinateSystem = "raumharmonik";
    form.metadata.scaledTo = `gridSize${targetGridSize}`;

    return form;
}

function _findClosestPoint(target, points) {
    let best = null;
    let minSq = 1e-9;
    for (const p of points) {
        const d = p.distanceToSquared(target);
        if (d < minSq) {
            minSq = d;
            best = p;
        }
    }
    return best;
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
        "isClosed": validationResults.volumes > 0,
        "isConnected": validationResults.isConnected,
        "symmetry": validationResults.symmetryProperties || "N/A",
        "source": sourceName,
        "notes": notes
    };
}

function _generateSymmetricForm(gridPoints, options, symmetryEngine) {
    const form = new Form();
    const groupKey = options.symmetryGroup || 'cubic';

    // Get transformations from SymmetryEngine
    const transforms = symmetryEngine.getSymmetryGroup(groupKey);

    if (!transforms || transforms.length === 0) {
        console.error(`Symmetry group '${groupKey}' not found or empty.`);
        return { points: [], lines: [] };
    }

    // Seed Line
    if (gridPoints.length < 2) return { points: [], lines: [] };

    let p1 = gridPoints[Math.floor(Math.random() * gridPoints.length)];
    let p2 = gridPoints[Math.floor(Math.random() * gridPoints.length)];
    let attempts = 0;
    while (p1.equals(p2) && attempts < 50) {
        p2 = gridPoints[Math.floor(Math.random() * gridPoints.length)];
        attempts++;
    }
    if (p1.equals(p2)) return { points: [], lines: [], symmetryInfo: null };

    const seedLine = new Line(p1, p2);
    form.points.push(p1, p2);
    form.lines.push(seedLine);

    // Apply Transformations
    applySymmetryGroup(form, transforms);

    return {
        points: form.points,
        lines: form.lines,
        symmetryInfo: { type: groupKey, seed: 'randomLine' }
    };
}

function applySymmetryGroup(form, matrices) {
    const initialLines = [...form.lines];
    const pointMap = new Map();

    const getKey = (p) => GeometryUtils.pointKey(p);

    const findOrCreatePoint = (p) => {
        const key = getKey(p);
        if (pointMap.has(key)) return pointMap.get(key);
        const newPoint = p.clone();
        pointMap.set(key, newPoint);
        return newPoint;
    };

    form.points.forEach(p => findOrCreatePoint(p));

    const lineSet = new Set();
    const getLineKey = (l) => GeometryUtils.segmentKey(l.start, l.end);

    const newLines = [];

    for (const line of initialLines) {
        for (const matrix of matrices) {
            const newStartPos = line.start.clone().applyMatrix4(matrix);
            const newEndPos = line.end.clone().applyMatrix4(matrix);

            const pStart = findOrCreatePoint(newStartPos);
            const pEnd = findOrCreatePoint(newEndPos);

            if (!pStart.equals(pEnd)) {
                const newLine = new Line(pStart, pEnd);
                const lKey = getLineKey(newLine);
                if (!lineSet.has(lKey)) {
                    lineSet.add(lKey);
                    newLines.push(newLine);
                }
            }
        }
    }

    form.lines = newLines;
    form.points = Array.from(pointMap.values());
}

function _defineGrid(gridSize, pointDensity) {
    const points = [];
    const half = (gridSize - 1) / 2;
    if (pointDensity < 1) pointDensity = 1;

    const steps = Array.from({ length: pointDensity }, (_, i) => {
        if (pointDensity === 1) return 0;
        return -half + i * (gridSize - 1) / (pointDensity - 1);
    });

    for (const x of steps) {
        for (const y of steps) {
            for (const z of steps) {
                points.push(new THREE.Vector3(x, y, z));
            }
        }
    }
    return points;
}

function _generateLinePath(gridPoints, options) {
    const usedPoints = new Set();
    const lines = [];
    const pathPoints = [];

    if (gridPoints.length < 2) return { points: [], lines: [] };

    let currentPoint = gridPoints[Math.floor(Math.random() * gridPoints.length)];
    usedPoints.add(currentPoint);
    pathPoints.push(currentPoint);

    const minSteps = options.minSteps || 3;
    const maxSteps = options.maxSteps || 20;
    const steps = minSteps + Math.floor(Math.random() * (maxSteps - minSteps + 1));

    for (let i = 0; i < steps; i++) {
        const candidates = gridPoints.filter(p => !usedPoints.has(p) && _isStraightLine(currentPoint, p));

        if (candidates.length === 0) break;

        const nextPoint = candidates[Math.floor(Math.random() * candidates.length)];
        lines.push(new Line(currentPoint, nextPoint));

        currentPoint = nextPoint;
        pathPoints.push(currentPoint);
        usedPoints.add(currentPoint);
    }

    return { points: pathPoints, lines: lines || [] };
}

function _isStraightLine(p1, p2) {
    const dx = Math.abs(p1.x - p2.x);
    const dy = Math.abs(p1.y - p2.y);
    const dz = Math.abs(p1.z - p2.z);

    const eps = 1e-6;
    const deltas = [dx, dy, dz].filter(d => d > eps);

    if (deltas.length === 0) return false;
    if (deltas.length === 1) return true;

    const first = deltas[0];
    return deltas.every(d => Math.abs(d - first) < eps);
}

function _validateForm(form) {
    const { points, lines } = form;
    if (points.length < 3 || lines.length < 2) {
        return { faces: 0, volumes: 0, isConnected: false, closedLoops: [] };
    }

    const pKey = (p) => GeometryUtils.pointKey(p);
    const pMap = new Map();
    points.forEach((p, i) => pMap.set(pKey(p), i));

    // Build adjacency
    const adj = new Map();
    points.forEach((_, i) => adj.set(i, []));

    lines.forEach(l => {
        const i1 = pMap.get(pKey(l.start));
        const i2 = pMap.get(pKey(l.end));
        if (i1 !== undefined && i2 !== undefined && i1 !== i2) {
            adj.get(i1).push(i2);
            adj.get(i2).push(i1);
        }
    });

    const cycles = [];
    const cycleSet = new Set();

    for (let i = 0; i < points.length; i++) {
        const neighbors = adj.get(i);
        if (!neighbors) continue;

        for (let j = 0; j < neighbors.length; j++) {
            for (let k = j + 1; k < neighbors.length; k++) {
                const n1 = neighbors[j];
                const n2 = neighbors[k];
                if (adj.get(n1).includes(n2)) {
                    const cycle = [i, n1, n2].sort();
                    const key = cycle.join('-');
                    if (!cycleSet.has(key)) {
                        cycleSet.add(key);
                        cycles.push(cycle.map(idx => points[idx]));
                    }
                }
            }
        }
    }

    const visited = new Set();
    const stack = [0];
    visited.add(0);
    while (stack.length) {
        const curr = stack.pop();
        const neighbors = adj.get(curr);
        if (neighbors) {
            neighbors.forEach(n => {
                if (!visited.has(n)) {
                    visited.add(n);
                    stack.push(n);
                }
            });
        }
    }
    const isConnected = (visited.size === points.length);

    return {
        faces: cycles.length,
        volumes: 0,
        isConnected,
        closedLoops: cycles
    };
}
