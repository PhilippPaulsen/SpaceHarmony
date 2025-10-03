/**
 * formGenerator.js
 * 
 * Ein modularer Generator zur Erzeugung von zufälligen, aber gültigen geometrischen Linienzügen
 * in einem 3D-Würfelgitter für das Projekt "SpaceHarmony".
 * 
 * @version 1.2.0
 * @date 2025-10-03
 */

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
    const { points, lines } = _generateLinePath(gridPoints, options);
    form.points = points;
    form.lines = lines;

    if (options.symmetry) {
        _applySymmetry(form, options.symmetry);
    }

    const validationResults = _validateForm(form);
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

    if (gridPoints.length === 0) return { points: [], lines: [] };

    let currentPoint = gridPoints[Math.floor(Math.random() * gridPoints.length)];
    usedPoints.add(currentPoint);
    pathPoints.push(currentPoint);

    const maxSteps = options.maxSteps || 10 + Math.floor(Math.random() * 10);

    for (let i = 0; i < maxSteps; i++) {
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

function _applySymmetry(form, symmetryType) {}

function _validateForm(form) {
    const { points, lines } = form;
    const closedLoops = { triangles: [] };

    const lineSet = new Set();
    for (const line of lines) {
        const key = [ [line.start.x, line.start.y, line.start.z].join(','), [line.end.x, line.end.y, line.end.z].join(',') ].sort().join('-');
        lineSet.add(key);
    }

    const hasLine = (p1, p2) => {
        const key = [ [p1.x, p1.y, p1.z].join(','), [p2.x, p2.y, p2.z].join(',') ].sort().join('-');
        return lineSet.has(key);
    };

    if (points.length >= 3) {
        for (let i = 0; i < points.length; i++) {
            for (let j = i + 1; j < points.length; j++) {
                for (let k = j + 1; k < points.length; k++) {
                    const p1 = points[i], p2 = points[j], p3 = points[k];
                    if (hasLine(p1, p2) && hasLine(p2, p3) && hasLine(p3, p1)) {
                        if (!_arePointsCollinear(p1, p2, p3)) {
                            closedLoops.triangles.push([p1, p2, p3]);
                        }
                    }
                }
            }
        }
    }
    
    const faceCount = closedLoops.triangles.length;
    return { faces: faceCount, volumes: 0, isConnected: true, symmetryProperties: "C1", closedLoops };
}

function _arePointsCollinear(p1, p2, p3) {
    const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
    const v2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };
    const crossProductX = v1.y * v2.z - v1.z * v2.y;
    const crossProductY = v1.z * v2.x - v1.x * v2.z;
    const crossProductZ = v1.x * v2.y - v1.y * v2.x;
    return crossProductX === 0 && crossProductY === 0 && crossProductZ === 0;
}

/**
 * Generiert den Metadaten-Block für die Form.
 * @private
 */
function _generateMetaData(form, options, validationResults) {
    const id = options.id || Date.now();
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
        "source": "Automatischer Generator v1.2",
        "notes": "automatisch generiert"
    };
}


// --- 3. Exportfunktionen ---

function exportAsJson(form) {
    return JSON.stringify(form, null, 2);
}

function exportAsObj(form) {
    let objContent = "# Generated by SpaceHarmony Form Generator v1.2\n";
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
    // Fügt Flächen hinzu, wenn vorhanden
    if (form.metadata.faceCount > 0) {
        objContent += "\n# Faces\n";
        form.metadata.closedLoops.triangles.forEach(triangle => {
            const idx1 = pointIndexMap.get(triangle[0]);
            const idx2 = pointIndexMap.get(triangle[1]);
            const idx3 = pointIndexMap.get(triangle[2]);
            objContent += `f ${idx1} ${idx2} ${idx3}\n`;
        });
    }
    return objContent;
}


// --- 4. Zukünftige Entwicklung: Volumenerkennung ---

/**
 * KONZEPT ZUR VOLUMENERKENNUNG
 * 
 * Eine Heuristik zur Erkennung geschlossener, "wasserdichter" Körper (Volumina)
 * könnte auf der Analyse der gefundenen Flächen und ihrer gemeinsamen Kanten basieren.
 * 
 * Vorgehen:
 * 1.  **Voraussetzung:** Eine Liste aller Flächen (z.B. `closedLoops.triangles`) liegt vor.
 * 
 * 2.  **Kanten-Map erstellen:** Baue eine Map, die jede Kante der Form auf die Anzahl der
 *     Flächen abbildet, zu der sie gehört. Eine Kante wird durch ihre beiden Endpunkte definiert.
 *     ```javascript
 *     const edgeToFaceCount = new Map();
 *     for (const face of allFaces) {
 *         for (const edge of face.edges) {
 *             const canonicalEdge = getCanonicalEdge(edge); // Eindeutiger Key für die Kante
 *             edgeToFaceCount.set(canonicalEdge, (edgeToFaceCount.get(canonicalEdge) || 0) + 1);
 *         }
 *     }
 *     ```
 *
 * 3.  **Manifold-Prüfung:** Ein einfacher, geschlossener Körper (manifold) hat die Eigenschaft, 
 *     dass jede seiner Kanten von GENAU ZWEI Flächen geteilt wird. Iteriere über die
 *     `edgeToFaceCount`-Map:
 *     -   Findest du eine Kante, die nur zu EINER Fläche gehört, ist sie eine "offene" Randkante.
 *         Die Form ist nicht geschlossen.
 *     -   Findest du eine Kante, die zu MEHR ALS ZWEI Flächen gehört, ist es eine "non-manifold"-
 *         Kante (z.B. wo mehrere Würfel an einer Kante zusammenstoßen). Dies ist kein einfacher Körper.
 * 
 * 4.  **Volumen-Schlussfolgerung:** Wenn ALLE Kanten in der Map den Wert 2 haben, ist die Hülle
 *     geschlossen und du hast mindestens ein Volumen gefunden.
 * 
 * 5.  **(Optional) Volumen zählen:** Um mehrere, separate Körper zu erkennen, könntest du einen
 *     Graphen-Traversierungs-Algorithmus (wie BFS oder DFS) auf den Flächen anwenden. Die Flächen
 *     sind die Knoten des Graphen, und eine gemeinsame Kante zwischen zwei Flächen bildet die
 *     Verbindung. Jede so gefundene zusammenhängende Komponente ist ein separates Volumen.
 */


// --- 5. Batch-Generierung (Node.js) ---

let fs, path;
try {
    fs = require('fs');
    path = require('path');
} catch (e) {
    // Ignorieren, wenn im Browser ausgeführt
}

function generateMultipleForms(count, options) {
    if (!fs || !path) {
        console.error("Batch-Generierung ist nur in einer Node.js-Umgebung verfügbar.");
        return;
    }

    const { outputDir = 'generated_forms', gridSize = 3, pointDensity = 2, generationOptions = { singleStroke: true }, filter = (form) => form.metadata.faces > 0, saveObj = false } = options;
    const absoluteOutputDir = path.join(__dirname, outputDir);

    try {
        if (!fs.existsSync(absoluteOutputDir)) {
            fs.mkdirSync(absoluteOutputDir, { recursive: true });
            console.log(`Verzeichnis erstellt: ${absoluteOutputDir}`);
        }
    } catch (error) {
        console.error(`Fehler beim Erstellen des Verzeichnisses: ${error.message}`);
        return;
    }

    console.log(`Starte Batch-Generierung von ${count} Formen...`);
    let savedCount = 0;
    const savedFiles = [];

    for (let i = 1; i <= count; i++) {
        process.stdout.write(`\rGeneriere & prüfe Form ${i}/${count}...`);
        const form = generateForm(gridSize, pointDensity, { ...generationOptions, id: i });

        if (filter(form)) {
            savedCount++;
            const m = form.metadata;
            const baseName = `SH_PD${m.pointDensity}_L${m.lineCount}_F${m.faceCount}_T${m.volumeCount}_${savedCount}`;
            
            // JSON speichern
            const jsonFileName = `${baseName}.json`;
            const jsonFilePath = path.join(absoluteOutputDir, jsonFileName);
            try {
                fs.writeFileSync(jsonFilePath, exportAsJson(form), 'utf8');
                savedFiles.push(jsonFileName);
            } catch (error) { console.error(`\nFehler beim Speichern von ${jsonFileName}: ${error.message}`); }

            // Optional OBJ speichern
            if (saveObj) {
                const objFileName = `${baseName}.obj`;
                const objFilePath = path.join(absoluteOutputDir, objFileName);
                try {
                    fs.writeFileSync(objFilePath, exportAsObj(form), 'utf8');
                } catch (error) { console.error(`\nFehler beim Speichern von ${objFileName}: ${error.message}`); }
            }
        } 
    }

    process.stdout.write('\n');
    console.log(`Batch-Generierung abgeschlossen. ${savedCount} von ${count} Formen wurden in '${absoluteOutputDir}' gespeichert.`);

    if (savedFiles.length > 0) {
        _createHtmlPreview(absoluteOutputDir, savedFiles);
    }
}

function _createHtmlPreview(outputDir, fileList) {
    if (!fs || !path) return;

    const listItems = fileList.map(file => `            <li><a href="./${file}" target="_blank">${file}</a></li>`).join('\n');

    const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SpaceHarmony - Generierte Formen</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; background-color: #f0f2f5; color: #1c1e21; }
        header { background-color: #fff; padding: 20px 40px; border-bottom: 1px solid #dddfe2; text-align: center; }
        h1 { margin: 0; font-size: 24px; }
        main { padding: 40px; max-width: 900px; margin: auto; }
        ul { list-style: none; padding: 0; background-color: #fff; border: 1px solid #dddfe2; border-radius: 8px; }
        li { padding: 15px 20px; border-bottom: 1px solid #dddfe2; }
        li:last-child { border-bottom: none; }
        a { text-decoration: none; color: #0866ff; font-weight: 500; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <header>
        <h1>SpaceHarmony - Generierte Formen</h1>
    </header>
    <main>
        <p>Es wurden <strong>${fileList.length}</strong> Formen gefunden, die den Kriterien entsprechen.</p>
        <ul>
${listItems}
        </ul>
    </main>
</body>
</html>
    `;

    const indexPath = path.join(outputDir, 'index.html');
    try {
        fs.writeFileSync(indexPath, htmlContent, 'utf8');
        console.log(`HTML-Vorschau erfolgreich erstellt: ${indexPath}`);
    } catch (error) {
        console.error(`Fehler beim Erstellen der HTML-Vorschau: ${error.message}`);
    }
}

// --- Skript ausführen (wenn direkt mit Node.js aufgerufen) ---

if (typeof require !== 'undefined' && require.main === module) {
    
    const batchOptions = {
        outputDir: 'generated_forms',
        gridSize: 3,
        pointDensity: 2,
        generationOptions: { singleStroke: true, maxSteps: 25 },
        filter: (form) => form.metadata.faces > 0,
        saveObj: true // << HIER .obj-Export aktivieren/deaktivieren
    };

    generateMultipleForms(100, batchOptions);
}
