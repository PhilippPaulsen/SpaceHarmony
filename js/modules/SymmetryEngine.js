import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';
import { GeometryUtils } from './GeometryUtils.js';

export class SymmetryEngine {
  constructor() {
    this.settings = {
      reflections: {
        xy: true,
        yz: true,
        zx: true,
        xy_diag: false,
        yz_diag: false,
        zx_diag: false,
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

    // Cache for named symmetry groups to avoid re-calculation
    this._groupCache = new Map();
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
    if (reflections.xy_diag) {
      transforms = this._expand(transforms, this._reflectionMatrix('xy_diag'));
    }
    if (reflections.yz_diag) {
      transforms = this._expand(transforms, this._reflectionMatrix('yz_diag'));
    }
    if (reflections.zx_diag) {
      transforms = this._expand(transforms, this._reflectionMatrix('zx_diag'));
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
      transforms = this._expand(transforms, this.applyInversion());
    }

    const roto = this.settings.rotoreflection;
    if (
      roto.enabled &&
      roto.axis !== 'none' &&
      roto.plane !== 'none' &&
      roto.count > 0
    ) {
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
    const matrix = new THREE.Matrix4();
    switch (plane) {
      case 'xy':
        return matrix.makeScale(1, 1, -1);
      case 'yz':
        return matrix.makeScale(-1, 1, 1);
      case 'zx':
        return matrix.makeScale(1, -1, 1);
      case 'xy_diag':
        return matrix.set(
          0, 1, 0, 0,
          1, 0, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        );
      case 'yz_diag':
        return matrix.set(
          1, 0, 0, 0,
          0, 0, 1, 0,
          0, 1, 0, 0,
          0, 0, 0, 1
        );
      case 'zx_diag':
        return matrix.set(
          0, 0, 1, 0,
          0, 1, 0, 0,
          1, 0, 0, 0,
          0, 0, 0, 1
        );
      default:
        return matrix.identity();
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

  applyInversion() {
    return new THREE.Matrix4().makeScale(-1, -1, -1);
  }

  applyRotoreflection(axis, angleRad, plane) {
    if (!axis || axis === 'none' || !plane || plane === 'none') {
      return null;
    }
    const rotation = this._rotationMatrix(axis, angleRad);
    const reflection = this._reflectionMatrix(plane);
    return reflection.clone().multiply(rotation);
  }

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
    const unique = [];
    const eps = 1e-5;

    for (let i = 0; i < transforms.length; i++) {
      const candidate = transforms[i];
      let isDuplicate = false;

      // Check against already found unique matrices
      for (let j = 0; j < unique.length; j++) {
        const existing = unique[j];

        let match = true;
        // Compare elements
        for (let k = 0; k < 16; k++) {
          if (Math.abs(candidate.elements[k] - existing.elements[k]) > eps) {
            match = false;
            break;
          }
        }

        if (match) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        unique.push(candidate);
      }
    }
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

  // --- Symmetry Groups Support ---

  getSymmetryGroup(groupName) {
    if (this._groupCache.has(groupName)) {
      // Return a deep copy to prevent mutation of cached matrices if caller modifies them
      return this._groupCache.get(groupName).map(m => m.clone());
    }

    const matrices = this._generateGroupMatrices(groupName);
    this._groupCache.set(groupName, matrices);
    return matrices.map(m => m.clone());
  }

  _generateGroupMatrices(groupName) {
    let matrices = [new THREE.Matrix4().identity()];

    if (groupName === 'cubic') {
      // Full Octahedral Symmetry (Oh)
      const generators = [
        this._rotationMatrix('x', Math.PI / 2), // 90 deg x
        this._rotationMatrix('y', Math.PI / 2), // 90 deg y
      ];

      let groupO = this._generateGroupFromGenerators(generators);

      const inversion = this.applyInversion();
      const groupOh = [...groupO];
      groupO.forEach(m => {
        groupOh.push(m.clone().multiply(inversion));
      });

      return this._deduplicate(groupOh);
    }

    if (groupName === 'tetrahedral') {
      // Td
      const r2x = this._rotationMatrix('x', Math.PI);
      const r3 = new THREE.Matrix4().set(
        0, 0, 1, 0,
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 0, 1
      );

      const groupT = this._generateGroupFromGenerators([r2x, r3]);
      const mirror = this._reflectionMatrix('xy_diag');

      const groupTd = this._generateGroupFromGenerators([...groupT, mirror]);
      return this._deduplicate(groupTd);
    }

    return matrices;
  }

  _generateGroupFromGenerators(generators) {
    const group = [new THREE.Matrix4().identity()];
    // Use simple array for temporary storage, deduplicate handles checking

    // We can't rely on Set for objects, so we do an iterative expansion

    let changed = true;
    let iterations = 0;

    // Safety break
    while (changed && iterations < 12) {
      changed = false;
      const currentLen = group.length;
      const newFound = [];

      for (let i = 0; i < currentLen; i++) {
        for (const gen of generators) {
          const product = group[i].clone().multiply(gen);
          newFound.push(product);
        }
      }

      // Merge and dedup
      const potential = [...group, ...newFound];
      const unique = this._deduplicate(potential);

      if (unique.length > group.length) {
        // Replace group with strictly larger unique set
        group.length = 0;
        group.push(...unique);
        changed = true;
      }

      iterations++;
    }
    return group;
  }
}
