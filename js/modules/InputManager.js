import * as THREE from 'three';
import { CONFIG } from './Config.js';

export class InputManager {
    constructor(container, sceneManager, callbacks = {}) {
        this.container = container;
        this.sceneManager = sceneManager;
        this.callbacks = callbacks; // { onClick: (intersect) => {}, onDrag: () => {} }

        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points.threshold = 0.05; // Reduced from 0.3 for precision. Rely on point SIZE instead.
        this.pointer = new THREE.Vector2();
        this.pointerDown = false;
        this.dragging = false;
        this.pointerDownPos = new THREE.Vector2();

        // Pickable objects will be managed here or passed in
        this.pickableMeshes = [];

        this._initEvents();
    }

    setPickableMeshes(meshes) {
        this.pickableMeshes = meshes || [];
    }

    _initEvents() {
        const canvas = this.sceneManager.renderer.domElement;
        canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
        canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
        canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
        // Touch support is handled by pointer events usually, but good to verify
    }

    _updatePointer(event) {
        const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    _onPointerDown(event) {
        this._updatePointer(event);
        this.pointerDown = true;
        this.dragging = false;
        this.pointerDownPos.copy(this.pointer);

        // Raycast immediately to see what we hit (optional, depending on logic)
        // For now we just record start pos
    }

    _onPointerMove(event) {
        this._updatePointer(event);
        if (this.pointerDown) {
            const distSq = this.pointer.distanceToSquared(this.pointerDownPos);
            // Increased threshold for easier clicking without accidental drag
            if (distSq > (CONFIG.DRAG_THRESHOLD_SQ * 2 / (this.sceneManager.renderer.domElement.height ** 2))) {
                // Scaling threshold to normalized coords is a bit tricky, simpler to assume if moved > X pixels
                // Let's use simple logic:
                this.dragging = true;
            }
        }

        // Handle Hover
        this._handleHover();
    }

    _onPointerUp(event) {
        this._updatePointer(event);
        this.pointerDown = false;

        // Check if it was a drag
        if (this.dragging) {
            this.dragging = false;
            return; // Ignore clicks that were drags (orbiting)
        }

        // It was a click
        this._handleClick();
    }

    _handleClick() {
        const intersect = this._getIntersect();
        if (this.callbacks.onClick) {
            this.callbacks.onClick(intersect, this.pointer);
        }
    }

    _getIntersect() {
        this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);
        // Intersect provided meshes
        const intersects = this.raycaster.intersectObjects(this.pickableMeshes, false); // false for recursive?

        if (intersects.length > 0) {
            // Sort by distance from camera
            intersects.sort((a, b) => a.distance - b.distance);

            // If we hit the PickingCloud ("GridPoints"), return it immediately.
            // The PickingCloud logic in App.js ensures the hit sizes are reasonable.
            // If the ray hits a point, it's a valid hit.
            const pointHit = intersects.find(hit => hit.object.name === 'GridPoints');
            if (pointHit) return pointHit;

            // Fallback to other hits (e.g. gridMesh instance if for some reason picking cloud missed)
            return intersects[0];
        }
        return null;
    }

    _handleHover() {
        // Implement hover highlighting logic if needed, or emit onHover
        if (this.callbacks.onHover) {
            const intersect = this._getIntersect();
            this.callbacks.onHover(intersect);
        }
    }
}
