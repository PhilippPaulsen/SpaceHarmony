import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateMultipleForms } from './js/formGenerator.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json());

app.use(express.static(__dirname)); 
app.use('/gallery', express.static(path.join(__dirname, 'gallery-app')));
// Dient den generierten Daten (OBJ, JSON, PNGs)
app.use('/gallery/data', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
}, express.static(path.join(__dirname, 'js/generated_forms')));

app.post('/generate', async (req, res) => {
  console.log('Anfrage zum Generieren von Formen erhalten mit Optionen:', req.body);

  const { count, minFaces, gridSize, mode, minSteps, maxSteps } = req.body;
  const densityForGenerator = Number(req.body.pointDensity) + 1;

  try {
    await generateMultipleForms({
      count: Number(count),
      minFaces: Number(minFaces),
      gridSize: Number(gridSize),
      pointDensity: densityForGenerator,
      debugLog: true,
      saveJson: true,
      saveObj: true,
      generateHtmlGallery: false,
      generateThumbnails: true,
      generationOptions: {
        mode: mode,
        minSteps: Number(minSteps),
        maxSteps: Number(maxSteps)
      }
    });

    res.status(200).send('✅ Formen erfolgreich generiert!');
  } catch (e) {
    console.error('Fehler bei der Form-Generierung:', e);
    res.status(500).send(`Fehler beim Generieren: ${e.message}`);
  }
});

app.delete('/delete', (req, res) => {
    console.log('Löschanfrage erhalten. Body:', JSON.stringify(req.body, null, 2));
    const { filename } = req.body;
    if (!filename) {
        return res.status(400).send('Dateiname fehlt.');
    }

    const filenames = (Array.isArray(filename) ? filename : [filename]).flat();
    console.log(`Löschanfrage für ${filenames.length} Datei(en) wird verarbeitet:`, filenames);

    const baseDir = path.join(__dirname, 'js', 'generated_forms');
    const indexPath = path.join(baseDir, 'obj_index.json');
    let allFilesToDelete = [];

    filenames.forEach(name => {
        if (typeof name !== 'string') {
            console.error('Ungültiger Dateiname in der Anfrage gefunden:', name);
            return; // Überspringe ungültige Einträge
        }
        allFilesToDelete.push(path.join(baseDir, name));
        allFilesToDelete.push(path.join(baseDir, name.replace('.obj', '.json')));
        allFilesToDelete.push(path.join(baseDir, 'thumbnails', name.replace('.obj', '.png')));
    });

    Promise.all(allFilesToDelete.map(file => fs.promises.unlink(file).catch(e => console.warn(`Datei nicht gefunden/gelöscht: ${file}`))))
        .then(() => {
            return fs.promises.readFile(indexPath, 'utf8')
                .then(data => {
                    let index = JSON.parse(data);
                    const newIndex = index.filter(item => !filenames.includes(item.obj));
                    return fs.promises.writeFile(indexPath, JSON.stringify(newIndex, null, 2), 'utf8');
                });
        })
        .then(() => {
            console.log(`${filenames.length} Formen erfolgreich gelöscht.`);
            res.status(200).send(`${filenames.length} Formen erfolgreich gelöscht.`);
        })
        .catch(err => {
            console.error('Fehler beim Löschvorgang:', err);
            res.status(500).send('Fehler beim Löschen der Dateien oder Aktualisieren des Index.');
        });
});

app.listen(port, () => {
  console.log(`✨ SpaceHarmony Server läuft!`);
  console.log(`  - Generator: http://localhost:${port}/generator.html`);
  console.log(`  - Galerie:   http://localhost:${port}/gallery`);
});