/**
 * updates_library.js
 * 
 * Run this script to update the 'collections/index.json' file.
 * This is useful if you manually added JSON files to the 'collections' folder in VS Code.
 * 
 * Usage: node updates_library.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const collectionsDir = path.join(__dirname, 'collections');
const indexPath = path.join(collectionsDir, 'index.json');

async function updateIndex() {
    try {
        if (!fs.existsSync(collectionsDir)) {
            console.error("Error: 'collections' directory not found.");
            return;
        }

        const files = await fs.promises.readdir(collectionsDir);
        // Filter for .json files, excluding index.json itself
        const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');

        console.log(`Found ${jsonFiles.length} forms in library.`);

        const details = await Promise.all(jsonFiles.map(async f => {
            const stat = await fs.promises.stat(path.join(collectionsDir, f));
            return { filename: f, date: stat.mtime };
        }));

        // Sort by date (newest first)
        details.sort((a, b) => new Date(b.date) - new Date(a.date));

        await fs.promises.writeFile(indexPath, JSON.stringify(details, null, 2));
        console.log("✅ Successfully updated 'collections/index.json'");

    } catch (e) {
        console.error("❌ Failed to update index:", e);
    }
}

updateIndex();
