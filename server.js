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

  const { count, minFaces, gridSize, pointDensity, mode, minSteps, maxSteps } = req.body;

  try {
    await generateMultipleForms({
      count: Number(count),
      minFaces: Number(minFaces),
      gridSize: Number(gridSize),
      pointDensity: Number(pointDensity),
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
    const { filename } = req.body;
    if (!filename) {
        return res.status(400).send('Dateiname fehlt.');
    }

    console.log(`Löschanfrage für ${filename} erhalten.`);

    const baseDir = path.join(__dirname, 'js', 'generated_forms');
    const objPath = path.join(baseDir, filename);
    const jsonPath = path.join(baseDir, filename.replace('.obj', '.json'));
    const thumbPath = path.join(baseDir, 'thumbnails', filename.replace('.obj', '.png'));
    const indexPath = path.join(baseDir, 'obj_index.json');

    const filesToDelete = [objPath, jsonPath, thumbPath];
    Promise.all(filesToDelete.map(file => fs.promises.unlink(file).catch(e => console.warn(`Datei nicht gefunden/gelöscht: ${file}`))))
        .then(() => {
            // Index aktualisieren
            fs.promises.readFile(indexPath, 'utf8')
                .then(data => {
                    let index = JSON.parse(data);
                    const newIndex = index.filter(item => item.obj !== filename);
                    return fs.promises.writeFile(indexPath, JSON.stringify(newIndex, null, 2), 'utf8');
                })
                .then(() => {
                    console.log(`Form ${filename} erfolgreich gelöscht.`);
                    res.status(200).send(`Form ${filename} erfolgreich gelöscht.`);
                })
                .catch(err => {
                    console.error('Fehler beim Aktualisieren der Index-Datei:', err);
                    res.status(500).send('Fehler beim Aktualisieren der Index-Datei.');
                });
        })
        .catch(err => {
            console.error('Fehler beim Löschen der Dateien:', err);
            res.status(500).send('Fehler beim Löschen der Dateien.');
        });
});

app.listen(port, () => {
  console.log(`✨ SpaceHarmony Server läuft!`);
  console.log(`  - Generator: http://localhost:${port}/generator.html`);
  console.log(`  - Galerie:   http://localhost:${port}/gallery`);
});