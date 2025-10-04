/**
 * symmetry.js
 * 
 * Definiert die Symmetrieoperationen und -gruppen für das SpaceHarmony-Projekt.
 * Enthält Transformationen für die kubische Symmetriegruppe.
 * 
 * @version 1.0.0
 * @date 2025-10-04
 */

import { Point } from './structures.js';

// --- 1. Definition der einzelnen Symmetrieoperationen als Funktionen ---

export const SYMMETRY_OPERATIONS = {
    // --- Identität ---
    identity: (p) => new Point(p.x, p.y, p.z),

    // --- Inversion ---
    inversion: (p) => new Point(-p.x, -p.y, -p.z),

    // --- Spiegelungen an den Hauptebenen (senkrecht zu den Achsen) ---
    mirrorX: (p) => new Point(-p.x, p.y, p.z), // Spiegelebene YZ
    mirrorY: (p) => new Point(p.x, -p.y, p.z), // Spiegelebene XZ
    mirrorZ: (p) => new Point(p.x, p.y, -p.z), // Spiegelebene XY

    // --- Spiegelungen an den Diagonal-Ebenen ---
    mirrorXY: (p) => new Point(p.y, p.x, p.z),   // Ebene x=y
    mirrorNegXY: (p) => new Point(-p.y, -p.x, p.z), // Ebene x=-y
    mirrorXZ: (p) => new Point(p.z, p.y, p.x),   // Ebene x=z
    mirrorNegXZ: (p) => new Point(-p.z, p.y, -p.x), // Ebene x=-z
    mirrorYZ: (p) => new Point(p.x, p.z, p.y),   // Ebene y=z
    mirrorNegYZ: (p) => new Point(p.x, -p.z, -p.y), // Ebene y=-z

    // --- Rotationen um 180° (C2) um die Hauptachsen ---
    rotationC2X: (p) => new Point(p.x, -p.y, -p.z),
    rotationC2Y: (p) => new Point(-p.x, p.y, -p.z),
    rotationC2Z: (p) => new Point(-p.x, -p.y, p.z),

    // --- Rotationen um 90°/270° (C4) um die Hauptachsen ---
    rotationC4X_90: (p) => new Point(p.x, -p.z, p.y),
    rotationC4X_270: (p) => new Point(p.x, p.z, -p.y),
    rotationC4Y_90: (p) => new Point(p.z, p.y, -p.x),
    rotationC4Y_270: (p) => new Point(-p.z, p.y, p.x),
    rotationC4Z_90: (p) => new Point(-p.y, p.x, p.z),
    rotationC4Z_270: (p) => new Point(p.y, -p.x, p.z),

    // --- Rotationen um 120°/240° (C3) um die Raumdiagonalen ---
    // Achse [1,1,1]
    rotationC3_111_120: (p) => new Point(p.z, p.x, p.y),
    rotationC3_111_240: (p) => new Point(p.y, p.z, p.x),
    // Achse [-1,1,1]
    rotationC3_m111_120: (p) => new Point(-p.z, -p.x, p.y),
    rotationC3_m111_240: (p) => new Point(p.y, -p.z, -p.x),
    // Achse [1,-1,1]
    rotationC3_1m11_120: (p) => new Point(p.z, -p.x, -p.y),
    rotationC3_1m11_240: (p) => new Point(-p.y, -p.z, p.x),
    // Achse [1,1,-1]
    rotationC3_11m1_120: (p) => new Point(-p.z, p.x, -p.y),
    rotationC3_11m1_240: (p) => new Point(p.y, -p.z, -p.x),
};

// --- 2. Definition der Symmetriegruppen ---
// Die Gruppen enthalten die Schlüssel der Operationen aus SYMMETRY_OPERATIONS.

export const SYMMETRY_GROUPS = {
    // Vollständige kubische Gruppe (48 Elemente)
    cubic: [
        'identity', 'inversion',
        'mirrorX', 'mirrorY', 'mirrorZ',
        'mirrorXY', 'mirrorNegXY', 'mirrorXZ', 'mirrorNegXZ', 'mirrorYZ', 'mirrorNegYZ',
        'rotationC2X', 'rotationC2Y', 'rotationC2Z',
        // C2 Rotationen um Diagonalen (z.B. x=y, z=0)
        // Diese werden durch Kombinationen der anderen erzeugt, hier aber explizit für Klarheit
        (p) => new Point(p.y, p.x, -p.z), 
        (p) => new Point(-p.y, -p.x, -p.z),
        (p) => new Point(p.z, -p.y, p.x),
        (p) => new Point(-p.z, -p.y, -p.x),
        (p) => new Point(-p.x, p.z, p.y),
        (p) => new Point(-p.x, -p.z, -p.y),

        'rotationC4X_90', 'rotationC4X_270',
        'rotationC4Y_90', 'rotationC4Y_270',
        'rotationC4Z_90', 'rotationC4Z_270',
        'rotationC3_111_120', 'rotationC3_111_240',
        'rotationC3_m111_120', 'rotationC3_m111_240',
        'rotationC3_1m11_120', 'rotationC3_1m11_240',
        'rotationC3_11m1_120', 'rotationC3_11m1_240',
        // Roto-Inversionen (hier nur einige Beispiele, da sie aus anderen Ops kombinierbar sind)
        (p) => new Point(-p.z, -p.x, -p.y), // S6 um 111
        (p) => new Point(-p.y, -p.z, -p.x), // S6 um 111
    ],

    // Tetraedrische Gruppe (24 Elemente)
    tetrahedral: [
        'identity',
        'rotationC2X', 'rotationC2Y', 'rotationC2Z',
        'rotationC3_111_120', 'rotationC3_111_240',
        'rotationC3_m111_120', 'rotationC3_m111_240',
        'rotationC3_1m11_120', 'rotationC3_1m11_240',
        'rotationC3_11m1_120', 'rotationC3_11m1_240',
        // S4 Roto-Inversionen
    ],

    // Platzhalter für weitere Gruppen
    icosahedral: [],

    // Einfachere Gruppen für Tests
    simpleRotation: ['identity', 'rotationC4Z_90', 'rotationC2Z', 'rotationC4Z_270'],
    simpleMirror: ['identity', 'mirrorX', 'mirrorY', 'mirrorZ'],
};
