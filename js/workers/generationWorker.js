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

            if (form.metadata.faceCount >= minFaces) {
                // FormGeneratorCore returns clean objects with Vector3s and Line objects {a,b}.
                // We construct a safe object to transfer.
                // explicitly map points to ensure no methods are attached (though structured clone handles basic objects fine)
                // lines are just {a,b} objects from class Line, which is also fine.

                const safeForm = {
                    points: form.points.map(p => ({ x: p.x, y: p.y, z: p.z })),
                    lines: form.lines.map(l => ({ a: l.a, b: l.b })),
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
