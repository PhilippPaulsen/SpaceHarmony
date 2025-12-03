

# Raumharmonik in Blender 5.0 – Arbeitsnotizen

Dieses Dokument sammelt den Plan für eine Geometry-Nodes-Umsetzung von **Space Harmony / Raumharmonik** in Blender 5.0. Wir gehen **bottom‑up** vor: erst ein minimaler Prototyp, dann Schritt für Schritt mehr Logik.

---
## 1. Zielbild (kurz)

- Prozedurales "Raumharmonik‑Kit" in Blender
- Auf Basis von **Geometry Nodes**:
  - Raster / Lattice im Raum
  - einfache Symmetrieoperationen (Spiegelung, Rotation)
  - später: Kombinationen als Symmetriegruppen, reguläre Formen, Bewertung der "Gesetzmäßigkeit"
- Blender dient als **Visualisierungs- und Forschungsumgebung** für Formen, die konzeptionell an SpaceHarmony anknüpfen.

---
## 2. Vorgehen bottom‑up

Wir starten mit einem **Minimal-Setup**:

1. Ein einfaches Mesh (Würfel) als Trägerobjekt
2. Ein Geometry-Nodes-Modifier, der
   - das Objekt in ein Raster (Lattice) übersetzt **oder** direkt Punkte/Instanzen im Raum erzeugt,
   - eine einfache Symmetrie (Spiegelung + Rotation) anwendet.
3. Die wichtigsten Parameter werden als **Group Inputs** publiziert, so dass man sie im Modifier-Panel steuern kann.

Auf diesem Setup bauen wir dann weitere Node-Groups auf (Symmetriegruppen, reguläre Formen etc.).

---
## 3. Schritt 1: Minimaler Prototyp in Blender

### 3.1 Szene vorbereiten

1. Neues Blender-Projekt öffnen.
2. Standard-Würfel im Viewport behalten (oder einen neuen hinzufügen) und sinnvoll benennen, z. B. `Raumharmonik_01`.
3. Optional: eine Kamera und ein Licht für spätere Renderings grob positionieren.

### 3.2 Geometry Nodes Modifier anlegen

1. `Raumharmonik_01` auswählen.
2. Im **Modifier-Tab** einen **Geometry Nodes**-Modifier hinzufügen.
3. Auf **New** klicken, um eine neue Node-Group zu erzeugen. Diese Node-Group benennen wir z. B. `GN_Raumharmonik_01`.

Diese Node-Group ist unser erstes "Lab" für Experimente.

---
## 4. Node-Setup: GN_Raumharmonik_Minimal

Ziel der ersten Version:
- Eingabe: Basisgeometrie (z. B. Würfel)
- Ausgabe: Mehrere transformierte Instanzen dieser Geometrie, die
  - entlang einer Achse gespiegelt werden
  - um eine zentrale Achse rotiert werden

Damit haben wir eine einfache, aber sichtbare **Symmetrie- und Vervielfältigungsstruktur** im Raum.

### 4.1 Geplante Parameter (Group Inputs)

In der Node-Group `GN_Raumharmonik_Minimal` legen wir folgende Inputs an:

- `mirror_enable` (Boolean) – Schaltet Spiegelung ein/aus.
- `mirror_axis` (Enum-Proxy, vorerst drei Booleans oder Integer) – X/Y/Z-Achse.
- `rotation_enable` (Boolean) – Schaltet Rotation ein/aus.
- `rotation_axis` (Vector oder Enum-Proxy) – Standard: Z-Achse.
- `rotation_steps` (Integer) – Anzahl der Kopien im Kreis (z. B. 4, 6, 8).
- `rotation_angle_total` (Float, Grad) – Gesamtdrehung (Standard: 360°).
- `instance_scale` (Float) – Einheitliche Skalierung der Instanzen.

Hinweis: Blender-Enums lassen sich im Node-Editor nur begrenzt direkt abbilden, daher zunächst pragmatiche Lösungen (z. B. drei Booleans für Achsen). Später kann man das verfeinern.

### 4.2 Node-Struktur (erste Version)

Grober Plan für die Nodes in `GN_Raumharmonik_Minimal`:

1. **Group Input**
   - Geometrie-Eingang (Standard)
   - Parameter wie oben beschrieben

2. **Instanzen für Rotation erzeugen**
   - `Mesh to Points` oder direkt die Eingabe-Geometrie als zu instanzierende Form behandeln.
   - `Duplicate Elements` oder `Instance on Points` verwenden, um mehrere Instanzen der Eingabe-Geometrie zu erzeugen.
   - Über den `Index` der Instanzen den Rotationswinkel berechnen:
     - `angle_step = rotation_angle_total / rotation_steps`
     - `angle = Index * angle_step`
   - `Rotate Instances`-Node nutzen, Achse über `rotation_axis` und Winkel über die berechnete `angle` steuern.
   - Wenn `rotation_enable = false`, per `Switch`-Node einfach die Originalgeometrie durchreichen.

3. **Spiegelung anwenden**
   - Nach der Rotation einen Block für Spiegelung einfügen.
   - Spiegelung als Skalierung von –1 entlang einer Achse:
     - `Transform`-Node mit Scale z. B. `(-1, 1, 1)` für X-Spiegelung.
   - Über `mirror_axis` entscheiden, welche Achse gespiegelt wird.
   - Über `mirror_enable` per `Switch`-Node zwischen
     - "nur rotiert" und
     - "rotiert + rotiert&gespiegelt" umschalten:
       - z. B. `Join Geometry` nutzen, um Originalinstanzen + gespiegelte Instanzen zu kombinieren.

4. **Skalierung & Ausgabe**
   - Optional einen `Scale Elements` oder `Transform`-Node mit `instance_scale` verwenden.
   - Ergebnis an den **Group Output** anschließen.

Dieses Setup bildet eine einfache Symmetriegruppe (Rotation + Spiegelung) nach, wie sie auch in SpaceHarmony als Grundoperationen vorkommt.

---
## 5. Nächste Schritte (Ausblick)

Wenn `GN_Raumharmonik_Minimal` im Viewport funktioniert, folgen:

1. **Refactoring in modulare Node-Groups**
   - `GN_Symmetry_Mirror` (nur Spiegelung)
   - `GN_Symmetry_Rotate` (nur Rotation)
   - `GN_SymmetryGroup_Basic` (kombiniert Spiegelung + Rotation mit Switches)

2. **Lattice/Grid ergänzen**
   - Eigene Node-Group `GN_LatticeGrid`, die ein kubisches Raster erzeugt (Parameter: `grid_size`, `divisions`).
   - Formen können später relativ zu diesem Raster platziert bzw. automatisch darin generiert werden.

3. **Verbindung zu SpaceHarmony-Konzepten**
   - Symmetrie-Modi später so benennen, dass sie direkt den Modi im Generator (Mirror, Dihedral, FourFold, FullCube, etc.) entsprechen.
   - Seed-Formen (Tetraeder, Pyramide, Oktaeder) als separate Meshes/Collections bereitstellen und per Geometry Nodes instanzieren.

Dieses Dokument dient als lebende Notiz – neue Ideen, konkrete Node-Screenshots und Varianten können wir hier Schritt für Schritt ergänzen.