import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const CUBE_HALF_SIZE = 0.5;
const INITIAL_CANVAS_SIZE = 320;
const DRAG_THRESHOLD_SQ = 9;
const RAY_PICK_THRESHOLD = 0.05;

class SymmetryEngine {
    constructor() {
        this.settings = {
            reflections: {
                xy: true,
                yz: true,
                zx: true,
            },
            rotation: {
                axis: 'all',
                steps: 4,
            },
            translation: {
                axis: 'none',
                count: 0,
                step: 0.5,
            },
            inversion: false,
            rotoreflection: {
                enabled: false,
                axis: 'none',
                plane: 'xy',
                angleDeg: 180,
                count: 0,
            },
            screw: {
                enabled: false,
                axis: 'none',
                angleDeg: 180,
                distance: 0.5,
                count: 0,
            },
        };
    }

    setReflection(plane, enabled) {
        if (Object.prototype.hasOwnProperty.call(this.settings.reflections, plane)) {
            this.settings.reflections[plane] = Boolean(enabled);
        }
    }

    setRotation(axis) {
        this.settings.rotation.axis = axis;
    }

    setTranslation(axis, count, step) {
        const axisValue = axis || 'none';
        this.settings.translation.axis = axisValue;
        this.settings.translation.count = Math.max(0, Math.floor(count || 0));
        this.settings.translation.step = Math.max(0, step || 0);
        if (axisValue === 'none') {
            this.settings.translation.count = 0;
        }
    }

    setInversion(enabled) {
        this.settings.inversion = Boolean(enabled);
    }

    setRotoreflection(config = {}) {
        const {
            enabled = false,
            axis = 'none',
            plane = 'xy',
            angleDeg = 0,
            count = 0,
        } = config;
        const axisValue = axis === 'all' ? 'none' : (axis || 'none');
        const planeValue = plane || 'xy';
        const axisPlaneMap = {
            x: 'yz',
            y: 'zx',
            z: 'xy',
        };
        const expectedPlane = axisPlaneMap[axisValue];
        const isValidCombo = !axisValue || axisValue === 'none' || !expectedPlane || expectedPlane === planeValue;
        this.settings.rotoreflection.enabled = Boolean(enabled) && axisValue !== 'none' && isValidCombo;
        this.settings.rotoreflection.axis = this.settings.rotoreflection.enabled ? axisValue : 'none';
        this.settings.rotoreflection.plane = this.settings.rotoreflection.enabled ? planeValue : planeValue;
        this.settings.rotoreflection.angleDeg = Number.isFinite(angleDeg) ? angleDeg : 0;
        this.settings.rotoreflection.count = Math.max(0, Math.floor(count || 0));
    }

    setScrew(config = {}) {
        const {
            enabled = false,
            axis = 'none',
            angleDeg = 0,
            distance = 0,
            count = 0,
        } = config;
        const axisValue = axis === 'all' ? 'none' : (axis || 'none');
        this.settings.screw.enabled = Boolean(enabled) && axisValue !== 'none';
        this.settings.screw.axis = axisValue;
        this.settings.screw.angleDeg = Number.isFinite(angleDeg) ? angleDeg : 0;
        this.settings.screw.distance = Number.isFinite(distance) ? distance : 0;
        this.settings.screw.count = Math.max(0, Math.floor(count || 0));
    }

    getTransforms() {
        let transforms = [new THREE.Matrix4().identity()];
        const { reflections, rotation, translation } = this.settings;

        if (reflections.xy) {
            transforms = this._expand(transforms, this._reflectionMatrix('xy'));
        }
        if (reflections.yz) {
            transforms = this._expand(transforms, this._reflectionMatrix('yz'));
        }
        if (reflections.zx) {
            transforms = this._expand(transforms, this._reflectionMatrix('zx'));
        }

        if (rotation.axis !== 'none' && rotation.steps > 1) {
            const axes = rotation.axis === 'all' ? ['x', 'y', 'z'] : [rotation.axis];
            const angleChoices = axes.map((ax) => {
                const delta = (Math.PI * 2) / rotation.steps;
                const options = [null];
                for (let i = 1; i < rotation.steps; i += 1) {
                    options.push({ axis: ax, angle: delta * i });
                }
                return options;
            });

            const combos = this._cartesianProduct(angleChoices);
            const baseTransforms = transforms.slice();
            combos.forEach((combo) => {
                let combined = new THREE.Matrix4().identity();
                let hasRotation = false;
                combo.forEach((spec) => {
                    if (!spec) {
                        return;
                    }
                    hasRotation = true;
                    combined = combined.multiply(this._rotationMatrix(spec.axis, spec.angle));
                });
                if (!hasRotation) {
                    return;
                }
                baseTransforms.forEach((matrix) => {
                    transforms.push(matrix.clone().multiply(combined));
                });
            });
        }

        if (translation.axis !== 'none' && translation.count > 0 && translation.step > 0) {
            const axes = translation.axis === 'all' ? ['x', 'y', 'z'] : [translation.axis];
            const perAxisOptions = axes.map((ax) => {
                const options = [null];
                for (let i = 1; i <= translation.count; i += 1) {
                    const offset = translation.step * i;
                    options.push(this._translationMatrix(ax, offset));
                    options.push(this._translationMatrix(ax, -offset));
                }
                return options;
            });

            const combos = this._cartesianProduct(perAxisOptions);
            const baseTransforms = transforms.slice();
            combos.forEach((combo) => {
                let combined = new THREE.Matrix4().identity();
                let hasTranslation = false;
                combo.forEach((matrix) => {
                    if (!matrix) {
                        return;
                    }
                    hasTranslation = true;
                    combined = combined.multiply(matrix);
                });
                if (!hasTranslation) {
                    return;
                }
                baseTransforms.forEach((matrix) => {
                    transforms.push(matrix.clone().multiply(combined));
                });
            });
        }

        if (this.settings.inversion) {
            // Mirror everything at the origin to add central inversion symmetry.
            transforms = this._expand(transforms, this.applyInversion());
        }

        const roto = this.settings.rotoreflection;
        if (
            roto.enabled &&
            roto.axis !== 'none' &&
            roto.plane !== 'none' &&
            roto.count > 0
        ) {
            // Apply successive rotoreflections (rotation + reflection) to seed additional copies.
            const baseTransforms = transforms.slice();
            const angleRad = THREE.MathUtils.degToRad(roto.angleDeg || 0);
            for (let i = 1; i <= roto.count; i += 1) {
                const matrix = this.applyRotoreflection(roto.axis, angleRad * i, roto.plane);
                if (!matrix) {
                    continue;
                }
                baseTransforms.forEach((existing) => {
                    transforms.push(existing.clone().multiply(matrix));
                });
            }
        }

        const screw = this.settings.screw;
        if (
            screw.enabled &&
            screw.axis !== 'none' &&
            screw.count > 0
        ) {
            // Build helical copies by pairing rotation with a translation along the same axis.
            const baseTransforms = transforms.slice();
            const angleRad = THREE.MathUtils.degToRad(screw.angleDeg || 0);
            for (let i = 1; i <= screw.count; i += 1) {
                const angle = angleRad * i;
                const distance = screw.distance * i;
                const matrixPos = this.applyScrew(screw.axis, angle, distance);
                const matrixNeg = this.applyScrew(screw.axis, -angle, -distance);
                baseTransforms.forEach((existing) => {
                    if (matrixPos) {
                        transforms.push(existing.clone().multiply(matrixPos));
                    }
                    if (matrixNeg) {
                        transforms.push(existing.clone().multiply(matrixNeg));
                    }
                });
            }
        }

        return this._deduplicate(transforms);
    }

    _reflectionMatrix(plane) {
        switch (plane) {
            case 'xy':
                return new THREE.Matrix4().makeScale(1, 1, -1);
            case 'yz':
                return new THREE.Matrix4().makeScale(-1, 1, 1);
            case 'zx':
                return new THREE.Matrix4().makeScale(1, -1, 1);
            default:
                return new THREE.Matrix4().identity();
        }
    }

    _rotationMatrix(axis, angle) {
        const matrix = new THREE.Matrix4();
        switch (axis) {
            case 'x':
                return matrix.makeRotationX(angle);
            case 'y':
                return matrix.makeRotationY(angle);
            case 'z':
                return matrix.makeRotationZ(angle);
            default:
                return matrix.identity();
        }
    }

    _translationMatrix(axis, distance) {
        const matrix = new THREE.Matrix4();
        switch (axis) {
            case 'x':
                return matrix.makeTranslation(distance, 0, 0);
            case 'y':
                return matrix.makeTranslation(0, distance, 0);
            case 'z':
                return matrix.makeTranslation(0, 0, distance);
            default:
                return matrix.identity();
        }
    }

    // Point inversion through the origin: (x, y, z) -> (-x, -y, -z)
    applyInversion() {
        return new THREE.Matrix4().makeScale(-1, -1, -1);
    }

    // Rotoreflection combines a rotation about an axis with a reflection in an orthogonal plane.
    applyRotoreflection(axis, angleRad, plane) {
        if (!axis || axis === 'none' || !plane || plane === 'none') {
            return null;
        }
        const rotation = this._rotationMatrix(axis, angleRad);
        const reflection = this._reflectionMatrix(plane);
        return reflection.clone().multiply(rotation);
    }

    // Screw symmetry (helical motion) combines a rotation and translation along the same axis.
    applyScrew(axis, angleRad, distance) {
        if (!axis || axis === 'none') {
            return null;
        }
        const nearZeroAngle = Math.abs(angleRad) < 1e-6;
        const nearZeroDistance = Math.abs(distance) < 1e-6;
        if (nearZeroAngle && nearZeroDistance) {
            return null;
        }
        const rotation = nearZeroAngle ? new THREE.Matrix4().identity() : this._rotationMatrix(axis, angleRad);
        const translation = nearZeroDistance ? new THREE.Matrix4().identity() : this._translationMatrix(axis, distance);
        return translation.clone().multiply(rotation);
    }

    _expand(baseTransforms, extraMatrix) {
        const result = baseTransforms.map((m) => m.clone());
        baseTransforms.forEach((matrix) => {
            const combined = matrix.clone().multiply(extraMatrix);
            result.push(combined);
        });
        return result;
    }

    _deduplicate(transforms) {
        const seen = new Set();
        const unique = [];
        transforms.forEach((matrix) => {
            const key = Array.from(matrix.elements)
                .map((value) => {
                    const v = Math.abs(value) < 1e-10 ? 0 : value;
                    return v.toFixed(5);
                })
                .join(',');
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(matrix);
            }
        });
        return unique;
    }

    _cartesianProduct(arrays) {
        if (!arrays.length) {
            return [[]];
        }
        const [first, ...rest] = arrays;
        const restProduct = this._cartesianProduct(rest);
        const result = [];
        first.forEach((item) => {
            restProduct.forEach((combo) => {
                result.push([item, ...combo]);
            });
        });
        return result;
    }
}

class RaumharmonikApp {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xffffff);

        const aspect = 1;
        const frustumSize = 2;
        this.camera = new THREE.OrthographicCamera(
            (frustumSize * aspect) / -2,
            (frustumSize * aspect) / 2,
            frustumSize / 2,
            frustumSize / -2,
            0.01,
            20
        );
        this.camera.position.set(1.8, 1.8, 1.8);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(INITIAL_CANVAS_SIZE, INITIAL_CANVAS_SIZE, false);
        this.renderer.setClearColor(0xffffff, 1);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.enablePan = false;
        this.controls.enableZoom = false;
        this.controls.minZoom = 1.0;
        this.controls.maxZoom = 4.0;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.8;
        this.controls.target.set(0, 0, 0);
        this.controls.update();

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.pointerDown = false;
        this.dragging = false;
        this.pointerDownPos = new THREE.Vector2();
        this.cubeBounds = new THREE.Box3(
            new THREE.Vector3(-CUBE_HALF_SIZE, -CUBE_HALF_SIZE, -CUBE_HALF_SIZE),
            new THREE.Vector3(CUBE_HALF_SIZE, CUBE_HALF_SIZE, CUBE_HALF_SIZE)
        );

        this.symmetry = new SymmetryEngine();
        this.pointGeometry = new THREE.SphereGeometry(0.01, 16, 16);
        this.pointMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.activePointGeometry = new THREE.SphereGeometry(0.014, 16, 16);
        this.activePointMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
        this.faceMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
        this.volumeMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.3, side: THREE.DoubleSide });

        this.useCurvedLines = false;
        this.curvedLineMaterial = new THREE.LineBasicMaterial({ color: 0x555555 });

        this.gridDivisions = 1;
        this.axisPositions = this._axisPositions(this.gridDivisions);
        this.gridPoints = [];
        this.baseSegments = [];
        this.activePointIndex = null;
        this.showPoints = true;
        this.showLines = true;
        this.symmetryGroup = null;

        this.segmentLookup = new Map();
        this.baseFaces = [];
        this.baseVolumes = [];
        this.history = [];
        this.future = [];
        this.pointLookup = new Map();
        this.pointIndexLookup = new Map();
        this.presetSelect = null;
        this.presets = [];
        this.faceCountElement = null;
        this.adjacencyGraph = new Map();

        this._addCubeFrame();
        this._setupLighting();
        this._registerEvents();
        this.updateGrid(this.gridDivisions);
        this._onResize();
        window.addEventListener('resize', () => this._onResize());

        this.renderer.setAnimationLoop(() => {
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        });
    }

    updateGrid(divisions) {
        const sanitized = Math.max(1, Math.floor(divisions || 1));
        this.gridDivisions = sanitized;
        this.axisPositions = this._axisPositions(sanitized);
        this.segmentLookup = new Map();
        this._clearSegments();
        this.history = [];
        this.future = [];
        this.activePointIndex = null;
        this.gridPoints = this._generateGridPoints();
        this._initializePresets();
        this._populatePresetOptions();
        this._updateFaceCountDisplay();
        this._rebuildSymmetryObjects();
    }

    reset() {
        this._clearSegments();
        this.history = [];
        this.future = [];
        this.activePointIndex = null;
        this._rebuildSymmetryObjects();
    }

    updateReflections({ xy, yz, zx }) {
        this.symmetry.setReflection('xy', xy);
        this.symmetry.setReflection('yz', yz);
        this.symmetry.setReflection('zx', zx);
        this._rebuildSymmetryObjects();
    }

    updateRotation(axis) {
        this.symmetry.setRotation(axis);
        this._rebuildSymmetryObjects();
    }

    updateTranslation(axis, count, step) {
        this.symmetry.setTranslation(axis, count, step);
        this._rebuildSymmetryObjects();
    }

    updateShowPoints(flag) {
        this.showPoints = Boolean(flag);
        this._rebuildSymmetryObjects();
    }

    updateShowLines(flag) {
        this.showLines = Boolean(flag);
        this._rebuildSymmetryObjects();
    }

    updateCurvedLines(flag) {
        this.useCurvedLines = Boolean(flag);
        this._rebuildSymmetryObjects();
    }

    updateInversion(flag) {
        this.symmetry.setInversion(flag);
        this._rebuildSymmetryObjects();
    }

    updateRotoreflection(config) {
        this.symmetry.setRotoreflection(config);
        this._rebuildSymmetryObjects();
    }

    updateScrew(config) {
        this.symmetry.setScrew(config);
        this._rebuildSymmetryObjects();
    }

    _generateGridPoints() {
        const points = [];
        this.pointLookup = new Map();
        this.pointIndexLookup = new Map();
        const axisValues = this.axisPositions;
        axisValues.forEach((x) => {
            axisValues.forEach((y) => {
                axisValues.forEach((z) => {
                    const point = new THREE.Vector3(x, y, z);
                    const key = this._pointKey(point);
                    this.pointLookup.set(key, point.clone());
                    this.pointIndexLookup.set(key, points.length);
                    points.push(point);
                });
            });
        });
        const hasCenter = axisValues.some((value) => Math.abs(value) < 1e-8);
        if (!hasCenter && this.gridDivisions > 1) {
            const center = new THREE.Vector3(0, 0, 0);
            const key = this._pointKey(center);
            this.pointLookup.set(key, center.clone());
            this.pointIndexLookup.set(key, points.length);
            points.push(center);
        }
        return points;
    }

    _axisPositions(divisions) {
        const count = Math.max(1, divisions);
        const segments = count;
        const step = (CUBE_HALF_SIZE * 2) / segments;
        const positions = [];
        for (let i = 0; i <= segments; i += 1) {
            const value = -CUBE_HALF_SIZE + step * i;
            positions.push(parseFloat(value.toFixed(10)));
        }
        return positions;
    }

    _formatCoord(value) {
        return value.toFixed(5);
    }

    _pointKey(vec) {
        return this._formatCoord(vec.x) + '|' + this._formatCoord(vec.y) + '|' + this._formatCoord(vec.z);
    }

    _pointKeyFromCoords(x, y, z) {
        return this._formatCoord(x) + '|' + this._formatCoord(y) + '|' + this._formatCoord(z);
    }

    _vectorFromKey(key) {
        const base = this.pointLookup.get(key);
        return base ? base.clone() : null;
    }

    _segmentKey(startVec, endVec) {
        const keys = [this._pointKey(startVec), this._pointKey(endVec)].sort();
        return keys.join('->');
    }

    _segmentKeyFromKeys(keyA, keyB) {
        const sorted = [keyA, keyB].sort();
        return sorted.join('->');
    }

    _createSegmentFromIndices(indexA, indexB) {
        if (indexA === indexB) {
            return null;
        }
        const pointA = this.gridPoints[indexA];
        const pointB = this.gridPoints[indexB];
        if (!pointA || !pointB) {
            return null;
        }
        const segment = {
            start: pointA.clone(),
            end: pointB.clone(),
        };
        segment.key = this._segmentKey(segment.start, segment.end);
        segment.indices = [indexA, indexB];
        return segment;
    }

    _createSegmentFromKeys(keyA, keyB) {
        if (!keyA || !keyB || keyA === keyB) {
            return null;
        }
        const pointA = this._vectorFromKey(keyA);
        const pointB = this._vectorFromKey(keyB);
        if (!pointA || !pointB) {
            return null;
        }
        const segment = {
            start: pointA,
            end: pointB,
        };
        segment.key = this._segmentKey(pointA, pointB);
        return segment;
    }

    _addSegments(segments) {
        const added = [];
        segments.forEach((segment) => {
            if (!segment || this.segmentLookup.has(segment.key)) {
                return;
            }
            const stored = {
                start: segment.start.clone(),
                end: segment.end.clone(),
                key: segment.key,
                indices: segment.indices ? segment.indices.slice() : null,
            };
            this.baseSegments.push(stored);
            this.segmentLookup.set(segment.key, stored);
            added.push(stored);
        });
        if (added.length) {
            this._updateFaces();
        }
        return added;
    }

    _removeSegments(segments) {
        let removed = false;
        segments.forEach((segment) => {
            if (!segment) {
                return;
            }
            const key = segment.key;
            if (!this.segmentLookup.has(key)) {
                return;
            }
            this.segmentLookup.delete(key);
            this.baseSegments = this.baseSegments.filter((existing) => existing.key !== key);
            removed = true;
        });
        if (removed) {
            this._updateFaces();
        }
        return removed;
    }

    _commitSegments(segments) {
        const added = this._addSegments(segments);
        if (!added.length) {
            return;
        }
        this._pushHistory({
            type: 'addSegments', segments: added.map((seg) => ({
                start: seg.start.clone(),
                end: seg.end.clone(),
                key: seg.key,
            }))
        });
        this.future = [];
        this._rebuildSymmetryObjects();
    }

    _pushHistory(action) {
        this.history.push(action);
        if (this.history.length > 100) {
            this.history.shift();
        }
    }

    _applyAction(action, direction) {
        if (!action) {
            return;
        }
        switch (action.type) {
            case 'addSegments':
                if (direction === 'undo') {
                    this._removeSegments(action.segments);
                } else {
                    this._addSegments(action.segments);
                }
                break;
            default:
                break;
        }
    }

    undoLastAction() {
        if (!this.history.length) {
            return;
        }
        const action = this.history.pop();
        this._applyAction(action, 'undo');
        this.future.push(action);
        this._rebuildSymmetryObjects();
    }

    redoLastAction() {
        if (!this.future.length) {
            return;
        }
        const action = this.future.pop();
        this._applyAction(action, 'redo');
        this.history.push(action);
        this._rebuildSymmetryObjects();
    }

    generateRandomForm(count = null) {
        const pointCount = this.gridPoints.length;
        if (pointCount < 2) {
            return;
        }
        const maxSegments = Math.min(pointCount, 12);
        const minSegments = Math.min(3, maxSegments);
        const targetCount = count || THREE.MathUtils.randInt(minSegments, maxSegments);
        const selected = [];
        const attempted = new Set();
        let guard = 0;
        while (selected.length < targetCount && guard < targetCount * 12) {
            guard += 1;
            const indexA = THREE.MathUtils.randInt(0, pointCount - 1);
            const indexB = THREE.MathUtils.randInt(0, pointCount - 1);
            if (indexA === indexB) {
                continue;
            }
            const pairKey = [indexA, indexB].sort((a, b) => a - b).join(':');
            if (attempted.has(pairKey)) {
                continue;
            }
            attempted.add(pairKey);
            const segment = this._createSegmentFromIndices(indexA, indexB);
            if (!segment) {
                continue;
            }
            if (this.segmentLookup.has(segment.key) || selected.some((item) => item.key === segment.key)) {
                continue;
            }
            selected.push(segment);
        }
        if (selected.length) {
            this._commitSegments(selected);
        }
    }

    applyPreset(presetId) {
        if (!this.presets || !this.presets.length) {
            return;
        }
        const preset = this.presets.find((item) => item.id === presetId);
        if (!preset || preset.id === 'none') {
            return;
        }
        const segments = preset.build ? preset.build() : [];
        if (segments.length) {
            this._commitSegments(segments);
        }
    }

    completeSurfacesAndVolumes({ closeFacesOnly = false, maxEdges = 20 } = {}) {
        this._updateFaces();
        const adjacency = new Map();
        this.adjacencyGraph.forEach((set, key) => {
            adjacency.set(key, new Set(set));
        });
        const segmentsToAdd = [];
        const plannedKeys = new Set();
        const segmentSet = new Set(this.segmentLookup.keys());
        const ensureAdjacency = (keyA, keyB) => {
            if (!adjacency.has(keyA)) {
                adjacency.set(keyA, new Set());
            }
            adjacency.get(keyA).add(keyB);
        };
        const addSegmentByKeys = (keyA, keyB) => {
            const segmentKey = this._segmentKeyFromKeys(keyA, keyB);
            if (segmentSet.has(segmentKey) || plannedKeys.has(segmentKey)) {
                return null;
            }
            const segment = this._createSegmentFromKeys(keyA, keyB);
            if (!segment) {
                return null;
            }
            const indexA = this.pointIndexLookup.get(keyA);
            const indexB = this.pointIndexLookup.get(keyB);
            if (indexA !== undefined && indexB !== undefined) {
                segment.indices = [indexA, indexB];
            }
            segment.key = segmentKey;
            plannedKeys.add(segmentKey);
            segmentsToAdd.push(segment);
            segmentSet.add(segmentKey);
            ensureAdjacency(keyA, keyB);
            ensureAdjacency(keyB, keyA);
            return segment;
        };

        const faceSet = new Set();
        adjacency.forEach((neighborsA, keyA) => {
            const arr = Array.from(neighborsA).sort();
            for (let i = 0; i < arr.length && segmentsToAdd.length < maxEdges; i += 1) {
                const keyB = arr[i];
                const neighborsB = adjacency.get(keyB);
                if (!neighborsB) continue;
                for (let j = i + 1; j < arr.length && segmentsToAdd.length < maxEdges; j += 1) {
                    const keyC = arr[j];
                    if (keyC === keyB) continue;
                    const neighborsC = adjacency.get(keyC);
                    if (!neighborsC) continue;
                    const faceKey = [keyA, keyB, keyC].sort().join('#');
                    if (faceSet.has(faceKey)) continue;
                    faceSet.add(faceKey);
                    const edgeBC = this._segmentKeyFromKeys(keyB, keyC);
                    if (segmentSet.has(edgeBC) || plannedKeys.has(edgeBC)) continue;
                    const pA = this._vectorFromKey(keyA);
                    const pB = this._vectorFromKey(keyB);
                    const pC = this._vectorFromKey(keyC);
                    if (!pA || !pB || !pC) continue;
                    const ab = new THREE.Vector3().subVectors(pB, pA);
                    const ac = new THREE.Vector3().subVectors(pC, pA);
                    const areaVec = new THREE.Vector3().crossVectors(ab, ac);
                    if (areaVec.lengthSq() < 1e-6) continue;
                    if (!neighborsB.has(keyC) || !neighborsC.has(keyB)) {
                        addSegmentByKeys(keyB, keyC);
                        if (segmentsToAdd.length >= maxEdges) break;
                    }
                }
            }
        });

        if (!closeFacesOnly && segmentsToAdd.length < maxEdges) {
            const processVolume = (keys) => {
                const missing = [];
                const pairs = [
                    [keys[0], keys[1]],
                    [keys[0], keys[2]],
                    [keys[0], keys[3]],
                    [keys[1], keys[2]],
                    [keys[1], keys[3]],
                    [keys[2], keys[3]],
                ];
                pairs.forEach(([a, b]) => {
                    const edgeKey = this._segmentKeyFromKeys(a, b);
                    if (!segmentSet.has(edgeKey) && !plannedKeys.has(edgeKey)) {
                        missing.push([a, b]);
                    }
                });
                if (missing.length === 0 || segmentsToAdd.length + missing.length > maxEdges) {
                    return;
                }
                const points = keys.map((key) => this._vectorFromKey(key));
                if (points.some((p) => !p)) {
                    return;
                }
                const [pA, pB, pC, pD] = points;
                const ab = new THREE.Vector3().subVectors(pB, pA);
                const ac = new THREE.Vector3().subVectors(pC, pA);
                const ad = new THREE.Vector3().subVectors(pD, pA);
                const triple = Math.abs(ab.dot(new THREE.Vector3().crossVectors(ac, ad))) / 6;
                if (triple < 1e-6) {
                    return;
                }
                missing.forEach(([a, b]) => {
                    addSegmentByKeys(a, b);
                });
            };

            const adjacencyCopy = adjacency;
            const keys = Array.from(adjacencyCopy.keys()).sort();
            for (let i = 0; i < keys.length && segmentsToAdd.length < maxEdges; i += 1) {
                const keyA = keys[i];
                const neighborsA = adjacencyCopy.get(keyA);
                if (!neighborsA) continue;
                const neighborsArr = Array.from(neighborsA).sort();
                for (let j = 0; j < neighborsArr.length && segmentsToAdd.length < maxEdges; j += 1) {
                    const keyB = neighborsArr[j];
                    if (keyB <= keyA) continue;
                    const neighborsB = adjacencyCopy.get(keyB);
                    if (!neighborsB) continue;
                    for (let k = j + 1; k < neighborsArr.length && segmentsToAdd.length < maxEdges; k += 1) {
                        const keyC = neighborsArr[k];
                        if (keyC <= keyB) continue;
                        const neighborsC = adjacencyCopy.get(keyC);
                        if (!neighborsC || !neighborsB.has(keyC)) continue;
                        const candidates = new Set([...neighborsA].filter((value) => neighborsB.has(value) && neighborsC.has(value)));
                        candidates.forEach((keyD) => {
                            if (keyD <= keyC || keyD === keyA || keyD === keyB) {
                                return;
                            }
                            processVolume([keyA, keyB, keyC, keyD]);
                        });
                        if (segmentsToAdd.length >= maxEdges) {
                            break;
                        }
                    }
                }
            }
        }

        if (segmentsToAdd.length) {
            this._commitSegments(segmentsToAdd);
        } else {
            this._updateFaceCountDisplay();
        }
        return segmentsToAdd.length;
    }

    registerPresetSelect(selectEl) {
        this.presetSelect = selectEl;
        this._initializePresets();
        this._populatePresetOptions();
        if (this.presetSelect) {
            this.presetSelect.addEventListener('change', () => {
                this.applyPreset(this.presetSelect.value);
            });
        }
    }

    setFaceCountElement(element) {
        this.faceCountElement = element;
        this._updateFaceCountDisplay();
    }

    _updateFaces() {
        this.baseFaces = [];
        if (this.baseSegments.length < 3) {
            this.adjacencyGraph = new Map();
            this.baseVolumes = [];
            this._updateFaceCountDisplay();
            return;
        }
        const adjacency = new Map();
        const addEdge = (a, b) => {
            if (!adjacency.has(a)) {
                adjacency.set(a, new Set());
            }
            adjacency.get(a).add(b);
        };
        this.baseSegments.forEach((segment) => {
            const keyA = this._pointKey(segment.start);
            const keyB = this._pointKey(segment.end);
            addEdge(keyA, keyB);
            addEdge(keyB, keyA);
        });
        const faceSet = new Set();
        adjacency.forEach((neighborsA, keyA) => {
            neighborsA.forEach((keyB) => {
                if (keyB <= keyA) {
                    return;
                }
                const neighborsB = adjacency.get(keyB);
                if (!neighborsB) {
                    return;
                }
                neighborsB.forEach((keyC) => {
                    if (keyC <= keyB || keyC === keyA) {
                        return;
                    }
                    const neighborsC = adjacency.get(keyC);
                    if (!neighborsC || !neighborsC.has(keyA)) {
                        return;
                    }
                    const faceKey = [keyA, keyB, keyC].sort().join('#');
                    if (faceSet.has(faceKey)) {
                        return;
                    }
                    const pA = this._vectorFromKey(keyA);
                    const pB = this._vectorFromKey(keyB);
                    const pC = this._vectorFromKey(keyC);
                    if (!pA || !pB || !pC) {
                        return;
                    }
                    const ab = new THREE.Vector3().subVectors(pB, pA);
                    const ac = new THREE.Vector3().subVectors(pC, pA);
                    const areaVec = new THREE.Vector3().crossVectors(ab, ac);
                    if (areaVec.lengthSq() < 1e-6) {
                        return;
                    }
                    faceSet.add(faceKey);
                    this.baseFaces.push({ keys: [keyA, keyB, keyC] });
                });
            });
        });

        this.adjacencyGraph = adjacency;
        this._updateVolumes(adjacency);
    }

    _updateVolumes(adjacency) {
        this.baseVolumes = [];
        if (!adjacency || this.baseFaces.length < 4) {
            return;
        }
        const volumeSet = new Set();
        const segmentSet = new Set(this.baseSegments.map((seg) => seg.key));
        const insertVolume = (keys) => {
            const sorted = [...keys].sort();
            const key = sorted.join('#');
            if (volumeSet.has(key)) {
                return;
            }
            const [keyA, keyB, keyC, keyD] = keys;
            const combos = [
                [keyA, keyB],
                [keyA, keyC],
                [keyA, keyD],
                [keyB, keyC],
                [keyB, keyD],
                [keyC, keyD],
            ];
            const missingEdge = combos.some(([a, b]) => !segmentSet.has(this._segmentKeyFromKeys(a, b)));
            if (missingEdge) {
                return;
            }
            const pA = this._vectorFromKey(keyA);
            const pB = this._vectorFromKey(keyB);
            const pC = this._vectorFromKey(keyC);
            const pD = this._vectorFromKey(keyD);
            if (!pA || !pB || !pC || !pD) {
                return;
            }
            const ab = new THREE.Vector3().subVectors(pB, pA);
            const ac = new THREE.Vector3().subVectors(pC, pA);
            const ad = new THREE.Vector3().subVectors(pD, pA);
            const triple = Math.abs(ab.dot(new THREE.Vector3().crossVectors(ac, ad))) / 6;
            if (triple < 1e-6) {
                return;
            }
            volumeSet.add(key);
            this.baseVolumes.push({ keys: [keyA, keyB, keyC, keyD] });
        };

        this.baseFaces.forEach((face) => {
            const [keyA, keyB, keyC] = face.keys;
            const neighborsA = adjacency.get(keyA);
            const neighborsB = adjacency.get(keyB);
            const neighborsC = adjacency.get(keyC);
            if (!neighborsA || !neighborsB || !neighborsC) {
                return;
            }
            neighborsA.forEach((keyD) => {
                if (keyD === keyA || keyD === keyB || keyD === keyC) {
                    return;
                }
                if (!neighborsB.has(keyD) || !neighborsC.has(keyD)) {
                    return;
                }
                const sorted = [keyA, keyB, keyC, keyD].sort();
                // Ensure deterministic ordering to avoid duplicates
                if (sorted[3] !== keyD) {
                    return;
                }
                insertVolume([keyA, keyB, keyC, keyD]);
            });
        });
    }

    _updateFaceCountDisplay() {
        if (!this.faceCountElement) {
            return;
        }
        const faceCount = this.baseFaces.length;
        const volumeCount = this.baseVolumes ? this.baseVolumes.length : 0;
        this.faceCountElement.textContent = 'Flächen: ' + faceCount + ' | Volumen: ' + volumeCount;
    }

    _clearSegments() {
        this.baseSegments = [];
        if (this.segmentLookup) {
            this.segmentLookup.clear();
        } else {
            this.segmentLookup = new Map();
        }
        this.baseFaces = [];
        this.baseVolumes = [];
        this.adjacencyGraph = new Map();
        this._updateFaces();
        this._updateFaceCountDisplay();
    }

    _populatePresetOptions() {
        if (!this.presetSelect) {
            return;
        }
        const current = this.presetSelect.value;
        this.presetSelect.innerHTML = '';
        this.presets.forEach((preset) => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.label;
            this.presetSelect.appendChild(option);
        });
        if (this.presets.some((preset) => preset.id === current)) {
            this.presetSelect.value = current;
        }
    }

    _initializePresets() {
        const half = CUBE_HALF_SIZE;
        const originKey = this._pointKeyFromCoords(0, 0, 0);
        const cornerKeys = [
            this._pointKeyFromCoords(-half, -half, -half),
            this._pointKeyFromCoords(half, -half, -half),
            this._pointKeyFromCoords(-half, half, -half),
            this._pointKeyFromCoords(half, half, -half),
            this._pointKeyFromCoords(-half, -half, half),
            this._pointKeyFromCoords(half, -half, half),
            this._pointKeyFromCoords(-half, half, half),
            this._pointKeyFromCoords(half, half, half),
        ];
        const buildFromPairs = (pairs) => {
            const segments = [];
            pairs.forEach(([a, b]) => {
                const segment = this._createSegmentFromKeys(a, b);
                if (segment) {
                    segments.push(segment);
                }
            });
            return segments;
        };
        const cubePairs = [
            [cornerKeys[0], cornerKeys[1]],
            [cornerKeys[1], cornerKeys[3]],
            [cornerKeys[3], cornerKeys[2]],
            [cornerKeys[2], cornerKeys[0]],
            [cornerKeys[4], cornerKeys[5]],
            [cornerKeys[5], cornerKeys[7]],
            [cornerKeys[7], cornerKeys[6]],
            [cornerKeys[6], cornerKeys[4]],
            [cornerKeys[0], cornerKeys[4]],
            [cornerKeys[1], cornerKeys[5]],
            [cornerKeys[2], cornerKeys[6]],
            [cornerKeys[3], cornerKeys[7]],
        ];
        const diagonalCrossPairs = [
            [cornerKeys[0], cornerKeys[7]],
            [cornerKeys[1], cornerKeys[6]],
            [cornerKeys[2], cornerKeys[5]],
            [cornerKeys[3], cornerKeys[4]],
        ];
        const tetrahedronPairs = [
            [cornerKeys[0], cornerKeys[1]],
            [cornerKeys[1], cornerKeys[7]],
            [cornerKeys[7], cornerKeys[2]],
            [cornerKeys[2], cornerKeys[0]],
            [cornerKeys[0], cornerKeys[7]],
            [cornerKeys[1], cornerKeys[2]],
        ];
        const starPairs = [
            [cornerKeys[0], originKey],
            [cornerKeys[1], originKey],
            [cornerKeys[2], originKey],
            [cornerKeys[3], originKey],
            [cornerKeys[4], originKey],
            [cornerKeys[5], originKey],
            [cornerKeys[6], originKey],
            [cornerKeys[7], originKey],
        ];
        this.presets = [
            { id: 'none', label: 'Preset wählen …', build: () => [] },
            { id: 'diagonal-cross', label: 'Diagonales Kreuz', build: () => buildFromPairs(diagonalCrossPairs) },
            { id: 'tetrahedron', label: 'Tetraeder', build: () => buildFromPairs(tetrahedronPairs) },
            { id: 'cube-frame', label: 'Würfelrahmen', build: () => buildFromPairs(cubePairs) },
            { id: 'mirror-star', label: 'Spiegelstern', build: () => buildFromPairs(starPairs) },
        ];
    }

    _addCubeFrame() {
        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
        const frameMaterial = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 });
        const frame = new THREE.LineSegments(edges, frameMaterial);
        this.scene.add(frame);
    }

    _setupLighting() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.35);
        this.scene.add(ambient);
        const directional = new THREE.DirectionalLight(0xffffff, 0.65);
        directional.position.set(1, 1, 1);
        this.scene.add(directional);
    }

    _registerEvents() {
        const canvas = this.renderer.domElement;
        canvas.addEventListener('pointerdown', (event) => this._onPointerDown(event));
        canvas.addEventListener('pointermove', (event) => this._onPointerMove(event));
        canvas.addEventListener('pointerup', (event) => this._onPointerUp(event));
        canvas.addEventListener('pointerleave', () => this._onPointerCancel());
        canvas.addEventListener('pointercancel', () => this._onPointerCancel());
    }

    _onPointerDown(event) {
        if (event.button !== 0) {
            return;
        }
        this.pointerDown = true;
        this.dragging = false;
        this.controls.autoRotate = false;
        this.pointerDownPos.set(event.clientX, event.clientY);
    }

    _onPointerMove(event) {
        if (!this.pointerDown) {
            return;
        }
        const dx = event.clientX - this.pointerDownPos.x;
        const dy = event.clientY - this.pointerDownPos.y;
        if (dx * dx + dy * dy > DRAG_THRESHOLD_SQ) {
            this.dragging = true;
        }
    }

    _onPointerUp(event) {
        if (!this.pointerDown) {
            return;
        }
        const wasDragging = this.dragging;
        this.pointerDown = false;
        this.dragging = false;
        if (wasDragging) {
            this.controls.autoRotate = true;
            return;
        }
        this._registerPointFromEvent(event);
        this.controls.autoRotate = true;
    }

    _onPointerCancel() {
        this.pointerDown = false;
        this.dragging = false;
        this.controls.autoRotate = true;
    }

    _registerPointFromEvent(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, this.camera);
        const ray = this.raycaster.ray;
        let pointIndex = this._findNearestPointOnRay(ray);

        if (pointIndex === null) {
            const intersection = new THREE.Vector3();
            if (ray.intersectBox(this.cubeBounds, intersection)) {
                pointIndex = this._findNearestGridPoint(intersection);
            }
        }

        if (pointIndex !== null) {
            this._handlePointSelection(pointIndex);
        }
    }

    _findNearestPointOnRay(ray) {
        let minDistSq = Infinity;
        let index = null;
        const thresholdSq = RAY_PICK_THRESHOLD * RAY_PICK_THRESHOLD;

        for (let i = 0; i < this.gridPoints.length; i += 1) {
            const point = this.gridPoints[i];
            const distSq = ray.distanceSqToPoint(point);
            if (distSq < minDistSq) {
                minDistSq = distSq;
                index = i;
            }
        }

        if (index !== null && minDistSq <= thresholdSq) {
            return index;
        }
        return null;
    }

    _findNearestGridPoint(position) {
        let minDistSq = Infinity;
        let index = null;
        for (let i = 0; i < this.gridPoints.length; i += 1) {
            const distSq = position.distanceToSquared(this.gridPoints[i]);
            if (distSq < minDistSq) {
                minDistSq = distSq;
                index = i;
            }
        }
        return index;
    }

    _handlePointSelection(index) {
        if (index === null) {
            return;
        }

        if (this.activePointIndex === null) {
            this.activePointIndex = index;
            this._rebuildSymmetryObjects();
            return;
        }

        if (this.activePointIndex === index) {
            this.activePointIndex = null;
            this._rebuildSymmetryObjects();
            return;
        }

        const segment = this._createSegmentFromIndices(this.activePointIndex, index);
        if (segment) {
            this._commitSegments([segment]);
        }

        this.activePointIndex = null;
        if (!segment) {
            this._rebuildSymmetryObjects();
        }
    }

    _rebuildSymmetryObjects() {
        if (this.symmetryGroup) {
            this.scene.remove(this.symmetryGroup);
            this.symmetryGroup.traverse((child) => {
                if (child.geometry && child.geometry !== this.pointGeometry && child.geometry !== this.activePointGeometry) {
                    child.geometry.dispose();
                }
            });
            this.symmetryGroup = null;
        }

        const transforms = this.symmetry.getTransforms();
        const group = new THREE.Group();
        if (this.showPoints) {
            const pointsGroup = new THREE.Group();
            transforms.forEach((matrix) => {
                this.gridPoints.forEach((pt) => {
                    const mesh = new THREE.Mesh(this.pointGeometry, this.pointMaterial);
                    mesh.position.copy(pt).applyMatrix4(matrix);
                    pointsGroup.add(mesh);
                });
            });
            group.add(pointsGroup);

            if (this.activePointIndex !== null) {
                const highlightGroup = new THREE.Group();
                const basePoint = this.gridPoints[this.activePointIndex];
                transforms.forEach((matrix) => {
                    const marker = new THREE.Mesh(this.activePointGeometry, this.activePointMaterial);
                    marker.position.copy(basePoint).applyMatrix4(matrix);
                    highlightGroup.add(marker);
                });
                group.add(highlightGroup);
            }
        }

        if (this.showLines && this.baseSegments.length) {
            if (this.useCurvedLines) {
                const lineGroup = new THREE.Group();
                transforms.forEach((matrix) => {
                    this.baseSegments.forEach((segment) => {
                        const start = segment.start.clone().applyMatrix4(matrix);
                        const end = segment.end.clone().applyMatrix4(matrix);
                        const dir = new THREE.Vector3().subVectors(end, start);
                        const length = dir.length();
                        if (length < 1e-6) {
                            return;
                        }
                        dir.normalize();
                        let normal = new THREE.Vector3(0, 1, 0).cross(dir);
                        if (normal.lengthSq() < 1e-6) {
                            normal = new THREE.Vector3(1, 0, 0).cross(dir);
                        }
                        if (normal.lengthSq() < 1e-6) {
                            normal = new THREE.Vector3(0, 0, 1);
                        }
                        normal.normalize();
                        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                        const control = mid.clone().addScaledVector(normal, length * 0.2);
                        const curve = new THREE.QuadraticBezierCurve3(start, control, end);
                        const points = curve.getPoints(16);
                        const positions = new Float32Array(points.length * 3);
                        points.forEach((pt, idx) => {
                            positions[idx * 3] = pt.x;
                            positions[idx * 3 + 1] = pt.y;
                            positions[idx * 3 + 2] = pt.z;
                        });
                        const geometry = new THREE.BufferGeometry();
                        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                        const line = new THREE.Line(geometry, this.curvedLineMaterial);
                        lineGroup.add(line);
                    });
                });
                if (lineGroup.children.length) {
                    group.add(lineGroup);
                }
            } else {
                const positions = [];
                transforms.forEach((matrix) => {
                    this.baseSegments.forEach((segment) => {
                        const start = segment.start.clone().applyMatrix4(matrix);
                        const end = segment.end.clone().applyMatrix4(matrix);
                        positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
                    });
                });

                if (positions.length) {
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                    const lines = new THREE.LineSegments(geometry, this.lineMaterial);
                    group.add(lines);
                }
            }
        }

        if (this.baseFaces.length) {
            const facePositions = [];
            transforms.forEach((matrix) => {
                this.baseFaces.forEach((face) => {
                    face.keys.forEach((key) => {
                        const vertex = this._vectorFromKey(key);
                        if (vertex) {
                            vertex.applyMatrix4(matrix);
                            facePositions.push(vertex.x, vertex.y, vertex.z);
                        }
                    });
                });
            });
            if (facePositions.length) {
                const faceGeometry = new THREE.BufferGeometry();
                faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(facePositions, 3));
                faceGeometry.computeVertexNormals();
                const mesh = new THREE.Mesh(faceGeometry, this.faceMaterial);
                group.add(mesh);
            }
        }

        if (this.baseVolumes && this.baseVolumes.length) {
            const volumePositions = [];
            transforms.forEach((matrix) => {
                this.baseVolumes.forEach((volume) => {
                    const vertices = volume.keys.map((key) => this._vectorFromKey(key));
                    if (vertices.some((v) => !v)) {
                        return;
                    }
                    const transformed = vertices.map((vertex) => vertex.applyMatrix4(matrix));
                    const [pA, pB, pC, pD] = transformed;
                    const faces = [
                        [pA, pB, pC],
                        [pA, pB, pD],
                        [pA, pC, pD],
                        [pB, pC, pD],
                    ];
                    faces.forEach(([v1, v2, v3]) => {
                        volumePositions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
                    });
                });
            });
            if (volumePositions.length) {
                const volumeGeometry = new THREE.BufferGeometry();
                volumeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(volumePositions, 3));
                volumeGeometry.computeVertexNormals();
                const volumeMesh = new THREE.Mesh(volumeGeometry, this.volumeMaterial);
                group.add(volumeMesh);
            }
        }

        this._updateFaceCountDisplay();

        this.symmetryGroup = group;
        this.scene.add(group);
    }

    _onResize() {
        const size = Math.min(INITIAL_CANVAS_SIZE, window.innerWidth - 40);
        this.renderer.setSize(size, size, false);
        const aspect = 1;
        const frustumSize = 2;
        this.camera.left = (frustumSize * aspect) / -2;
        this.camera.right = (frustumSize * aspect) / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = frustumSize / -2;
        this.camera.updateProjectionMatrix();
    }
}

function init() {
    const container = document.getElementById('canvas-container');
    if (!container) {
        return;
    }

    const app = new RaumharmonikApp(container);
    const reflections = {
        xy: document.getElementById('reflection-xy'),
        yz: document.getElementById('reflection-yz'),
        zx: document.getElementById('reflection-zx'),
    };
    const inversionEl = document.getElementById('toggle-inversion');
    const rotationAxisEl = document.getElementById('rotation-axis');
    const rotoreflectionEnabledEl = document.getElementById('rotoreflection-enabled');
    const rotoreflectionAxisEl = document.getElementById('rotoreflection-axis');
    const rotoreflectionPlaneEl = document.getElementById('rotoreflection-plane');
    const rotoreflectionAngleEl = document.getElementById('rotoreflection-angle');
    const rotoreflectionCountEl = document.getElementById('rotoreflection-count');
    const translationAxisEl = document.getElementById('translation-axis');
    const translationCountEl = document.getElementById('translation-count');
    const translationStepEl = document.getElementById('translation-step');
    const screwEnabledEl = document.getElementById('screw-enabled');
    const screwAxisEl = document.getElementById('screw-axis');
    const screwAngleEl = document.getElementById('screw-angle');
    const screwDistanceEl = document.getElementById('screw-distance');
    const screwCountEl = document.getElementById('screw-count');
    const showPointsEl = document.getElementById('toggle-points');
    const showLinesEl = document.getElementById('toggle-lines');
    const showCurvedLinesEl = document.getElementById('toggle-curved-lines');
    const gridDensityEl = document.getElementById('grid-density');
    const undoButton = document.getElementById('undo-button');
    const redoButton = document.getElementById('redo-button');
    const randomFormButton = document.getElementById('random-form-button');
    const completeShapesButton = document.getElementById('complete-shapes-button');
    const presetSelectEl = document.getElementById('preset-select');
    const faceCountEl = document.getElementById('face-count');
    const clearButton = document.getElementById('clear-button');

    if (clearButton) {
        clearButton.addEventListener('click', () => app.reset());
    }

    if (undoButton) {
        undoButton.addEventListener('click', () => app.undoLastAction());
    }

    if (redoButton) {
        redoButton.addEventListener('click', () => app.redoLastAction());
    }

    if (randomFormButton) {
        randomFormButton.addEventListener('click', () => app.generateRandomForm());
    }

    if (completeShapesButton) {
        completeShapesButton.addEventListener('click', () => app.completeSurfacesAndVolumes());
    }

    if (presetSelectEl) {
        app.registerPresetSelect(presetSelectEl);
    }

    if (faceCountEl) {
        app.setFaceCountElement(faceCountEl);
    }

    Object.values(reflections).forEach((checkbox) => {
        if (checkbox) {
            checkbox.addEventListener('change', () => {
                app.updateReflections({
                    xy: reflections.xy ? reflections.xy.checked : false,
                    yz: reflections.yz ? reflections.yz.checked : false,
                    zx: reflections.zx ? reflections.zx.checked : false,
                });
            });
        }
    });
    app.updateReflections({
        xy: reflections.xy ? reflections.xy.checked : false,
        yz: reflections.yz ? reflections.yz.checked : false,
        zx: reflections.zx ? reflections.zx.checked : false,
    });

    if (inversionEl) {
        const applyInversion = () => {
            app.updateInversion(inversionEl.checked);
        };
        inversionEl.addEventListener('change', applyInversion);
        applyInversion();
    }

    if (
        rotoreflectionEnabledEl &&
        rotoreflectionAxisEl &&
        rotoreflectionPlaneEl &&
        rotoreflectionAngleEl &&
        rotoreflectionCountEl
    ) {
        const applyRotoreflection = () => {
            app.updateRotoreflection({
                enabled: rotoreflectionEnabledEl.checked,
                axis: rotoreflectionAxisEl.value,
                plane: rotoreflectionPlaneEl.value,
                angleDeg: parseFloat(rotoreflectionAngleEl.value) || 0,
                count: parseInt(rotoreflectionCountEl.value, 10) || 0,
            });
        };
        rotoreflectionEnabledEl.addEventListener('change', applyRotoreflection);
        rotoreflectionAxisEl.addEventListener('change', applyRotoreflection);
        rotoreflectionPlaneEl.addEventListener('change', applyRotoreflection);
        rotoreflectionAngleEl.addEventListener('change', applyRotoreflection);
        rotoreflectionAngleEl.addEventListener('input', applyRotoreflection);
        rotoreflectionCountEl.addEventListener('change', applyRotoreflection);
        rotoreflectionCountEl.addEventListener('input', applyRotoreflection);
        applyRotoreflection();
    }

    if (rotationAxisEl) {
        const applyRotation = () => {
            app.updateRotation(rotationAxisEl.value);
        };
        rotationAxisEl.addEventListener('change', applyRotation);
        applyRotation();
    }

    if (translationAxisEl && translationCountEl && translationStepEl) {
        const applyTranslation = () => {
            const axis = translationAxisEl.value;
            const count = parseInt(translationCountEl.value, 10) || 0;
            const step = parseFloat(translationStepEl.value) || 0;
            app.updateTranslation(axis, count, step);
        };
        translationAxisEl.addEventListener('change', applyTranslation);
        translationCountEl.addEventListener('change', applyTranslation);
        translationCountEl.addEventListener('input', applyTranslation);
        translationStepEl.addEventListener('change', applyTranslation);
        translationStepEl.addEventListener('input', applyTranslation);
        applyTranslation();
    }

    if (screwEnabledEl && screwAxisEl && screwAngleEl && screwDistanceEl && screwCountEl) {
        const applyScrew = () => {
            app.updateScrew({
                enabled: screwEnabledEl.checked,
                axis: screwAxisEl.value,
                angleDeg: parseFloat(screwAngleEl.value) || 0,
                distance: parseFloat(screwDistanceEl.value) || 0,
                count: parseInt(screwCountEl.value, 10) || 0,
            });
        };
        screwEnabledEl.addEventListener('change', applyScrew);
        screwAxisEl.addEventListener('change', applyScrew);
        screwAngleEl.addEventListener('change', applyScrew);
        screwAngleEl.addEventListener('input', applyScrew);
        screwDistanceEl.addEventListener('change', applyScrew);
        screwDistanceEl.addEventListener('input', applyScrew);
        screwCountEl.addEventListener('change', applyScrew);
        screwCountEl.addEventListener('input', applyScrew);
        applyScrew();
    }

    if (showPointsEl) {
        const applyShowPoints = () => {
            app.updateShowPoints(showPointsEl.checked);
        };
        showPointsEl.addEventListener('change', applyShowPoints);
        applyShowPoints();
    }

    if (showLinesEl) {
        const applyShowLines = () => {
            app.updateShowLines(showLinesEl.checked);
        };
        showLinesEl.addEventListener('change', applyShowLines);
        applyShowLines();
    }

    if (showCurvedLinesEl) {
        const applyCurvedLines = () => {
            app.updateCurvedLines(showCurvedLinesEl.checked);
        };
        showCurvedLinesEl.addEventListener('change', applyCurvedLines);
        applyCurvedLines();
    }

    if (gridDensityEl) {
        const updateGrid = () => {
            const divisions = parseInt(gridDensityEl.value, 10) || 1;
            app.updateGrid(divisions);
        };
        gridDensityEl.addEventListener('change', updateGrid);
        gridDensityEl.addEventListener('input', updateGrid);
        updateGrid();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { RaumharmonikApp };