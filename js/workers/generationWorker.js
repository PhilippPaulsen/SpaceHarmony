/**
 * generationWorker.js
 * 
 * Web Worker for generating forms in the background.
 * Uses the shared FormGeneratorCore logic.
 */

import { generateForm } from '../modules/FormGeneratorCore.js';

self.onmessage = function (e) {
    const config = e.data;
    const { count, minFaces, gridSize, pointDensity, options } = config;

    try {
        const results = [];
        let attempts = 0;
        const maxAttempts = count * 10; // Avoid infinite loops

        while (results.length < count && attempts < maxAttempts) {
            attempts++;
            const form = generateForm(gridSize, pointDensity, options);

            // Deduplication & Filtering Logic
            // 2. Strict Volume Filter (User Request: "Only Body Forms")
            // We interpret "Body Form" as having at least 4 known faces (Tetrahedron).
            // Since we enforce symmetry now, 4 faces implies a closed 3-space wrapper.
            // If the user manually lowered config.minFaces below 4, we might respect it,
            // but the UI default is now 4.
            if (form.metadata.faceCount < 4) continue;

            // Respect user config if higher
            if (form.metadata.faceCount < minFaces) continue;

            // Check 3: Deduplication (Signature)
            const edgeKeys = form.lines.map(l => {
                const a = l.a;
                const b = l.b;
                return a < b ? `${a}-${b}` : `${b}-${a}`;
            });
            edgeKeys.sort();
            // Include symmetry in signature to distinguish same shape with different internal symmetry properties? 
            // Actually, visuals are determined by geometry.
            const signature = edgeKeys.join('|');

            if (results.some(r => {
                // Check if signature matches any existing result
                // We need to re-construct signature from result
                const rKeys = r.lines.map(l => {
                    const a = l.a; const b = l.b; return a < b ? `${a}-${b}` : `${b}-${a}`;
                });
                rKeys.sort();
                return rKeys.join('|') === signature;
            })) {
                continue;
            }

            if (true) { // Replaced original if condition
                // FormGeneratorCore returns clean objects with Vector3s and Line objects {a,b}.
                // We construct a safe object to transfer.
                // explicitly map points to ensure no methods are attached (though structured clone handles basic objects fine)
                // lines are just {a,b} objects from class Line, which is also fine.

                const safeForm = {
                    points: form.points.map(p => ({ x: p.x, y: p.y, z: p.z })),
                    lines: form.lines.map(l => ({ a: l.a, b: l.b })),
                    faces: form.faces, // IDs array
                    metadata: form.metadata
                };

                results.push(safeForm);

                self.postMessage({ type: 'progress', current: results.length, total: count });
            }
        }

        self.postMessage({ type: 'success', results: results });
    } catch (error) {
        self.postMessage({ type: 'error', message: error.message });
    }
};
