# 260119_ManhattanVoronoi

260119_ManhattanVoronoi is a three.js tool that generates 3D Manhattan-distance Voronoi cells as independent meshes inside a configurable box, with a stylized floating UI, seed preview, and export tools.

## Features
- 3D Manhattan Voronoi cell meshes per seed with marching cubes, smoothing, and explode separation
- Toggleable box, cells, colors, and wireframe overlay with hide/undo/redo history
- Seeded point preview plus screenshot capture and OBJ export of visible cells
- Floating UI matching the BooleanCube styling with draggable panel layout

## Getting Started
1. Run `npm install`.
2. Start the dev server with `npm run dev`.
3. Build a production bundle with `npm run build`.

## Controls
- Drag the panel header to reposition the UI.
- Sliders: Box X/Y/Z, Points, Seed, Resolution, Smooth, Explode.
- Toggles: Box, Cells, Colors (greyscale), Wireframe.
- `Reframe` smoothly resets the camera; `Unhide` restores hidden cells; `Undo`/`Redo` step through hide history.
- `Screenshot` saves a PNG of the canvas; `Export` downloads an OBJ of visible cells.
- Orbit controls: LMB rotate, MMB/scroll dolly, RMB pan.
- MMB on a cell hides it and its seed point.

## Deployment
- **Local production preview:** `npm install`, then `npm run build -- --base=./` followed by `npm run preview`.
- **Publish to GitHub Pages:** From a clean `main`, run `npm run build -- --base=./`. Checkout (or create) the `gh-pages` branch in a separate worktree, copy everything inside `dist/` plus a `.nojekyll` marker to its root, commit with a descriptive message, `git push origin gh-pages`, then switch back to `main`.
- **Live demo:** https://ekimroyrp.github.io/260119_ManhattanVoronoi/
