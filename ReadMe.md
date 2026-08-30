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
- ✅ Rasterwürfel mit einstellbarer Teilung (`gridSize`)  
- ✅ Punktplatzierung durch Mausklick auf Raster  
- ✅ Linienverbindungen mit Undo/Redo-Unterstützung  
- ✅ Symmetrieoperationen:
  - Spiegelung: XY, YZ, ZX  
  - Rotation um X, Y, Z  
  - Translation in XYZ-Richtung  
  - Inversion am Ursprung  
  - Schraubsymmetrie (Rotation + Translation)  
  - Rotospiegelung (Rotation & Spiegelung)  
- ✅ Optionaler Kurvenmodus (quadratische Bézier-Linien)  
- ✅ Umschaltbare gewölbte Flächen / Volumen auf Bézier-Basis  
- ✅ Manuelle & automatische Erkennung geschlossener Flächen / Volumen  
- ✅ Markierung regulärer Dreiecke und Tetraeder  
- ✅ Liniengenerator für Zufallsformen  
- ✅ Presets: Würfelrahmen, Tetraeder, Diagonalkreuz, Stern  
- ✅ Transparente Darstellung mit Shading + Hover-Effekte  
- ✅ Light/Dark Mode (Apple Glass-kompatibel)  
- ✅ Export `.json`, `.obj`, `.stl` inkl. Metadatenstruktur  
- ✅ Download-Buttons für `.obj` und `.json` in der Galerie  
- ✅ Automatische Klassifikation & Benennung generierter Formen (`js/modules/Taxonomy.js`):
  - `vProfile`: Vertex-Gruppen nach Betragssignatur (z. B. `8x[1.00,1.00,1.00]+6x[1.00,0.00,0.00]`)
  - `eProfile`: Kanten-Gruppen nach Länge + Richtung
  - `cGeo`: kanonische Flächen-Signatur + Hash (z. B. `F6-{6xV4}`)
  - Zusammengesetzter Name: `V(...)|E{...}|<hash>` — nur im systematischen Generator-Modus (`mode: "systematic"`)
  - Zufalls-/Symmetrie-Pfad nutzt stattdessen ein einfaches Debug-Label: `Form #<n> [<STRICT|RLX>-P<pointCount>-<SMPL|CPLX>]`
  - Labels + Metadaten werden im Export eingebettet

---

## 🔁 Neuer Form-Generator (ab v1.6)

- 🧩 **Formgenerierung im 3D-Raum (Batchfähig)**  
- 🔍 **Validierung (Linien, Flächen, Konnektivität)**  
- 🧠 **Cycle-Detection zur Flächenerkennung**  
- 💾 **Export `.json` + `.obj` mit eingebetteten Metadaten**  
- 🌐 **HTML-Galerie mit Three.js-Vorschau (Lazy Loading)**  
- 🖼️ **Thumbnails werden automatisch generiert (PNG)**  
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
- 🌄 Vorschau als `.webp` / `.png` wird automatisch generiert  
- 📂 **"Löschen"-Button je Form, optional "Mehrfachauswahl löschen" geplant**  
- 🔽 Metadaten-Panel ist standardmäßig eingeklappt  
- ⚠️ Symmetrieoperationen teilweise instabil – Workaround durch höhere Punktdichte  
- 🛠️ Benennung `pointDensity` nun synchronisiert mit Raumharmonik

---

## 📌 Geplante Features

### 🔧 Generator & Analyse
- [ ] Automatische Volumenschließung nach Symmetrieoperationen  
- [ ] Typisierung: Offen | Geschlossen | Regulär | Symmetrisch  
- [ ] Rückwärtsformung durch Label-Eingabe  
- [ ] Filterung & Sortierung in Galerie (nach Punkten/Linien/Flächen)  
- [ ] Erkennung modular kombinierbarer Flächenformen  

### 🧭 Systematik & Klassifikation
- [ ] Systematische Erzeugung aller Kombinationsformen  
- [ ] Gruppierung nach Symmetrie & Struktur  
- [ ] Ostwald/Hinterreiter-Labeling (z. B. `V1_6A`, Vertex-Labels wie `X+_Y0_Z-`) als zusätzliches Namensschema neben `Taxonomy.js` — bisher nicht implementiert  
- [ ] Export für Buch, Galerie, Forschung  
- [ ] Modularer Volumenbau aus Teilformen  

### 🖥️ Interface & UX
- [ ] Minimalistische UI mit Slidern, Tooltips, Download-Funktionen  
- [ ] Touch-Optimierung für Tablet & VR-Headsets (MetaQuest, Apple Glass)  
- [ ] "Öffnen in Raumharmonik"-Verknüpfung aus Galerie  

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

*Letzte Aktualisierung: 2025-10-04*
