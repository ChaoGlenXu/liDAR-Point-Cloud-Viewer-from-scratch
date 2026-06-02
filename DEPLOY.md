# Deployment

This app has two deployment modes.

## Fast Drag-And-Drop Static Deploy

The viewer runs entirely in the browser, so the easiest deployment is a static
bundle.

```bash
npm run package:drop
```

That creates:

- `drag-drop-deploy/` - drag this folder into Netlify Drop, Cloudflare Pages
  Direct Upload, or another static host.
- `lidar-annotator-static.zip` - upload this zip if the host accepts zip files.

Netlify Drop: https://app.netlify.com/drop

## Full Netlify SSR Deploy

The existing TanStack Start build also supports Netlify serverless deployment:

```bash
npm run build
netlify deploy --prod --dir dist --functions .netlify/functions-internal
```

Use this path only if you later add server functions, authentication, database
calls, or other backend behavior.
