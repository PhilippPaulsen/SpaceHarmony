# 🌐 Raumharmonik – Welt der Formen

Ein exploratives, interaktives 3D-Projekt zur Umsetzung von Wilhelm Ostwalds Idee einer „Welt der Formen“. Ziel ist es, geometrische Strukturen im Raum zu erzeugen, zu analysieren und durch Symmetrieoperationen zu vervielfältigen – als Grundlage einer raumästhetischen Ordnung.

---

## 🎯 Zielsetzung

- Interaktive Konstruktion geometrischer Formen im Raum  
- Anwendung von Symmetrieoperationen (Reflexion, Rotation, Translation, Inversion, Schraubung, Rotospiegelung)  
- Visualisierung geschlossener Linien, Flächen und Volumina  
- Untersuchung ästhetischer und strukturierender Prinzipien im Sinne Ostwalds

---

## 🛠️ Aktueller Funktionsumfang

- ✅ Orthografische 3D-Kamera mit OrbitControls und sanftem Auto-Rotate  
- ✅ Rasterisierter Raumwürfel mit einstellbarer Teilung  
- ✅ Platzierung von Punkten per Klick auf das Raster  
- ✅ Verbinden von Punkten zu Linien inkl. Undo/Redo-Verlauf  
- ✅ Symmetrieoperationen:
  - Spiegelung an XY, YZ, ZX  
  - Rotation um X, Y, Z (auch kombiniert)  
  - Translation in x/y/z-Richtung (repetitiv)  
  - Inversion durch Ursprung  
  - Rotationsspiegelung (Rotoreflektion)  
  - Schraubsymmetrie (Rotation + Translation)  
- ✅ Optionaler Kurvenmodus (Quadratic Bézier)  
- ✅ Umschaltbare gewölbte Flächen und Tetraeder-Volumen  
- ✅ Manuelle & automatische Erkennung geschlossener Flächen/Tetraeder  
- ✅ Erkennung regulärer Dreiecke/Tetraeder mit visueller Hervorhebung  
- ✅ Zufallsgenerator für Linienzüge  
- ✅ Presets: Würfelrahmen, Tetraeder, Diagonalkreuz, Stern  
- ✅ Transparente Darstellung von Linien, Flächen, Volumina  
- ✅ Light/Dark Mode  
- ✅ Export `.json`, `.obj`, `.stl` inkl. Metadaten  
- ✅ Labeling nach **Ostwald/Hinterreiter-System**:
  - z. B. `V1_6A.obj` für Volumen mit 6 Punkten  
  - Vertex-Labels auf Basis symmetrischer Raumlage  
  - Automatischer Einbau in Export-Dateien

---

## 🔁 Neuer Form-Generator (ab v1.6)

- 🧩 **Automatische Formgenerierung im 3D-Raum**  
- 🔍 **Validierung und Analyse der Formen** (Linien, Flächen, Konnektivität)  
- 🧠 **Cycle-Detection zur Flächenerkennung**  
- 💾 **Export `.json` + `.obj` mit eingebetteten Metadaten**  
- 🌐 **HTML-Galerie mit Three.js-Vorschau**  
- 📊 **Batch-Statistiken (z. B. Trefferquote bei Flächenbildung)**  
- ⚙️ **Konfiguration über Optionsobjekt** (z. B. `minFaces`, `maxSteps`, `singleStroke`)  
- 🐞 **Debug-Modus mit Detailausgabe je Form**  
- 🔄 **Automatische Limitierung auf 50 Formen im Debug-Modus**  
- 🚀 **Autostart der Galerie nach erfolgreichem Batch-Run**

---

### ✅ Bugfix v1.6.1: Flächenzählung

**Problem:**  
Keine Formen wurden gespeichert, obwohl `minFaces = 0` gesetzt war.

**Ursache:**  
Zugriff auf nicht existierendes Attribut `form.metadata.faces` statt korrekt `form.metadata.faceCount`.

**Lösung:**  
Zugriff im Batch korrekt angepasst:

```js
const meetsCriteria = form.metadata.faceCount >= minFaces;

Ergebnis:
Formen werden nun korrekt erkannt und gespeichert.

⸻

🔄 Geplante Features

1. Form-Generator & Analyse
	•	Automatische Flächen-/Volumenschließung auch bei Symmetrie
	•	Klassifikation: offen, geschlossen, regulär, symmetrisch
	•	Rückwärtsgenerierung durch Label-Eingabe

2. Systematik & Katalogisierung
	•	Erzeugung aller möglichen Konfigurationen
	•	Benennung nach festen Regeln (Hinterreiter-System)
	•	Export für Buch, Katalog, Datenbank

3. Interface & Usability
	•	Minimalistisches UI mit Tooltips & Slidern
	•	Onboarding-Overlay & Kontext-Hilfe
	•	Optimierung für Tablet & Querformat

⸻

💡 Vision: KI-gestützte Exploration
	•	📊 Intelligente Filterung (nur „schöne“ oder „komplexe“ Formen)
	•	🧠 KI-Klassifikation nach Symmetriegruppen
	•	🎨 Automatisches Scoring nach Ästhetik
	•	🔁 Formvorschläge auf Basis bestehender Geometrien

⸻

📁 Projektstruktur

raumharmonik_generator/  
├── index.html  
├── js/  
│   ├── raumharmonik.js  
│   ├── formGenerator.js  
│   └── generated_forms/  
├── style.css  
├── run_form_generator.command  
└── ReadMe.md  

📚 Wilhelm Ostwalds Einfluss

Wilhelm Ostwald sah in geometrischer Ordnung den Schlüssel zu einer universellen Ästhetik. Dieses Projekt überträgt seine Ideen in eine interaktive Umgebung – nicht nur zur Visualisierung, sondern zur strukturierten Erforschung von Form, Symmetrie und Raumharmonie.

⸻

🧭 Langfristige Vision
	•	Aufbau einer offenen Formdatenbank
	•	Systematische Klassifikation aller Raumformen
	•	Interaktiver & printbarer Formenkatalog
	•	Integration KI-gestützter Analyse-Tools
	•	Veröffentlichung als Werkzeugkasten der Formforschung

⸻

Letzte Aktualisierung: 2025-10-03