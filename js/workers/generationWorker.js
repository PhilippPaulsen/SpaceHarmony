/**
 * generationWorker.js
 * 
 * Web Worker for generating forms in the background.
 * Uses the shared FormGeneratorCore logic.
 */

import { generateForm } from '../modules/FormGeneratorCore.js';

self.onmessage = function (e) {
    const config = e.data;
    const { count, minFaces, minVolumes, gridSize, pointDensity, options } = config;

    try {
        const results = [];
        const seenSignatures = new Set();
        let attempts = 0;
        const maxAttempts = count * 200; // Significantly increased attempts to find rare volumes

        // Systematic Mode: Use monotonic index
        let scanIndex = 0;

        while (results.length < count && attempts < maxAttempts) {
            attempts++;

            // For systematic, we MUST increment index every step, regardless of filter success
            const currentIndex = (options.mode === 'systematic') ? scanIndex++ : results.length;

            const currentOptions = { ...options, index: currentIndex };
            const form = generateForm(gridSize, pointDensity, currentOptions);

            // Check for Systematic Exhaustion
            if (form.metadata && form.metadata.exhausted) {
                // Stop generation
                break;
            }

            // Deduplication & Filtering Logic

            // 1. Face Count Filter (User Request)
            if (form.metadata.faceCount < (minFaces || 0)) continue;

            // 2. Volume Count Filter (User Request)
            if (minVolumes > 0 && form.metadata.volumeCount < minVolumes) continue;

            // 3. Deduplication (Signature)
            // Use Geometric Signature (cGeo) from Taxonomy if available
            const signature = (form.metadata && form.metadata.cGeo)
                ? form.metadata.cGeo
                : form.lines.map(l => { const a = l.a; const b = l.b; return a < b ? `${a}-${b}` : `${b}-${a}`; }).sort().join('|');

            if (seenSignatures.has(signature)) {
                // console.log(`[Worker] Skipped duplicate signature: ${signature}`);
                continue;
            }
            seenSignatures.add(signature);

            results.push({
                points: form.points.map(p => ({ x: p.x, y: p.y, z: p.z })),
                lines: form.lines,
                faces: form.faces, // IDs array
                metadata: form.metadata
            });

            // Report progress periodically
            if (results.length % 5 === 0) {
                self.postMessage({ type: 'progress', current: results.length, total: count });
            }
        }

        self.postMessage({ type: 'success', results: results });

    } catch (error) {
        self.postMessage({ type: 'error', message: error.message });
    }
};
