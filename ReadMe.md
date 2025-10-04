# 🌐 Raumharmonik – Welt der Formen

Ein exploratives, interaktives 3D-Projekt zur Umsetzung von Wilhelm Ostwalds Idee einer „Welt der Formen“. Ziel ist es, geometrische Strukturen im Raum zu erzeugen, zu analysieren und durch Symmetrieoperationen zu vervielfältigen – als Grundlage einer raumästhetischen Ordnung.

---

## Setup

To generate thumbnails, the `canvas` dependency is required. Install it using npm:

```bash
npm install canvas
```

On macOS, you might need to install some additional dependencies using Homebrew:

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

---

## 🎯 Zielsetzung

- Interaktive Konstruktion geometrischer Formen im Raum  
- Anwendung von Symmetrieoperationen (Reflexion, Rotation, Translation, Inversion, Schraubung, Rotospiegelung)  
- Visualisierung geschlossener Linien, Flächen und Volumina  
- Untersuchung ästhetischer und strukturierender Prinzipien im Sinne Ostwalds

---

## 🛠️ Aktueller Funktionsumfang

- ✅ Orthografische 3D-Kamera mit OrbitControls & Auto-Rotate  
- ✅ Rasterwürfel mit einstellbarer Teilung (gridSize)  
- ✅ Punktplatzierung durch Mausklick auf Raster  
- ✅ Linienverbindungen mit Undo/Redo-Unterstützung  
- ✅ Symmetrieoperationen:
  - Spiegelung: XY, YZ, ZX  
  - Rotation um X, Y, Z  
  - Translation in XYZ-Richtung  
  - Inversion am Ursprung  
  - Schraubsymmetrie (Rotation + Translation)  
  - Rotospiegelung (Kombination aus Rotation & Spiegelung)  
- ✅ Optionaler Kurvenmodus (quadratische Bézier-Linien)  
- ✅ Umschaltbare gewölbte Flächen / Volumen auf Bézier-Basis  
- ✅ Manuelle & automatische Erkennung geschlossener Flächen / Volumen  
- ✅ Markierung regulärer Dreiecke und Tetraeder  
- ✅ Liniengenerator für Zufallsformen  
- ✅ Presets: Würfelrahmen, Tetraeder, Diagonalkreuz, Stern  
- ✅ Transparente Darstellung mit Shading + Hover-Effekte  
- ✅ Light/Dark Mode  
- ✅ Export `.json`, `.obj`, `.stl` inkl. Metadatenstruktur  
- ✅ Intelligentes Labeling nach **Ostwald/Hinterreiter-System**:
  - z. B. `V1_6A.obj` für erstes Volumen mit 6 Punkten  
  - Vertex-Labels auf Basis ihrer Lage im Raum (z. B. `X+_Y0_Z-`)  
  - Labels + Metadaten werden im Export eingebettet

---

## 🔁 Neuer Form-Generator (ab v1.6)

- 🧩 **Formgenerierung im 3D-Raum (Batchfähig)**  
- 🔍 **Validierung (Linien, Flächen, Konnektivität)**  
- 🧠 **Cycle-Detection zur Flächenerkennung**  
- 💾 **Export `.json` + `.obj` mit eingebetteten Metadaten**  
- 🌐 **HTML-Galerie mit Three.js-Vorschau (Lazy Loading)**  
- 📊 **Batch-Statistiken (z. B. Trefferquote bei Flächenbildung)**  
- ⚙️ **Konfiguration über Optionsobjekt** (`minFaces`, `maxSteps`, `singleStroke`, etc.)  
- 🐞 **Debug-Modus mit detaillierter Formausgabe**  
- 🔄 **Limitierung auf 50 Formen im Debug-Modus**  
- 🚀 **Autostart der Galerie nach erfolgreichem Batch-Run**

---

## 🆕 Modus: Maximale Gesetzmäßigkeit (ab v1.6.2)

- 🔺 **Neue Generatorfunktion:** `_generateMaximallyRegularForm()`  
- 🔄 **Seed-Formen:** Tetraeder, Pyramide, Oktaeder  
- 🧭 **Symmetriegruppen:** Mirror, Dihedral, FourFold, Inversion, FullCube, etc.  
- 🔂 **Duplikaterkennung:** Doppelpunkte & Doppellinien werden gefiltert  
- 📈 **Metadaten-Erweiterung:**
  - `source`: `"Symmetrischer Generator"` oder `"Zufallsgenerator"`  
  - `symmetryScore`: Bewertung der angewandten Symmetrie (0–1)  
  - `notes`: z. B. `"Grundform: pyramid, Symmetrie: mirrorAll"`  
- ✅ Aktivierung über:
```js
generationOptions: { mode: "maxRegular" }
```

---

## ✅ Bugfix v1.6.1: Flächenzählung

**Problem:**  
Keine Formen wurden gespeichert, obwohl `minFaces = 0`.

**Ursache:**  
Zugriff auf `form.metadata.faces` (nicht vorhanden) statt `form.metadata.faceCount`.

**Fix:**  
```js
const meetsCriteria = form.metadata.faceCount >= minFaces;
```

**Ergebnis:**  
Formen werden korrekt erkannt und gespeichert.

---

## 🖼️ Galerie-Upgrade: Lazy-Loading (ab v1.6.3)

- ⚡ **IntersectionObserver** statt fixer Three.js-Szenen  
- 💤 Nur sichtbare Modelle werden geladen (weniger WebGL-Kontexte)  
- 🌄 Optional: Vorschaubild als `<img>` einfügen (→ später möglich)

---

## 📌 Geplante Features

### 🔧 Generator & Analyse
- [ ] Automatische Volumenschließung nach Symmetrieoperationen  
- [ ] Typisierung: Offen | Geschlossen | Regulär | Symmetrisch  
- [ ] Rückwärtsformung durch Label-Eingabe  

### 🧭 Systematik & Klassifikation
- [ ] Systematische Erzeugung aller Kombinationsformen  
- [ ] Gruppierung nach Symmetrie & Struktur  
- [ ] Export für Buch, Galerie, Forschung  

### 🖥️ Interface & UX
- [ ] Minimalistische UI mit Slider, Icons, Tooltips  
- [ ] Kontextbasiertes Onboarding / Hilfesystem  
- [ ] Touch-Optimierung für Tablet-Ansicht

---

## 💡 KI-gestützte Exploration (Ausblick)

- [ ] Scoring nach Regelmäßigkeit & Ästhetik  
- [ ] Vorschläge für ähnliche / komplementäre Formen  
- [ ] KI-Klassifikation nach Symmetriegruppen  
- [ ] Kuratorischer Modus für gezielte Auswahl

---

## 📁 Projektstruktur

```text
raumharmonik_generator/
├── index.html  
├── js/
│   ├── raumharmonik.js  
│   ├── formGenerator.js  
│   └── generated_forms/
├── style.css  
├── run_form_generator.command  
└── ReadMe.md  
```

---

## 📚 Bezug zu Wilhelm Ostwald

Wilhelm Ostwald sah in geometrischer Ordnung den Schlüssel zu einer **universellen Ästhetik**. Dieses Projekt überträgt seine Konzepte ins Digitale – nicht als fertige Bilder, sondern als **strukturierte Forschung an Raumform, Symmetrie und Ordnung**.

---

## 🧭 Langfristige Vision

- Aufbau einer **offenen 3D-Formdatenbank**  
- Klassifikation aller möglichen Formen im Rasterraum  
- Interaktiver & druckbarer **Katalog geordneter Raumkörper**  
- Veröffentlichung als **digitaler Werkzeugkasten für Formforschung**  
- Einsatz von KI zur Bewertung & Strukturanalyse  

---

*Letzte Aktualisierung: 2025-10-03*