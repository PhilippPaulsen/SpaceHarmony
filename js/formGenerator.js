/**
 * formGenerator.js
 * 
 * Ein modularer Generator zur Erzeugung von zufälligen und gesetzmäßigen geometrischen Formen
 * in einem 3D-Würfelgitter für das Projekt "SpaceHarmony".
 * 
 * @version 1.8.1
 * @date 2025-10-03
 */

// --- ES6 Modul-Importe ---
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import gl from 'gl';
import Canvas from 'canvas';
import open from 'open';

// --- ES6 Modul-Kontext für __dirname ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- 0. Datenstrukturen ---

class Point {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

class Line {
    constructor(startPoint, endPoint) {
        this.start = startPoint;
        this.end = endPoint;
    }
}

class Form {
    constructor() {
        this.points = [];
        this.lines = [];
        this.metadata = {};
    }
}


// --- 1. Hauptfunktion ---

function generateForm(gridSize, pointDensity, options = {}) {
    const form = new Form();
    const gridPoints = _defineGrid(gridSize, pointDensity);
    
    let pathResult;
    if (options.mode === 'maxRegular') {
        pathResult = _generateMaximallyRegularForm({ gridSize, pointDensity }, options);
    } else {
        pathResult = _generateLinePath(gridPoints, options);
    }

    form.points = pathResult.points;
    form.lines = pathResult.lines;

    const validationResults = _validateForm(form);
    
    // Metadaten aus dem Generator (falls vorhanden) übernehmen
    if (pathResult.symmetryInfo) {
        validationResults.symmetryProperties = pathResult.symmetryInfo.type;
        validationResults.symmetryScore = pathResult.symmetryInfo.score;
        validationResults.seedShape = pathResult.symmetryInfo.seed;
    }

    form.metadata = _generateMetaData(form, { gridSize, pointDensity, ...options }, validationResults);
    
    return form;
}


// --- 2. Modulare Hilfsfunktionen ---

function _defineGrid(gridSize, pointDensity) {
    const points = [];
    const half = (gridSize - 1) / 2;
    const steps = pointDensity === 1 ? [ -half, half ] : Array.from({length: gridSize}, (_, i) => i - half);
    
    for (const x of steps) {
        for (const y of steps) {
            for (const z of steps) {
                points.push(new Point(x, y, z));
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

    return { points: pathPoints, lines };
}

function _generateMaximallyRegularForm(gridConfig, options) {
    const form = new Form();
    const half = (gridConfig.gridSize - 1) / 2;

    // --- Bibliothek für geometrische Grundformen ("Seeds") ---
    const seeds = {
        pyramid: () => {
            const p1 = new Point(-half, -half, -half);
            const p2 = new Point(half, -half, -half);
            const p3 = new Point(half, half, -half);
            const p4 = new Point(-half, half, -half);
            const apex = new Point(0, 0, half);
            form.points = [p1, p2, p3, p4, apex];
            form.lines = [
                new Line(p1, p2), new Line(p2, p3), new Line(p3, p4), new Line(p4, p1), // Basis
                new Line(p1, apex), new Line(p2, apex), new Line(p3, apex), new Line(p4, apex) // Seiten
            ];
        },
        tetrahedron: () => {
            const p1 = new Point(half, half, half);
            const p2 = new Point(half, -half, -half);
            const p3 = new Point(-half, half, -half);
            const p4 = new Point(-half, -half, half);
            form.points = [p1, p2, p3, p4];
            form.lines = [
                new Line(p1, p2), new Line(p1, p3), new Line(p1, p4),
                new Line(p2, p3), new Line(p2, p4), new Line(p3, p4)
            ];
        },
        octahedron: () => {
            const p1 = new Point(half, 0, 0);
            const p2 = new Point(-half, 0, 0);
            const p3 = new Point(0, half, 0);
            const p4 = new Point(0, -half, 0);
            const p5 = new Point(0, 0, half);
            const p6 = new Point(0, 0, -half);
            form.points = [p1, p2, p3, p4, p5, p6];
            form.lines = [
                new Line(p1,p3), new Line(p1,p4), new Line(p1,p5), new Line(p1,p6),
                new Line(p2,p3), new Line(p2,p4), new Line(p2,p5), new Line(p2,p6),
                new Line(p3,p5), new Line(p3,p6), new Line(p4,p5), new Line(p4,p6)
            ];
        }
    };

    // --- Bibliothek für Symmetrieoperationen ---
    const symmetries = {
        fourFoldZ: ['rotateZ90', 'rotateZ180', 'rotateZ270'],
        mirrorXY: ['mirrorXY'],
        fullInversion: ['inversion']
    };

    // Wähle zufällig eine Grundform und eine Symmetrieoperation
    const seedKeys = Object.keys(seeds);
    const symmetryKeys = Object.keys(symmetries);
    const chosenSeedKey = seedKeys[Math.floor(Math.random() * seedKeys.length)];
    const chosenSymmetryKey = symmetryKeys[Math.floor(Math.random() * symmetryKeys.length)];
    
    // Erzeuge die Grundform
    seeds[chosenSeedKey]();

    // Wende die Symmetrie an
    _applySymmetry(form, symmetries[chosenSymmetryKey]);
    
    const symmetryInfo = {
        seed: chosenSeedKey,
        type: chosenSymmetryKey,
        score: (1 + symmetries[chosenSymmetryKey].length) / 5 // Einfacher Score, max. ca. 1.0
    };

    return { points: form.points, lines: form.lines, symmetryInfo };
}

function _isStraightLine(p1, p2) {
    const dx = Math.abs(p1.x - p2.x);
    const dy = Math.abs(p1.y - p2.y);
    const dz = Math.abs(p1.z - p2.z);
    const nonZeroDeltas = [dx, dy, dz].filter(d => d > 0);
    if (nonZeroDeltas.length === 1) return true;
    if (nonZeroDeltas.length > 1 && nonZeroDeltas.every(d => d === nonZeroDeltas[0])) return true;
    return false;
}

function _applySymmetry(form, operations) {
    // Hilfsfunktion zur Verwaltung einzigartiger Punkte. Essenziell für korrekte Geometrie.
    const pointMap = new Map();
    const epsilon = 1e-6;
    const getKey = (p) => `${Math.round(p.x/epsilon)}:${Math.round(p.y/epsilon)}:${Math.round(p.z/epsilon)}`;

    form.points.forEach(p => pointMap.set(getKey(p), p));

    const findOrCreatePoint = (p) => {
        const key = getKey(p);
        if (pointMap.has(key)) {
            return pointMap.get(key);
        }
        const newPoint = new Point(p.x, p.y, p.z);
        pointMap.set(key, newPoint);
        return newPoint;
    };

    const initialPoints = [...form.points];
    const initialLines = [...form.lines];
    let newLines = [];

    // Wende jede Transformation auf alle existierenden Punkte und Linien an
    for (const op of operations) {
        const transformedPoints = new Map(); // Map von Originalpunkt zu transformiertem Punkt

        initialPoints.forEach(p => {
            let tp; // transformierter Punkt
            switch (op) {
                case 'mirrorXY': tp = new Point(p.x, p.y, -p.z); break;
                case 'mirrorYZ': tp = new Point(-p.x, p.y, p.z); break;
                case 'mirrorXZ': tp = new Point(p.x, -p.y, p.z); break;
                case 'rotateZ90': tp = new Point(-p.y, p.x, p.z); break;
                case 'rotateZ180': tp = new Point(-p.x, -p.y, p.z); break;
                case 'rotateZ270': tp = new Point(p.y, -p.x, p.z); break;
                case 'inversion': tp = new Point(-p.x, -p.y, -p.z); break;
                default: tp = new Point(p.x, p.y, p.z);
            }
            transformedPoints.set(p, findOrCreatePoint(tp));
        });

        initialLines.forEach(line => {
            const newStart = transformedPoints.get(line.start);
            const newEnd = transformedPoints.get(line.end);
            if (newStart && newEnd) {
                newLines.push(new Line(newStart, newEnd));
            }
        });
    }

    // Baue die Form mit einzigartigen Punkten und Linien neu auf
    const lineSet = new Set();
    const finalLines = [];
    
    const getLineKey = (line) => {
        const key1 = getKey(line.start);
        const key2 = getKey(line.end);
        return [key1, key2].sort().join('-');
    };

    form.lines.concat(newLines).forEach(line => {
        const lineKey = getLineKey(line);
        if (!lineSet.has(lineKey) && getKey(line.start) !== getKey(line.end)) {
            lineSet.add(lineKey);
            finalLines.push(line);
        }
    });

    form.points = Array.from(pointMap.values());
    form.lines = finalLines;
}

function _validateForm(form) {
    const { points, lines } = form;

    if (points.length < 3 || lines.length < 2) {
        return { faces: 0, volumes: 0, isConnected: points.length > 1, symmetryProperties: "C1", closedLoops: [] };
    }

    const pointIndexMap = new Map(points.map((p, i) => [p, i]));
    const adjList = new Map(points.map((_, i) => [i, []]));

    for (const line of lines) {
        const startIndex = pointIndexMap.get(line.start);
        const endIndex = pointIndexMap.get(line.end);
        if (startIndex !== undefined && endIndex !== undefined && startIndex !== endIndex) {
            adjList.get(startIndex).push(endIndex);
            adjList.get(endIndex).push(startIndex);
        }
    }

    const allCycles = [];
    const uniqueCycles = new Set();

    function findNewCycles(startNode) {
        const stack = [[startNode, [startNode]]]; // Stack stores [currentNode, currentPath] 
        
        while (stack.length > 0) {
            const [u, path] = stack.pop();
            const neighbors = adjList.get(u) || [];

            for (const v of neighbors) {
                // Avoid going back immediately in the path
                if (path.length > 1 && v === path[path.length - 2]) {
                    continue;
                }

                if (v === startNode && path.length >= 3) {
                    // Found a cycle returning to the start node
                    const cycle = [...path];
                    const canonical = cycle.sort((a, b) => a - b).join('-');
                    if (!uniqueCycles.has(canonical)) {
                        uniqueCycles.add(canonical);
                        allCycles.push(cycle.map(index => points[index]));
                    }
                } else if (!path.includes(v)) {
                    // Continue traversal
                    const newPath = [...path, v];
                    // Simple loop prevention to keep paths from becoming excessively long
                    if (newPath.length <= points.length) {
                       stack.push([v, newPath]);
                    }
                }
            }
        }
    }

    for (let i = 0; i < points.length; i++) {
        findNewCycles(i);
    }

    const validFaces = allCycles.filter(cycle => {
        if (cycle.length < 3) return false;
        // Check if all points in the cycle are collinear.
        // We only need to find one non-collinear triplet to confirm it's a valid 2D face.
        for (let i = 2; i < cycle.length; i++) {
            if (!_arePointsCollinear(cycle[0], cycle[1], cycle[i])) {
                return true; // This cycle forms a non-flat polygon.
            }
        }
        return false; // All points were collinear.
    });
    
    // Check for graph connectivity using a simple traversal (like BFS or DFS)
    let isConnected = true;
    if (points.length > 0) {
        const visited = new Set();
        const q = [0];
        visited.add(0);
        let head = 0;
        while(head < q.length) {
            const u = q[head++];
            for(const v of (adjList.get(u) || [])) {
                if(!visited.has(v)) {
                    visited.add(v);
                    q.push(v);
                }
            }
        }
        // A graph is connected if the traversal visited all points that have lines connected to them.
        const pointsWithLines = new Set();
        lines.forEach(line => {
            const startIdx = pointIndexMap.get(line.start);
            const endIdx = pointIndexMap.get(line.end);
            if (startIdx !== undefined) pointsWithLines.add(startIdx);
            if (endIdx !== undefined) pointsWithLines.add(endIdx);
        });
        
        if (pointsWithLines.size > 0) {
            isConnected = Array.from(pointsWithLines).every(pIdx => visited.has(pIdx));
        } else {
            isConnected = points.length <= 1;
        }
    }


    return {
        faces: validFaces.length,
        volumes: 0,
        isConnected: isConnected,
        symmetryProperties: "C1",
        closedLoops: validFaces
    };
}

function _arePointsCollinear(p1, p2, p3) {
    const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
    const v2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };
    const crossProductX = v1.y * v2.z - v1.z * v2.y;
    const crossProductY = v1.z * v2.x - v1.x * v2.z;
    const crossProductZ = v1.x * v2.y - v1.y * v2.x;
    // Use an epsilon for robust floating point comparison, though for grid points it might not be strictly necessary.
    const epsilon = 1e-9;
    return Math.abs(crossProductX) < epsilon && Math.abs(crossProductY) < epsilon && Math.abs(crossProductZ) < epsilon;
}

function _generateMetaData(form, options, validationResults) {
    const id = options.id || Date.now();
    const sourceName = options.mode === 'maxRegular' ? "Symmetrischer Generator v1.7" : "Zufallsgenerator v1.7";
    const notes = options.mode === 'maxRegular' ? `Grundform: ${validationResults.seedShape}, Symmetrie: ${validationResults.symmetryProperties}` : "zufällig generiert";

    return {
        "id": id,
        "name": `SH_Form_${id}`,
        "generatedAt": new Date().toISOString(),
        "gridSize": options.gridSize,
        "pointDensity": options.pointDensity,
        "lineCount": form.lines.length,
        "faceCount": validationResults.faces,
        "volumeCount": validationResults.volumes,
        "isClosed": validationResults.volumes > 0,
        "isConnected": validationResults.isConnected,
        "symmetry": validationResults.symmetryProperties || "N/A",
        "symmetryScore": validationResults.symmetryScore || 0,
        "source": sourceName,
        "notes": notes
    };
}


// --- 3. Exportfunktionen ---

function exportAsJson(form) {
    return JSON.stringify(form, null, 2);
}

function exportAsObj(form) {
    let objContent = "# Generated by SpaceHarmony Form Generator v1.7\n";
    const pointIndexMap = new Map();
    form.points.forEach((p, i) => {
        objContent += `v ${p.x} ${p.y} ${p.z}\n`;
        pointIndexMap.set(p, i + 1);
    });
    objContent += "\n";
    form.lines.forEach(l => {
        const startIndex = pointIndexMap.get(l.start);
        const endIndex = pointIndexMap.get(l.end);
        if (startIndex && endIndex) {
            objContent += `l ${startIndex} ${endIndex}\n`;
        }
    });
    if (form.metadata.faceCount > 0 && form.metadata.closedLoops) {
        objContent += "\n# Faces\n";
        form.metadata.closedLoops.forEach(face => {
            const indices = face.map(p => pointIndexMap.get(p)).join(' ');
            if (indices && !indices.includes('undefined')) {
                objContent += `f ${indices}\n`;
            }
        });
    }
    return objContent;
}


// --- 4. Zukünftige Entwicklung: Volumenerkennung ---

/** KONZEPT ZUR VOLUMENERKENNUNG... */


// --- 5. Batch-Generierung (Node.js) ---

async function generateMultipleForms(config = {}) {
    if (!fs || !path) {
        console.error("Batch-Generierung ist nur in einer Node.js-Umgebung verfügbar.");
        return;
    }

    const mutableConfig = { ...config };

    if (mutableConfig.debugLog && mutableConfig.count > 50) {
        console.warn("\n⚠️  Debug-Modus: Anzahl der Formen wird auf 50 begrenzt, um die Konsole nicht zu überfluten.");
        mutableConfig.count = 50;
    }

    const {
        count = 50000,
        minFaces: configMinFaces,
        gridSize = 3,
        pointDensity = 3,
        generationOptions = {},
        outputDir = 'generated_forms',
        saveJson = true,
        saveObj = true,
        generateHtmlGallery = true,
        debugLog = false,
        generateThumbnails = true // Neue Option
    } = mutableConfig;

    const minFaces = typeof configMinFaces === 'number' ? configMinFaces : 0;
    const absoluteOutputDir = path.join(__dirname, outputDir);

    try {
        if (fs.existsSync(absoluteOutputDir)) {
            fs.rmSync(absoluteOutputDir, { recursive: true, force: true });
        }
        fs.mkdirSync(absoluteOutputDir, { recursive: true });
        console.log(`Ausgabeverzeichnis '${absoluteOutputDir}' zurückgesetzt.`);

        if (generateThumbnails) {
            const thumbDir = path.join(absoluteOutputDir, 'thumbnails');
            fs.mkdirSync(thumbDir, { recursive: true });
        }
    } catch (error) {
        console.error(`Fehler beim Zurücksetzen des Verzeichnisses: ${error.message}`);
        return;
    }

    console.log(`Starte Batch-Generierung von ${count} Formen (Kriterium: minFaces >= ${minFaces})...
`);
    
    let generatedWithLines = 0;
    let meetsCriteriaCount = 0;
    const savedFiles = [];

    for (let i = 1; i <= count; i++) {
        if (!debugLog) {
            process.stdout.write(`\rGeneriere & prüfe Form ${i}/${count}...`);
        }
        const form = generateForm(gridSize, pointDensity, { ...generationOptions, id: i });

        if (form.lines.length === 0) {
            if (debugLog) process.stdout.write(`\n[Debug] Form ${i}: 0 Linien – übersprungen ❌`);
            continue;
        }
        generatedWithLines++;

        const meetsCriteria = form.metadata.faceCount >= minFaces;

        if (debugLog) {
            const status = meetsCriteria ? 'gespeichert ✅' : `übersprungen ❌ (minFaces: ${minFaces})`;
            process.stdout.write(`\n[Debug] Form ${i}: ${form.points.length} P, ${form.lines.length} L, ${form.metadata.faceCount} F – ${status}`);
        }

        if (meetsCriteria) {
            meetsCriteriaCount++;
            const m = form.metadata;
            const baseName = `SH_PD${m.pointDensity}_L${m.lineCount}_F${m.faceCount}_T${m.volumeCount}_${meetsCriteriaCount}`;
            
            if (saveJson) {
                const jsonFileName = `${baseName}.json`;
                const jsonFilePath = path.join(absoluteOutputDir, jsonFileName);
                try {
                    fs.writeFileSync(jsonFilePath, exportAsJson(form), 'utf8');
                    savedFiles.push({json: jsonFileName, obj: ''});
                } catch (error) { console.error(`\nFehler beim Speichern von ${jsonFileName}: ${error.message}`); }
            }

            if (saveObj) {
                const objFileName = `${baseName}.obj`;
                const objFilePath = path.join(absoluteOutputDir, objFileName);
                try {
                    fs.writeFileSync(objFilePath, exportAsObj(form), 'utf8');
                    if(savedFiles.length > 0) savedFiles[savedFiles.length-1].obj = objFileName;

                    if (generateThumbnails) {
                        const thumbPath = path.join(absoluteOutputDir, 'thumbnails', `${baseName}.webp`);
                        await _generateThumbnail(form, thumbPath);
                    }
                } catch (error) { console.error(`\nFehler beim Speichern von ${objFileName} oder Thumbnail: ${error.message}`); }
            }
        } 
    }

    process.stdout.write('\n\n--- Batch-Generierung Abgeschlossen ---\n');
    console.log(`- ${generatedWithLines} von ${count} Versuchen ergaben eine Form mit Linien.`);
    console.log(`- ${meetsCriteriaCount} davon erfüllten das Kriterium (faces >= ${minFaces}).`);

    if (generatedWithLines > 0) {
        const faceHitRate = (meetsCriteriaCount / generatedWithLines * 100).toFixed(2);
        console.log(`\nTrefferquote (Kriterium erfüllt): ${meetsCriteriaCount} von ${generatedWithLines} (≈ ${faceHitRate}%).`);
    }

    if (generateHtmlGallery) {
        _createHtmlPreview(absoluteOutputDir, savedFiles.map(f => f.obj));
    }

    if (meetsCriteriaCount > 0 && generateHtmlGallery) {
        const galleryPath = path.join(absoluteOutputDir, 'index.html');
        try {
            console.log('\nÖffne HTML-Galerie im Browser...');
            await open(galleryPath);
        } catch (error) {
            console.warn(`\nKonnte die Galerie nicht automatisch öffnen. Bitte öffne sie manuell: ${galleryPath}`);
        }
    }
}

async function _generateThumbnail(form, thumbPath, width = 400, height = 300) {
    const createCanvas = Canvas.createCanvas;
    const headlessGL = gl;

    const glContext = headlessGL(width, height, { preserveDrawingBuffer: true });

    const renderer = new THREE.WebGLRenderer({
    context: glContext,
    antialias: true,
    preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setClearColor(0xffffff, 1); // Weißer Hintergrund

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(3, 3, 3);
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    const scene = new THREE.Scene();

    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x000000,
        linewidth: 1,
        transparent: true,
        opacity: 0.6
    });

    const geometry = new THREE.BufferGeometry();
    const positions = [];

    form.lines.forEach(line => {
        positions.push(line.start.x, line.start.y, line.start.z);
        positions.push(line.end.x, line.end.y, line.end.z);
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const lineSegments = new THREE.LineSegments(geometry, lineMaterial);

    const group = new THREE.Group();
    group.add(lineSegments);

    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    group.position.sub(center);

    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
        const scale = 3 / maxDim;
        group.scale.set(scale, scale, scale);
    }

    scene.add(group);
    renderer.render(scene, camera);

    const canvas = createCanvas(width, height);
    const buffer = canvas.toBuffer('image/webp');
    fs.writeFileSync(thumbPath, buffer);
    renderer.dispose();
}

function _createHtmlPreview(outputDir, objFiles) {
    if (!fs || !path) return;

    const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SpaceHarmony - Form-Galerie</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; background-color: #121212; color: #e0e0e0; }
        header { text-align: center; padding: 2rem; border-bottom: 1px solid #333; }
        h1 { margin: 0; font-size: 2rem; font-weight: 300; letter-spacing: 1px; }
        main { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 2rem; padding: 2rem; }
        .scene-wrapper {
            position: relative;
            background-color: #1e1e1e; 
            border: 1px solid #333; 
            border-radius: 8px; 
            overflow: hidden; 
            box-shadow: 0 4px 8px rgba(0,0,0,0.2); 
            transition: transform 0.2s ease;
            min-height: 320px; 
            display: flex;
            flex-direction: column;
        }
        .scene-wrapper:hover { transform: translateY(-5px); box-shadow: 0 8px 16px rgba(0,0,0,0.3); }
        h2 { font-size: 0.9rem; font-weight: 400; text-align: center; padding: 0.8rem; margin: 0; background-color: #282828; border-bottom: 1px solid #333; word-wrap: break-word; }
        .visual-container {
            position: relative;
            flex-grow: 1;
        }
        .preview-thumb {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            width: 100%; height: 100%;
            object-fit: cover;
            transition: opacity 0.5s ease-in-out;
            opacity: 1;
            z-index: 2;
        }
        .three-canvas {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            width: 100%; height: 100%;
            opacity: 0;
            transition: opacity 0.5s ease-in-out;
            z-index: 1;
        }
        .loading-spinner {
            width: 40px; height: 40px;
            border: 4px solid #444;
            border-top-color: #fff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            z-index: 3;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        @keyframes spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
        .empty-state { text-align: center; grid-column: 1 / -1; padding: 4rem; }
    </style>
    <script type="importmap">
    {
        "imports": {
            "three": "https://unpkg.com/three@0.164.1/build/three.module.js",
            "three/addons/": "https://unpkg.com/three@0.164.1/examples/jsm/"
        }
    }
    </script>
</head>
<body>
    <header><h1>SpaceHarmony Form-Galerie</h1></header>
    <main id="gallery-container"></main>

    <script type="module">
        import * as THREE from 'three';
        import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

        const objFiles = ${JSON.stringify(objFiles)};
        const container = document.getElementById('gallery-container');

        const activeScenes = new Map();

        if (objFiles.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Keine Formen zum Anzeigen gefunden. Führe den Generator aus, um neue Formen zu erstellen.</p></div>';
        }

        const observerCallback = (entries, observer) => {
            entries.forEach(entry => {
                const wrapper = entry.target;
                const visualContainer = wrapper.querySelector('.visual-container');
                if (!visualContainer) return;

                if (entry.isIntersecting) {
                    if (!activeScenes.has(wrapper)) {
                        const spinner = visualContainer.querySelector('.loading-spinner');
                        spinner.style.opacity = '1';

                        const canvas = document.createElement('canvas');
                        canvas.className = 'three-canvas';
                        visualContainer.appendChild(canvas);
                        
                        const onLoaded = () => {
                            const thumb = visualContainer.querySelector('.preview-thumb');
                            if (thumb) thumb.style.opacity = '0';
                            canvas.style.opacity = '1';
                            spinner.style.opacity = '0';
                        };

                        const sceneContext = initScene(canvas, wrapper.dataset.objPath, onLoaded);
                        activeScenes.set(wrapper, sceneContext);
                    }
                } else {
                    if (activeScenes.has(wrapper)) {
                        const thumb = visualContainer.querySelector('.preview-thumb');
                        if (thumb) thumb.style.opacity = '1';

                        destroyScene(activeScenes.get(wrapper));
                        activeScenes.delete(wrapper);
                        visualContainer.querySelector('canvas')?.remove();
                    }
                }
            });
        };

        const observer = new IntersectionObserver(observerCallback, { rootMargin: '200px' });

        objFiles.forEach(fileName => {
            if (!fileName) return;
            const thumbName = fileName.replace('.obj', '.webp');
            const sceneWrapper = document.createElement('div');
            sceneWrapper.className = 'scene-wrapper';
            sceneWrapper.dataset.objPath = fileName;

            const title = document.createElement('h2');
            title.textContent = fileName;
            sceneWrapper.appendChild(title);

            const visualContainer = document.createElement('div');
            visualContainer.className = 'visual-container';

            const spinner = document.createElement('div');
            spinner.className = 'loading-spinner';

            const img = document.createElement('img');
            img.src = 'thumbnails/' + thumbName;
            img.className = 'preview-thumb';
            img.alt = 'Vorschau von ' + fileName;

            visualContainer.appendChild(spinner);
            visualContainer.appendChild(img);

            sceneWrapper.appendChild(visualContainer);
            container.appendChild(sceneWrapper);
            observer.observe(sceneWrapper);
        });

        function initScene(canvas, objPath, onLoadedCallback) {
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1e1e1e);

            const renderer = new THREE.WebGLRenderer({
                context,
                antialias: true,
                preserveDrawingBuffer: true
            });
            renderer.setSize(width, height, false);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Performance-Optimierung für Mobile

            const parent = canvas.parentElement;
            const aspect = parent.clientWidth / parent.clientHeight;
            const frustumSize = 5;
            const camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 0.1, 1000);
            camera.position.set(5, 5, 5);
            camera.lookAt(scene.position);

            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;

            scene.add(new THREE.AmbientLight(0xffffff, 0.7));
            const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
            dirLight.position.set(8, 10, 5);
            scene.add(dirLight);

            const loader = new OBJLoader();
            loader.load(objPath, 
                (object) => {
                    const box = new THREE.Box3().setFromObject(object);
                    const center = box.getCenter(new THREE.Vector3());
                    object.position.sub(center);

                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const scale = frustumSize / maxDim;
                    object.scale.set(scale, scale, scale);

                    object.traverse(child => {
                        if (child.isMesh) {
                            child.material = new THREE.MeshPhysicalMaterial({
                                color: 0x0077ff, metalness: 0.2, roughness: 0.6,
                                transparent: true, opacity: 0.8, side: THREE.DoubleSide
                            });
                            const wireframe = new THREE.LineSegments(
                                new THREE.WireframeGeometry(child.geometry),
                                new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1, transparent: true, opacity: 0.5 })
                            );
                            child.add(wireframe);
                        }
                    });
                    scene.add(object);
                    if(onLoadedCallback) onLoadedCallback(); // Callback nach dem Laden ausführen
                },
                undefined, 
                (error) => console.error('Fehler beim Laden von', objPath, error)
            );

            let animationId;
            function animate() {
                animationId = requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
            }
            animate();

            const resizeListener = () => {
                const p = canvas.parentElement;
                if (!p) return;
                renderer.setSize(p.clientWidth, p.clientHeight);
                const aspect = p.clientWidth / p.clientHeight;
                camera.left = frustumSize * aspect / -2;
                camera.right = frustumSize * aspect / 2;
                camera.updateProjectionMatrix();
            };
            window.addEventListener('resize', resizeListener);

            return { scene, renderer, controls, animationId, resizeListener };
        }

        function destroyScene(context) {
            cancelAnimationFrame(context.animationId);
            window.removeEventListener('resize', context.resizeListener);

            context.scene.traverse(object => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });

            context.controls.dispose();
            context.renderer.dispose();
            context.renderer.forceContextLoss();
        }
    </script>
</body>
</html>
    `;

    const indexPath = path.join(outputDir, 'index.html');
    try {
        fs.writeFileSync(indexPath, htmlContent, 'utf8');
        console.log(`Interaktive HTML-Galerie erfolgreich erstellt: ${indexPath}`);
    } catch (error) {
        console.error(`Fehler beim Erstellen der HTML-Galerie: ${error.message}`);
    }
}

// --- Skript ausführen (wenn direkt mit Node.js aufgerufen) ---
const isMainModule = (import.meta.url.startsWith('file://') && process.argv[1] === fileURLToPath(import.meta.url));

if (isMainModule) {
    generateMultipleForms({
        count: 5,
        minFaces: 1,
        debugLog: true,
        saveJson: false,
        saveObj: true, // ← wieder aktivieren
        generateHtmlGallery: true,
        generateThumbnails: true,
        gridSize: 3,
        pointDensity: 3,
        generationOptions: {
            mode: "maxRegular",
            minSteps: 8,
            maxSteps: 18
        }
    });
}