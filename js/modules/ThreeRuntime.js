/**
 * ThreeRuntime.js
 *
 * Environment-aware loader for the `three` package.
 *
 * Node (CLI/worker-in-Node context): resolves the bare specifier 'three'
 * via node_modules, matching the version pinned in package.json.
 *
 * Browser (main thread and module Workers): imports the exact same
 * absolute CDN URL/version already used by index.html's <script type="importmap">
 * and by the other already-CDN-importing modules today. This is deliberate -
 * import maps do not apply inside module Workers (as of 2026, still an open
 * spec gap), so a bare 'three' specifier would fail to resolve for any module
 * reachable from js/workers/generationWorker.js. An absolute URL needs no
 * resolution/import-map at all and works identically in both the main thread
 * and a Worker.
 *
 * This intentionally leaves the two runtimes on different three.js versions
 * (Node: whatever's in node_modules: currently 0.182.0; Browser: 0.152.2,
 * pinned in the CDN URL below and in index.html's importmap) - that split
 * already existed before this file for the four modules using a bare 'three'
 * import (GridSystem.js, SceneManager.js, InputManager.js, formGenerator.js),
 * this only makes it consistent across the rest of the codebase rather than
 * introducing something new. Unifying the two versions is a separate,
 * bigger decision (would need the browser-side importmap bumped and the
 * rendering-heavy API surface in App.js/SceneManager.js checked against
 * three's r152->r182 changelog) and is out of scope here.
 */
const isNode = typeof process !== 'undefined' && !!process.versions?.node;

const THREE = isNode
  ? await import('three')
  : await import('https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js');

export default THREE;
