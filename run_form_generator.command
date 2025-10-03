#!/bin/bash
# Navigiert zum Verzeichnis, in dem das Skript liegt, und führt den Generator aus.
cd "$(dirname "$0")"
node js/formGenerator.js
