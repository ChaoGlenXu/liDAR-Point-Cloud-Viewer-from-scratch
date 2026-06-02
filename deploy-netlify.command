#!/bin/bash
cd "$(dirname "$0")"

# Install Netlify CLI if not present
if ! command -v netlify &> /dev/null; then
  echo "→ Installing Netlify CLI..."
  npm install -g netlify-cli
fi

echo "→ Deploying to Netlify..."
netlify deploy --prod --dir dist --functions .netlify/functions-internal

echo ""
echo "✓ Deployed! Check the URL above."
