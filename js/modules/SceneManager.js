import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CONFIG } from './Config.js';

export class SceneManager {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.init();
    }

    init() {
        this._setupCamera();
        this._setupRenderer();
        this._setupControls();
        this._setupLighting();
        this._setupLighting();
        this.updateFrame('cubic');

        window.addEventListener('resize', () => this.onResize());
    }

    _setupCamera() {
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
    }

    _setupRenderer() {
        const existingCanvas = this.container.querySelector('canvas');
        if (existingCanvas && !existingCanvas.id) {
            existingCanvas.id = 'three-canvas';
        }

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            canvas: existingCanvas || undefined,
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearAlpha(0);
        this.renderer.setSize(CONFIG.INITIAL_CANVAS_SIZE, CONFIG.INITIAL_CANVAS_SIZE, false); // Initial estimate

        if (!existingCanvas) {
            this.renderer.domElement.id = 'three-canvas';
            this.container.appendChild(this.renderer.domElement);
        }
    }

    _setupControls() {
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
    }

    _setupLighting() {
        // 1. Ambient Light (Softer base)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        // 2. Key Light (Warm Main Source - Top Right Front)
        const keyLight = new THREE.DirectionalLight(0xffffee, 1.0);
        keyLight.position.set(5, 8, 5);
        this.scene.add(keyLight);

        // 3. Fill Light (Cool Side Source - Left) - Adds color contrast to defined edges
        const fillLight = new THREE.DirectionalLight(0xddeeff, 0.6);
        fillLight.position.set(-5, 3, 5);
        this.scene.add(fillLight);

        // 4. Rim Light (Backlight) - Highlights the silhouette
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
        rimLight.position.set(0, 5, -5);
        this.scene.add(rimLight);
    }



    updateFrame(type = 'cubic') {
        if (this.cubeFrame) {
            this.scene.remove(this.cubeFrame);
            this.cubeFrame.geometry.dispose();
            this.cubeFrame.material.dispose();
            this.cubeFrame = null;
        }

        let geometry;
        if (type === 'icosahedral') {
            // Construct manually to ensure 100% alignment with GridSystem points
            const scale = CONFIG.CUBE_HALF_SIZE;
            const effectiveScale = scale * Math.sqrt(3); // Match the new grid scaling
            const phi = (1 + Math.sqrt(5)) / 2;

            // Same raw vertices as GridSystem
            const t = phi;
            const rawVertices = [
                new THREE.Vector3(-1, t, 0), new THREE.Vector3(1, t, 0), new THREE.Vector3(-1, -t, 0), new THREE.Vector3(1, -t, 0),
                new THREE.Vector3(0, -1, t), new THREE.Vector3(0, 1, t), new THREE.Vector3(0, -1, -t), new THREE.Vector3(0, 1, -t),
                new THREE.Vector3(t, 0, -1), new THREE.Vector3(t, 0, 1), new THREE.Vector3(-t, 0, -1), new THREE.Vector3(-t, 0, 1)
            ];

            const vertices = rawVertices.map(v => v.clone().normalize().multiplyScalar(effectiveScale));

            // Create convex hull edges or explicit connections
            // Explicit Icosahedron Edges (indices)
            // Derived from proximity (~1.05 * R)
            geometry = new THREE.BufferGeometry().setFromPoints(vertices);

            const indices = [];

            // Distance on unit sphere is ~1.05. Scale it up by effectiveScale.
            // 1.1 is a safe upper bound factor for 1.05
            const distSqThreshold = (1.1 * 1.1) * effectiveScale * effectiveScale;

            for (let i = 0; i < vertices.length; i++) {
                for (let j = i + 1; j < vertices.length; j++) {
                    if (vertices[i].distanceToSquared(vertices[j]) < distSqThreshold) {
                        indices.push(i, j);
                    }
                }
            }
            geometry.setIndex(indices);

            // For Icosahedral, we already built the wireframe indices manually.
            // Using EdgesGeometry on a line-only geometry is invalid/undefined behavior.
            const theme = document.documentElement.dataset.theme || 'light';
            const color = theme === 'dark' ? 0x444444 : 0xcccccc;
            const material = new THREE.LineBasicMaterial({ color: color });

            this.cubeFrame = new THREE.LineSegments(geometry, material);
            this.scene.add(this.cubeFrame);
            this.scene.add(this.cubeFrame);
            return; // Skip the BoxGeometry path
        } else if (type === 'tetrahedral') {
            const size = CONFIG.CUBE_HALF_SIZE;
            const vertices = [
                new THREE.Vector3(1, 1, 1),
                new THREE.Vector3(-1, -1, 1),
                new THREE.Vector3(-1, 1, -1),
                new THREE.Vector3(1, -1, -1)
            ].map(v => v.multiplyScalar(size));

            // Edges: 0-1, 0-2, 0-3, 1-2, 1-3, 2-3
            const indices = [
                0, 1, 0, 2, 0, 3,
                1, 2, 1, 3,
                2, 3
            ];

            geometry = new THREE.BufferGeometry().setFromPoints(vertices);
            geometry.setIndex(indices);

            // Tetrahedral Frame
            const theme = document.documentElement.dataset.theme || 'light';
            const color = theme === 'dark' ? 0x444444 : 0xcccccc;
            const material = new THREE.LineBasicMaterial({ color: color });

            this.cubeFrame = new THREE.LineSegments(geometry, material);
            this.scene.add(this.cubeFrame);
            return;
        } else {
            const size = CONFIG.CUBE_HALF_SIZE;
            geometry = new THREE.BoxGeometry(size * 2, size * 2, size * 2);
        }

        const edges = new THREE.EdgesGeometry(geometry);
        const theme = document.documentElement.dataset.theme || 'light';
        const color = theme === 'dark' ? 0x444444 : 0xcccccc;
        const material = new THREE.LineBasicMaterial({ color: color });
        this.cubeFrame = new THREE.LineSegments(edges, material);
        this.scene.add(this.cubeFrame);
    }

    onResize() {
        if (!this.container || !this.renderer || !this.camera) return;

        const width = this.container.clientWidth;
        const height = Math.max(CONFIG.MIN_CANVAS_SIZE, width); // Maintain square aspect ratio if possible, or adapt

        // For orthographic camera, we might want to keep the frustum constant or adapt it.
        // The original code used a fixed size approach or relied on CSS.
        // Let's ensure the renderer matches the container.

        this.renderer.setSize(width, height, false);

        // Update camera frustum if aspect ratio changes (though we enforce square mostly)
        const aspect = width / height;
        const frustumSize = 2;

        this.camera.left = -frustumSize * aspect / 2;
        this.camera.right = frustumSize * aspect / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = -frustumSize / 2;

        this.camera.updateProjectionMatrix();
    }

    updateTheme(theme) {
        const isDark = theme === 'dark';
        const hex = isDark ? 0x111111 : 0xf5f5f5;
        this.scene.background = new THREE.Color(hex);
        this.renderer.setClearColor(hex, 1);

        // Update Cube Frame color
        if (this.cubeFrame) {
            this.cubeFrame.material.color.setHex(isDark ? 0x444444 : 0xcccccc);
        }
    }

    render() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    setView(type) {
        this.toggleAutoRotate(false);

        if (type === 'z') {
            // Front/Top View (looking at XY plane from Z)
            this.camera.position.set(0, 0, 3.1);
            this.camera.lookAt(0, 0, 0);
            this.camera.up.set(0, 1, 0);
        } else if (type === 'iso') {
            // Isometric Perspective
            this.camera.position.set(1.8, 1.8, 1.8);
            this.camera.lookAt(0, 0, 0);
            this.camera.up.set(0, 1, 0);
        } else if (type === 'overview') {
            // "Optimal Overview" (Dimetric-like)
            // Asymmetric: Rotated ~10deg relative to previous state (Form turned left)
            this.camera.position.set(3.1, 1.2, 1.4);
            this.camera.lookAt(0, 0, 0);
            this.camera.up.set(0, 1, 0);
        }

        this.camera.updateProjectionMatrix();
        this.controls.update();

        // Dispatch optional callback if needed, but SceneManager is low level.
    }

    toggleAutoRotate(enabled) {
        if (this.controls) {
            this.controls.autoRotate = (enabled !== undefined) ? enabled : !this.controls.autoRotate;
        }
    }
}
