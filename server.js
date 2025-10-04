import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateMultipleForms } from './js/formGenerator.js';

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

app.listen(port, () => {
  console.log(`✨ SpaceHarmony Server läuft!`);
  console.log(`  - Generator: http://localhost:${port}/generator.html`);
  console.log(`  - Galerie:   http://localhost:${port}/gallery`);
});