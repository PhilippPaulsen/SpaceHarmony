
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
        // User requested size matching with Cube/Tetra.
        // Cube Corners are at dist = sqrt(3) * scale.
        // Previously we used dist = 1.0 * scale.
        // We now align them to the same circumsphere: scale * sqrt(3).
        const isoScale = scale * Math.sqrt(3);

        icoRaw.forEach(v => {
            const p = v.clone().normalize().multiplyScalar(isoScale);
            add(p);
        });

        // 3. Dodecahedron (20 Vertices) - "Dual"
        // If density >= 2, add Dodecahedron vertices
        // We position them as the geometric Dual to the Icosahedron.
        // Ratio R_dual / R_ico ≈ 0.79465 (Vertices of Dodecahedron at Face Centers of Icosahedron)
        const dodecaScale = 0.79465;

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

            dodecaRaw.forEach(v => {
                // Scale to be the harmonic dual
                const p = v.clone().normalize().multiplyScalar(isoScale * dodecaScale);
                add(p);
            });
        }

        // 4. Higher Densities: geometric enrichment

        if (density >= 3) {
            // Density 3: Add Icosidodecahedron (30 Vertices)
            // These are the Midpoints of the Icosahedron edges.
            // They allow forming 10-pointed stars and complex pentagonal networks.

            // 1. Generate all unique midpoints between Icoahedron vertices
            // Distance between neighbors in unit Ico is 2 or 1/phi?
            // We use a distance check to identify valid edges.
            const midpoints = [];
            const edgeDistSq = 4 * 1.0; // Raw coords: dist is 2. (e.g. (1,phi,0) to (-1,phi,0) is dist 2)
            // Logic: Icosahedron edge length in our raw coords (1, phi) is exactly 2.
            // Check: (1, phi, 0) - (-1, phi, 0) = (2, 0, 0) -> Length 2. Correct.

            for (let i = 0; i < icoRaw.length; i++) {
                for (let j = i + 1; j < icoRaw.length; j++) {
                    if (icoRaw[i].distanceToSquared(icoRaw[j]) < 4.1) { // Tolerance for 4.0
                        const mid = new THREE.Vector3().addVectors(icoRaw[i], icoRaw[j]).multiplyScalar(0.5);
                        midpoints.push(mid);
                    }
                }
            }

            // 2. Add them to grid
            midpoints.forEach(v => {
                // Scale to lie on the Icosahedron edges?
                // Or project to Sphere?
                // "Space Harmony" usually prefers spherical projection (Geodesic).
                // But "Form" might prefer straight edges.
                // If we want to draw the STAR connecting midpoints, they must be ON the edges (linear midpoint).
                // If we project them out, lines become curved/offset.
                // User image shows straight lines.
                // We keep them linear midpoints. Radius will be slightly less than Ico radius.

                // Scale factor: The raw midpoints are already correct relative to the raw Ico vertices
                // We just need to apply the global 'isoScale'.
                // Reminder: isoScale was calculated for the vertices.
                // But 'icoRaw' are the raw direction vectors.
                // We need to apply the same normalization/scaling logic?
                // Actually, icoRaw are NOT normalized. They are (±1, ±phi, 0).

                // If we used the logic: p = v.clone().normalize().multiplyScalar(isoScale) for vertices...
                // Then for midpoints, to match the "Linear Edge", we should:
                // Take linear mix of SCALED vertices.
                // P_mid = (P_i + P_j) * 0.5
                // P_i = icoRaw[i].normalized * isoScale

                // Let's re-calculate to be precise.

                // Find indices of parents in the previously added points? Hard.
                // Re-calculate parents.
                // P_i direction = icoRaw[i] normalized.
                // P_j direction = icoRaw[j] normalized.
                // Mid_direction = (P_i + P_j) * 0.5. (Length is < 1).
                // We add this point.

                // However, visual consistency:
                // If we want 10-pointed star ON the sphere, we must normalize.
                // If I keep linear, I get Icosidodecahedron.
                // The user's image shows straight lines forming a star.
                // This implies the nodes ARE the linear midpoints.

                // Let's use Normalized vector but scale it to the linear midpoint radius?
                // Radius of Ico = sqrt(1 + phi^2) = sqrt(1 + 2.618) = 1.9.
                // Midpoint (0, phi, 0) radius = phi = 1.618.
                // Ratio = 1.618 / 1.902 ≈ 0.85.

                // Let's just calculate the linear midpoint of the SCALED vertices.
                const p = v.clone(); // This is raw linear midpoint (e.g. 0, phi, 0)
                // Normalize to verify direction, then scale?
                // Raw Vertex Radius: sqrt(1 + phi*phi)
                // Raw Midpoint Radius: varies? No, for Ico all edges are same.
                // Midpoint is e.g. (0, phi, 0). Length phi.
                // Vertex (1, phi, 0). Length sqrt(1+phi^2).

                // Scale Factor to world:
                // WorldVertex = RawVertex.normalize() * isoScale
                // WorldMidpoint = RawMidpoint * (isoScale / RawVertexLength) ???
                // No.

                // WorldMidpoint = (WorldVertexA + WorldVertexB) / 2

                // Let's do that explicitly.
                // It ensures exact alignment.
            });

            for (let i = 0; i < icoRaw.length; i++) {
                for (let j = i + 1; j < icoRaw.length; j++) {
                    if (icoRaw[i].distanceToSquared(icoRaw[j]) < 4.1) {
                        const vA = icoRaw[i].clone().normalize().multiplyScalar(isoScale);
                        const vB = icoRaw[j].clone().normalize().multiplyScalar(isoScale);
                        const mid = new THREE.Vector3().addVectors(vA, vB).multiplyScalar(0.5);
                        add(mid);
                    }
                }
            }
        }

        if (density >= 4) {
            // Density 4: Inner Icosahedron (Nested)
            icoRaw.forEach(v => {
                const p = v.clone().normalize().multiplyScalar(isoScale * 0.5);
                add(p);
            });
            // And maybe Inner Dodeca?
            // Let's keep distinct generations.

            // Density 4: Inner Dodecahedron (Half Size Dual)
            // Scale this one as the Harmonic Dual
            const innerDualFactor = 0.79465;

            const iphi = 1 / phi;
            const recRaw = [
                new THREE.Vector3(0, iphi, phi), new THREE.Vector3(0, iphi, -phi), new THREE.Vector3(0, -iphi, phi), new THREE.Vector3(0, -iphi, -phi),
                new THREE.Vector3(iphi, phi, 0), new THREE.Vector3(iphi, -phi, 0), new THREE.Vector3(-iphi, phi, 0), new THREE.Vector3(-iphi, -phi, 0),
                new THREE.Vector3(phi, 0, iphi), new THREE.Vector3(phi, 0, -iphi), new THREE.Vector3(-phi, 0, iphi), new THREE.Vector3(-phi, 0, -iphi)
            ];
            const cubeRaw = [];
            for (let x of [-1, 1]) for (let y of [-1, 1]) for (let z of [-1, 1]) cubeRaw.push(new THREE.Vector3(x, y, z));
            const dodecaRaw = [...cubeRaw, ...recRaw];

            dodecaRaw.forEach(v => {
                add(v.clone().normalize().multiplyScalar(isoScale * 0.5 * innerDualFactor));
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

    _generateTetrahedralGrid(density, scale) {
        // IVM (Isotropic Vector Matrix) / FCC Lattice Implementation
        // We generate coordinates (x,y,z) such that x+y+z is even.
        // This ensures all nearest neighbors are equidistant (d = sqrt(2) in integer space).
        // density determines the resolution of the grid within the 'scale' (cubeHalfSize).

        const points = [];
        const uniqueKeys = new Set();

        // Ensure we use an even number of steps so that (d,d,d) satisfies the even-sum check.
        // d steps: 2, 4, 6, 8, 10
        const d = Math.max(1, Math.floor(density)) * 2;

        // Step size to fill the 'scale' volume
        const step = scale / d;

        // Loop through the Integer Cube
        for (let x = -d; x <= d; x++) {
            for (let y = -d; y <= d; y++) {
                for (let z = -d; z <= d; z++) {
                    // FCC Condition: Sum of coordinates must be even
                    if ((Math.abs(x) + Math.abs(y) + Math.abs(z)) % 2 === 0) {
                        const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);

                        // Gradual Progression for Density
                        if (density < 5.0) {
                            const h = d / 2;
                            const isCenter = (ax === 0 && ay === 0 && az === 0);

                            // Density 1: Core Skeleton (Minimal)
                            if (density <= 1.5) {
                                const isCorner = (ax === d && ay === d && az === d);
                                // Face Center of the main cube (d,0,0)
                                const isFaceCenter = ((ax === d && ay === 0 && az === 0) || (ay === d && ax === 0 && az === 0) || (az === d && ax === 0 && ay === 0));
                                // VE Vertices (h,h,0) - Note: h might be odd (e.g. d=2, h=1)
                                const isVE = ((ax === h && ay === h && az === 0) || (ax === h && az === h && ay === 0) || (ay === h && az === h && ax === 0));

                                if (!isCenter && !isCorner && !isFaceCenter && !isVE) continue;
                            }
                            // Density 2: Enhanced Skeleton
                            else if (density <= 2.5) {
                                const isCorner = (ax === d && ay === d && az === d);
                                const isFaceCenter = ((ax === d && ay === 0 && az === 0) || (ay === d && ax === 0 && az === 0) || (az === d && ax === 0 && ay === 0));
                                const isVE = ((ax === h && ay === h && az === 0) || (ax === h && az === h && ay === 0) || (ay === h && az === h && ax === 0));
                                // Edge Midpoints (d,d,0)
                                const isEdgeMid = ((ax === d && ay === d && az === 0) || (ax === d && az === d && ay === 0) || (ay === d && az === d && ax === 0));
                                // Sub-corners (h,h,h)
                                const isSubCorner = (ax === h && ay === h && az === h);

                                if (!isCenter && !isCorner && !isFaceCenter && !isVE && !isEdgeMid && !isSubCorner) continue;
                            }
                            // Density 3 & 4: Structural Volume (Even Grid)
                            else {
                                // Filter: Even Coordinates Only
                                if (x % 2 !== 0 || y % 2 !== 0 || z % 2 !== 0) continue;

                                const maxCoord = Math.max(ax, ay, az);
                                // Density 3: Hollow Outer Shells
                                if (density <= 3.5) {
                                    if (maxCoord < d * 0.5) continue;
                                }
                                // Density 4: Deepen the shell
                                else {
                                    if (maxCoord < d * 0.3) continue;
                                }
                            }
                        }

                        // Density 5+: Full Volume (No filter)

                        const v = new THREE.Vector3(x, y, z).multiplyScalar(step);

                        // Deduplicate just in case (though loop is unique)
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
