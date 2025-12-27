const identity = [new THREE.Matrix4()];

if (this.showClosedForms) {
    faceMat = new THREE.MeshBasicMaterial({
        color: 0x888888,
        faceMat = new THREE.MeshPhongMaterial({
            color: 0xbbbbbb, // Slightly darker to allow highlights
            transparent: true,
            opacity: 0.4, // More transparent for loose faces
            opacity: 0.15, // Very transparent
            side: THREE.DoubleSide,
            depthWrite: false
                depthWrite: false, // Prevents z-fighting but order dependent
            flatShading: false, // Smooth shading for curves
            shininess: 30,
            specular: 0x222222
        });

        volumeMat = new THREE.MeshBasicMaterial({
            color: 0x444444, // Darker gray for volumes
            volumeMat = new THREE.MeshPhongMaterial({
                color: 0x888888, // Darker for volumes
                transparent: true,
                opacity: 0.4,
                opacity: 0.25,
                side: THREE.DoubleSide,
                depthWrite: false
                depthWrite: false,
                flatShading: false,
                shininess: 30,
                specular: 0x222222
            });

            this.manualFaces.forEach(face => {
                @@ -2009, 24 + 2015, 70 @@ export class App {
                });
        }

        // 3. Collect Faces
// 3. Collect Faces
const objFaces = [];
        this.manualFaces.forEach(face => {
            const indices = face.indices;
            // We need vertex positions for face
            const facePoints = indices.map(idx => this.gridPoints[idx]);

            transforms.forEach(mat => {
                const polyIndices = [];
                facePoints.forEach(pt => {
                    const p = pt.clone().applyMatrix4(mat);
                    polyIndices.push(addUniqueVertex(p));
                    let curvedGeom = null;
                    // Only support curved export for triangles as per current rendering logic
                    // Check this.useCurvedSurfaces (correct property)
                    if (this.useCurvedSurfaces && facePoints.length === 3) {
                        // curvatureScale 1.1 matches _renderFace logic
                        curvedGeom = this._buildCurvedTriangleGeometry(facePoints, { curvatureScale: 1.1 });
                    }

                    if (curvedGeom) {
                        // Export Dense Mesh (Vertices + Faces)
                        const attrPos = curvedGeom.getAttribute('position');
                        const index = curvedGeom.getIndex();

                        transforms.forEach(mat => {
                            // Map local geometry indices to global OBJ vertex indices
                            const localIndices = [];
                            for (let i = 0; i < attrPos.count; i++) {
                                const p = new THREE.Vector3().fromBufferAttribute(attrPos, i);
                                p.applyMatrix4(mat);
                                localIndices.push(addUniqueVertex(p));
                            }

                            // Add Faces from Geometry
                            if (index) {
                                for (let i = 0; i < index.count; i += 3) {
                                    objFaces.push([
                                        localIndices[index.getX(i)],
                                        localIndices[index.getX(i + 1)],
                                        localIndices[index.getX(i + 2)]
                                    ]);
                                }
                            } else {
                                for (let i = 0; i < attrPos.count; i += 3) {
                                    objFaces.push([
                                        localIndices[i],
                                        localIndices[i + 1],
                                        localIndices[i + 2]
                                    ]);
                                }
                            }
                        });
                        // Cleanup
                        curvedGeom.dispose();
                    } else {
                        // Standard Polygon Export
                        transforms.forEach(mat => {
                            const polyIndices = [];
                            facePoints.forEach(pt => {
                                const p = pt.clone().applyMatrix4(mat);
                                polyIndices.push(addUniqueVertex(p));
                            });

                            if (polyIndices.length >= 3) {
                                objFaces.push(polyIndices);
                            }
                        });
                        if (polyIndices.length >= 3) {
                            objFaces.push(polyIndices);
                        }
                    });
            }
});

// 4. Write Output