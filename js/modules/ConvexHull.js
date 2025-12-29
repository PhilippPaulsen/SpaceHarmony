/**
 * ConvexHull.js
 * 
 * robust implementation of the QuickHull 3D algorithm.
 * Computes the convex hull of a set of 3D points.
 * 
 * Usage:
 * const hull = new ConvexHull(points);
 * const geometry = hull.generate(); // { vertices: [], faces: [[i,j,k], ...] }
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';

const EPSILON = 1e-4;

class Face {
    constructor(a, b, c, norm) {
        this.a = a; // vertex index
        this.b = b;
        this.c = c;
        this.normal = norm; // THREE.Vector3
        this.visiblePoints = []; // indices of points
        this.markedForDeletion = false;
    }
}

export class ConvexHull {
    constructor(points) {
        this.points = points; // Array of THREE.Vector3
        this.faces = []; // Array of Face
        this.newFaces = []; // Temporarily store new faces
    }

    generate() {
        if (this.points.length < 4) return null;

        if (!this.initSimplex()) {
            // Degenerate case (coplanar or collinear)
            return null;
        }

        this.points.forEach((p, i) => {
            if (this.assigned.has(i)) return;
            this.assignPointToFace(i);
        });

        let currentFace;
        while ((currentFace = this.nextFaceToProcess())) {
            this.processFace(currentFace);
        }

        return this.buildResult();
    }

    initSimplex() {
        // 1. Find 6 extreme points
        const extremeIndices = this.getExtremePoints();

        // 2. Find two most distant points
        let maxDist = 0;
        let p1 = extremeIndices[0], p2 = extremeIndices[0];

        for (let i of extremeIndices) {
            for (let j of extremeIndices) {
                const d = this.points[i].distanceToSquared(this.points[j]);
                if (d > maxDist) {
                    maxDist = d;
                    p1 = i;
                    p2 = j;
                }
            }
        }

        // 3. Find 3rd point furthest from line p1-p2
        let p3 = -1;
        let maxDistLine = EPSILON;
        const line = new THREE.Line3(this.points[p1], this.points[p2]);

        for (let i = 0; i < this.points.length; i++) {
            if (i === p1 || i === p2) continue;
            // distanceSq to line?
            // closestPointToPointParameter...
            const closest = new THREE.Vector3();
            line.closestPointToPoint(this.points[i], true, closest);
            const d = closest.distanceToSquared(this.points[i]);
            if (d > maxDistLine) {
                maxDistLine = d;
                p3 = i;
            }
        }

        if (p3 === -1) return false; // Collinear

        // 4. Find 4th point furthest from plane p1-p2-p3
        let p4 = -1;
        let maxDistPlane = EPSILON;
        const plane = new THREE.Plane().setFromCoplanarPoints(this.points[p1], this.points[p2], this.points[p3]);

        for (let i = 0; i < this.points.length; i++) {
            if (i === p1 || i === p2 || i === p3) continue;
            const d = Math.abs(plane.distanceToPoint(this.points[i]));
            if (d > maxDistPlane) {
                maxDistPlane = d;
                p4 = i;
            }
        }

        if (p4 === -1) return false; // Coplanar

        this.assigned = new Set([p1, p2, p3, p4]);

        // Create initial faces (ensure CCW winding relative to outside)
        // Center of tetrahedron
        const center = new THREE.Vector3()
            .add(this.points[p1]).add(this.points[p2]).add(this.points[p3]).add(this.points[p4])
            .multiplyScalar(0.25);

        const faces = [
            [p1, p2, p3],
            [p1, p3, p4],
            [p1, p4, p2],
            [p2, p4, p3]
        ];

        for (const f of faces) {
            this.addFace(f[0], f[1], f[2], center);
        }

        return true;
    }

    getExtremePoints() {
        const min = [0, 0, 0], max = [0, 0, 0];

        for (let i = 1; i < this.points.length; i++) {
            if (this.points[i].x < this.points[min[0]].x) min[0] = i;
            if (this.points[i].x > this.points[max[0]].x) max[0] = i;
            if (this.points[i].y < this.points[min[1]].y) min[1] = i;
            if (this.points[i].y > this.points[max[1]].y) max[1] = i;
            if (this.points[i].z < this.points[min[2]].z) min[2] = i;
            if (this.points[i].z > this.points[max[2]].z) max[2] = i;
        }
        // Unique
        return Array.from(new Set([...min, ...max]));
    }

    addFace(a, b, c, innerPoint) {
        const pA = this.points[a], pB = this.points[b], pC = this.points[c];
        const v1 = new THREE.Vector3().subVectors(pB, pA);
        const v2 = new THREE.Vector3().subVectors(pC, pA);
        let norm = new THREE.Vector3().crossVectors(v1, v2).normalize();

        // Check direction relative to innerPoint
        const toPt = new THREE.Vector3().subVectors(pA, innerPoint);
        if (norm.dot(toPt) < 0) {
            norm.negate();
            // swap to keep winding
            const tmp = b; b = c; c = tmp;
        }

        this.faces.push(new Face(a, b, c, norm));
    }

    assignPointToFace(pIdx) {
        const p = this.points[pIdx];
        let maxDist = EPSILON;
        let assignedFace = null;

        for (const face of this.faces) {
            if (face.markedForDeletion) continue;
            // distance = dot(p - a, normal)
            const dist = face.normal.dot(new THREE.Vector3().subVectors(p, this.points[face.a]));
            if (dist > maxDist) {
                maxDist = dist;
                assignedFace = face;
            }
        }

        if (assignedFace) {
            assignedFace.visiblePoints.push({ index: pIdx, dist: maxDist });
        }
    }

    nextFaceToProcess() {
        for (const face of this.faces) {
            if (!face.markedForDeletion && face.visiblePoints.length > 0) {
                return face;
            }
        }
        return null;
    }

    processFace(face) {
        // 1. Identify point furthest from face
        let maxD = -1;
        let farP = -1;
        for (const vp of face.visiblePoints) {
            if (vp.dist > maxD) {
                maxD = vp.dist;
                farP = vp.index;
            }
        }

        // 2. Find all visible faces from farP
        const pVec = this.points[farP];
        const visibleFaces = [];
        const nonVisibleFaces = []; // Just to know boundary

        // DFS or simple iteration? Iteration is safer.
        for (const f of this.faces) {
            if (f.markedForDeletion) continue;
            const dist = f.normal.dot(new THREE.Vector3().subVectors(pVec, this.points[f.a]));
            if (dist > EPSILON) {
                f.markedForDeletion = true;
                visibleFaces.push(f);
            }
        }

        // 3. Find horizon edges (edges of visible faces that are shared with non-visible faces)
        // Edge: 'a-b' ordered
        const horizon = [];
        const edgeCount = new Map();

        for (const f of visibleFaces) {
            const edges = [[f.a, f.b], [f.b, f.c], [f.c, f.a]];
            for (const [u, v] of edges) {
                const key = u < v ? `${u}-${v}` : `${v}-${u}`;
                edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
            }
        }

        // Horizon edges are those that appear exactly ONCE in the visible set.
        // Wait, if it's internal to visible set, it appears twice?
        // Yes, if volume is closed, an internal edge is shared by 2 visible faces.
        // A horizon edge is shared by 1 visible and 1 non-visible.

        // We need to know the order (u->v) that respects the Counter-Clockwise winding of the visible face.
        // Actually, we can just grab all edges from visible faces. 
        // If an edge 'u->v' exists, and 'v->u' exists (from another visible face), they cancel out.
        // The remaining directed edges form the horizon loops.

        const directedEdges = new Set();
        for (const f of visibleFaces) {
            directedEdges.add(`${f.a}-${f.b}`);
            directedEdges.add(`${f.b}-${f.c}`);
            directedEdges.add(`${f.c}-${f.a}`);
        }

        const horizonEdges = []; // array of [u, v]
        for (const f of visibleFaces) {
            const edges = [[f.a, f.b], [f.b, f.c], [f.c, f.a]];
            for (const [u, v] of edges) {
                if (!directedEdges.has(`${v}-${u}`)) {
                    horizonEdges.push([u, v]);
                }
            }
        }

        // 4. Create new faces connecting horizon to farP
        const newFaces = [];
        const center = new THREE.Vector3(); // For normal orientation check, assume hull center roughly? 
        // Or simply: horizon edge u->v was CCW for the old face.
        // So new face u->v->farP will be CCW.

        for (const [u, v] of horizonEdges) {
            const nf = new Face(u, v, farP, new THREE.Vector3());
            // Compute normal
            const pU = this.points[u], pV = this.points[v], pP = this.points[farP];
            const v1 = new THREE.Vector3().subVectors(pV, pU);
            const v2 = new THREE.Vector3().subVectors(pP, pU);
            nf.normal.crossVectors(v1, v2).normalize();
            newFaces.push(nf);
            this.faces.push(nf);
        }

        // 5. Reassign orphan points
        const orphans = [];
        for (const f of visibleFaces) {
            for (const vp of f.visiblePoints) {
                if (vp.index !== farP) orphans.push(vp.index);
            }
        }

        // Add unique orphans
        const uniqueOrphans = Array.from(new Set(orphans));
        for (const idx of uniqueOrphans) {
            this.assignPointToFace(idx);
        }
    }

    buildResult() {
        const activeFaces = this.faces.filter(f => !f.markedForDeletion);

        // Helper to collect edges
        const faceIndices = activeFaces.map(f => [f.a, f.b, f.c]);

        // Unique vertex map
        const finalVerts = [];
        const oldToNew = new Map();

        activeFaces.forEach(f => {
            [f.a, f.b, f.c].forEach(idx => {
                if (!oldToNew.has(idx)) {
                    oldToNew.set(idx, finalVerts.length);
                    finalVerts.push(this.points[idx]);
                }
            });
        });

        // Remap faces
        const finalFaces = activeFaces.map(f => [
            oldToNew.get(f.a),
            oldToNew.get(f.b),
            oldToNew.get(f.c)
        ]);

        return {
            vertices: finalVerts,
            faces: finalFaces
        };
    }
}
