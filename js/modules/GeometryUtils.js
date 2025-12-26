import * as THREE from 'three';

export const GeometryUtils = {
    formatCoord(value) {
        return value.toFixed(5);
    },

    pointKey(vec) {
        return GeometryUtils.formatCoord(vec.x) + '|' + GeometryUtils.formatCoord(vec.y) + '|' + GeometryUtils.formatCoord(vec.z);
    },

    pointKeyFromCoords(x, y, z) {
        return GeometryUtils.formatCoord(x) + '|' + GeometryUtils.formatCoord(y) + '|' + GeometryUtils.formatCoord(z);
    },

    vectorFromKey(key) {
        if (!key) return null;
        const parts = key.split('|').map(parseFloat);
        if (parts.length < 3 || parts.some(isNaN)) return null;
        return new THREE.Vector3(parts[0], parts[1], parts[2]);
    },

    segmentKey(startVec, endVec) {
        const keys = [GeometryUtils.pointKey(startVec), GeometryUtils.pointKey(endVec)].sort();
        return keys.join('->');
    },

    segmentKeyFromKeys(keyA, keyB) {
        const sorted = [keyA, keyB].sort();
        return sorted.join('->');
    },

    faceKeyFromKeys(keys, expectedLength) {
        if (!keys) return '';
        const sorted = keys.slice().sort();
        return sorted.join('_');
    },

    volumeKeyFromKeys(keys) {
        if (!keys) return '';
        const sorted = keys.slice().sort();
        return sorted.join('__');
    },

    isPlanar(keys, tolerance = 1e-4) {
        if (keys.length < 4) {
            return true; // Triangles are always planar
        }
        const points = keys.map((key) => GeometryUtils.vectorFromKey(key));
        if (points.some((p) => !p)) {
            return false;
        }

        const [p0, p1, p2, p3] = points;
        const v1 = new THREE.Vector3().subVectors(p1, p0);
        const v2 = new THREE.Vector3().subVectors(p2, p0);
        const v3 = new THREE.Vector3().subVectors(p3, p0);

        const volume = Math.abs(v3.dot(v1.clone().cross(v2)));
        return volume < tolerance;
    },

    orderFaceKeys(faceKeys) {
        if (!Array.isArray(faceKeys) || faceKeys.length < 3) {
            return null;
        }
        const uniqueKeys = Array.from(new Set(faceKeys));
        if (uniqueKeys.length < 3) {
            return null;
        }
        const points = uniqueKeys.map((key) => GeometryUtils.vectorFromKey(key));
        if (points.some((p) => !p)) {
            return null;
        }

        const centroid = points.reduce((acc, point) => acc.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);

        let normal = new THREE.Vector3();
        let foundNormal = false;
        for (let i = 0; i < points.length && !foundNormal; i += 1) {
            for (let j = i + 1; j < points.length && !foundNormal; j += 1) {
                for (let k = j + 1; k < points.length && !foundNormal; k += 1) {
                    const v1 = new THREE.Vector3().subVectors(points[j], points[i]);
                    const v2 = new THREE.Vector3().subVectors(points[k], points[i]);
                    normal = new THREE.Vector3().crossVectors(v1, v2);
                    if (normal.lengthSq() > 1e-10) {
                        foundNormal = true;
                    }
                }
            }
        }
        if (!foundNormal) {
            return null;
        }
        normal.normalize();

        let axisU = new THREE.Vector3().subVectors(points[0], centroid);
        if (axisU.lengthSq() < 1e-10 && points.length > 1) {
            axisU = new THREE.Vector3().subVectors(points[1], centroid);
        }
        if (axisU.lengthSq() < 1e-10) {
            axisU = new THREE.Vector3(1, 0, 0);
            if (Math.abs(axisU.dot(normal)) > 0.99) {
                axisU = new THREE.Vector3(0, 1, 0);
            }
        }
        axisU.normalize();
        let axisV = new THREE.Vector3().crossVectors(normal, axisU);
        if (axisV.lengthSq() < 1e-10) {
            axisU = new THREE.Vector3(0, 1, 0);
            if (Math.abs(axisU.dot(normal)) > 0.99) {
                axisU = new THREE.Vector3(0, 0, 1);
            }
            axisU.normalize();
            axisV = new THREE.Vector3().crossVectors(normal, axisU);
        }
        axisV.normalize();

        const orderedData = uniqueKeys
            .map((key, idx) => {
                const rel = new THREE.Vector3().subVectors(points[idx], centroid);
                const x = rel.dot(axisU);
                const y = rel.dot(axisV);
                const angle = Math.atan2(y, x);
                return { key, angle };
            })
            .sort((a, b) => a.angle - b.angle)
            .map((entry) => entry.key);

        return { ordered: orderedData, normal };
    },

    triangulatePolygonKeys(orderedKeys, normal = null) {
        if (!Array.isArray(orderedKeys) || orderedKeys.length < 3) {
            return [];
        }
        if (orderedKeys.length === 3) {
            return [orderedKeys.slice()];
        }
        const triangles = [];
        for (let i = 1; i < orderedKeys.length - 1; i += 1) {
            triangles.push([orderedKeys[0], orderedKeys[i], orderedKeys[i + 1]]);
        }
        if (normal && normal.lengthSq && normal.lengthSq() > 0) {
            const corrected = [];
            triangles.forEach((triangle) => {
                const [keyA, keyB, keyC] = triangle;
                const a = GeometryUtils.vectorFromKey(keyA);
                const b = GeometryUtils.vectorFromKey(keyB);
                const c = GeometryUtils.vectorFromKey(keyC);
                if (!a || !b || !c) {
                    corrected.push(triangle.slice());
                    return;
                }
                const ab = new THREE.Vector3().subVectors(b, a);
                const ac = new THREE.Vector3().subVectors(c, a);
                const cross = new THREE.Vector3().crossVectors(ab, ac);
                if (cross.dot(normal) < 0) {
                    corrected.push([keyA, keyC, keyB]);
                } else {
                    corrected.push(triangle.slice());
                }
            });
            return corrected;
        }
        return triangles;
    }
};
