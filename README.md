# liDAR Point Cloud Viewer from scratch

A browser-based LiDAR point cloud annotation tool built with React, Vite,
TanStack Start, Three.js, React Three Fiber, and Konva.

## Features

- Interactive 3D point cloud viewer
- Procedural LiDAR sample scenes
- KITTI `.bin`, PCD, and ASCII PLY imports
- 3D bounding box annotation for cars, pedestrians, cyclists, and other objects
- Synced 2D camera projection panel
- Timeline playback and sparse keyframe interpolation
- JSON, KITTI label, and nuScenes-style annotation export

## Run locally

```bash
npm install
npm run dev
```

## Build

Full TanStack Start / Netlify SSR build:

```bash
npm run build
```

Static drag-and-drop build:

```bash
npm run package:drop
```

That creates `drag-drop-deploy/` and `lidar-annotator-static.zip`.

## Deploy

For the fastest deploy, upload the static build to Netlify Drop:

1. Run `npm run package:drop`
2. Open https://app.netlify.com/drop
3. Drag in `drag-drop-deploy/` or `lidar-annotator-static.zip`

The app currently runs client-side and does not require a database or backend
service.
