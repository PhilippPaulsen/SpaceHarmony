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
        this._addCubeFrame();

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
        // 1. Ambient Light (Softer base to allow shadows)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        // 2. Key Light (Main Source - Top Right Front)
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
        keyLight.position.set(5, 8, 5);
        this.scene.add(keyLight);

        // 3. Fill Light (Soften shadows - Left)
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.5); // Neutral White
        fillLight.position.set(-5, 3, 5);
        this.scene.add(fillLight);

        // 4. Rim Light (Backlight for edge definition)
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.6); // Neutral White, slightly reduced intensity
        rimLight.position.set(0, 5, -5);
        this.scene.add(rimLight);
    }

    _addCubeFrame() {
        const size = CONFIG.CUBE_HALF_SIZE;
        const geometry = new THREE.BoxGeometry(size * 2, size * 2, size * 2);
        const edges = new THREE.EdgesGeometry(geometry);

        // Create separate materials for light and dark modes? 
        // For now, we use a default color that handles theme changes via updateTheme
        const material = new THREE.LineBasicMaterial({ color: 0xcccccc });
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

    toggleAutoRotate(enabled) {
        if (this.controls) {
            this.controls.autoRotate = (enabled !== undefined) ? enabled : !this.controls.autoRotate;
        }
    }
}
