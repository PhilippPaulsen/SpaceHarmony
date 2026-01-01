/**
 * Taxonomy.js
 * 
 * Helper for classifying and naming forms systematically.
 * 
 * Signatures:
 * - V-Profile: Vertex types based on grid orbit (Corner, Edge, Face, Center).
 * - E-Profile: Edge types based on direction/length.
 * - C_geo: Canonical Geometric Signature (Faces + Topology).
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';
import { GeometryUtils } from './GeometryUtils.js';

export class Taxonomy {

    /**
     * Generates a unique signature for a convex body.
     * @param {Object} hullResult - { vertices: [], faces: [[a,b,c], ...] } from ConvexHull
     * @param {Object} context - { n: 1|2 } grid size context for V-Profile
     * @returns {Object} { name, vProfile, eProfile, cGeo }
     */
    static classify(hullResult, context = {}) {
        const { vertices, faces } = hullResult;

        // 1. V-Profile (Vertex Classification)
        const vProfile = this.getVProfile(vertices, context.n || 1);

        // 2. E-Profile (Edge Directions)
        const edges = this.getUniqueEdges(faces);
        const eProfile = this.getEProfile(vertices, edges);

        // 3. C_geo (Geometric Canonical String)
        const cGeo = this.getGeometricSignature(vertices, faces);

        return {
            name: `V(${vProfile}) | E{${eProfile}} | ${cGeo.hash}`,
            vProfile,
            eProfile,
            cGeo: cGeo.full,
            hash: cGeo.hash,
            details: cGeo.details
        };
    }

    static getVProfile(vertices, n) {
        // Map integer coordinates to 0..n space
        // Vertices are Vector3. 
        // If n=1, range is 0..1. Center is 0.5.
        // We need to check if vertex is Integer or Half-Integer relative to grid.
        // Actually, our grid points are integers 0..n.
        // Center of grid is n/2.

        // Classify each vertex relative to Grid Box P(n).
        // For n=1: 
        // (0,0,0)..(1,1,1) -> Corners
        // (0.5, 0.5, 0.5) -> Body Center ? (Not in grid P(1), but maybe hull center?)
        // Wait, Hull Vertices MUST be Grid Points.
        // So they are always Integers.

        // Classification for P(n):
        // Corner: coords are {0, n}
        // Edge: 2 coords are {0, n}, 1 is in (0, n)
        // Face: 1 coord is {0, n}, 2 are in (0, n)
        // Interior: all 3 in (0, n)

        const counts = { C: 0, E: 0, F: 0, I: 0 };
        const eps = 0.001;

        vertices.forEach(v => {
            const x = Math.round(v.x);
            const y = Math.round(v.y);
            const z = Math.round(v.z);

            // Check boundary hits
            // Assuming grid ranges from bounds of the hull or standard P(n) 0..n?
            // The input grid was centered or 0-based? 
            // FormGenerator typically centers points or uses specific range.
            // Let's assume standard P(n) {0..n} if we want strictly "SpaceHarmony" classification.
            // But the generator outputs centered coords usually.
            // Let's rely on relative position to bounding box of the grid?
            // Safer: Just count how many coords are 'extreme' (min/max of the specific body? no, the grid).

            // Let's denote "Boundary" vs "Inner".
            // Since we know 'n', the grid extent is likely 0..n or -n/2..n/2.
            // Let's classify based on "Number of coords that are max bounds".
            // Actually, simply counting unique coordinate values might be better?

            // Standard approach for "Space Harmony":
            // Vertices are usually subsets of the Grid.
            // Let's just output a sorted string of "Type".
            // Type = # of coords that are divisible by n (if n=1) or 'on boundary'.
            // Let's perform a generic "OnHullBoundary" check?
            // No, let's stick to the User Request: "P(2): Ecke / Kantenmitte / Flächenmitte / Zentrum".

            // Assume grid is centered at 0 if n is even? Or 0..n. 
            // Let's normalize to 0..n first?
            // We'll trust the caller passes 'context.n'.
            // And we assume vertices are integers.

            // Let bound = n/2 (if centered) or n (if 0-based).
            // Let's detect bounds from the vertices themselves? 
            // No, the grid is the reference frame.

            // Robust method for P(n) symmetric forms:
            // Check distance from origin? Or permutations.
            // Let's count orbit types.
            // Sort vertices by magnitude, then group.
            // e.g. "8x(1,1,1) + 6x(1,0,0)"
        });

        // Simplified V-Profile: Group by Magnitude (squared distance from center)
        // This is rotation invasive and simple.
        const center = new THREE.Vector3(); // Assume symmetry center is 0,0,0 for now
        // If not, compute centroid?
        // Symmetric bodies usually centered at 0 or 0.5.

        // Let's group by "NormSq | integer-sorted-coords"
        const groups = new Map();
        vertices.forEach(v => {
            const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
            const key = [ax, ay, az].sort((a, b) => b - a).map(k => k.toFixed(2)).join(',');
            groups.set(key, (groups.get(key) || 0) + 1);
        });

        // Format: "8xA, 6xB"
        const parts = [];
        const sortedKeys = Array.from(groups.keys()).sort();
        for (const k of sortedKeys) {
            parts.push(`${groups.get(k)}x[${k}]`);
        }
        return parts.join('+');
    }

    static getUniqueEdges(faces) {
        const edgeSet = new Set();
        const edges = [];
        faces.forEach(face => {
            // face is [i, j, k, ...] indices
            for (let i = 0; i < face.length; i++) {
                const a = face[i];
                const b = face[(i + 1) % face.length];
                const u = Math.min(a, b);
                const v = Math.max(a, b);
                const key = `${u}-${v}`;
                if (!edgeSet.has(key)) {
                    edgeSet.add(key);
                    edges.push([u, v]);
                }
            }
        });
        return edges;
    }

    static getEProfile(vertices, edges) {
        // Classify edges by Length and "Direction Type" (e.g. 1,0,0 vs 1,1,0)
        // Group by "Length | sorted-deltas"
        const groups = new Map();

        edges.forEach(e => {
            const v1 = vertices[e[0]];
            const v2 = vertices[e[1]];
            const dx = Math.abs(v1.x - v2.x);
            const dy = Math.abs(v1.y - v2.y);
            const dz = Math.abs(v1.z - v2.z);
            const deltas = [dx, dy, dz].sort((a, b) => b - a);
            const lenSq = dx * dx + dy * dy + dz * dz;

            const key = `L${lenSq.toFixed(1)}-D(${deltas.map(d => d.toFixed(1)).join(',')})`;
            groups.set(key, (groups.get(key) || 0) + 1);
        });

        const parts = [];
        Array.from(groups.keys()).sort().forEach(k => {
            parts.push(`${groups.get(k)}x${k}`);
        });
        return parts.join('|');
    }

    static getGeometricSignature(vertices, faces) {
        // Canonical Geometry: 
        // 1. Identify Facets (merge coplanar triangles from Hull).
        // 2. Sort Facets by Area/Distance?
        // 3. Create string: "F<Count>-[ShapeSignature...]"

        // Step A: Merge Triangles into Polygons
        // QuickHull returns triangles. Co-planar triangles sharing edges should be merged.
        // Or simpler: Group triangles by Plane Normal + Distance.

        const planeMap = new Map(); // "nx,ny,nz,d" -> [triangles]
        const PRECISION = 1; // Round normals heavily to catch coplanar? No, standard physics eps.

        faces.forEach(tri => {
            const a = vertices[tri[0]], b = vertices[tri[1]], c = vertices[tri[2]];
            // Normal
            const ab = new THREE.Vector3().subVectors(b, a);
            const ac = new THREE.Vector3().subVectors(c, a);
            const n = new THREE.Vector3().crossVectors(ab, ac).normalize();
            const d = -n.dot(a); // Plane eq: ax+by+cz+d=0

            // Canonical Key: round components
            const nk = `${n.x.toFixed(3)},${n.y.toFixed(3)},${n.z.toFixed(3)},${d.toFixed(3)}`;

            // Better: find existing existing key within epsilon
            let foundKey = null;
            for (const k of planeMap.keys()) {
                // parse? no, store objects?
                // Just use string for now, precision 3 is usually okay for "integer based" grids.
                if (nk === k) { foundKey = k; break; }
            }
            if (!foundKey) foundKey = nk;

            if (!planeMap.has(foundKey)) planeMap.set(foundKey, { n, d, tris: [] });
            planeMap.get(foundKey).tris.push(tri);
        });

        // Step B: For each plane, calculate Face Signature (Simpler than full polygon reconstruction)
        // Signature = "V<VertexCount>" (e.g. Triangle, Quad, Hexagon...)
        // To do this properly, we need to count unique vertices in this plane group.
        // This is a robust enough invariant for simple solids.

        const faceSigs = [];
        for (const entry of planeMap.values()) {
            const vSet = new Set();
            entry.tris.forEach(face => {
                face.forEach(idx => vSet.add(idx));
            });
            faceSigs.push(vSet.size);
        }

        // Sort signatures
        faceSigs.sort((a, b) => b - a); // Descending (largest faces first)

        // Hash: "F6-V(4,4,4,4,4,4)" -> Cube
        // "F8-V(3,3,3,3,3,3,3,3)" -> Octahedron

        // Group by type: "6x4" (6 faces of 4 verts)
        const groups = new Map();
        faceSigs.forEach(v => groups.set(v, (groups.get(v) || 0) + 1));

        const sigParts = [];
        Array.from(groups.keys()).sort((a, b) => b - a).forEach(k => {
            sigParts.push(`${groups.get(k)}xV${k}`);
        });

        const fullSig = `F${planeMap.size}-{${sigParts.join(',')}}`;
        const hash = this.simpleHash(fullSig);

        return {
            full: fullSig,
            hash: hash,
            details: fullSig
        };
    }

    static simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return (hash >>> 0).toString(16).toUpperCase();
    }
}
