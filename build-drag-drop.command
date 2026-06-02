#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "-> Building static drag-and-drop package..."
npm run package:drop

echo ""
echo "Ready to deploy:"
echo "  drag-drop-deploy/"
echo "  lidar-annotator-static.zip"
echo ""
echo "Drag either one into Netlify Drop or upload the folder to any static host."
open .
