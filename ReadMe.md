# 🌐 Raumharmonik – Welt der Formen

Ein exploratives, interaktives 3D-Projekt zur Umsetzung von Wilhelm Ostwalds Idee einer „Welt der Formen“. Ziel ist es, geometrische Strukturen im Raum zu erzeugen, zu analysieren und durch Symmetrieoperationen zu vervielfältigen – als Grundlage einer raumästhetischen Ordnung.

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
- ✅ Optionaler Kurvenmodus (Quadratic Bézier) für Linien  
- ✅ Umschaltbare gewölbte Flächen und Tetraeder-Volumen auf Bézier-Basis  
- ✅ Manuelle oder automatische Definition/Entfernung geschlossener Flächen & Tetraeder inkl. Hover-Highlight  
- ✅ Erkennung regulärer Dreiecke/Tetraeder und farbliche Markierung  
- ✅ Zufallsgenerator für neue Linienkonfigurationen  
- ✅ Presets: Würfelrahmen, Tetraeder, Diagonalkreuz, Stern  
- ✅ Automatische Erkennung geschlossener Flächen (Dreiecke) und Volumina (Tetraeder)  
- ✅ Rendering von Linien, Flächen und Volumen mit transparentem Shading und Punkt-Highlighting  
- ✅ Light/Dark Mode umschaltbar  
- ✅ Export als `.json`, `.obj`, `.stl` mit eingebetteter Metadatenstruktur  
- ✅ Session-spezifisches Labeling nach **Ostwald/Hinterreiter-System**:
  - Z. B. `V1_6A.obj` für erstes Volumen mit 6 Kantenpunkten, Variante A  
  - Vertex-Labels auf Basis ihrer **symmetrischen Lage im Raum** (`X0_Y+_Z-`, `C`, `X+_S1` etc.)  
  - Labels werden mit Positionsdaten in den Export-Dateien eingebettet

---

## 🔄 Geplante Features (nächste Schritte)

### 1. **Form-Generator & Analyse**
- [ ] Vollständige automatische Flächen-/Volumenschließung auch für symmetrisch erzeugte Linien  
- [ ] Klassifikation nach Formtypen (offen, geschlossen, symmetrisch, regulär)  
- [ ] Umgekehrter Weg: **Eingabe von Labels oder Parametern zur Form-Generierung**

### 2. **Katalogisierung & Systematik**
- [ ] Generierung sämtlicher **symmetrisch möglicher Konfigurationen** im Raum  
- [ ] Benennung nach festen Regeln (Hinterreiter-System)  
- [ ] Export benannter Formen zur Weiterverarbeitung in Katalog, Buch, Galerie

### 3. **UX & Interface**
- [ ] Minimalistisches Sidebar-Layout mit Icons, Slidern, Tooltips  
- [ ] Kontextsensitives Onboarding / Hilfe  
- [ ] Verbesserung des Responsive Designs für Tablet & Querformat

---

## 💡 Optional: Erweiterungen durch Form-Generator

- [ ] 🔁 **Automatische 3D-Formengalerie**
  - Live-Generierung von `.json` + `.obj`-Dateien im Batch  
  - Erstellung einer `index.html` mit Three.js-Vorschau aller generierten Modelle  
  - Klickbare Vorschau + Metadatenanzeige

- [ ] 🧠 **Intelligente Filterlogik**
  - Nur Formen mit Flächen oder Volumina speichern  
  - Optional: Nur „einzügige“ Formen mit bestimmter Linienanzahl  
  - Symmetrieanalyse + Label-Erkennung im Generator

- [ ] 📦 **Integration in Haupt-Interface**
  - Formen aus Galerie direkt in SpaceHarmony laden  
  - Vorschlagsfunktion für „ähnliche Formen“ basierend auf Struktur

- [ ] 🎯 **KI-gestützte Bewertung (Ausblick)**
  - Sortierung nach Regelmäßigkeit, Komplexität oder ästhetischer Wirkung  
  - „Kuratorischer Modus“ zur Sammlung systematisch interessanter Körper

---

## 📁 Projektstruktur (Kurzüberblick)

```
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

Wilhelm Ostwalds Vision einer „Welt der Formen“ basiert auf der Idee, dass Ordnung, Regelmäßigkeit und Symmetrie eine universale ästhetische und wissenschaftliche Relevanz besitzen. Dieses Projekt versucht, diese Konzepte **nicht nur visuell darzustellen**, sondern **strukturierbar und explorativ erfahrbar** zu machen.

---

## 🧭 Langfristige Vision

- Aufbau einer offenen **Form-Datenbank** mit systematischer Benennung  
- Klassifikation aller strukturell möglichen Formen in kubischer Umgebung  
- Publikation als **Werkzeugkasten zur Formforschung** (interaktiv, printfähig, exportierbar)  
- Einbindung von KI zur Formanalyse, Ästhetik-Bewertung oder Optimierung  

*Letzte Aktualisierung: 2025-10-03*
