/**
 * structures.js
 * 
 * Definiert die grundlegenden Datenstrukturen (Point, Line, Form) 
 * für das SpaceHarmony-Projekt.
 * 
 * @version 1.0.0
 * @date 2025-10-04
 */

export class Point {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

export class Line {
    constructor(startPoint, endPoint) {
        this.start = startPoint;
        this.end = endPoint;
    }
}

export class Form {
    constructor() {
        this.points = [];
        this.lines = [];
        this.metadata = {};
    }
}
