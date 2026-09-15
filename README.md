# BAUDA

A 3D idle empire builder rendered entirely as ASCII, built as an iOS home-screen
web app. Design document: [`features.md`](features.md).

Phase 0 is built: the render pipeline, camera, placement, terminal chrome, sim loop,
save system and PWA shell. There is no gameplay yet — Phase 0 exists to de-risk the
renderer and the placement interaction before content is written. Results are in
§16 of the design document.

## Running

```sh
npm install
npm run dev        # dev server
npm run build      # typecheck + production build
npm run shots      # verification harness: screenshots + character dumps per tier
```

`npm run shots` drives a real browser at iPhone dimensions, captures every terminal
tier as both a PNG and the literal character grid, and checks placement precision,
font coverage and save round-tripping. Output lands in `shots/`.

## How the renderer works

The world is a real 3D scene; ASCII is a post-process, not hand-placed characters.

1. **Scene pass** — low-poly meshes, orthographic camera, rendered to a target at
   character-cell resolution (plus depth and normals). Roughly a thumbnail.
2. **DoG pass** — difference of gaussians over luminance, suppressing smooth shading
   so the next pass finds structure rather than gradients.
3. **Cell pass** — one fragment per character cell. Averages luminance, runs Sobel
   for edge *direction*, gates edges on geometry (depth laplacian + normal
   discontinuity), picks a glyph, composites the UI overlay. Its output *is* the
   character grid.
4. **Display pass** — one fragment per screen pixel: look the cell's glyph up in the
   atlas and color it. Deliberately trivial.

Splitting cell decisions from display is what makes it cheap, and it means the UI
chrome and the world end up in the same character buffer rather than HTML floating
over a canvas.

## Layout

```
src/render/   glyph atlas, charset, shaders, tiers, the renderer
src/world/    scene, camera rig, building definitions, placement, auras
src/ui/       cell buffer and terminal chrome
src/input/    pointer gesture recognizer
src/sim/      seeded RNG, fixed-timestep loop
src/save/     IndexedDB + localStorage mirror + export
scripts/      verification harness
```
