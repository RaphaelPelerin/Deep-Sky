# Changelog

## 0.1.0 (2026-10-28)

First release.

- Render engine: WebGL nebula, aurora, light beams, roaming light with lens, shockwaves, light sweep, grain and vignette; 2D stars with parallax, swirl, constellations, shooting stars and spotlight; a perspective grid floor.
- Runs in a Web Worker on OffscreenCanvas, with main-thread and CSS fallbacks.
- Adaptive quality, long-task back-off, pause when hidden, reduced-motion support.
- Seven presets (`cosmos`, `aurora`, `ember`, `abyss`, `synthwave`, `graphite`, `daybreak`), dark and light palettes with crossfade.
- `createDeepSky()` core API, `<deep-sky>` element, React and Vue components, Svelte action, CDN build.
