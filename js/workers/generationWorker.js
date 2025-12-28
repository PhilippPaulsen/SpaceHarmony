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
        let attempts = 0;
        const maxAttempts = count * 200; // Significantly increased attempts to find rare volumes

        while (results.length < count && attempts < maxAttempts) {
            attempts++;
            // Pass index in options to drive the deterministic/hybrid strategy
            const currentOptions = { ...options, index: results.length };
            const form = generateForm(gridSize, pointDensity, currentOptions);

            // Deduplication & Filtering Logic

            // 1. Face Count Filter (User Request)
            if (form.metadata.faceCount < (minFaces || 0)) continue;

            // 2. Volume Count Filter (User Request)
            if (minVolumes > 0 && form.metadata.volumeCount < minVolumes) continue;

            // 3. Deduplication (Signature)
            // DISABLED for variety (Visual Variants allowed).
            // We want "50 Forms", not just "The 2 Unique Mathematical Solids".
            /* 
            const edgeKeys = form.lines.map(l => {
                const a = l.a; const b = l.b; return a < b ? `${a}-${b}` : `${b}-${a}`;
            });
            edgeKeys.sort();
            const signature = edgeKeys.join('|');
            // Check usage... (disabled)
            */

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
