# Changelog

## 0.2.0 (2026-10-28)

- **3D models.** `models` hangs glTF / GLB files or built-in shapes (`orb`, `knot`, `torus`, `crystal`, `gem`, `planet`, `cube`) in the sky, lit by it: the roaming light, aurora rim lights, the nebula as reflections and refraction, shockwaves that bend them and set them spinning.
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
