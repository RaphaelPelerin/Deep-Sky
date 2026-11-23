# Changelog

## 0.3.0 (2026-11-23)

- **A new light theme.** A slow gradient mesh of the palette's colors, vivid and smooth, over bright paper, with the nebula as a faint marbling, instead of faint gray tints. Beams, the roaming light, shockwaves and sweeps add light, stars are white sparkles, the aurora is a soft veil, and the grain is halved. Every preset has new light colors.
- **`daylight`**, the light theme's finish: `contrast` (colors deepen in the folds and towards the edges, a colored vignette, never gray), `sheen` (a pearly, iridescent band sweeping slowly across) `bokeh` (soft discs of light with a bright rim, drifting up) and `split` (hot and cold sides: the colors keep to one side of a slowly turning diagonal, the background holds the other, the third color lights the seam). Also `<deep-sky daylight="1.5">` and a Daylight section in the playground. Skipped entirely while the sky is dark.
- **Light-first presets**: `sunset` (hot red and orange against electric blue, meeting through violet), `daybreak` (remade: peach, rose and lilac), `mist` (a cool morning haze), `blossom` (cherry blossom pinks), `lagoon` (turquoise water and sunlight) and `porcelain` (warm whites and grays for product UIs). Each has a dark palette too.
- The `aurora` preset is gone (the aurora layer stays): asking for it gives `cosmos`.
- The package is published as `deep-sky-background` on npm.

## 0.2.0 (2026-10-28)

- **3D models.** `models` hangs glTF / GLB files or built-in shapes (`orb`, `knot`, `torus`, `crystal`, `gem`, `planet`, `cube`) in the sky, lit by it: the roaming light, aurora rim lights, the nebula as reflections and refraction, shockwaves that bend them and set them spinning.
- `anchor` attaches a model to an element (or a CSS selector): it scrolls with its section, sticks with a sticky one, and its `x`, `y` and `size` are relative to that box. Also `<deep-sky model-anchor="#stage">`.
- `reveal` (0–1) materializes a model, or dissolves it, smoothly: drive it from the scroll. A hidden model (`reveal: 0`) is loaded and compiled ahead of time, so it appears without a hitch. Removed models dissolve away, a new shape cross-fades with the old one.
- Shaders compile in parallel (`KHR_parallel_shader_compile`) and meshes upload ahead of time: the first 3D frame no longer freezes the sky.
- Surfaces: `auto` (the file's PBR materials and maps), `chrome`, `glass`, `hologram`, `iridescent`, `wire`, `nebula`; liquid surfaces with `morph`.
- A WebGL 2 layer with 4× MSAA, HDR, bloom and light shafts, rendered in the worker and downloaded only by pages that use it.
- `<deep-sky model="knot" model-material="glass">`, `onModelError`, and the `modelDefaults`, `modelShapes`, `modelMaterials` exports.
- The grid is drawn on the particle layer with sub-pixel antialiasing: no more flicker, 60 fps while it scrolls.

## 0.1.0 (2026-10-28)

First release.

- Render engine: WebGL nebula, aurora, light beams, roaming light with lens, shockwaves, light sweep, grain and vignette; 2D stars with parallax, swirl, constellations, shooting stars and spotlight; a perspective grid floor.
- Runs in a Web Worker on OffscreenCanvas, with main-thread and CSS fallbacks.
- Adaptive quality, long-task back-off, pause when hidden, reduced-motion support.
- Seven presets (`cosmos`, `aurora`, `ember`, `abyss`, `synthwave`, `graphite`, `daybreak`), dark and light palettes with crossfade.
- `createDeepSky()` core API, `<deep-sky>` element, React and Vue components, Svelte action, CDN build.
