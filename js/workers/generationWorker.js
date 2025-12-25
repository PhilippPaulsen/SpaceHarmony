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
                // Convert complex objects to JSON-serializable structure if needed,
                // or rely on structured cloning (Three.js objects might need manual serialization or just passing data)
                // FormGeneratorCore returns clean objects with Vector3s. 
                // Vector3s are transferable/cloneable? Structured Clone covers many types but custom methods are lost.
                // It's safer to export to a plain data structure or JSON string.

                // Let's strip methods by JSON cycle
                results.push(JSON.parse(JSON.stringify(form)));
            }
        }

        self.postMessage({ type: 'success', results: results });
    } catch (error) {
        self.postMessage({ type: 'error', message: error.message });
    }
};
