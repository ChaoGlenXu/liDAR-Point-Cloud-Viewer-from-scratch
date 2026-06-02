#!/bin/bash
cd "$(dirname "$0")"
echo "→ Removing bun's node_modules..."
rm -rf node_modules
echo "→ Installing with npm..."
npm install --legacy-peer-deps
echo "→ Building for Netlify..."
npm run build
echo ""
echo "✓ Done! Your dist/client folder is ready to drag & drop at netlify.com/drop"
open .
