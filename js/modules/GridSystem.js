
import * as THREE from 'three';
import { GeometryUtils } from './GeometryUtils.js';

/**
 * GridSystem.js
 * Manages the generation of the base point grid.
 */
export class GridSystem {
    constructor(config) {
        this.config = config || {};
        this.system = 'cubic'; // 'cubic' | 'icosahedral'
    }

    setSystem(sys) {
        this.system = sys;
    }

    generatePoints(density, cubeHalfSize) {
        if (this.system === 'icosahedral') {
            return this._generateIcosahedralGrid(density, cubeHalfSize);
        } else {
            return this._generateCubicGrid(density, cubeHalfSize);
        }
    }

    _generateCubicGrid(divisions, halfSize) {
        const points = [];
        const step = (halfSize * 2) / divisions;

        // Generate scalar values
        const values = [];
        for (let i = 0; i <= divisions; i++) {
            values.push(parseFloat((-halfSize + step * i).toFixed(5)));
        }

        // Cartesian product
        values.forEach(x => {
            values.forEach(y => {
                values.forEach(z => {
                    points.push(new THREE.Vector3(x, y, z));
                });
            });
        });

        // Ensure center exists if grid is odd (should already be covered if divisions is even number of cells -> odd points)
        // But logic in App.js handled this explicitly.
        // Let's ensure (0,0,0) is there if it fits the step pattern.
        return points;
    }

    _generateIcosahedralGrid(density, scale) {
        const points = [];
        const phi = (1 + Math.sqrt(5)) / 2;

        // Helper: Add unique points
        const keys = new Set();
        const add = (v) => {
            const k = GeometryUtils.pointKey(v);
            if (!keys.has(k)) {
                keys.add(k);
                points.push(v);
            }
        };

        // 1. Center
        add(new THREE.Vector3(0, 0, 0));

        // 2. Icosahedron (12 Vertices)
        // (0, ±1, ±phi) cyclic
        const t = phi;
        const icoRaw = [
            new THREE.Vector3(-1, t, 0), new THREE.Vector3(1, t, 0), new THREE.Vector3(-1, -t, 0), new THREE.Vector3(1, -t, 0),
            new THREE.Vector3(0, -1, t), new THREE.Vector3(0, 1, t), new THREE.Vector3(0, -1, -t), new THREE.Vector3(0, 1, -t),
            new THREE.Vector3(t, 0, -1), new THREE.Vector3(t, 0, 1), new THREE.Vector3(-t, 0, -1), new THREE.Vector3(-t, 0, 1)
        ];

        // Add Icosahedron shell (normalized and scaled)
        icoRaw.forEach(v => {
            const p = v.clone().normalize().multiplyScalar(scale);
            add(p);
        });

        // 3. Dodecahedron (20 Vertices) - "Dual"
        // If density > 1, add Dodecahedron vertices
        if (density >= 2) {
            // (±1, ±1, ±1)
            const cubeRaw = [];
            for (let x of [-1, 1]) for (let y of [-1, 1]) for (let z of [-1, 1]) cubeRaw.push(new THREE.Vector3(x, y, z));

            // (0, ±1/phi, ±phi) cyclic
            const iphi = 1 / phi;
            const recRaw = [
                new THREE.Vector3(0, iphi, phi), new THREE.Vector3(0, iphi, -phi), new THREE.Vector3(0, -iphi, phi), new THREE.Vector3(0, -iphi, -phi),
                new THREE.Vector3(iphi, phi, 0), new THREE.Vector3(iphi, -phi, 0), new THREE.Vector3(-iphi, phi, 0), new THREE.Vector3(-iphi, -phi, 0),
                new THREE.Vector3(phi, 0, iphi), new THREE.Vector3(phi, 0, -iphi), new THREE.Vector3(-phi, 0, iphi), new THREE.Vector3(-phi, 0, -iphi)
            ];

            const dodecaRaw = [...cubeRaw, ...recRaw];

            // Dodecahedron circumradius is usually slightly different if sharing edge length.
            // But here we probably want them on the SAME conceptual sphere or concentric?
            // "SpaceHarmony" -> Harmony implies nested shells.
            // Let's put Dodecahedron at slightly smaller radius or same?
            // Usually Dodecahedron fits INSIDE Icosahedron or vice versa.
            // Let's scale it to fit nicely: 
            // Dodecahedron vertices are "dual" to Icosahedron faces.

            dodecaRaw.forEach(v => {
                const p = v.clone().normalize().multiplyScalar(scale * 0.85); // Slightly smaller shell
                add(p);
            });
        }

        // 4. Higher Densities: Nested Shells / Midpoints
        // We use a simple strategy: specific shells for lower densities, and scaling for higher.

        if (density >= 3) {
            // Inner Icosahedron (Midpoint-like scale)
            icoRaw.forEach(v => {
                const p = v.clone().normalize().multiplyScalar(scale * 0.5);
                add(p);
            });
        }

        if (density >= 4) {
            // Inner Dodecahedron
            const iphi = 1 / phi;
            const recRaw = [
                new THREE.Vector3(0, iphi, phi), new THREE.Vector3(0, iphi, -phi), new THREE.Vector3(0, -iphi, phi), new THREE.Vector3(0, -iphi, -phi),
                new THREE.Vector3(iphi, phi, 0), new THREE.Vector3(iphi, -phi, 0), new THREE.Vector3(-iphi, phi, 0), new THREE.Vector3(-iphi, -phi, 0),
                new THREE.Vector3(phi, 0, iphi), new THREE.Vector3(phi, 0, -iphi), new THREE.Vector3(-phi, 0, iphi), new THREE.Vector3(-phi, 0, -iphi)
            ];
            // Add box vertices too for full dodeca
            const cubeRaw = [];
            for (let x of [-1, 1]) for (let y of [-1, 1]) for (let z of [-1, 1]) cubeRaw.push(new THREE.Vector3(x, y, z));
            const dodecaRaw = [...cubeRaw, ...recRaw];

            dodecaRaw.forEach(v => {
                // Scale factor guessed to look good inside
                add(v.clone().normalize().multiplyScalar(scale * 0.45));
            });
        }

        if (density >= 5) {
            // Radial shells strategy
            // For density 5+, we just add normalized Icosahedron + Dodecahedron at incremental radii
            // to create a "cloud" suitable for connecting.

            // Steps: 0.2, 0.4, 0.6, 0.8... 
            // We already covered outer (1.0), 0.85, 0.5, 0.45

            // Let's allow arbitrary density up to 12
            for (let d = 5; d <= density; d++) {
                const s = 1.0 - (d - 1) * 0.15; // Decreasing radius? Or increasing?
                // Current logic has "scale" as max size (outer shell).
                // So we want FILLING.
                // Let's add shells at:
                // d=5 -> 0.7
                // d=6 -> 0.3
                // d=7 -> 0.6... 

                // Simpler: Just 5 dense layers.
                // shellScale = d / density? No, strict positions help symmetry.

                const shellScale = 1.0 - (d * 0.08);
                if (shellScale > 0.1) {
                    // Add Icosahedron shell
                    icoRaw.forEach(v => {
                        add(v.clone().normalize().multiplyScalar(scale * shellScale));
                    });
                }
            }
        }

        return points;
    }
}
