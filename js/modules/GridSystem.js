
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
        } else if (this.system === 'tetrahedral') {
            return this._generateTetrahedralGrid(density, cubeHalfSize);
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
        const isoScale = scale * Math.sqrt(3);

        icoRaw.forEach(v => {
            const p = v.clone().normalize().multiplyScalar(isoScale);
            add(p);
        });

        // 3. Dodecahedron (20 Vertices) - "Dual"
        const dodecaScale = 0.79465;

        if (density >= 2) {
            // (±1, ±1, ±1)
            const cubeRaw = [];
            for (let x of [-1, 1]) for (let y of [-1, 1]) for (let z of [-1, 1]) cubeRaw.push(new THREE.Vector3(x, y, z));

            // Corrected Dodecahedron Vertices: (0, ±phi, ±1/phi)
            // Cyclic: (0, phi, iphi), (iphi, 0, phi), (phi, iphi, 0)
            const iphi = 1 / phi;
            const recRaw = [
                // Set 1: (0, ±phi, ±iphi)
                new THREE.Vector3(0, phi, iphi), new THREE.Vector3(0, phi, -iphi), new THREE.Vector3(0, -phi, iphi), new THREE.Vector3(0, -phi, -iphi),
                // Set 2: (±iphi, 0, ±phi)
                new THREE.Vector3(iphi, 0, phi), new THREE.Vector3(iphi, 0, -phi), new THREE.Vector3(-iphi, 0, phi), new THREE.Vector3(-iphi, 0, -phi),
                // Set 3: (±phi, ±iphi, 0)
                new THREE.Vector3(phi, iphi, 0), new THREE.Vector3(phi, -iphi, 0), new THREE.Vector3(-phi, iphi, 0), new THREE.Vector3(-phi, -iphi, 0)
            ];

            const dodecaRaw = [...cubeRaw, ...recRaw];

            dodecaRaw.forEach(v => {
                // Scale to be the harmonic dual
                const p = v.clone().normalize().multiplyScalar(isoScale * dodecaScale);
                p.type = 'dodeca';
                add(p);
            });
        }

        // 3. Pentagram Intersections (Star Points)
        // Enable at Density >= 2 so they are available immediately with the Dodecahedron
        if (density >= 2) {
            const starPoints = [];
            const phiSq = phi * phi;
            const starScale = 1.0 / phiSq; // 0.381966

            // Pre-calculate Crude Dodeca Vertices for finding faces (Match above logic)
            const dr = [];
            for (let x of [-1, 1]) for (let y of [-1, 1]) for (let z of [-1, 1]) dr.push(new THREE.Vector3(x, y, z));
            const iphi_l = 1 / phi;
            const rr = [
                new THREE.Vector3(0, phi, iphi_l), new THREE.Vector3(0, phi, -iphi_l), new THREE.Vector3(0, -phi, iphi_l), new THREE.Vector3(0, -phi, -iphi_l),
                new THREE.Vector3(iphi_l, 0, phi), new THREE.Vector3(iphi_l, 0, -phi), new THREE.Vector3(-iphi_l, 0, phi), new THREE.Vector3(-iphi_l, 0, -phi),
                new THREE.Vector3(phi, iphi_l, 0), new THREE.Vector3(phi, -iphi_l, 0), new THREE.Vector3(-phi, iphi_l, 0), new THREE.Vector3(-phi, -iphi_l, 0)
            ];
            dr.push(...rr);

            icoRaw.forEach(dir => {
                const normal = dir.clone().normalize();

                // Find 5 Face Vertices
                let maxDot = -Infinity;
                dr.forEach(v => {
                    const d = v.clone().normalize().dot(normal);
                    if (d > maxDot) maxDot = d;
                });

                const faceVertsRaw = [];
                dr.forEach(v => {
                    const d = v.clone().normalize().dot(normal);
                    if (Math.abs(d - maxDot) < 0.001) {
                        faceVertsRaw.push(v);
                    }
                });

                if (faceVertsRaw.length === 5) {
                    const worldVerts = faceVertsRaw.map(v => v.clone().normalize().multiplyScalar(isoScale * 0.79465));
                    const worldCenter = new THREE.Vector3();
                    worldVerts.forEach(wv => worldCenter.add(wv));
                    worldCenter.multiplyScalar(1 / 5);

                    worldVerts.forEach(wv => {
                        const vec = new THREE.Vector3().subVectors(wv, worldCenter);
                        const p = worldCenter.clone().add(vec.multiplyScalar(-starScale));
                        starPoints.push(p);
                    });
                }
            });

            starPoints.forEach(p => {
                p.type = 'star';
                add(p);
            });
        }

        if (density >= 4) {
            // Density 4: Inner Icosahedron
            icoRaw.forEach(v => {
                const p = v.clone().normalize().multiplyScalar(isoScale * 0.5);
                add(p);
            });

            // Density 4: Inner Dodecahedron (Corrected coordinates)
            const innerDualFactor = 0.79465;
            const iphi = 1 / phi;
            const recRaw = [
                new THREE.Vector3(0, phi, iphi), new THREE.Vector3(0, phi, -iphi), new THREE.Vector3(0, -phi, iphi), new THREE.Vector3(0, -phi, -iphi),
                new THREE.Vector3(iphi, 0, phi), new THREE.Vector3(iphi, 0, -phi), new THREE.Vector3(-iphi, 0, phi), new THREE.Vector3(-iphi, 0, -phi),
                new THREE.Vector3(phi, iphi, 0), new THREE.Vector3(phi, -iphi, 0), new THREE.Vector3(-phi, iphi, 0), new THREE.Vector3(-phi, -iphi, 0)

            ];
            const cubeRaw = [];
            for (let x of [-1, 1]) for (let y of [-1, 1]) for (let z of [-1, 1]) cubeRaw.push(new THREE.Vector3(x, y, z));
            const dodecaRaw = [...cubeRaw, ...recRaw];

            dodecaRaw.forEach(v => {
                add(v.clone().normalize().multiplyScalar(isoScale * 0.5 * innerDualFactor));
            });
        }

        if (density >= 5) {
            // Radial shells
            for (let d = 5; d <= density; d++) {
                const shellScale = 1.0 - (d * 0.08);
                if (shellScale > 0.1) {
                    icoRaw.forEach(v => {
                        add(v.clone().normalize().multiplyScalar(isoScale * shellScale));
                    });
                }
            }
        }

        return points;
    }

    _generateTetrahedralGrid(density, scale) {
        // IVM (Isotropic Vector Matrix) / FCC Lattice Implementation
        const points = [];
        const uniqueKeys = new Set();
        const d = Math.max(1, Math.floor(density)) * 2;
        const step = scale / d;

        for (let x = -d; x <= d; x++) {
            for (let y = -d; y <= d; y++) {
                for (let z = -d; z <= d; z++) {
                    if ((Math.abs(x) + Math.abs(y) + Math.abs(z)) % 2 === 0) {
                        const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);

                        if (density < 5.0) {
                            const h = d / 2;
                            const isCenter = (ax === 0 && ay === 0 && az === 0);

                            if (density <= 1.5) {
                                const isCorner = (ax === d && ay === d && az === d);
                                const isFaceCenter = ((ax === d && ay === 0 && az === 0) || (ay === d && ax === 0 && az === 0) || (az === d && ax === 0 && ay === 0));
                                const isVE = ((ax === h && ay === h && az === 0) || (ax === h && az === h && ay === 0) || (ay === h && az === h && ax === 0));

                                if (!isCenter && !isCorner && !isFaceCenter && !isVE) continue;
                            }
                            else if (density <= 2.5) {
                                const isCorner = (ax === d && ay === d && az === d);
                                const isFaceCenter = ((ax === d && ay === 0 && az === 0) || (ay === d && ax === 0 && az === 0) || (az === d && ax === 0 && ay === 0));
                                const isVE = ((ax === h && ay === h && az === 0) || (ax === h && az === h && ay === 0) || (ay === h && az === h && ax === 0));
                                const isEdgeMid = ((ax === d && ay === d && az === 0) || (ax === d && az === d && ay === 0) || (ay === d && az === d && ax === 0));
                                const isSubCorner = (ax === h && ay === h && az === h);

                                if (!isCenter && !isCorner && !isFaceCenter && !isVE && !isEdgeMid && !isSubCorner) continue;
                            }
                            else {
                                if (x % 2 !== 0 || y % 2 !== 0 || z % 2 !== 0) continue;
                                const maxCoord = Math.max(ax, ay, az);
                                if (density <= 3.5) {
                                    if (maxCoord < d * 0.5) continue;
                                }
                                else {
                                    if (maxCoord < d * 0.3) continue;
                                }
                            }
                        }

                        const v = new THREE.Vector3(x, y, z).multiplyScalar(step);
                        const key = GeometryUtils.pointKey(v);
                        if (!uniqueKeys.has(key)) {
                            uniqueKeys.add(key);
                            points.push(v);
                        }
                    }
                }
            }
        }

        return points;
    }
}
