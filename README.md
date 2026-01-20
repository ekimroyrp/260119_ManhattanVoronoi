# 260119_ManhattanVoronoi

260119_ManhattanVoronoi is a three.js project that generates 3D Manhattan-distance Voronoi cells as separate meshes inside a configurable box, with a stylized floating UI and seeded point preview.

## Features
- 3D Manhattan Voronoi cell meshes generated per seed inside a bounded box
- Marching cubes meshing with adjustable density and per-cell smoothing
- Floating UI matching the BooleanCube styling, with seeded point preview

## Getting Started
1. Run `npm install`.
2. Start the dev server with `npm run dev`.

## Controls
- Drag the panel header to reposition the UI.
- Use the sliders for box X/Y/Z, points, seed, resolution, smooth, and explode.
- Click `Reframe` to smoothly reset the camera and `Unhide` to restore hidden cells.
- `Undo`/`Redo` step through hidden-cell history.
- Orbit controls: LMB rotate, MMB/scroll dolly, RMB pan.
- MMB on a cell hides it and its seed point.
