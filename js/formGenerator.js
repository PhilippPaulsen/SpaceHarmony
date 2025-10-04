/**
 * formGenerator.js
 * 
 * Ein modularer Generator zur Erzeugung von zufälligen und gesetzmäßigen geometrischen Formen
 * in einem 3D-Würfelgitter für das Projekt "SpaceHarmony".
 * 
 * @version 1.9.0
 * @date 2025-10-04
 */

// --- ES6 Modul-Importe ---
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from 'canvas';
import open from 'open';
import { Point, Line, Form } from './structures.js';
import { SYMMETRY_OPERATIONS, SYMMETRY_GROUPS } from './symmetry.js';

// --- ES6 Modul-Kontext für __dirname ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// --- 1. Hauptfunktion ---

function generateForm(gridSize, pointDensity, options = {}) {
    const form = new Form();
    const gridPoints = _defineGrid(gridSize, pointDensity);
    
    let pathResult;
    const genOptions = options.generationOptions || {};

    // Wenn eine Symmetrie-Option (neu oder alt) vorhanden ist, wird der volle Symmetrie-Modus verwendet.
    if (genOptions.symmetryGroup || options.mode === 'fullSymmetry' || options.mode === 'All Reflections / Rotations') {
        pathResult = _generateSymmetricForm(gridPoints, { symmetryGroup: 'cubic' });
    } 
    else {
        // Andernfalls wird eine zufällige Linie generiert.
        pathResult = _generateLinePath(gridPoints, options);
    }

    form.points = pathResult.points;
    form.lines = pathResult.lines;

    const validationResults = _validateForm(form);
    
    // Metadaten aus dem Generator (falls vorhanden) übernehmen
    if (pathResult.symmetryInfo) {
        validationResults.symmetryProperties = pathResult.symmetryInfo.type;
        validationResults.symmetryScore = _calculateSymmetryScore(form, pathResult.symmetryInfo.operations);
        validationResults.symmetries = pathResult.symmetryInfo.operations;
        validationResults.seedShape = pathResult.symmetryInfo.seed;
    }

    form.metadata = _generateMetaData(form, { gridSize, pointDensity, ...options }, validationResults);
    
    return form;
}

function _generateMetaData(form, options, validationResults) {
    const id = options.id || Date.now();
    let sourceName = "Zufallsgenerator v1.9";
    if (validationResults.symmetryProperties) {
        sourceName = "All Reflections / Rotations";
    }
    const notes = `Startform: ${validationResults.seedShape || 'N/A'}, Symmetrie-Gruppe: ${validationResults.symmetryProperties || 'Keine'}`;

    return {
        "id": id,
        "name": `SH_Form_${id}`,
        "generatedAt": new Date().toISOString(),
        "gridSize": options.gridSize,
        "pointDensity": options.pointDensity,
        "minSteps": options.minSteps || null,
        "maxSteps": options.maxSteps || null,
        "pointCount": form.points.length,
        "lineCount": form.lines.length,
        "faceCount": validationResults.faces,
        "volumeCount": validationResults.volumes,
        "isClosed": validationResults.volumes > 0,
        "isConnected": validationResults.isConnected,
        "symmetry": validationResults.symmetryProperties || "N/A",
        "symmetryScore": validationResults.symmetryScore || {},
        "symmetries": validationResults.symmetries || [],
        "source": sourceName,
        "notes": notes
    };
}

/**
 * Berechnet den Symmetrie-Score für eine gegebene Form und eine Liste von Symmetrien.
 * @returns {object} Ein Objekt mit Scores für jede Symmetrie, z.B. { mirrorXY: 0.95, ... }
 */
function _calculateSymmetryScore(form, symmetries) {
    const scores = {};
    if (!symmetries || symmetries.length === 0) return scores;

    // Da die Formen programmatisch generiert werden, um perfekt symmetrisch zu sein,
    // setzen wir den Score für die verwendeten Operationen auf 1.0.
    // Eine echte Symmetrie-Erkennung für eine beliebige Form wäre deutlich komplexer.
    symmetries.forEach(opKey => {
        if (typeof opKey === 'string') {
            scores[opKey] = 1.0;
        }
    });

    return scores;
}

/**
 * Erzeugt eine symmetrische Form basierend auf einer Symmetriegruppe.
 */
function _generateSymmetricForm(gridPoints, options) {
    const form = new Form();
    const groupKey = options.symmetryGroup || 'cubic';
    const operations = SYMMETRY_GROUPS[groupKey];

    if (!operations) {
        console.error(`Symmetriegruppe '${groupKey}' nicht gefunden.`);
        return { points: [], lines: [] };
    }

    // Erzeuge eine einzelne zufällige Linie als "Seed"
    let p1 = gridPoints[Math.floor(Math.random() * gridPoints.length)];
    let p2 = gridPoints[Math.floor(Math.random() * gridPoints.length)];
    let attempts = 0;
    while (p1 === p2 && attempts < 50) {
        p2 = gridPoints[Math.floor(Math.random() * gridPoints.length)];
        attempts++;
    }
    if (p1 === p2) return { points: [], lines: [], symmetryInfo: null };
    
    form.points.push(p1, p2);
    form.lines.push(new Line(p1, p2));

    // Wende die komplette Symmetriegruppe auf die Seed-Form an
    applySymmetryGroup(form, operations);

    const symmetryInfo = {
        seed: 'randomLine',
        type: groupKey,
        operations: operations.map(op => typeof op === 'string' ? op : 'custom_function'),
        score: 1.0 // Platzhalter, später wird hier der Score berechnet
    };

    return { points: form.points, lines: form.lines, symmetryInfo };
}

/**
 * Wendet eine Gruppe von Symmetrieoperationen auf eine Form an.
 * Erzeugt alle symmetrischen Äquivalente für die initialen Linien der Form.
 */
function applySymmetryGroup(form, operations) {
    const initialLines = [...form.lines];
    
    const pointMap = new Map();
    const epsilon = 1e-6;
    const getKey = (p) => `${Math.round(p.x/epsilon)}:${Math.round(p.y/epsilon)}:${Math.round(p.z/epsilon)}`;

    const findOrCreatePoint = (p) => {
        const key = getKey(p);
        if (pointMap.has(key)) {
            return pointMap.get(key);
        }
        const newPoint = new Point(p.x, p.y, p.z);
        pointMap.set(key, newPoint);
        return newPoint;
    };

    const lineSet = new Set();
    const getLineKey = (line) => {
        const key1 = getKey(line.start);
        const key2 = getKey(line.end);
        return [key1, key2].sort().join('-');
    };

    const newLines = [];
    for (const line of initialLines) {
        for (const op of operations) {
            const opFunc = typeof op === 'string' ? SYMMETRY_OPERATIONS[op] : op;
            if (!opFunc) {
                console.warn(`Unbekannte Symmetrieoperation: ${op}`);
                continue;
            }

            const newStart = findOrCreatePoint(opFunc(line.start));
            const newEnd = findOrCreatePoint(opFunc(line.end));
            const newLine = new Line(newStart, newEnd);
            const lineKey = getLineKey(newLine);

            if (getKey(newStart) !== getKey(newEnd) && !lineSet.has(lineKey)) {
                lineSet.add(lineKey);
                newLines.push(newLine);
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

    // Erzeugt eine Reihe von Schritten von -half bis +half.
    const steps = Array.from({ length: pointDensity }, (_, i) => {
        if (pointDensity === 1) return 0; // Einzelner Punkt im Zentrum
        return -half + i * (gridSize - 1) / (pointDensity - 1);
    });

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

function _isStraightLine(p1, p2) {
    const dx = Math.abs(p1.x - p2.x);
    const dy = Math.abs(p1.y - p2.y);
    const dz = Math.abs(p1.z - p2.z);
    const nonZeroDeltas = [dx, dy, dz].filter(d => d > 0);
    if (nonZeroDeltas.length === 1) return true;
    if (nonZeroDeltas.length > 1 && nonZeroDeltas.every(d => d === nonZeroDeltas[0])) return true;
    return false;
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

export async function generateMultipleForms(config) {
    console.log('[DEBUG] generateMultipleForms received config:', config);

    if (!fs || !path) {
        console.error("Batch-Generierung ist nur in einer Node.js-Umgebung verfügbar.");
        return;
    }

    // Parameter direkt aus dem config-Objekt verwenden und Standardwerte setzen, falls sie fehlen.
    const {
        count = 10,
        minFaces = 0,
        gridSize = 3,
        pointDensity = 3,
        generationOptions = {},
        outputDir = 'generated_forms',
        saveJson = true,
        saveObj = true,
        debugLog = true,
        generateThumbnails = true
    } = config;

    const absoluteOutputDir = path.join(__dirname, outputDir);
    const thumbnailsDir = path.join(absoluteOutputDir, 'thumbnails');

    try {
        if (fs.existsSync(absoluteOutputDir)) {
            fs.rmSync(absoluteOutputDir, { recursive: true, force: true });
        }
        fs.mkdirSync(absoluteOutputDir, { recursive: true });
        if (generateThumbnails) {
            fs.mkdirSync(thumbnailsDir, { recursive: true });
        }
        console.log(`Ausgabeverzeichnis '${absoluteOutputDir}' zurückgesetzt.`);

    } catch (error) {
        console.error(`Fehler beim Zurücksetzen des Verzeichnisses: ${error.message}`);
        return;
    }

    console.log(`Starte Batch-Generierung von ${count} Formen mit gridSize=${gridSize} (Kriterium: minFaces >= ${minFaces})...\n`);

    let generatedWithLines = 0;
    let meetsCriteriaCount = 0;
    const savedFiles = [];

    for (let i = 1; i <= count; i++) {
        if (debugLog) {
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
            const fileData = { json: '', obj: '', png: '' };

            if (saveJson) {
                const jsonFileName = `${baseName}.json`;
                const jsonFilePath = path.join(absoluteOutputDir, jsonFileName);
                try {
                    fs.writeFileSync(jsonFilePath, exportAsJson(form), 'utf8');
                    fileData.json = jsonFileName;
                } catch (error) { console.error(`\nFehler beim Speichern von ${jsonFileName}: ${error.message}`); }
            }

            if (saveObj) {
                const objFileName = `${baseName}.obj`;
                const objFilePath = path.join(absoluteOutputDir, objFileName);
                try {
                    fs.writeFileSync(objFilePath, exportAsObj(form), 'utf8');
                    fileData.obj = objFileName;

                    if (generateThumbnails && form.points.length > 0) {
                        const thumbName = `${baseName}.png`;
                        const thumbPath = path.join(thumbnailsDir, thumbName);
                        try {
                            const success = await _generateThumbnailCanvas(form, thumbPath);
                            if (success) {
                                fileData.png = thumbName;
                            }
                        } catch (thumbError) {
                            console.warn(`\n⚠️ Thumbnail-Fehler für ${baseName}: ${thumbError.message}`);
                        }
                    }
                } catch (error) { console.error(`\nFehler beim Speichern von ${objFileName}: ${error.message}`); }
            }
            savedFiles.push(fileData);
        }
    }

    process.stdout.write('\n\n--- Batch-Generierung Abgeschlossen ---\n');
    console.log(`- ${generatedWithLines} von ${count} Versuchen ergaben eine Form mit Linien.`);
    console.log(`- ${meetsCriteriaCount} davon erfüllten das Kriterium (faces >= ${minFaces}).`);

    if (generatedWithLines > 0) {
        const faceHitRate = (meetsCriteriaCount / generatedWithLines * 100).toFixed(2);
        console.log(`\nTrefferquote (Kriterium erfüllt): ${meetsCriteriaCount} von ${generatedWithLines} (≈ ${faceHitRate}%).`);
    }

    createObjIndexFile(absoluteOutputDir, savedFiles);
}

async function _generateThumbnailCanvas(form, thumbPath, width = 400, height = 300) {
  try {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Hintergrund
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, width, height);

    // simple isometric-like view: rotate points by Rx, Ry, Rz (in radians)
    const deg2rad = (d) => d * Math.PI / 180;
    const Rx = deg2rad(-30);
    const Ry = deg2rad(45);
    const cosX = Math.cos(Rx), sinX = Math.sin(Rx);
    const cosY = Math.cos(Ry), sinY = Math.sin(Ry);

    function project(p) {
      // rotate around X
      let x = p.x, y = p.y, z = p.z;
      let y1 = y * cosX - z * sinX;
      let z1 = y * sinX + z * cosX;
      // rotate around Y
      let x2 = x * cosY + z1 * sinY;
      let z2 = -x * sinY + z1 * cosY;
      // orthographic projection: (x2, y1)
      return { x: x2, y: y1, z: z2 };
    }

    // Project all points once, build bounding box
    const projected = form.points.map(p => project(p));
    const xs = projected.map(p => p.x);
    const ys = projected.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    // compute scale and offset to fit into canvas with padding
    const padding = 20;
    const scaleX = (width - 2*padding) / (maxX - minX || 1);
    const scaleY = (height - 2*padding) / (maxY - minY || 1);
    const scale = Math.min(scaleX, scaleY);
    const offsetX = padding + (width - 2*padding - (maxX - minX) * scale) / 2;
    const offsetY = padding + (height - 2*padding - (maxY - minY) * scale) / 2;

    function toCanvas(p) {
      return {
        x: offsetX + (p.x - minX) * scale,
        y: height - (offsetY + (p.y - minY) * scale) // flip y for canvas coords
      };
    }

    // Draw faces if available
    if (form.metadata && Array.isArray(form.metadata.closedLoops)) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      for (const facePoints of form.metadata.closedLoops) {
        if (!Array.isArray(facePoints) || facePoints.length < 3) continue;
        ctx.beginPath();
        const proj = facePoints.map(p => toCanvas(project(p)));
        ctx.moveTo(proj[0].x, proj[0].y);
        for (let i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,120,255,0.18)'; // subtle blue
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw lines (edges)
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    for (const l of form.lines) {
      const a = toCanvas(project(l.start));
      const b = toCanvas(project(l.end));
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();

    // Draw points
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (const p of projected) {
      const c = toCanvas(p);
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(1, Math.min(3, 3)), 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    // write file (png)
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(thumbPath, buffer);
    return true;
  } catch (err) {
    console.warn('Thumbnail error:', err && err.message ? err.message : err);
    return false;
  }
}



/**
 * Schreibt eine obj_index.json, die alle generierten Dateipfade (OBJ, JSON, PNG) enthält.
 */
function createObjIndexFile(directoryPath, savedFiles) {
    // Stelle sicher, dass nur Einträge mit einer OBJ-Datei aufgenommen werden.
    const validFiles = savedFiles.filter(f => f.obj);

    const fileIndex = validFiles.map(fileData => ({
      obj: fileData.obj,
      json: fileData.json || null,
      thumbnail: fileData.png ? `thumbnails/${fileData.png}` : null
    }));

    const outputPath = path.join(directoryPath, 'obj_index.json');
    fs.writeFileSync(outputPath, JSON.stringify(fileIndex, null, 2), 'utf8');

    console.log(`✅ obj_index.json erstellt mit ${fileIndex.length} Einträgen.`);
}

// --- Skript ausführen (wenn direkt mit Node.js aufgerufen) ---
const isMainModule = (import.meta.url.startsWith('file://') && process.argv[1] === fileURLToPath(import.meta.url));

if (isMainModule) {
    const outputDir = path.join(__dirname, 'generated_forms');

    generateMultipleForms({
        count: 5,
        minFaces: 1,
        debugLog: true,
        saveJson: true,
        saveObj: true,
        generateHtmlGallery: true,
        generateThumbnails: true,
        gridSize: 3,
        pointDensity: 3,
        generationOptions: {
            mode: "maxRegular",
            minSteps: 8,
            maxSteps: 18
        }
    })
}