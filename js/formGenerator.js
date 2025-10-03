/**
 * formGenerator.js
 * 
 * Ein modularer Generator zur Erzeugung von zufälligen, aber gültigen geometrischen Linienzügen
 * in einem 3D-Würfelgitter für das Projekt "SpaceHarmony".
 * 
 * @version 1.6.0
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

function _applySymmetry(form, symmetryType) {}

function _validateForm(form) {
    const { points, lines } = form;
    const closedLoops = { triangles: [] };

    if (points.length < 3 || lines.length < 3) {
        return { faces: 0, volumes: 0, isConnected: points.length > 1, symmetryProperties: "C1", closedLoops };
    }

    const lineSet = new Set();
    for (const line of lines) {
        const key = [ [line.start.x, line.start.y, line.start.z].join(','), [line.end.x, line.end.y, line.end.z].join(',') ].sort().join('-');
        lineSet.add(key);
    }

    const hasLine = (p1, p2) => {
        const key = [ [p1.x, p1.y, p1.z].join(','), [p2.x, p2.y, p2.z].join(',') ].sort().join('-');
        return lineSet.has(key);
    };

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
        "source": "Automatischer Generator v1.6",
        "notes": "automatisch generiert"
    };
}


// --- 3. Exportfunktionen ---

function exportAsJson(form) {
    return JSON.stringify(form, null, 2);
}

function exportAsObj(form) {
    let objContent = "# Generated by SpaceHarmony Form Generator v1.6\n";
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

/** KONZEPT ZUR VOLUMENERKENNUNG... */


// --- 5. Batch-Generierung (Node.js) ---

let fs, path;
try {
    fs = require('fs');
    path = require('path');
} catch (e) {}

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
        debugLog = false
    } = mutableConfig;

    const minFaces = typeof configMinFaces === 'number' ? configMinFaces : 0;
    const absoluteOutputDir = path.join(__dirname, outputDir);

    try {
        if (fs.existsSync(absoluteOutputDir)) {
            fs.rmSync(absoluteOutputDir, { recursive: true, force: true });
        }
        fs.mkdirSync(absoluteOutputDir, { recursive: true });
        console.log(`Ausgabeverzeichnis '${absoluteOutputDir}' zurückgesetzt.`);
    } catch (error) {
        console.error(`Fehler beim Zurücksetzen des Verzeichnisses: ${error.message}`);
        return;
    }

    console.log(`Starte Batch-Generierung von ${count} Formen (Kriterium: minFaces >= ${minFaces})...
`);
    
    let generatedWithLines = 0;
    let meetsCriteriaCount = 0;
    const savedJsonFiles = [];

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

        const meetsCriteria = form.metadata.faces >= minFaces;

        if (debugLog) {
            const status = meetsCriteria ? 'gespeichert ✅' : `übersprungen ❌ (minFaces: ${minFaces})`;
            process.stdout.write(`\n[Debug] Form ${i}: ${form.points.length} P, ${form.lines.length} L, ${form.metadata.faces} F – ${status}`);
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
                    savedJsonFiles.push(jsonFileName);
                } catch (error) { console.error(`\nFehler beim Speichern von ${jsonFileName}: ${error.message}`); }
            }

            if (saveObj) {
                const objFileName = `${baseName}.obj`;
                const objFilePath = path.join(absoluteOutputDir, objFileName);
                try {
                    fs.writeFileSync(objFilePath, exportAsObj(form), 'utf8');
                } catch (error) { console.error(`\nFehler beim Speichern von ${objFileName}: ${error.message}`); }
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
        _createHtmlPreview(absoluteOutputDir, savedJsonFiles);
    }

    if (meetsCriteriaCount > 0 && generateHtmlGallery) {
        const galleryPath = path.join(absoluteOutputDir, 'index.html');
        try {
            console.log('\nÖffne HTML-Galerie im Browser...');
            const open = (await import('open')).default;
            await open(galleryPath);
        } catch (error) {
            console.warn(`\nKonnte die Galerie nicht automatisch öffnen. Bitte öffne sie manuell: ${galleryPath}`);
        }
    }
}

function _createHtmlPreview(outputDir, jsonFiles) {
    if (!fs || !path) return;

    const objFiles = jsonFiles.map(file => file.replace('.json', '.obj'));

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
        .scene-wrapper { background-color: #1e1e1e; border: 1px solid #333; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.2); transition: transform 0.2s ease; }
        .scene-wrapper:hover { transform: translateY(-5px); box-shadow: 0 8px 16px rgba(0,0,0,0.3); }
        h2 { font-size: 0.9rem; font-weight: 400; text-align: center; padding: 0.8rem; margin: 0; background-color: #282828; border-bottom: 1px solid #333; word-wrap: break-word; }
        canvas { display: block; width: 100%; height: 250px; }
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

        if (objFiles.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Keine Formen zum Anzeigen gefunden. Führe den Generator aus, um neue Formen zu erstellen.</p></div>';
        }

        objFiles.forEach(fileName => {
            const sceneWrapper = document.createElement('div');
            sceneWrapper.className = 'scene-wrapper';
            
            const title = document.createElement('h2');
            title.textContent = fileName;
            
            const canvas = document.createElement('canvas');
            
            sceneWrapper.appendChild(title);
            sceneWrapper.appendChild(canvas);
            container.appendChild(sceneWrapper);

            initScene(canvas, fileName);
        });

        function initScene(canvas, objPath) {
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1e1e1e);

            const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
            renderer.setSize(canvas.clientWidth, canvas.clientHeight);
            renderer.setPixelRatio(window.devicePixelRatio);

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
                                color: 0x0077ff,
                                metalness: 0.2,
                                roughness: 0.6,
                                transparent: true,
                                opacity: 0.8,
                                side: THREE.DoubleSide
                            });
                            const wireframe = new THREE.LineSegments(
                                new THREE.WireframeGeometry(child.geometry),
                                new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1, transparent: true, opacity: 0.5 })
                            );
                            child.add(wireframe);
                        }
                    });
                    scene.add(object);
                },
                undefined, 
                (error) => console.error('Fehler beim Laden von', objPath, error)
            );

            function animate() {
                requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
            }
            animate();

            window.addEventListener('resize', () => {
                const p = canvas.parentElement;
                renderer.setSize(p.clientWidth, p.clientHeight);
                const aspect = p.clientWidth / p.clientHeight;
                camera.left = frustumSize * aspect / -2;
                camera.right = frustumSize * aspect / 2;
                camera.updateProjectionMatrix();
            });
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

if (typeof require !== 'undefined' && require.main === module) {
    
    generateMultipleForms({
        count: 50000,
        minFaces: 0, // 0 = alle Formen mit Linien speichern, 1 = nur die mit Flächen
        gridSize: 3,
        pointDensity: 3,
        generationOptions: { 
            singleStroke: true, 
            minSteps: 6, // Mindestlänge des Linienzugs
            maxSteps: 25 
        },
        saveJson: true,
        saveObj: true,
        generateHtmlGallery: true,
        debugLog: false // Für detaillierte Logs auf true setzen
    });
}
