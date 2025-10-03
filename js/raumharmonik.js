import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const CUBE_HALF_SIZE = 0.5;
const INITIAL_CANVAS_SIZE = 640;
const MIN_CANVAS_SIZE = 280;
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

const APP_SNAPSHOT_VERSION = '1.0.0';

class RaumharmonikApp {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();

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

    const existingCanvas = this.container.querySelector('canvas');
    if (existingCanvas && !existingCanvas.id) {
      existingCanvas.id = 'three-canvas';
    }
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Wichtig: alpha aktivieren für Transparenz
      canvas: existingCanvas || undefined,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearAlpha(0); // Hintergrund des Renderers transparent machen
    this.renderer.setSize(INITIAL_CANVAS_SIZE, INITIAL_CANVAS_SIZE, false);
    const syncThemeToRenderer = (theme) => {
      const isDark = theme === 'dark';
      const hex = isDark ? 0x111111 : 0xf5f5f5;
      this.scene.background = new THREE.Color(hex);
      this.renderer.setClearColor(hex, 1);
    };

    this.pointGeometry = new THREE.SphereGeometry(0.01, 16, 16);
    this.pointMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.activePointGeometry = new THREE.SphereGeometry(0.014, 16, 16);
    this.activePointMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.selectionPointMaterial = new THREE.MeshBasicMaterial({ color: 0x0077ff });
    this.lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    this.curvedLineMaterial = new THREE.LineBasicMaterial({ color: 0x555555 });
    this.neutralFaceMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
    this.neutralVolumeMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    this.faceHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
    this.faceRegularMaterial = new THREE.MeshStandardMaterial({ color: 0x33ff88, transparent: true, opacity: 0.28, side: THREE.DoubleSide, emissive: 0x002200 });
    this.volumeHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    this.volumeRegularMaterial = new THREE.MeshStandardMaterial({ color: 0x33ff88, transparent: true, opacity: 0.22, side: THREE.DoubleSide, emissive: 0x002200 });
    this.highlightMaterial = new THREE.MeshStandardMaterial({ color: 0xffff66, transparent: true, opacity: 0.4, side: THREE.DoubleSide, emissive: 0x333300 });

    this.useCurvedLines = false;
    this.useCurvedSurfaces = false;
    this.curvedSurfaceSegments = 8;
    this.curvedSurfaceCurvature = 0.3;


    const applyMaterialTheme = (theme) => {
      const isDark = theme === 'dark';
      const lineHex = isDark ? 0xffffff : 0x222222;
      const pointHex = isDark ? 0xf0f0f0 : 0x111111;
      const faceHex = isDark ? 0xffffff : 0xcccccc;
      const volumeHex = isDark ? 0xffffff : 0x555555;

      this.pointMaterial.color.setHex(pointHex);
      this.pointMaterial.needsUpdate = true;
      this.activePointMaterial.color.setHex(isDark ? 0xffffff : 0x333333);
      this.activePointMaterial.needsUpdate = true;
      this.selectionPointMaterial.color.setHex(isDark ? 0xffffff : 0x000000);
      this.selectionPointMaterial.needsUpdate = true;
      this.lineMaterial.color.setHex(lineHex);
      this.curvedLineMaterial.color.setHex(lineHex);
      this.lineMaterial.needsUpdate = true;
      this.curvedLineMaterial.needsUpdate = true;

      this.neutralFaceMaterial.color.setHex(faceHex);
      this.neutralFaceMaterial.opacity = isDark ? 0.18 : 0.24;
      this.neutralFaceMaterial.transparent = true;
      this.neutralFaceMaterial.needsUpdate = true;
      this.neutralVolumeMaterial.color.setHex(volumeHex);
      this.neutralVolumeMaterial.opacity = isDark ? 0.24 : 0.32;
      this.neutralVolumeMaterial.transparent = true;
      this.neutralVolumeMaterial.needsUpdate = true;

      this.faceHighlightMaterial.color.setHex(isDark ? 0xffffff : 0xffffff);
      this.faceHighlightMaterial.opacity = isDark ? 0.22 : 0.18;
      this.faceHighlightMaterial.transparent = true;
      this.faceHighlightMaterial.needsUpdate = true;
      this.volumeHighlightMaterial.color.setHex(isDark ? 0xffffff : 0xffffff);
      this.volumeHighlightMaterial.opacity = isDark ? 0.2 : 0.16;
      this.volumeHighlightMaterial.transparent = true;
      this.volumeHighlightMaterial.needsUpdate = true;
      this.faceRegularMaterial.color.setHex(isDark ? 0xe6e6e6 : 0xbababa);
      this.faceRegularMaterial.opacity = isDark ? 0.22 : 0.26;
      this.faceRegularMaterial.transparent = true;
      this.faceRegularMaterial.needsUpdate = true;
      this.volumeRegularMaterial.color.setHex(isDark ? 0xe6e6e6 : 0xbababa);
      this.volumeRegularMaterial.opacity = isDark ? 0.24 : 0.22;
      this.volumeRegularMaterial.transparent = true;
      this.volumeRegularMaterial.needsUpdate = true;
    };

    const currentTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    syncThemeToRenderer(currentTheme);
    applyMaterialTheme(currentTheme);
    document.addEventListener('rh-theme-change', (event) => {
      const theme = event?.detail?.theme === 'dark' ? 'dark' : 'light';
      syncThemeToRenderer(theme);
      applyMaterialTheme(theme);
    });
    if (!existingCanvas) {
      this.renderer.domElement.id = 'three-canvas';
      this.container.appendChild(this.renderer.domElement);
    }

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
    this.selectionBuffer = [];
    this.selectedPointIndices = new Set();
    this.manualFaces = new Map();
    this.manualVolumes = new Map();
    this.hiddenFaces = new Set();
    this.hiddenVolumes = new Set();
    this.vertices = new Map();
    this.edges = new Map();
    this.vertexUsage = new Map();
    this.vertexIdCounter = 0;
    this.edgeIdCounter = 0;
    this.formLabelCounters = new Map();
    this.showClosedForms = true;
    this.autoCloseFaces = false;
    this.useRegularHighlight = false;
    this.pickableMeshes = [];
    this.hoveredMesh = null;
    this.hoveredOriginalMaterial = null;
    this.hoveredType = null;
    this.pointerDownHit = null;
    this._keyboardHandler = (event) => this._onKeyDown(event);
    this.snapshotVersion = APP_SNAPSHOT_VERSION;

    this._addCubeFrame();
    this._setupLighting();
    this._registerEvents();
    this.updateGrid(this.gridDivisions);
    this._onResize();
    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('keydown', this._keyboardHandler, { passive: false });

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
    this._clearHover();
    this.pointerDownHit = null;
    this._rebuildSymmetryObjects();
  }

  async loadFromFile(event) {
    const files = event.target.files;
    if (!files || !files.length) {
      return;
    }
    await this.importFromJSON(files[0]);
  }

  updateReflections({ xy, yz, zx }) {
    this.symmetry.setReflection('xy', xy);
    this.symmetry.setReflection('yz', yz);
    this.symmetry.setReflection('zx', zx);
    const added = this.applySymmetryToModel();
    if (!added) {
      this._rebuildSymmetryObjects();
    }
  }

  updateRotation(axis) {
    this.symmetry.setRotation(axis);
    const added = this.applySymmetryToModel();
    if (!added) {
      this._rebuildSymmetryObjects();
    }
  }

  updateTranslation(axis, count, step) {
    this.symmetry.setTranslation(axis, count, step);
    const added = this.applySymmetryToModel();
    if (!added) {
      this._rebuildSymmetryObjects();
    }
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

  updateCurvedSurfaces(flag) {
    this.useCurvedSurfaces = Boolean(flag);
    this._rebuildSymmetryObjects();
  }

  updateInversion(flag) {
    this.symmetry.setInversion(flag);
    const added = this.applySymmetryToModel();
    if (!added) {
      this._rebuildSymmetryObjects();
    }
  }

  updateRotoreflection(config) {
    this.symmetry.setRotoreflection(config);
    const added = this.applySymmetryToModel();
    if (!added) {
      this._rebuildSymmetryObjects();
    }
  }

  updateScrew(config) {
    this.symmetry.setScrew(config);
    const added = this.applySymmetryToModel();
    if (!added) {
      this._rebuildSymmetryObjects();
    }
  }

  updateShowClosedForms(flag) {
    this.showClosedForms = Boolean(flag);
    this._rebuildSymmetryObjects();
  }

  updateAutoCloseFaces(flag) {
    this.autoCloseFaces = Boolean(flag);
  }

  updateColorHighlight(flag) {
    this.useRegularHighlight = Boolean(flag);
    this._rebuildSymmetryObjects();
  }

  closeSelectedFace() {
    const collectFaces = () => {
      const collected = [];
      (this.baseFaces || []).forEach((face) => {
        if (!face || !Array.isArray(face.keys) || (face.keys.length !== 3 && face.keys.length !== 4)) {
          return;
        }
        const faceKey = this._faceKeyFromKeys(face.keys, face.keys.length);
        if (this.manualFaces.has(faceKey) || this.hiddenFaces.has(faceKey)) {
          return;
        }
        collected.push(face.keys.slice());
      });
      return collected;
    };

    let facesToCommit = collectFaces();
    if (!facesToCommit.length) {
      this._updateFaces();
      facesToCommit = collectFaces();
    }

    console.log(`[closeSelectedFace] Found ${facesToCommit.length} auto faces to commit.`);

    const committedFaces = [];
    facesToCommit.forEach((keys) => {
      this._commitManualFace(keys, { recordHistory: false });
      committedFaces.push(keys.slice());
    });

    console.log(`[closeSelectedFace] Committed ${committedFaces.length} faces to manual set.`);

    if (committedFaces.length > 0) {
      this._pushHistory({
        type: 'addMultipleFaces',
        faces: committedFaces.map((keys) => ({ keys })),
      });
      this.future = [];
      this._rebuildSymmetryObjects();
    } else {
      this._updateFaceCountDisplay();
    }
  }

  closeSelectedVolume() {
    const collectVolumes = () => {
      const collected = [];
      (this.baseVolumes || []).forEach((volume) => {
        if (!volume || !Array.isArray(volume.keys) || volume.keys.length < 4) {
          return;
        }
        const sortedKeys = volume.keys.slice().sort();
        const volumeKey = this._volumeKeyFromKeys(sortedKeys);
        if (this.manualVolumes.has(volumeKey) || this.hiddenVolumes.has(volumeKey)) {
          return;
        }
        const faceKeys = Array.isArray(volume.faceKeys) ? volume.faceKeys.map((fk) => fk.slice()) : [];
        if (!faceKeys.length) {
          return;
        }
        collected.push({ keys: sortedKeys, faceKeys });
      });
      return collected;
    };

    let volumesToCommit = collectVolumes();
    if (!volumesToCommit.length) {
      this._updateFaces();
      this._updateVolumes();
      volumesToCommit = collectVolumes();
    }

    console.log(`[closeSelectedVolume] Found ${volumesToCommit.length} auto volumes to commit.`);

    const committedVolumes = [];
    volumesToCommit.forEach((data) => {
      this._commitManualVolume(data.keys, { faceKeys: data.faceKeys, recordHistory: false });
      committedVolumes.push({ keys: data.keys.slice(), faceKeys: data.faceKeys.map((fk) => fk.slice()) });
    });

    console.log(`[closeSelectedVolume] Committed ${committedVolumes.length} volumes to manual set.`);

    if (committedVolumes.length > 0) {
      this._pushHistory({
        type: 'addMultipleVolumes',
        volumes: committedVolumes.map((volumeData) => ({ keys: volumeData.keys.slice() })),
      });
      this.future = [];
      this._rebuildSymmetryObjects();
    } else {
      this._updateFaceCountDisplay();
    }
  }

  _autoCloseAll() {
    this.closeSelectedFace();
    this.closeSelectedVolume();
  }

  _findClosedFaceFromSelection() {
    if (!this.selectionBuffer.length) {
      return null;
    }
    // Start search from the last selected point
    const lastSelectedIndex = this.selectionBuffer[this.selectionBuffer.length - 1];
    const startPoint = this.gridPoints[lastSelectedIndex];
    if (!startPoint) {
      return null;
    }
    const startKey = this._pointKey(startPoint);

    const neighbors = this.adjacencyGraph.get(startKey);
    if (!neighbors) {
      return null;
    }

    // --- Search for triangles (3-cycles) first ---
    const neighborKeys = Array.from(neighbors);
    if (neighbors.size >= 2) {
      for (let i = 0; i < neighborKeys.length; i++) {
        for (let j = i + 1; j < neighborKeys.length; j++) {
          const keyB = neighborKeys[i];
          const keyC = neighborKeys[j];
          const neighborsOfB = this.adjacencyGraph.get(keyB);
          if (neighborsOfB && neighborsOfB.has(keyC)) {
            return [startKey, keyB, keyC]; // Found a closed triangle
          }
        }
      }
    }

    // --- If no triangle, search for planar quadrilaterals (4-cycles) ---
    if (neighbors.size >= 2) {
      for (let i = 0; i < neighborKeys.length; i++) {
        for (let j = i + 1; j < neighborKeys.length; j++) {
          const keyB = neighborKeys[i];
          const keyD = neighborKeys[j];

          const neighborsOfB = this.adjacencyGraph.get(keyB);
          const neighborsOfD = this.adjacencyGraph.get(keyD);

          if (neighborsOfB && neighborsOfD) {
            const commonNeighbors = new Set([...neighborsOfB].filter(n => neighborsOfD.has(n)));
            commonNeighbors.delete(startKey); // Remove startKey itself

            for (const keyC of commonNeighbors) {
              const quadKeys = [startKey, keyB, keyC, keyD];
              if (this._isPlanar(quadKeys, 1e-3)) {
                return quadKeys; // Found a planar quad
              }
            }
          }
        }
      }
    }

    return null; // No closed face found of size 3 or 4
  }

  _isPlanar(keys, tolerance = 1e-4) {
    if (keys.length < 4) {
      return true; // Triangles are always planar
    }
    if (keys.length > 4) {
      // This logic only supports triangles and quads for now
      return false;
    }
    const points = keys.map((key) => this._vectorFromKey(key));
    if (points.some((p) => !p)) {
      return false;
    }

    const [p0, p1, p2, p3] = points;
    const v1 = new THREE.Vector3().subVectors(p1, p0);
    const v2 = new THREE.Vector3().subVectors(p2, p0);
    const v3 = new THREE.Vector3().subVectors(p3, p0);

    // Calculate the volume of the tetrahedron. If it's near zero, the points are coplanar.
    const volume = Math.abs(v3.dot(v1.clone().cross(v2)));
    return volume < tolerance;
  }

  _findAllClosedFaces() {
    const faces = [];
    const foundFaces = new Set();

    if (!this.adjacencyGraph) return faces;

    const keys = Array.from(this.adjacencyGraph.keys());

    // Find all triangles
    for (const keyA of keys) {
      const neighborsA = this.adjacencyGraph.get(keyA);
      if (!neighborsA) continue;
      for (const keyB of neighborsA) {
        if (keyB < keyA) continue;
        const neighborsB = this.adjacencyGraph.get(keyB);
        if (!neighborsB) continue;
        for (const keyC of neighborsB) {
          if (keyC < keyB) continue;
          if (neighborsA.has(keyC)) {
            const faceKeys = [keyA, keyB, keyC];
            const faceKey = this._faceKeyFromKeys(faceKeys, 3);
            if (!foundFaces.has(faceKey)) {
              faces.push(faceKeys);
              foundFaces.add(faceKey);
            }
          }
        }
      }
    }

    // Find all planar quads
    for (let i = 0; i < keys.length; i += 1) {
      const keyA = keys[i];
      for (let j = i + 1; j < keys.length; j += 1) {
        const keyC = keys[j];

        // Skip if A and C are directly connected (diagonal edge present)
        if (this.adjacencyGraph.get(keyA)?.has(keyC)) {
          continue;
        }

        const neighborsA = this.adjacencyGraph.get(keyA);
        const neighborsC = this.adjacencyGraph.get(keyC);
        if (!neighborsA || !neighborsC) {
          continue;
        }

        const commonNeighbors = [...neighborsA].filter((n) => neighborsC.has(n));
        if (commonNeighbors.length < 2) {
          continue;
        }

        for (let m = 0; m < commonNeighbors.length - 1; m += 1) {
          for (let n = m + 1; n < commonNeighbors.length; n += 1) {
            const keyB = commonNeighbors[m];
            const keyD = commonNeighbors[n];
            if (keyB === keyD) {
              continue;
            }

            const neighborsB = this.adjacencyGraph.get(keyB);
            const neighborsD = this.adjacencyGraph.get(keyD);
            if (!neighborsB || !neighborsD) {
              continue;
            }

            // Ensure the cycle A->B->C->D closes (i.e. all boundary edges exist).
            const hasAB = neighborsA.has(keyB) && neighborsB.has(keyA);
            const hasBC = neighborsB.has(keyC) && neighborsC.has(keyB);
            const hasCD = neighborsC.has(keyD) && neighborsD.has(keyC);
            const hasDA = neighborsD.has(keyA) && neighborsA.has(keyD);
            if (!hasAB || !hasBC || !hasCD || !hasDA) {
              continue;
            }

            const quadKeys = [keyA, keyB, keyC, keyD];
            const faceKey = this._faceKeyFromKeys(quadKeys, 4);
            if (foundFaces.has(faceKey)) {
              continue;
            }
            if (!this._isPlanar(quadKeys, 1e-3)) {
              continue;
            }
            faces.push(quadKeys);
            foundFaces.add(faceKey);
          }
        }
      }
    }
    return faces;
  }

  _orderFaceKeys(faceKeys) {
    if (!Array.isArray(faceKeys) || faceKeys.length < 3) {
      return null;
    }
    const uniqueKeys = Array.from(new Set(faceKeys));
    if (uniqueKeys.length < 3) {
      return null;
    }
    const points = uniqueKeys.map((key) => this._vectorFromKey(key));
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
  }

  _triangulatePolygonKeys(orderedKeys, normal = null) {
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
        const a = this._vectorFromKey(keyA);
        const b = this._vectorFromKey(keyB);
        const c = this._vectorFromKey(keyC);
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

  _findClosedVolumeFromSelection() {
    if (!this.selectionBuffer.length) {
      return null;
    }
    const lastSelectedIndex = this.selectionBuffer[this.selectionBuffer.length - 1];
    const startPoint = this.gridPoints[lastSelectedIndex];
    if (!startPoint) {
      return null;
    }
    const keyA = this._pointKey(startPoint);

    const neighborsA = this.adjacencyGraph.get(keyA);
    if (!neighborsA || neighborsA.size < 3) {
      return null;
    }

    const neighborKeys = Array.from(neighborsA);
    for (let i = 0; i < neighborKeys.length; i++) {
      const keyB = neighborKeys[i];
      for (let j = i + 1; j < neighborKeys.length; j++) {
        const keyC = neighborKeys[j];
        const neighborsB = this.adjacencyGraph.get(keyB);
        if (!neighborsB || !neighborsB.has(keyC)) continue;

        for (let k = j + 1; k < neighborKeys.length; k++) {
          const keyD = neighborKeys[k];
          const neighborsC = this.adjacencyGraph.get(keyC);
          if (neighborsB.has(keyD) && neighborsC && neighborsC.has(keyD)) {
            return [keyA, keyB, keyC, keyD]; // Found a closed tetrahedron
          }
        }
      }
    }
    return null;
  }

  _findAllClosedVolumes() {
    const volumes = [];
    const foundVolumes = new Set();
    if (!this.adjacencyGraph) {
      return volumes;
    }

    const faces = this._findAllClosedFaces();
    if (!faces.length) {
      return volumes;
    }

    const faceData = [];
    faces.forEach((faceKeys) => {
      const orderedInfo = this._orderFaceKeys(faceKeys);
      if (!orderedInfo || !orderedInfo.ordered) {
        return;
      }
      const { ordered, normal } = orderedInfo;
      const boundaryEdges = [];
      for (let idx = 0; idx < ordered.length; idx += 1) {
        const a = ordered[idx];
        const b = ordered[(idx + 1) % ordered.length];
        boundaryEdges.push(this._segmentKeyFromKeys(a, b));
      }
      const triangles = this._triangulatePolygonKeys(ordered, normal);
      if (!triangles.length) {
        return;
      }
      faceData.push({ ordered, boundaryEdges, triangles });
    });

    if (!faceData.length) {
      return volumes;
    }

    const edgeToFaces = new Map();
    faceData.forEach((face, index) => {
      face.boundaryEdges.forEach((edgeKey) => {
        if (!edgeToFaces.has(edgeKey)) {
          edgeToFaces.set(edgeKey, []);
        }
        edgeToFaces.get(edgeKey).push(index);
      });
    });

    const faceAdjacency = new Map();
    edgeToFaces.forEach((indices) => {
      indices.forEach((idx) => {
        if (!faceAdjacency.has(idx)) {
          faceAdjacency.set(idx, new Set());
        }
        indices.forEach((otherIdx) => {
          if (idx !== otherIdx) {
            faceAdjacency.get(idx).add(otherIdx);
          }
        });
      });
    });

    const visited = new Set();
    const tolerance = 1e-6;

    const collectComponent = (startIdx) => {
      const queue = [startIdx];
      const component = new Set();
      while (queue.length) {
        const idx = queue.shift();
        if (visited.has(idx)) {
          continue;
        }
        visited.add(idx);
        component.add(idx);
        const neighbors = faceAdjacency.get(idx);
        if (neighbors) {
          neighbors.forEach((neighbor) => {
            if (!visited.has(neighbor)) {
              queue.push(neighbor);
            }
          });
        }
      }
      return component;
    };

    const computeComponentVolume = (component) => {
      const vertexKeys = new Set();
      const triangles = [];
      component.forEach((idx) => {
        faceData[idx].ordered.forEach((key) => vertexKeys.add(key));
        faceData[idx].triangles.forEach((tri) => triangles.push(tri));
      });
      const uniqueKeys = Array.from(vertexKeys);
      if (uniqueKeys.length < 4) {
        return { volume: 0, uniqueKeys: [], triangles: [] };
      }
      const points = uniqueKeys.map((key) => this._vectorFromKey(key)).filter(Boolean);
      if (points.length !== uniqueKeys.length) {
        return { volume: 0, uniqueKeys: [], triangles: [] };
      }
      const box = new THREE.Box3();
      points.forEach((point) => box.expandByPoint(point));
      const size = new THREE.Vector3();
      box.getSize(size);
      if (size.x < tolerance || size.y < tolerance || size.z < tolerance) {
        return { volume: 0, uniqueKeys: [], triangles: [] };
      }
      const centroid = points.reduce((acc, point) => acc.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
      let approxVolume = 0;
      triangles.forEach(([keyA, keyB, keyC]) => {
        const a = this._vectorFromKey(keyA);
        const b = this._vectorFromKey(keyB);
        const c = this._vectorFromKey(keyC);
        if (!a || !b || !c) {
          return;
        }
        const va = new THREE.Vector3().subVectors(a, centroid);
        const vb = new THREE.Vector3().subVectors(b, centroid);
        const vc = new THREE.Vector3().subVectors(c, centroid);
        const triple = Math.abs(va.dot(new THREE.Vector3().crossVectors(vb, vc))) / 6;
        approxVolume += triple;
      });
      return { volume: approxVolume, uniqueKeys, triangles };
    };

    faceData.forEach((_, idx) => {
      if (visited.has(idx)) {
        return;
      }
      const component = collectComponent(idx);
      if (!component || !component.size) {
        return;
      }

      const edgeCounts = new Map();
      component.forEach((faceIdx) => {
        faceData[faceIdx].boundaryEdges.forEach((edgeKey) => {
          edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) || 0) + 1);
        });
      });

      let closed = true;
      edgeCounts.forEach((count) => {
        if (count !== 2) {
          closed = false;
        }
      });
      if (!closed) {
        return;
      }

      const { volume: approxVolume, uniqueKeys, triangles } = computeComponentVolume(component);
      if (!uniqueKeys.length || approxVolume < tolerance) {
        return;
      }

      const sortedKeys = uniqueKeys.slice().sort();
      const volumeKey = this._volumeKeyFromKeys(sortedKeys);
      if (foundVolumes.has(volumeKey)) {
        return;
      }
      foundVolumes.add(volumeKey);
      volumes.push({ keys: sortedKeys, faceKeys: triangles.map((tri) => tri.slice()) });
    });

    return volumes;
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

  getVertexLabel(vertex, bounds = this.cubeBounds, symmetryInfo = this.symmetry?.settings) {
    if (!vertex) {
      return 'Unknown';
    }
    const vector = vertex.isVector3
      ? vertex.clone()
      : new THREE.Vector3(
        Number.isFinite(vertex.x) ? vertex.x : (Array.isArray(vertex) ? vertex[0] || 0 : 0),
        Number.isFinite(vertex.y) ? vertex.y : (Array.isArray(vertex) ? vertex[1] || 0 : 0),
        Number.isFinite(vertex.z) ? vertex.z : (Array.isArray(vertex) ? vertex[2] || 0 : 0),
      );

    const tolerance = (bounds && bounds.tolerance) || 0.01;
    const axisDescriptor = (value, axis) => {
      if (Math.abs(value) <= tolerance) {
        return `${axis}0`;
      }
      return value > 0 ? `${axis}+` : `${axis}-`;
    };

    const axisCodes = [
      axisDescriptor(vector.x, 'X'),
      axisDescriptor(vector.y, 'Y'),
      axisDescriptor(vector.z, 'Z'),
    ];
    const isCenter = axisCodes.every((code) => code[1] === '0');
    const baseLabel = isCenter ? 'C' : axisCodes.join('');

    const symmetryLabels = [];
    const reflections = symmetryInfo?.reflections || {};
    const rotation = symmetryInfo?.rotation || {};

    const reflectionPlanes = [
      { key: 'xy', axis: 'z', label: 'S1' },
      { key: 'yz', axis: 'x', label: 'S2' },
      { key: 'zx', axis: 'y', label: 'S3' },
    ];
    reflectionPlanes.forEach(({ key, axis, label }) => {
      if (reflections[key] && Math.abs(vector[axis]) <= tolerance) {
        symmetryLabels.push(label);
      }
    });

    const rotationAxisMap = { x: 'R1', y: 'R2', z: 'R3' };
    if (rotation.axis && rotation.axis !== 'none' && rotation.steps > 1) {
      const axes = rotation.axis === 'all' ? ['x', 'y', 'z'] : [rotation.axis];
      axes.forEach((axis) => {
        const otherAxes = ['x', 'y', 'z'].filter((a) => a !== axis);
        const onAxis = otherAxes.every((other) => Math.abs(vector[other]) <= tolerance);
        if (onAxis) {
          const rotationLabel = rotationAxisMap[axis] || 'R';
          if (!symmetryLabels.includes(rotationLabel)) {
            symmetryLabels.push(rotationLabel);
          }
        }
      });
    }

    if (symmetryInfo?.inversion && isCenter && !symmetryLabels.includes('I1')) {
      symmetryLabels.push('I1');
    }

    if (symmetryInfo?.screw?.enabled) {
      const screw = symmetryInfo.screw;
      if (screw.axis && screw.axis !== 'none') {
        const otherAxes = ['x', 'y', 'z'].filter((a) => a !== screw.axis);
        const onAxis = otherAxes.every((other) => Math.abs(vector[other]) <= tolerance);
        if (onAxis) {
          symmetryLabels.push('H1');
        }
      }
    }

    return symmetryLabels.length ? `${baseLabel}_${symmetryLabels.join('_')}` : baseLabel;
  }

  _getNextVertexId() {
    this.vertexIdCounter += 1;
    return this.vertexIdCounter;
  }

  _getNextEdgeId() {
    this.edgeIdCounter += 1;
    return this.edgeIdCounter;
  }

  _hasVertex(key) {
    return this.vertices.has(key);
  }

  _hasEdge(edgeKey) {
    return this.edges.has(edgeKey);
  }

  _commitVertex(vector) {
    if (!vector) {
      return null;
    }
    const key = this._pointKey(vector);
    let vertex = this.vertices.get(key);
    if (!vertex) {
      vertex = {
        id: this._getNextVertexId(),
        key,
        position: vector.clone(),
      };
      this.vertices.set(key, vertex);
    }
    vertex.label = this.getVertexLabel(vector, this.cubeBounds, this.symmetry?.settings);
    if (this.pointLookup && !this.pointLookup.has(key)) {
      this.pointLookup.set(key, vertex.position.clone());
    }
    return vertex;
  }

  _incrementVertexUsage(key) {
    const current = this.vertexUsage.get(key) || 0;
    this.vertexUsage.set(key, current + 1);
  }

  _decrementVertexUsage(key) {
    if (!this.vertexUsage.has(key)) {
      return;
    }
    const next = this.vertexUsage.get(key) - 1;
    if (next <= 0) {
      this.vertexUsage.delete(key);
      this.vertices.delete(key);
    } else {
      this.vertexUsage.set(key, next);
    }
  }

  _commitEdge(segment) {
    if (!segment || !segment.start || !segment.end) {
      return null;
    }
    const startKey = this._pointKey(segment.start);
    const endKey = this._pointKey(segment.end);
    const edgeKey = this._segmentKeyFromKeys(startKey, endKey);
    if (this._hasEdge(edgeKey)) {
      return this.edges.get(edgeKey);
    }
    const startVertex = this._commitVertex(segment.start);
    const endVertex = this._commitVertex(segment.end);
    const edge = {
      id: this._getNextEdgeId(),
      key: edgeKey,
      startKey,
      endKey,
      startVertexId: startVertex ? startVertex.id : null,
      endVertexId: endVertex ? endVertex.id : null,
    };
    this.edges.set(edgeKey, edge);
    this._incrementVertexUsage(startKey);
    this._incrementVertexUsage(endKey);
    return edge;
  }

  _removeEdgeByKey(edgeKey) {
    if (!edgeKey || !this.edges.has(edgeKey)) {
      return;
    }
    const edge = this.edges.get(edgeKey);
    this.edges.delete(edgeKey);
    if (edge) {
      this._decrementVertexUsage(edge.startKey);
      this._decrementVertexUsage(edge.endKey);
    }
  }

  _collectVertexLabelsForExport({ includePositions = true, asMap = false } = {}) {
    const collection = asMap ? {} : [];
    this.vertices.forEach((vertex, key) => {
      if (!vertex || !vertex.position) {
        return;
      }
      const label = vertex.label || this.getVertexLabel(vertex.position, this.cubeBounds, this.symmetry?.settings);
      const entry = {
        key,
        label,
      };
      if (includePositions) {
        entry.position = {
          x: vertex.position.x,
          y: vertex.position.y,
          z: vertex.position.z,
        };
      }
      if (asMap) {
        collection[key] = entry;
      } else {
        collection.push(entry);
      }
    });
    return collection;
  }

  _formatVertexLabelComments(vertexLabels, format = 'obj') {
    if (!Array.isArray(vertexLabels) || !vertexLabels.length) {
      return [];
    }
    const prefix = format === 'obj' ? '# ' : '# ';
    const header = `${prefix}Vertex Labels (label = key @ x,y,z)`;
    const lines = [header];
    vertexLabels.forEach((entry) => {
      if (!entry || !entry.label) {
        return;
      }
      const pos = entry.position
        ? ` ${entry.position.x.toFixed(3)},${entry.position.y.toFixed(3)},${entry.position.z.toFixed(3)}`
        : '';
      const keyPart = entry.key ? ` ${entry.key}` : '';
      lines.push(`${prefix}${entry.label}${keyPart}${pos}`);
    });
    return lines;
  }

  _isIdentityMatrix(matrix, tolerance = 1e-8) {
    if (!matrix || !matrix.elements) {
      return false;
    }
    const identity = new THREE.Matrix4();
    const source = matrix.elements;
    const target = identity.elements;
    for (let i = 0; i < 16; i += 1) {
      if (Math.abs(source[i] - target[i]) > tolerance) {
        return false;
      }
    }
    return true;
  }

  _generateSymmetryCopies(segments) {
    if (!Array.isArray(segments) || !segments.length || !this.symmetry) {
      return [];
    }
    const transforms = this.symmetry.getTransforms();
    if (!Array.isArray(transforms) || transforms.length <= 1) {
      return [];
    }

    const validSegments = segments.filter((segment) => segment && segment.start && segment.end);
    if (!validSegments.length) {
      return [];
    }

    const existingKeys = new Set();
    if (this.segmentLookup && this.segmentLookup.size) {
      this.segmentLookup.forEach((_, key) => existingKeys.add(key));
    }
    validSegments.forEach((segment) => {
      const key = segment.key || this._segmentKey(segment.start, segment.end);
      existingKeys.add(key);
    });

    const producedKeys = new Set();
    const copies = [];

    transforms.forEach((matrix) => {
      if (this._isIdentityMatrix(matrix)) {
        return;
      }
      validSegments.forEach((segment) => {
        const start = segment.start.clone().applyMatrix4(matrix);
        const end = segment.end.clone().applyMatrix4(matrix);
        if (start.distanceToSquared(end) < 1e-10) {
          return;
        }
        const key = this._segmentKey(start, end);
        if (existingKeys.has(key) || producedKeys.has(key)) {
          return;
        }
        const clone = { start, end, key, origin: 'symmetry' };
        if (this.pointIndexLookup) {
          const startKey = this._pointKey(start);
          const endKey = this._pointKey(end);
          const indexA = this.pointIndexLookup.get(startKey);
          const indexB = this.pointIndexLookup.get(endKey);
          if (indexA !== undefined && indexB !== undefined) {
            clone.indices = [indexA, indexB];
          }
        }
        copies.push(clone);
        producedKeys.add(key);
        existingKeys.add(key);
      });
    });

    return copies;
  }

  _faceKeyFromKeys(keys, size = 3) {
    const sorted = [...keys].sort();
    if (size === 4) {
      return `quad-${sorted.join('#')}`;
    }
    return sorted.join('#');
  }

  _volumeKeyFromKeys(keys) {
    return [...keys].sort().join('#');
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

  _addSelectionIndex(index) {
    if (index === null || index === undefined) {
      return;
    }
    const existing = this.selectionBuffer.indexOf(index);
    if (existing !== -1) {
      this.selectionBuffer.splice(existing, 1);
    }
    this.selectionBuffer.push(index);
    this.selectedPointIndices.add(index);
    // Prevent unbounded growth while keeping the most recent choices handy.
    if (this.selectionBuffer.length > 16) {
      const removed = this.selectionBuffer.shift();
      if (!this.selectionBuffer.includes(removed)) {
        this.selectedPointIndices.delete(removed);
      }
    }
    if (this.autoCloseFaces && this.selectionBuffer.length >= 3) {
      this._autoCloseFromSelection();
    }
  }

  _removeSelectionIndex(index) {
    const idx = this.selectionBuffer.indexOf(index);
    if (idx !== -1) {
      this.selectionBuffer.splice(idx, 1);
    }
    if (!this.selectionBuffer.includes(index)) {
      this.selectedPointIndices.delete(index);
    }
  }

  _clearSelection() {
    this.selectionBuffer = [];
    this.selectedPointIndices.clear();
  }

  _getSelectionKeys(limit) {
    if (!limit || limit <= 0) {
      return [];
    }
    const unique = [];
    const seen = new Set();
    for (let i = this.selectionBuffer.length - 1; i >= 0 && unique.length < limit; i -= 1) {
      const index = this.selectionBuffer[i];
      if (seen.has(index)) {
        continue;
      }
      seen.add(index);
      unique.push(index);
    }
    unique.reverse();
    return unique.map((index) => {
      const point = this.gridPoints[index];
      return point ? this._pointKey(point) : null;
    }).filter(Boolean);
  }

  _hasFace(faceKey, { includeHidden = false, includeAuto = true } = {}) {
    if (!faceKey) {
      return false;
    }
    if (this.manualFaces.has(faceKey)) {
      return true;
    }
    if (includeHidden && this.hiddenFaces.has(faceKey)) {
      return true;
    }
    if (includeAuto) {
      return this.baseFaces.some((face) => face.key === faceKey);
    }
    return false;
  }

  _hasVolume(volumeKey, { includeHidden = false, includeAuto = true } = {}) {
    if (!volumeKey) {
      return false;
    }
    if (this.manualVolumes.has(volumeKey)) {
      return true;
    }
    if (includeHidden && this.hiddenVolumes.has(volumeKey)) {
      return true;
    }
    if (includeAuto) {
      return this.baseVolumes.some((volume) => volume.key === volumeKey);
    }
    return false;
  }

  _currentStateSettings() {
    return {
      gridDivisions: this.gridDivisions,
      showPoints: this.showPoints,
      showLines: this.showLines,
      useCurvedLines: this.useCurvedLines,
      useCurvedSurfaces: this.useCurvedSurfaces,
      showClosedForms: this.showClosedForms,
      autoCloseFaces: this.autoCloseFaces,
      useRegularHighlight: this.useRegularHighlight,
      symmetry: { ...this.symmetry.settings },
    };
  }

  _serializeSnapshot() {
    const segments = this.baseSegments.map((segment) => ({
      start: [segment.start.x, segment.start.y, segment.start.z],
      end: [segment.end.x, segment.end.y, segment.end.z],
      key: segment.key,
      indices: segment.indices ? segment.indices.slice() : null,
      origin: segment.origin || 'manual',
    }));
    const snapshot = {
      meta: {
        version: this.snapshotVersion,
        createdAt: new Date().toISOString(),
      },
      settings: this._currentStateSettings(),
      segments,
      manualFaces: Array.from(this.manualFaces.values()).map((face) => ({
        keys: face.keys.slice(),
        isRegular: Boolean(face.isRegular),
        source: face.source || 'manual',
      })),
      manualVolumes: Array.from(this.manualVolumes.values()).map((volume) => ({
        keys: volume.keys.slice(),
        isRegular: Boolean(volume.isRegular),
        source: volume.source || 'manual',
        faceKeys: Array.isArray(volume.faceKeys) ? volume.faceKeys.map((fk) => fk.slice()) : [],
      })),
      hiddenFaces: Array.from(this.hiddenFaces),
      hiddenVolumes: Array.from(this.hiddenVolumes),
    };
    return snapshot;
  }

  _migrateSnapshot(snapshot) {
    let effectiveSnapshot = { ...snapshot };

    // Handle wrapped snapshot: { meta:..., data: {<snapshot_content>} }
    if (effectiveSnapshot.data && typeof effectiveSnapshot.data === 'object' && effectiveSnapshot.data.settings && Array.isArray(effectiveSnapshot.data.segments)) {
      console.log('[migrateSnapshot] Detected wrapped snapshot. Unwrapping from "data" property.');
      const outerMeta = effectiveSnapshot.meta || {};
      effectiveSnapshot = effectiveSnapshot.data;
      if (!effectiveSnapshot.meta) effectiveSnapshot.meta = {};
      // Merge meta, giving preference to the outer one if keys conflict
      effectiveSnapshot.meta = { ...effectiveSnapshot.meta, ...outerMeta };
    }

    const snapshotVersion = effectiveSnapshot.meta?.version ? String(effectiveSnapshot.meta.version) : '0.0.0';
    const appVersion = this.snapshotVersion;

    if (snapshotVersion === appVersion) {
      return effectiveSnapshot; // No further migration needed
    }

    console.warn(`[migrateSnapshot] Migrating snapshot from version ${snapshotVersion} to ${appVersion}.`);

    // Ensure basic structure for older versions
    if (snapshotVersion.startsWith('0.')) {
      if (!effectiveSnapshot.meta) effectiveSnapshot.meta = { createdAt: new Date().toISOString() };
      effectiveSnapshot.meta.version = appVersion; // Stamp with new version
      if (!effectiveSnapshot.settings) effectiveSnapshot.settings = this._currentStateSettings();
      if (!effectiveSnapshot.segments) effectiveSnapshot.segments = [];
      if (!effectiveSnapshot.manualFaces) effectiveSnapshot.manualFaces = [];
      if (!effectiveSnapshot.manualVolumes) effectiveSnapshot.manualVolumes = [];
      if (!effectiveSnapshot.hiddenFaces) effectiveSnapshot.hiddenFaces = [];
      if (!effectiveSnapshot.hiddenVolumes) effectiveSnapshot.hiddenVolumes = [];
    }

    return effectiveSnapshot;
  }

  _deserializeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Invalid snapshot data');
    }

    // The migration logic now handles version mismatches. We can still log for transparency.
    const snapshotVersion = snapshot?.meta?.version || 'unknown';
    if (snapshotVersion !== this.snapshotVersion) {
      console.warn(`[deserialize] Processing snapshot version ${snapshotVersion} (app version is ${this.snapshotVersion}). The data has been migrated.`);
    }

    const { settings } = snapshot;
    const safeSettings = Object.assign({}, this._currentStateSettings(), settings || {});
    this.updateGrid(safeSettings.gridDivisions);
    this.updateShowPoints(safeSettings.showPoints);
    this.updateShowLines(safeSettings.showLines);
    this.updateCurvedLines(safeSettings.useCurvedLines);
    this.updateCurvedSurfaces(safeSettings.useCurvedSurfaces);
    this.updateShowClosedForms(safeSettings.showClosedForms);
    this.updateAutoCloseFaces(safeSettings.autoCloseFaces);
    this.updateColorHighlight(safeSettings.useRegularHighlight);

    if (safeSettings.symmetry) {
      const sym = safeSettings.symmetry;
      this.updateReflections(sym.reflections || {});
      this.updateRotation(sym.rotation ? sym.rotation.axis : 'all');
      this.updateTranslation(
        sym.translation ? sym.translation.axis : 'none',
        sym.translation ? sym.translation.count : 0,
        sym.translation ? sym.translation.step : 0.5
      );
      this.updateInversion(sym.inversion);
      this.updateRotoreflection(sym.rotoreflection || {});
      this.updateScrew(sym.screw || {});
    }

    this._clearSegments();
    this._clearSelection();

    const segmentObjects = (snapshot.segments || []).map((data) => {
      const start = new THREE.Vector3().fromArray(data.start);
      const end = new THREE.Vector3().fromArray(data.end);
      const key = data.key || this._segmentKey(start, end);
      return { start, end, key, origin: data.origin || 'manual' };
    });
    if (segmentObjects.length) {
      this._addSegments(segmentObjects);
    }

    this.manualFaces.clear();
    (snapshot.manualFaces || []).forEach((face) => {
      if (!Array.isArray(face.keys) || (face.keys.length !== 3 && face.keys.length !== 4)) {
        return;
      }
      const faceKey = this._faceKeyFromKeys(face.keys, face.keys.length);
      this.manualFaces.set(faceKey, {
        key: faceKey,
        keys: face.keys.slice(),
        source: face.source || 'manual',
        isRegular: Boolean(face.isRegular),
      });
    });

    this.manualVolumes.clear();
    (snapshot.manualVolumes || []).forEach((volume) => {
      if (!Array.isArray(volume.keys) || volume.keys.length < 4) {
        return;
      }
      const uniqueKeys = Array.from(new Set(volume.keys));
      if (uniqueKeys.length < 4) {
        return;
      }
      const sortedKeys = uniqueKeys.slice().sort();
      const volumeKey = this._volumeKeyFromKeys(sortedKeys);
      const faceKeys = Array.isArray(volume.faceKeys) && volume.faceKeys.length
        ? volume.faceKeys.map((combo) => combo.slice())
        : (sortedKeys.length === 4 ? this._volumeFaceCombinations(sortedKeys).map((combo) => combo.slice()) : []);
      if (!faceKeys.length) {
        return;
      }
      this.manualVolumes.set(volumeKey, {
        key: volumeKey,
        keys: sortedKeys,
        source: volume.source || 'manual',
        isRegular: sortedKeys.length === 4 ? Boolean(volume.isRegular) : false,
        faceKeys,
      });
    });

    this.hiddenFaces = new Set(snapshot.hiddenFaces || []);
    this.hiddenVolumes = new Set(snapshot.hiddenVolumes || []);

    this._updateFaces();
    this._rebuildSymmetryObjects();
  }

  _downloadBlob(content, filename, type = 'application/json') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  _resolveFormTypeCode(form) {
    const raw = (form && (form.type || form.kind || form.category)) || '';
    const normalized = String(raw).toLowerCase();
    if (normalized.startsWith('v')) {
      return 'V';
    }
    if (normalized.startsWith('f')) {
      return 'F';
    }
    if (Array.isArray(form?.faceKeys) || (Array.isArray(form?.keys) && form.keys.length >= 4)) {
      return 'V';
    }
    return 'F';
  }

  _resolveGridSize(form) {
    if (Number.isFinite(form?.gridSize) && form.gridSize > 0) {
      return Math.max(1, Math.round(form.gridSize));
    }
    if (Number.isFinite(form?.divisions) && form.divisions > 0) {
      return Math.max(1, Math.round(form.divisions));
    }
    return Math.max(1, Math.round(this.gridDivisions || 1));
  }

  _extractFormKeys(form) {
    if (!form || typeof form !== 'object') {
      return [];
    }
    const candidates = ['keys', 'points', 'vertices', 'indices'];
    for (let i = 0; i < candidates.length; i += 1) {
      const prop = candidates[i];
      if (Array.isArray(form[prop]) && form[prop].length) {
        return form[prop]
          .map((value) => (value && value.key ? value.key : value))
          .filter((value) => value !== null && value !== undefined);
      }
    }
    return [];
  }

  _countFormElements(form) {
    if (Number.isFinite(form?.pointCount)) {
      return Math.max(0, Math.round(form.pointCount));
    }
    if (Number.isFinite(form?.elementCount)) {
      return Math.max(0, Math.round(form.elementCount));
    }
    if (Array.isArray(form?.segments) && form.segments.length) {
      return form.segments.length;
    }
    const keys = this._extractFormKeys(form);
    if (keys.length) {
      return new Set(keys.map((value) => String(value))).size;
    }
    if (Array.isArray(form?.faceKeys) && form.faceKeys.length) {
      return new Set(form.faceKeys.flat().map((value) => String(value))).size;
    }
    return 0;
  }

  _sequenceLetters(index) {
    const base = 26;
    let value = Math.max(0, index);
    let result = '';
    do {
      const remainder = value % base;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor(value / base) - 1;
    } while (value >= 0);
    return result;
  }

  // Generates a reproducible catalog label such as F3_6A with configurable extension.
  getFormLabel(form = {}, overrides = {}) {
    const target = form && typeof form === 'object' ? form : {};
    const options = overrides && typeof overrides === 'object' ? overrides : {};
    let extension = options.extension;
    if (!extension && typeof target.extension === 'string') {
      extension = target.extension;
    }
    if (!extension || typeof extension !== 'string') {
      extension = '.json';
    }
    if (!extension.startsWith('.')) {
      extension = `.${extension}`;
    }

    let baseLabel = target.__labelBase;
    if (!baseLabel) {
      const typeCode = this._resolveFormTypeCode(target);
      const gridSize = this._resolveGridSize(target);
      const elementCount = this._countFormElements(target);
      const counterKey = `${typeCode}|${gridSize}|${elementCount}`;
      const currentIndex = this.formLabelCounters.get(counterKey) || 0;
      const suffix = this._sequenceLetters(currentIndex);
      baseLabel = `${typeCode}${gridSize}_${elementCount}${suffix}`;
      this.formLabelCounters.set(counterKey, currentIndex + 1);
      if (target && typeof target === 'object') {
        try {
          Object.defineProperty(target, '__labelBase', {
            value: baseLabel,
            writable: true,
            configurable: true,
            enumerable: false,
          });
        } catch (error) {
          target.__labelBase = baseLabel; // Fallback if defineProperty fails
        }
      }
    }

    return `${baseLabel}${extension}`;
  }

  extractFormProperties(form = {}) {
    const keys = this._extractFormKeys(form);
    const uniqueKeys = new Set(keys.map((value) => String(value)));
    const typeCode = this._resolveFormTypeCode(form);
    const isClosed = Boolean(form.isClosed || (typeCode === 'V') || (Array.isArray(form.faceKeys) && form.faceKeys.length > 0));
    return {
      type: typeCode === 'V' ? 'volume' : 'face',
      gridSize: this._resolveGridSize(form),
      uniquePointCount: uniqueKeys.size,
      elementCount: this._countFormElements(form),
      isClosed,
      symmetry: form.symmetry || form.transforms || null,
    };
  }

  // Downloads the supplied form using systematic naming; supports alternate formats via options.
  downloadForm(form = {}, extensionOrOptions = null, extraOptions = null) {
    let options = {};
    if (typeof extensionOrOptions === 'string') {
      options.extension = extensionOrOptions;
    } else if (extensionOrOptions && typeof extensionOrOptions === 'object') {
      options = { ...extensionOrOptions };
    }
    if (extraOptions && typeof extraOptions === 'object') {
      options = { ...options, ...extraOptions };
    }

    if (options.extension && typeof options.extension === 'string' && !options.extension.startsWith('.')) {
      options.extension = `.${options.extension}`;
    }

    const vertexLabels = Array.isArray(options.vertexLabels)
      ? options.vertexLabels
      : (options.includeVertexLabels === false ? [] : this._collectVertexLabelsForExport({ includePositions: true }));

    const filename = this.getFormLabel(form, { extension: options.extension });

    let content;
    let mimeType = options.mimeType;
    if (options.content !== undefined) {
      content = options.content;
      if (!mimeType) {
        mimeType = typeof content === 'string' ? 'text/plain' : 'application/octet-stream';
      }
    } else {
      const payload = {
        meta: {
          label: filename,
          generatedAt: new Date().toISOString(),
          properties: this.extractFormProperties(form),
        },
        data: options.data !== undefined ? options.data : (form && form.data !== undefined ? form.data : form),
      };
      if (vertexLabels.length) {
        payload.meta.vertexLabels = vertexLabels;
        payload.meta.properties.vertexLabels = vertexLabels;
      }
      if (options.meta && typeof options.meta === 'object') {
        payload.meta = { ...payload.meta, ...options.meta };
      }
      content = JSON.stringify(payload, null, 2);
      if (!mimeType) {
        mimeType = 'application/json';
      }
    }

    if (typeof content !== 'string') {
      content = JSON.stringify(content, null, 2);
      if (!mimeType) {
        mimeType = 'application/json';
      }
    }

    this._downloadBlob(content, filename, mimeType || 'application/octet-stream');
    return filename;
  }

  exportToJSON() {
    const snapshot = this._serializeSnapshot();
    const formInfo = {
      type: 'snapshot',
      gridSize: this.gridDivisions,
      elementCount: this.baseSegments.length + this.baseFaces.length + this.baseVolumes.length,
    };
    const vertexLabels = this._collectVertexLabelsForExport({ includePositions: true });
    this.downloadForm(formInfo, {
      extension: '.json',
      data: snapshot,
      mimeType: 'application/json',
      vertexLabels,
    });
  }

  async importFromJSON(file) {
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const migratedData = this._migrateSnapshot(data);
      this._deserializeSnapshot(migratedData);
    } catch (error) {
      console.error('Import failed:', error);
    }
  }

  _collectTriangleFaces() {
    const transforms = this.symmetry.getTransforms();
    const faceDefinitions = [];
    const faceKeySet = new Set();

    const addDefinition = (keys) => {
      if (!Array.isArray(keys) || keys.length !== 3) {
        return;
      }
      const faceKey = this._faceKeyFromKeys(keys, 3);
      if (faceKeySet.has(faceKey)) {
        return;
      }
      faceKeySet.add(faceKey);
      faceDefinitions.push(keys);
    };

    this.baseFaces.forEach((face) => addDefinition(face.keys));

    const appendVolumeFaces = (volume) => {
      if (!volume.faceKeys) {
        return;
      }
      volume.faceKeys.forEach((keys) => addDefinition(keys));
    };

    this.baseVolumes.forEach(appendVolumeFaces);

    const triangles = [];
    transforms.forEach((matrix) => {
      faceDefinitions.forEach((keys) => {
        let points;
        if (keys.length === 4) {
          // Split quad into two triangles
          const p = keys.map((k) => this._vectorFromKey(k)?.applyMatrix4(matrix));
          if (p.some((v) => !v)) return;
          triangles.push([p[0], p[1], p[2]]);
          triangles.push([p[0], p[2], p[3]]);
          return; // Continue to next face definition
        } else {
          points = keys.map((key) => {
            const base = this._vectorFromKey(key);
            return base ? base.applyMatrix4(matrix) : null;
          });
          if (points.some((p) => !p)) return;
        }
        triangles.push(points);
      });
    });

    return triangles;
  }

  _computeTriangleNormal(points) {
    if (!points || points.length !== 3) {
      return new THREE.Vector3(0, 0, 0);
    }
    const [a, b, c] = points;
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const normal = new THREE.Vector3().crossVectors(ab, ac);
    if (normal.lengthSq() < 1e-12) {
      return new THREE.Vector3(0, 0, 0);
    }
    return normal.normalize();
  }

  _collectGeometryForOBJ() {
    const vertices = [];
    const faces = [];
    const triangles = this._collectTriangleFaces();

    triangles.forEach((points) => {
      const baseIndex = vertices.length + 1;
      points.forEach((p) => {
        vertices.push(`v ${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}`);
      });
      faces.push(`f ${baseIndex} ${baseIndex + 1} ${baseIndex + 2}`);
    });

    return { vertices, faces };
  }

  exportToOBJ() {
    const { vertices, faces } = this._collectGeometryForOBJ();
    if (!vertices.length) {
      console.warn('Keine Geometrie zum Exportieren gefunden.');
      return;
    }
    const lines = [
      '# Raumharmonik OBJ Export',
      'o RaumharmonikShape',
      ...vertices,
      ...faces,
    ];
    const vertexLabels = this._collectVertexLabelsForExport({ includePositions: true });
    const labelComments = this._formatVertexLabelComments(vertexLabels, 'obj');
    const content = [
      lines[0],
      ...labelComments,
      ...lines.slice(1),
    ].join('\n');
    const formInfo = {
      type: this.baseVolumes.length ? 'volume' : 'face',
      gridSize: this.gridDivisions,
      vertices,
      faceKeys: faces,
      elementCount: faces.length,
    };
    this.downloadForm(formInfo, {
      extension: '.obj',
      content,
      mimeType: 'text/plain',
      vertexLabels,
    });
  }

  exportToSTL() {
    const triangles = this._collectTriangleFaces();
    if (!triangles.length) {
      console.warn('Keine Geometrie zum Exportieren gefunden.');
      return;
    }
    const lines = ['solid Raumharmonik'];
    triangles.forEach((points) => {
      const normal = this._computeTriangleNormal(points);
      lines.push(
        `  facet normal ${normal.x.toFixed(6)} ${normal.y.toFixed(6)} ${normal.z.toFixed(6)}`
      );
      lines.push('    outer loop');
      points.forEach((p) => {
        lines.push(`      vertex ${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}`);
      });
      lines.push('    endloop');
      lines.push('  endfacet');
    });
    lines.push('endsolid Raumharmonik');
    const vertexLabels = this._collectVertexLabelsForExport({ includePositions: true });
    const labelComments = this._formatVertexLabelComments(vertexLabels, 'stl');
    const content = [
      lines[0],
      ...labelComments,
      ...lines.slice(1),
    ].join('\n');
    const formInfo = {
      type: this.baseVolumes.length ? 'volume' : 'face',
      gridSize: this.gridDivisions,
      elementCount: triangles.length,
      faceKeys: this.baseFaces.map((face) => face.keys),
    };
    this.downloadForm(formInfo, {
      extension: '.stl',
      content,
      mimeType: 'text/plain',
      vertexLabels,
    });
  }

  _autoCloseFromSelection() {
    const keys = this._getSelectionKeys(3);
    if (keys.length !== 3) {
      return;
    }
    const faceKey = this._faceKeyFromKeys(keys, 3);
    if (this._hasFace(faceKey, { includeHidden: true })) {
      return;
    }
    this.closeSelectedFace();
  }

  _ensureSegmentsForKeys(keys) {
    const segmentsToAdd = new Map();
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const keyA = keys[i];
        const keyB = keys[j];
        const segmentKey = this._segmentKeyFromKeys(keyA, keyB);
        if (this.segmentLookup.has(segmentKey)) {
          continue;
        }
        const segment = this._createSegmentFromKeys(keyA, keyB);
        if (segment) {
          segmentsToAdd.set(segment.key, segment);
        }
      }
    }
    if (segmentsToAdd.size > 0) {
      this._commitSegments(Array.from(segmentsToAdd.values()));
    }
  }

  _commitManualFace(keys, { recordHistory = true } = {}) {
    const faceKey = this._faceKeyFromKeys(keys, keys.length);
    const faceData = {
      key: faceKey,
      keys: keys.slice(),
      source: 'manual',
    };
    faceData.isRegular = this._isEquilateralFace(keys);
    this.manualFaces.set(faceKey, faceData);
    this.hiddenFaces.delete(faceKey);
    if (recordHistory) {
      this._pushHistory({ type: 'addManualFace', faceKey, face: { ...faceData } });
      this.future = [];
    }
    this._updateFaces();
  }

  _commitManualVolume(keys, { faceKeys = null, recordHistory = true } = {}) {
    if (!Array.isArray(keys) || keys.length < 4) {
      return;
    }
    const uniqueKeys = Array.from(new Set(keys));
    if (uniqueKeys.length < 4) {
      return;
    }
    const sortedKeys = uniqueKeys.slice().sort();
    const volumeKey = this._volumeKeyFromKeys(sortedKeys);

    let resolvedFaces = Array.isArray(faceKeys) ? faceKeys.filter((fk) => Array.isArray(fk) && fk.length >= 3).map((fk) => fk.slice()) : null;
    if (!resolvedFaces || !resolvedFaces.length) {
      if (sortedKeys.length === 4) {
        resolvedFaces = this._volumeFaceCombinations(sortedKeys).map((combo) => combo.slice());
      } else {
        resolvedFaces = [];
      }
    }
    if (!resolvedFaces.length) {
      return;
    }

    const volumeData = {
      key: volumeKey,
      keys: sortedKeys.slice(),
      faceKeys: resolvedFaces,
      source: 'manual',
    };
    volumeData.isRegular = sortedKeys.length === 4 ? this._isRegularTetrahedron(sortedKeys) : false;
    this.manualVolumes.set(volumeKey, volumeData);
    this.hiddenVolumes.delete(volumeKey);
    if (recordHistory) {
      this._pushHistory({ type: 'addManualVolume', volumeKey, volume: { ...volumeData, faceKeys: resolvedFaces.map((fk) => fk.slice()) } });
      this.future = [];
    }
    this._updateFaces();
  }

  _volumeFaceCombinations(keys) {
    if (!Array.isArray(keys) || keys.length !== 4) {
      return [];
    }
    const [a, b, c, d] = keys;
    return [
      [a, b, c],
      [a, b, d],
      [a, c, d],
      [b, c, d],
    ];
  }

  _lengthBetweenKeys(keyA, keyB) {
    const pA = this._vectorFromKey(keyA);
    const pB = this._vectorFromKey(keyB);
    if (!pA || !pB) {
      return 0;
    }
    return pA.distanceTo(pB);
  }

  _isEquilateralFace(keys) {
    if (!Array.isArray(keys) || keys.length !== 3) {
      return false;
    }
    const lengths = [
      this._lengthBetweenKeys(keys[0], keys[1]),
      this._lengthBetweenKeys(keys[1], keys[2]),
      this._lengthBetweenKeys(keys[2], keys[0]),
    ];
    const avg = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    if (avg < 1e-6) {
      return false;
    }
    const tolerance = Math.max(avg * 0.02, 1e-4);
    return lengths.every((value) => Math.abs(value - avg) <= tolerance);
  }

  _isRegularTetrahedron(keys) {
    if (!Array.isArray(keys) || keys.length !== 4) {
      return false;
    }
    const edgePairs = [
      [keys[0], keys[1]],
      [keys[0], keys[2]],
      [keys[0], keys[3]],
      [keys[1], keys[2]],
      [keys[1], keys[3]],
      [keys[2], keys[3]],
    ];
    const lengths = edgePairs.map(([a, b]) => this._lengthBetweenKeys(a, b));
    const avg = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    if (avg < 1e-6) {
      return false;
    }
    const tolerance = Math.max(avg * 0.025, 1e-4);
    const edgesEqual = lengths.every((value) => Math.abs(value - avg) <= tolerance);
    if (!edgesEqual) {
      return false;
    }
    // Volume check to avoid nearly flat tetrahedra.
    const points = keys.map((key) => this._vectorFromKey(key));
    if (points.some((p) => !p)) {
      return false;
    }
    const [p0, p1, p2, p3] = points;
    const v1 = new THREE.Vector3().subVectors(p1, p0);
    const v2 = new THREE.Vector3().subVectors(p2, p0);
    const v3 = new THREE.Vector3().subVectors(p3, p0);
    const volume = Math.abs(v1.dot(new THREE.Vector3().crossVectors(v2, v3))) / 6;
    return volume > 1e-6;
  }

  _buildCurvedTriangleGeometryFromKeys(keys, options = {}) {
    if (!Array.isArray(keys) || keys.length !== 3) {
      return null;
    }
    const points = keys.map((key) => this._vectorFromKey(key));
    if (points.some((pt) => !pt)) {
      return null;
    }
    return this._buildCurvedTriangleGeometry(points, options);
  }

  _buildCurvedTriangleGeometry(points, { curvatureScale = 1 } = {}) {
    if (!Array.isArray(points) || points.length !== 3) {
      return null;
    }
    const [p0, p1, p2] = points.map((pt) => pt.clone());
    const edge01 = new THREE.Vector3().subVectors(p1, p0);
    const edge02 = new THREE.Vector3().subVectors(p2, p0);
    const normal = new THREE.Vector3().crossVectors(edge01, edge02);
    const normalLength = normal.length();
    if (normalLength < 1e-6) {
      return null;
    }
    normal.divideScalar(normalLength);

    const edge12 = new THREE.Vector3().subVectors(p2, p1);
    const avgEdgeLength = (edge01.length() + edge02.length() + edge12.length()) / 3;
    const curvature = Math.max(0, this.curvedSurfaceCurvature * curvatureScale * avgEdgeLength);

    const control01 = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5).addScaledVector(normal, curvature);
    const control12 = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5).addScaledVector(normal, curvature);
    const control20 = new THREE.Vector3().addVectors(p2, p0).multiplyScalar(0.5).addScaledVector(normal, curvature);

    const segments = Math.max(1, Math.floor(this.curvedSurfaceSegments));
    const positions = [];
    const indexMap = Array.from({ length: segments + 1 }, () => []);
    let vertexIndex = 0;

    for (let i = 0; i <= segments; i += 1) {
      for (let j = 0; j <= segments - i; j += 1) {
        const u = (segments - i - j) / segments;
        const v = i / segments;
        const w = j / segments;

        const basePoint = this._evaluateQuadraticBezierTriangle(
          p0,
          p1,
          p2,
          control01,
          control12,
          control20,
          u,
          v,
          w
        );

        const bulgeFactor = curvature === 0 ? 0 : 6 * u * v * w;
        if (bulgeFactor !== 0) {
          basePoint.addScaledVector(normal, curvature * bulgeFactor);
        }

        positions.push(basePoint.x, basePoint.y, basePoint.z);
        indexMap[i][j] = vertexIndex;
        vertexIndex += 1;
      }
    }

    const indices = [];
    for (let i = 0; i < segments; i += 1) {
      for (let j = 0; j < segments - i; j += 1) {
        const currentRow = indexMap[i];
        const nextRow = indexMap[i + 1];
        const a = currentRow[j];
        const b = nextRow && j < nextRow.length ? nextRow[j] : -1;
        const c = currentRow[j + 1];
        if (a !== undefined && b !== -1 && c !== undefined) {
          indices.push(a, b, c);
        }
        const d = nextRow && j + 1 < nextRow.length ? nextRow[j + 1] : -1;
        if (b !== -1 && c !== undefined && d !== -1) {
          indices.push(b, d, c);
        }
      }
    }

    if (!positions.length || !indices.length) {
      return null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  _evaluateQuadraticBezierTriangle(p0, p1, p2, c01, c12, c20, u, v, w) {
    const point = new THREE.Vector3();
    point.addScaledVector(p0, u * u);
    point.addScaledVector(p1, v * v);
    point.addScaledVector(p2, w * w);
    point.addScaledVector(c01, 2 * u * v);
    point.addScaledVector(c12, 2 * v * w);
    point.addScaledVector(c20, 2 * w * u);
    return point;
  }

  _buildFlatTriangleGeometryFromKeys(keys) {
    if (!Array.isArray(keys) || keys.length !== 3) {
      return null;
    }
    const vertices = keys.map((key) => this._vectorFromKey(key));
    if (vertices.some((v) => !v)) {
      return null;
    }
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(9);
    vertices.forEach((vertex, idx) => {
      positions[idx * 3] = vertex.x;
      positions[idx * 3 + 1] = vertex.y;
      positions[idx * 3 + 2] = vertex.z;
    });
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex([0, 1, 2]);
    geometry.computeVertexNormals();
    return geometry;
  }

  _addSegments(segments) {
    const added = [];
    if (!Array.isArray(segments) || !segments.length) {
      return added;
    }
    const pendingKeys = new Set();
    segments.forEach((segment) => {
      if (!segment || !segment.start || !segment.end) {
        return;
      }
      const key = segment.key || this._segmentKey(segment.start, segment.end);
      if (pendingKeys.has(key) || this.segmentLookup.has(key)) {
        return;
      }
      const stored = {
        start: segment.start.clone(),
        end: segment.end.clone(),
        key,
        indices: segment.indices ? segment.indices.slice() : null,
        origin: segment.origin || 'manual',
      };
      this.baseSegments.push(stored);
      this.segmentLookup.set(key, stored);
      added.push(stored);
      pendingKeys.add(key);

      const keyA = this._pointKey(stored.start);
      const keyB = this._pointKey(stored.end);
      if (!this.adjacencyGraph.has(keyA)) this.adjacencyGraph.set(keyA, new Set());
      if (!this.adjacencyGraph.has(keyB)) this.adjacencyGraph.set(keyB, new Set());
      this.adjacencyGraph.get(keyA).add(keyB);
      this.adjacencyGraph.get(keyB).add(keyA);

      this._commitEdge(stored);
    });
    if (added.length) {
      this._updateFaces();
    }
    return added;
  }

  _removeSegments(segments) {
    let removed = false;
    if (!Array.isArray(segments) || !segments.length) {
      return removed;
    }
    segments.forEach((segment) => {
      if (!segment) {
        return;
      }
      const key = segment.key || this._segmentKey(segment.start, segment.end);
      const stored = this.segmentLookup.get(key);
      if (!stored) {
        return;
      }

      const startVec = stored.start || segment.start;
      const endVec = stored.end || segment.end;
      const keyA = this._pointKey(startVec);
      const keyB = this._pointKey(endVec);

      this.segmentLookup.delete(key);
      this.baseSegments = this.baseSegments.filter((existing) => existing.key !== key);

      const neighborsA = this.adjacencyGraph.get(keyA);
      if (neighborsA) {
        neighborsA.delete(keyB);
        if (!neighborsA.size) {
          this.adjacencyGraph.delete(keyA);
        }
      }
      const neighborsB = this.adjacencyGraph.get(keyB);
      if (neighborsB) {
        neighborsB.delete(keyA);
        if (!neighborsB.size) {
          this.adjacencyGraph.delete(keyB);
        }
      }

      this._removeEdgeByKey(this._segmentKeyFromKeys(keyA, keyB));
      removed = true;
    });
    if (removed) {
      this._updateFaces();
    }
    return removed;
  }

  _commitSegments(segments, { applySymmetry = true } = {}) {
    const inputSegments = Array.isArray(segments)
      ? segments.filter((segment) => segment && segment.start && segment.end)
      : [];
    if (!inputSegments.length) {
      return;
    }

    let toAdd = inputSegments;
    if (applySymmetry) {
      const generated = this._generateSymmetryCopies(inputSegments);
      if (generated.length) {
        toAdd = inputSegments.concat(generated);
      }
    }

    const added = this._addSegments(toAdd);
    if (!added.length) {
      return;
    }
    this._pushHistory({ type: 'addSegments', segments: added.map((seg) => ({
      start: seg.start.clone(),
      end: seg.end.clone(),
      key: seg.key,
      origin: seg.origin,
    })) });
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
      case 'addManualFace':
        if (direction === 'undo') {
          this._removeFaceByKey(action.faceKey, { recordHistory: false });
        } else if (action.face && action.face.keys) {
          this._commitManualFace(action.face.keys, { recordHistory: false });
        }
        break;
      case 'removeManualFace':
        if (direction === 'undo' && action.face && action.face.keys) {
          this._commitManualFace(action.face.keys, { recordHistory: false });
        } else if (direction === 'redo') {
          this._removeFaceByKey(action.faceKey, { recordHistory: false });
        }
        break;
      case 'hideFace':
        if (direction === 'undo') {
          this.hiddenFaces.delete(action.faceKey);
          this._updateFaces();
          this._rebuildSymmetryObjects();
        } else {
          this.hiddenFaces.add(action.faceKey);
          this._updateFaces();
          this._rebuildSymmetryObjects();
        }
        break;
      case 'addManualVolume':
        if (direction === 'undo') {
          this._removeVolumeByKey(action.volumeKey, { recordHistory: false });
        } else if (action.volume && action.volume.keys) {
          this._commitManualVolume(action.volume.keys, { recordHistory: false });
        }
        break;
      case 'removeManualVolume':
        if (direction === 'undo' && action.volume && action.volume.keys) {
          this._commitManualVolume(action.volume.keys, { recordHistory: false });
        } else if (direction === 'redo') {
          this._removeVolumeByKey(action.volumeKey, { recordHistory: false });
        }
        break;
      case 'hideVolume':
        if (direction === 'undo') {
          this.hiddenVolumes.delete(action.volumeKey);
          this._updateFaces();
          this._rebuildSymmetryObjects();
        } else {
          this.hiddenVolumes.add(action.volumeKey);
          this._updateFaces();
          this._rebuildSymmetryObjects();
        }
        break;
      case 'addMultipleFaces':
        if (direction === 'undo') {
          action.faces.forEach(face => {
            const faceKey = this._faceKeyFromKeys(face.keys, face.keys.length);
            this._removeFaceByKey(faceKey, { recordHistory: false });
          });
        }
        // Redo is complex, so we just let the user click the button again.
        break;
      case 'addMultipleVolumes':
        if (direction === 'undo') {
          action.volumes.forEach(volume => {
            const volumeKey = this._volumeKeyFromKeys(volume.keys);
            this._removeVolumeByKey(volumeKey, { recordHistory: false });
          });
        }
        // Redo is complex, so we just let the user click the button again.
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

  applySymmetryToModel(segments = null) {
    const sourceSegments = Array.isArray(segments)
      ? segments
      : this.baseSegments.filter((segment) => segment && segment.origin === 'manual');
    if (!sourceSegments || !sourceSegments.length) {
      return 0;
    }
    const copies = this._generateSymmetryCopies(sourceSegments);
    if (!copies.length) {
      return 0;
    }
    this._commitSegments(copies, { applySymmetry: false });
    return copies.length;
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
    const detectedFaces = new Map();

    const allFoundFaces = this._findAllClosedFaces();
    allFoundFaces.forEach(faceKeys => {
      const faceKey = this._faceKeyFromKeys(faceKeys, faceKeys.length);
      if (!this.manualFaces.has(faceKey) && !this.hiddenFaces.has(faceKey)) {
        detectedFaces.set(faceKey, { key: faceKey, keys: faceKeys, source: 'auto' });
      }
    });

    const combinedFaces = [];
    detectedFaces.forEach((face) => {
      combinedFaces.push(face);
    });

    this.manualFaces.forEach((face, key) => {
      if (this.hiddenFaces.has(key)) {
        return;
      }
      if (!face || !Array.isArray(face.keys) || (face.keys.length !== 3 && face.keys.length !== 4)) {
        this.manualFaces.delete(key);
        return;
      }
      const valid = face.keys.every((pointKey) => this.pointLookup.has(pointKey));
      if (!valid) {
        this.manualFaces.delete(key);
        return;
      }
      let isRegular = false;
      if (face.keys.length === 3) {
        isRegular = this._isEquilateralFace(face.keys);
      }
      // Could add regularity check for quads here if needed
      face.isRegular = isRegular;
      const enriched = {
        key,
        keys: face.keys.slice(),
        source: 'manual',
        isRegular,
      };
      combinedFaces.push(enriched);
    });

    this.baseFaces = combinedFaces;
    this._updateVolumes();
  }

  _updateVolumes() {
    const combinedVolumes = [];
    const detectedVolumes = new Map();
    const autoVolumes = this._findAllClosedVolumes();

    autoVolumes.forEach((volume) => {
      if (!volume || !Array.isArray(volume.keys) || volume.keys.length < 4) {
        return;
      }
      const sortedKeys = volume.keys.slice().sort();
      const volumeKey = this._volumeKeyFromKeys(sortedKeys);
      if (this.manualVolumes.has(volumeKey) || this.hiddenVolumes.has(volumeKey)) {
        return;
      }
      const faceKeys = Array.isArray(volume.faceKeys) ? volume.faceKeys.map((fk) => fk.slice()) : [];
      if (!faceKeys.length) {
        return;
      }
      detectedVolumes.set(volumeKey, {
        key: volumeKey,
        keys: sortedKeys,
        faceKeys,
        source: 'auto',
        isRegular: sortedKeys.length === 4 ? this._isRegularTetrahedron(sortedKeys) : false,
      });
    });

    detectedVolumes.forEach((volume) => {
      combinedVolumes.push(volume);
    });

    this.manualVolumes.forEach((volume, key) => {
      if (this.hiddenVolumes.has(key)) {
        return;
      }
      if (!volume || !Array.isArray(volume.keys) || volume.keys.length < 4) {
        this.manualVolumes.delete(key);
        return;
      }
      const valid = volume.keys.every((pointKey) => this.pointLookup.has(pointKey));
      if (!valid) {
        this.manualVolumes.delete(key);
        return;
      }
      const faceKeys = Array.isArray(volume.faceKeys) && volume.faceKeys.length
        ? volume.faceKeys.map((combo) => combo.slice())
        : (volume.keys.length === 4 ? this._volumeFaceCombinations(volume.keys).map((combo) => combo.slice()) : []);
      if (!faceKeys.length) {
        this.manualVolumes.delete(key);
        return;
      }
      const isRegular = volume.keys.length === 4 ? this._isRegularTetrahedron(volume.keys) : false;
      volume.isRegular = isRegular;
      combinedVolumes.push({
        key,
        keys: volume.keys.slice(),
        faceKeys,
        source: 'manual',
        isRegular,
      });
    });

    this.baseVolumes = combinedVolumes;
    this._updateFaceCountDisplay();
  }

  _updateFaceCountDisplay() {
    if (!this.faceCountElement) {
      return;
    }
    const faceCount = this.baseFaces.length;
    const volumeCount = this.baseVolumes ? this.baseVolumes.length : 0;
    this.faceCountElement.textContent = 'Faces: ' + faceCount + ' | Volumes: ' + volumeCount;
  }

  _clearSegments() {
    if (this.vertices) {
      this.vertices.clear();
    } else {
      this.vertices = new Map();
    }
    if (this.edges) {
      this.edges.clear();
    } else {
      this.edges = new Map();
    }
    if (this.vertexUsage) {
      this.vertexUsage.clear();
    } else {
      this.vertexUsage = new Map();
    }
    this.vertexIdCounter = 0;
    this.edgeIdCounter = 0;
    this.baseSegments = [];
    if (this.segmentLookup) {
      this.segmentLookup.clear();
    } else {
      this.segmentLookup = new Map();
    }
    this.baseFaces = [];
    this.baseVolumes = [];
    this.adjacencyGraph = new Map();
    this.manualFaces.clear();
    this.manualVolumes.clear();
    this.hiddenFaces.clear();
    this.hiddenVolumes.clear();
    this._clearSelection();
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
    this.pointerDownHit = this._pickSceneIntersection(event);
    this.pointerDown = true;
    this.dragging = false;
    this.controls.autoRotate = false;
    this.pointerDownPos.set(event.clientX, event.clientY);
  }

  _onPointerMove(event) {
    this._handleHover(event);
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
    const hit = this._pickSceneIntersection(event);
    if (hit && this.pointerDownHit && hit.object === this.pointerDownHit.object) {
      if (this._handleShapeClick(hit)) {
        this.pointerDownHit = null;
        this.controls.autoRotate = true;
        return;
      }
    }
    this.pointerDownHit = null;
    this._registerPointFromEvent(event);
    this.controls.autoRotate = true;
  }

  _onPointerCancel() {
    this.pointerDown = false;
    this.dragging = false;
    this.controls.autoRotate = true;
    this.pointerDownHit = null;
    this._clearHover();
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

  _pickSceneIntersection(event) {
    if (!this.pickableMeshes || !this.pickableMeshes.length) {
      return null;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.pickableMeshes, false);
    if (!intersects.length) {
      return null;
    }
    const hit = intersects[0];
    return {
      object: hit.object,
      data: hit.object ? hit.object.userData || {} : {},
    };
  }

  _handleHover(event) {
    if (!event) {
      return;
    }
    if (!this.pickableMeshes.length) {
      this._clearHover();
      return;
    }
    const hit = this._pickSceneIntersection(event);
    if (!hit || !hit.data || !hit.data.type) {
      this._clearHover();
      return;
    }
    if (this.hoveredMesh === hit.object) {
      return;
    }
    this._clearHover();
    this.hoveredMesh = hit.object;
    this.hoveredOriginalMaterial = hit.object.material;
    this.hoveredType = hit.data.type;
    this.hoveredMesh.material = this.highlightMaterial;
  }

  _clearHover() {
    if (this.hoveredMesh && this.hoveredOriginalMaterial) {
      this.hoveredMesh.material = this.hoveredOriginalMaterial;
    }
    this.hoveredMesh = null;
    this.hoveredOriginalMaterial = null;
    this.hoveredType = null;
  }

  _handleShapeClick(hit) {
    if (!hit || !hit.data || !hit.data.type) {
      return false;
    }
    let handled = false;
    if (hit.data.type === 'face' && hit.data.faceKey) {
      handled = this._removeFaceByKey(hit.data.faceKey);
    }
    if (hit.data.type === 'volumeFace' && hit.data.volumeKey) {
      handled = this._removeVolumeByKey(hit.data.volumeKey) || handled;
    }
    if (handled) {
      this._clearHover();
    }
    return handled;
  }

  _removeFaceByKey(faceKey, { recordHistory = true } = {}) {
    if (!faceKey) {
      return false;
    }
    let removed = false;
    if (this.manualFaces.has(faceKey)) {
      const stored = this.manualFaces.get(faceKey);
      if (recordHistory) {
        this._pushHistory({ type: 'removeManualFace', faceKey, face: { ...stored, keys: stored.keys.slice() } });
        this.future = [];
      }
      this.manualFaces.delete(faceKey);
      removed = true;
    } else if (!this.hiddenFaces.has(faceKey)) {
      this.hiddenFaces.add(faceKey);
      if (recordHistory) {
        this._pushHistory({ type: 'hideFace', faceKey });
        this.future = [];
      }
      removed = true;
    }
    if (removed) {
      this._updateFaces();
      this._rebuildSymmetryObjects();
    }
    return removed;
  }

  _removeVolumeByKey(volumeKey, { recordHistory = true } = {}) {
    if (!volumeKey) {
      return false;
    }
    let removed = false;
    if (this.manualVolumes.has(volumeKey)) {
      const stored = this.manualVolumes.get(volumeKey);
      if (recordHistory) {
        const clonedFaceKeys = stored.faceKeys ? stored.faceKeys.map((fk) => fk.slice()) : this._volumeFaceCombinations(stored.keys).map((fk) => fk.slice());
        this._pushHistory({ type: 'removeManualVolume', volumeKey, volume: { ...stored, keys: stored.keys.slice(), faceKeys: clonedFaceKeys } });
        this.future = [];
      }
      this.manualVolumes.delete(volumeKey);
      removed = true;
    } else if (!this.hiddenVolumes.has(volumeKey)) {
      this.hiddenVolumes.add(volumeKey);
      if (recordHistory) {
        this._pushHistory({ type: 'hideVolume', volumeKey });
        this.future = [];
      }
      removed = true;
    }
    if (removed) {
      this._updateFaces();
      this._rebuildSymmetryObjects();
    }
    return removed;
  }

  _onKeyDown(event) {
    if (!event) {
      return;
    }
    const meta = event.metaKey || event.ctrlKey;
    if (!meta) {
      return;
    }
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.redoLastAction();
      } else {
        this.undoLastAction();
      }
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
      this._addSelectionIndex(index);
      this._rebuildSymmetryObjects();
      return;
    }

    if (this.activePointIndex === index) {
      this._removeSelectionIndex(index);
      this.activePointIndex = null;
      this._rebuildSymmetryObjects();
      return;
    }

    const segment = this._createSegmentFromIndices(this.activePointIndex, index);
    if (segment) {
      this._commitSegments([segment]);
    }
    this._addSelectionIndex(index);
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

    this._clearHover();
    this.pickableMeshes = [];
    this.pointerDownHit = null;
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

      if (this.selectedPointIndices.size) {
        const selectionGroup = new THREE.Group();
        const indices = Array.from(this.selectedPointIndices);
        if (this.activePointIndex !== null) {
          const idx = indices.indexOf(this.activePointIndex);
          if (idx !== -1) {
            indices.splice(idx, 1);
          }
        }
        transforms.forEach((matrix) => {
          indices.forEach((index) => {
            const basePoint = this.gridPoints[index];
            if (!basePoint) {
              return;
            }
            const marker = new THREE.Mesh(this.pointGeometry, this.selectionPointMaterial);
            marker.position.copy(basePoint).applyMatrix4(matrix);
            selectionGroup.add(marker);
          });
        });
        if (selectionGroup.children.length) {
          group.add(selectionGroup);
        }
      }
    }

    if (this.showLines && this.baseSegments.length) {
      if (this.useCurvedLines) {
        const lineGroup = new THREE.Group();
        this.baseSegments.forEach((segment) => {
          const start = segment.start.clone();
          const end = segment.end.clone();
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
        if (lineGroup.children.length) {
          group.add(lineGroup);
        }
      } else {
        const positions = [];
        this.baseSegments.forEach((segment) => {
          positions.push(
            segment.start.x,
            segment.start.y,
            segment.start.z,
            segment.end.x,
            segment.end.y,
            segment.end.z
          );
        });
        if (positions.length) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          const lines = new THREE.LineSegments(geometry, this.lineMaterial);
          group.add(lines);
        }
      }
    }

    if (this.showClosedForms && this.baseFaces.length) {
      const faceGroup = new THREE.Group();
      const baseEntries = [];
      this.baseFaces.forEach((face) => {
        if (!face || !Array.isArray(face.keys) || face.keys.length < 3) {
          return;
        }
        const triangleKeysList = [];
        if (face.keys.length === 3) {
          triangleKeysList.push(face.keys.slice());
        } else {
          const orderedInfo = this._orderFaceKeys(face.keys);
          if (!orderedInfo || !orderedInfo.ordered) {
            return;
          }
          const triangulated = this._triangulatePolygonKeys(orderedInfo.ordered, orderedInfo.normal);
          triangulated.forEach((tri) => triangleKeysList.push(tri));
        }
        triangleKeysList.forEach((triangleKeys) => {
          let geometry;
          if (this.useCurvedSurfaces) {
            geometry = this._buildCurvedTriangleGeometryFromKeys(triangleKeys);
          } else {
            geometry = this._buildFlatTriangleGeometryFromKeys(triangleKeys);
          }
          if (geometry) {
            baseEntries.push({ geometry, face });
          }
        });
      });
      if (baseEntries.length) {
        baseEntries.forEach(({ geometry, face }) => {
          const patch = geometry.clone();
          patch.computeVertexNormals();
          const material = this.useRegularHighlight
            ? (face.isRegular ? this.faceRegularMaterial : this.faceHighlightMaterial)
            : this.neutralFaceMaterial;
          const mesh = new THREE.Mesh(patch, material);
          mesh.userData = {
            type: 'face',
            faceKey: face.key,
            source: face.source,
          };
          this.pickableMeshes.push(mesh);
          faceGroup.add(mesh);
        });
      }
      baseEntries.forEach(({ geometry }) => geometry.dispose());
      if (faceGroup.children.length) {
        group.add(faceGroup);
      }
    }

    if (this.showClosedForms && this.baseVolumes && this.baseVolumes.length) {
      const volumeGroup = new THREE.Group();
      const baseEntries = [];
      this.baseVolumes.forEach((volume) => {
        if (!volume.faceKeys || !volume.faceKeys.length) {
          return;
        }
        volume.faceKeys.forEach((faceKeys) => {
          let triangles = [];
          if (Array.isArray(faceKeys) && faceKeys.length === 3) {
            triangles = [faceKeys.slice()];
          } else if (Array.isArray(faceKeys) && faceKeys.length > 3) {
            const orderedInfo = this._orderFaceKeys(faceKeys);
            if (orderedInfo && orderedInfo.ordered) {
              triangles = this._triangulatePolygonKeys(orderedInfo.ordered, orderedInfo.normal);
            }
          }
          if (!triangles.length) {
            return;
          }
          triangles.forEach((triangleKeys) => {
            let geometry;
            if (this.useCurvedSurfaces) {
              geometry = this._buildCurvedTriangleGeometryFromKeys(triangleKeys, { curvatureScale: 1.1 });
            } else {
              geometry = this._buildFlatTriangleGeometryFromKeys(triangleKeys);
            }
            if (geometry) {
              baseEntries.push({ geometry, volume, faceKeys: triangleKeys });
            }
          });
        });
      });
      if (baseEntries.length) {
        baseEntries.forEach(({ geometry, volume, faceKeys }) => {
          const patch = geometry.clone();
          patch.computeVertexNormals();
          const material = this.useRegularHighlight
            ? (volume.isRegular ? this.volumeRegularMaterial : this.volumeHighlightMaterial)
            : this.neutralVolumeMaterial;
          const mesh = new THREE.Mesh(patch, material);
          mesh.userData = {
            type: 'volumeFace',
            volumeKey: volume.key,
            faceKey: faceKeys.slice().sort().join('#'),
            source: volume.source,
          };
          this.pickableMeshes.push(mesh);
          volumeGroup.add(mesh);
        });
      }
      baseEntries.forEach(({ geometry }) => geometry.dispose());
      if (volumeGroup.children.length) {
        group.add(volumeGroup);
      }
    }

    this._updateFaceCountDisplay();

    this.symmetryGroup = group;
    this.scene.add(group);
  }

  _onResize() {
    const bounds = this.container.getBoundingClientRect();
    const available = Math.min(
      bounds.width || INITIAL_CANVAS_SIZE,
      bounds.height || INITIAL_CANVAS_SIZE,
    );
    const size = Math.max(MIN_CANVAS_SIZE, Math.min(INITIAL_CANVAS_SIZE, available));
    this.renderer.setSize(size, size, false);
    const canvas = this.renderer.domElement;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
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
  const showCurvedSurfacesEl = document.getElementById('toggle-curved-surfaces');
  const colorHighlightEl = document.getElementById('toggle-color-highlights');
  const closeFaceButton = document.getElementById('close-face-button');
  const closeVolumeButton = document.getElementById('close-volume-button');
  const showClosedEl = document.getElementById('toggle-show-closed');
  const autoCloseEl = document.getElementById('toggle-auto-close');
  const gridDensityEl = document.getElementById('grid-density');
  const undoButton = document.getElementById('undo-button');
  const redoButton = document.getElementById('redo-button');
  const randomFormButton = document.getElementById('random-form-button');
  const exportJsonButton = document.getElementById('export-json-button');
  const importJsonButton = document.getElementById('import-json-button');
  const exportObjButton = document.getElementById('export-obj-button');
  const exportStlButton = document.getElementById('export-stl-button');
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

  if (exportJsonButton) {
    exportJsonButton.addEventListener('click', () => app.exportToJSON());
  }

  if (importJsonButton) {
    importJsonButton.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.addEventListener('change', async (event) => {
        try {
          await app.loadFromFile(event);
        } catch (error) {
          console.error('Import fehlgeschlagen:', error);
        }
      }, { once: true });
      input.click();
    });
  }

  if (exportObjButton) {
    exportObjButton.addEventListener('click', () => app.exportToOBJ());
  }

  if (exportStlButton) {
    exportStlButton.addEventListener('click', () => app.exportToSTL());
  }

  if (closeFaceButton) {
    closeFaceButton.addEventListener('click', () => app.closeSelectedFace());
  }

  if (closeVolumeButton) {
    closeVolumeButton.addEventListener('click', () => app.closeSelectedVolume());
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

  if (showCurvedSurfacesEl) {
    const applyCurvedSurfaces = () => {
      app.updateCurvedSurfaces(showCurvedSurfacesEl.checked);
    };
    showCurvedSurfacesEl.addEventListener('change', applyCurvedSurfaces);
    applyCurvedSurfaces();
  }

  if (colorHighlightEl) {
    const applyColorHighlight = () => {
      app.updateColorHighlight(colorHighlightEl.checked);
    };
    colorHighlightEl.addEventListener('change', applyColorHighlight);
    applyColorHighlight();
  }

  if (showClosedEl) {
    const applyShowClosed = () => {
      app.updateShowClosedForms(showClosedEl.checked);
    };
    showClosedEl.addEventListener('change', applyShowClosed);
    applyShowClosed();
  }

  if (autoCloseEl) {
    const applyAutoClose = () => {
      app.updateAutoCloseFaces(autoCloseEl.checked);
    };
    autoCloseEl.addEventListener('change', applyAutoClose);
    applyAutoClose();
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
