
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

        // 3. Pentagram Intersections on Dodecahedron Faces
        // To draw the star on the Dodecahedron face, we need the intersection points of the diagonals.
        // These points form a smaller, inverted pentagon inside the face.
        // Math: Relative to Face Center, radius is r * (1/phi^2) and rotated 180 (inverted). -> Scale -0.381966

        // Dodeca Face Centers are exactly the Normalized Icosahedron Vertices * InSphereRadius?
        // Or we can just calculate them from the generated Dodeca Vertices.

        // Quick method: Iterate the 12 Ico directions (Face normals for Dodeca)
        // Find 5 closest Dodeca vertices.
        // Generate star points.

        const starPoints = [];
        const phiSq = phi * phi;
        const starScale = 1.0 / phiSq; // 0.381966

        icoRaw.forEach(dir => {
            // Direction of the Dodeca Face Center (Ico vertex)
            const normal = dir.clone().normalize();

            // Find the 5 Dodeca vertices belonging to this face
            // They are the ones closest to this normal.
            // In exact math, dot product is const.
            // We generated 'dodecaRaw' before (cube + recRaw). 
            // We need to re-generate or check generated points.
            // Re-generating 'dodecaRaw' logic locally for matching:

            const dr = [];
            // (±1, ±1, ±1)
            for (let x of [-1, 1]) for (let y of [-1, 1]) for (let z of [-1, 1]) dr.push(new THREE.Vector3(x, y, z));
            // (0, ±1/phi, ±phi) cyclic
            const iphi_l = 1 / phi;
            const rr = [
                new THREE.Vector3(0, iphi_l, phi), new THREE.Vector3(0, iphi_l, -phi), new THREE.Vector3(0, -iphi_l, phi), new THREE.Vector3(0, -iphi_l, -phi),
                new THREE.Vector3(iphi_l, phi, 0), new THREE.Vector3(iphi_l, -phi, 0), new THREE.Vector3(-iphi_l, phi, 0), new THREE.Vector3(-iphi_l, -phi, 0),
                new THREE.Vector3(phi, 0, iphi_l), new THREE.Vector3(phi, 0, -iphi_l), new THREE.Vector3(-phi, 0, iphi_l), new THREE.Vector3(-phi, 0, -iphi_l)
            ];
            dr.push(...rr);

            // Filter the 5 vertices for this face
            const faceVerts = [];
            let maxDot = -1.0;

            // Closest 5 have the same max dot product
            dr.forEach(v => {
                const d = v.clone().normalize().dot(normal);
                if (d > maxDot) maxDot = d;
            });

            dr.forEach(v => {
                const d = v.clone().normalize().dot(normal);
                if (Math.abs(d - maxDot) < 0.001) {
                    faceVerts.push(v);
                }
            });

            if (faceVerts.length === 5) {
                // Calculate Face Center (Visual) - should align with normal
                // Just use the 5 verts to calc star points
                const center = new THREE.Vector3();
                faceVerts.forEach(v => center.add(v));
                center.multiplyScalar(1 / 5); // This is the Face Center in Crude Coords

                // Generate Dual/Star points
                faceVerts.forEach(v => {
                    const vec = new THREE.Vector3().subVectors(v, center);
                    // Invert and Scale
                    const starV = center.clone().add(vec.multiplyScalar(-starScale));

                    // Now scale this 'Crude Star Point' to the World Scale
                    // We used 'isoScale * dodecaScale' for Dodeca vertices.
                    // dodecaScale was 0.79465.
                    // We need to apply the SAME transform chain.
                    // The 'starV' computed here is in the 'Crude' space of (±1, ±phi).
                    // We need to Normalize it to Sphere? Or keep it planar on the Face?
                    // Planar on Face to keep straight lines!
                    // But we must scale it by 'isoScale * dodecaScale / LengthOfCrudeDodeca'?
                    // No, just similar triangles.
                    // WorldDodecaVerts = CrudeDodecaVerts.normalize() * isoScale * dodecaScale.
                    // This projects them to Sphere.
                    // This WARPS the face from flat pentagon to spherical cap?
                    // If Dodeca vertices are on Sphere, the Face is NOT Flat. The edges are chords.
                    // Pentagram lines are chords.
                    // The intersection of spherical chords is NOT the same as planar chords.
                    // BUT, for visual drawing, we usually stay Linear (Euclidean).
                    // Our Dodecahedron Vertices were generated by PROJECTING to Sphere?
                    // Code check: "v.clone().normalize().multiplyScalar(isoScale * dodecaScale)" -> YES, SPHERICAL.

                    // If the vertices are on a sphere, the "Face" is a set of 5 points on a sphere.
                    // The "Center" is inside the sphere.
                    // The "Star Points" (intersections of Euclidean chords) are INSIDE the sphere (deeper).
                    // They define the Great Dodecahedron.
                    // Just use Vector addition of the SPHERICAL vertices.
                });

                // Re-do with World Coordinates
                const worldVerts = faceVerts.map(v => v.clone().normalize().multiplyScalar(isoScale * 0.79465));
                const worldCenter = new THREE.Vector3();
                worldVerts.forEach(wv => worldCenter.add(wv));
                worldCenter.multiplyScalar(1 / 5); // CoG of 5 spherical verts (inside sphere)

                worldVerts.forEach(wv => {
                    const vec = new THREE.Vector3().subVectors(wv, worldCenter);
                    const p = worldCenter.clone().add(vec.multiplyScalar(-starScale));
                    starPoints.push(p);
                });
            }
        });

        starPoints.forEach(p => add(p));



        if (density >= 4) {
            // Density 4: Inner Icosahedron (Nested)
            icoRaw.forEach(v => {
                const p = v.clone().normalize().multiplyScalar(isoScale * 0.5);
                add(p);
            });

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
