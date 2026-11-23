/** full-screen triangle */
export const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * Nebula (domain-warped fbm), aurora curtains, light beams, roaming light with a lens,
 * shockwaves, light sweep, grain and vignette. Dark and light themes are two blends of the
 * same layers, cross-faded with uPointer.z.
 */
export const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec4 uFrame;      // xy: resolution, z: animation time, w: clock (s)
uniform vec4 uPointer;    // xy: light position (0..1, y up), z: dark mix, w: last sweep (clock)
uniform vec4 uRipples[4]; // xy: center (0..1), z: start (clock), w: strength
uniform vec4 uMix;        // nebula, aurora, rays, glow intensities
uniform vec4 uFx;         // lens, grain, vignette, shimmer
uniform vec4 uShape;      // nebula scale, aurora offset, rays spread, intro duration
uniform vec4 uDay;        // light theme: contrast, sheen, bokeh, split
uniform vec4 uAuroraA;    // aurora: height, speed, waves, streaks
uniform vec4 uAuroraB;    // aurora: curtains, tilt, edge
uniform sampler2D uNoise; // 256×256, four independent random values per texel, repeating
uniform vec3 uBg;
uniform vec3 uNeb0;
uniform vec3 uNeb1;
uniform vec3 uNeb2;
uniform vec3 uNeb3;
uniform vec3 uAur0;
uniform vec3 uAur1;
uniform vec3 uRays;
uniform vec3 uGlow;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// four independent smooth value noises in one texture read, instead of four hashes each: the
// fraction goes through a smoothstep first, so the GPU's bilinear filter interpolates like a cubic
vec4 noise4(vec2 p) {
  vec2 i = mod(floor(p), 256.0);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return texture2D(uNoise, (i + f + 0.5) / 256.0);
}

vec4 fbm4(vec2 p) {
  vec4 v = vec4(0.0);
  float a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise4(p);
    p = rot * p * 2.03 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 res = uFrame.xy;
  float t = uFrame.z;
  float clock = uFrame.w;
  vec2 uv = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  // shockwaves: expanding rings that bend everything behind them
  float ring = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 rp = uRipples[i];
    float age = clock - rp.z;
    if (rp.w > 0.0 && age > 0.0 && age < 3.0) {
      vec2 dv = p - (rp.xy - 0.5) * vec2(aspect, 1.0);
      float d = length(dv);
      float w = d - age * 0.85;
      float k = exp(-w * w * 380.0) * (1.0 - age / 3.0) * rp.w;
      ring += k;
      p += dv / (d + 1e-4) * k * 0.035;
    }
  }

  // roaming light (follows the cursor) with a subtle magnifying lens
  vec2 md = p - (uPointer.xy - 0.5) * vec2(aspect, 1.0);
  float ml = exp(-dot(md, md) * 7.0);
  p -= md * 0.08 * ml * uFx.x;

  // nebula
  float neb = 0.0;
  // the whole field, not only the dense clouds: the light theme paints with it
  float nebField = 0.0;
  vec3 nebCol = uNeb0;
  if (uMix.x > 0.0) {
    vec2 np = p * uShape.x;
    // domain warping, three passes of four octaves: each reads two or more fields at once
    vec2 q = fbm4(np * 1.3 + vec2(t * 0.012, t * 0.035)).xy;
    vec2 r = fbm4(np * 1.7 + 3.0 * q + vec2(1.7, 9.2) + vec2(t * 0.045, -t * 0.04)).zw;
    nebField = fbm4(np * 1.5 + 3.2 * r).x;
    // thresholds matched to the earlier hash noise: the same clouds, at a fraction of the cost
    neb = smoothstep(0.55, 0.92, nebField);
    nebCol = mix(uNeb0, uNeb1, clamp(q.x * 1.7 - 0.2, 0.0, 1.0));
    nebCol = mix(nebCol, uNeb2, clamp(r.y * r.y * 2.0, 0.0, 1.0));
    nebCol = mix(nebCol, uNeb3, clamp(r.x * r.x * r.x * 2.2, 0.0, 1.0) * 0.55);
    // slow drift of the palette towards warm highlights
    nebCol = mix(nebCol, nebCol.brg * vec3(1.1, 0.95, 0.6), uFx.w * (0.5 + 0.5 * sin(t * 0.045)));
  }

  // aurora: waving curtains with a sharp lower edge and vertical streaks
  float aur = 0.0;
  // the same curtains without streaks nor a sharp edge: a soft veil for the light theme
  float aurSoft = 0.0;
  vec3 aurCol = vec3(0.0);
  if (uMix.y > 0.0) {
    float ta = t * uAuroraA.y;
    float rise = 7.0 / uAuroraA.x;
    float edge = 30.0 * uAuroraB.z;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      if (fi >= uAuroraB.x) break;
      float yc = uShape.y + fi * 0.1 + uAuroraB.y * 0.5 * p.x
        + uAuroraA.z * (0.07 * sin(p.x * (1.4 + fi * 0.6) + ta * (0.22 + fi * 0.07) + fi * 2.1)
          + 0.03 * sin(p.x * 5.3 - ta * 0.41 + fi * 1.3)
          + 0.015 * sin(p.x * 11.0 + ta * 0.9 + fi));
      float dy = p.y - yc;
      float band = exp(-max(dy, 0.0) * rise) * exp(-max(-dy, 0.0) * edge);
      float streak = mix(1.0, 0.45 + 0.55 * noise4(vec2(p.x * 24.0 + fi * 17.0 + ta * 0.15, ta * 0.5 + fi)).y, uAuroraA.w);
      float a = band * streak * (1.0 - fi * 0.22);
      aur += a;
      aurSoft += exp(-max(dy, 0.0) * 4.0 / uAuroraA.x) * exp(-max(-dy, 0.0) * 8.0) * (1.0 - fi * 0.22);
      aurCol += a * mix(uAur0, uAur1, clamp(dy * 5.0 + fi * 0.25, 0.0, 1.0));
    }
  }

  // light beams from a slowly swaying source above the screen
  float rays = 0.0;
  if (uMix.z > 0.0) {
    vec2 sv = p - vec2(0.45 * sin(t * 0.06), 0.95);
    float ang = atan(sv.x, -sv.y);
    float s = uShape.z;
    rays = pow(0.5 + 0.5 * sin(ang * 11.0 * s + t * 0.3), 7.0)
      + 0.7 * pow(0.5 + 0.5 * sin(ang * 6.0 * s - t * 0.2 + 1.3), 9.0)
      + 0.5 * pow(0.5 + 0.5 * sin(ang * 19.0 * s + t * 0.45 + 2.1), 12.0);
    rays *= exp(-length(sv) * 0.9) * smoothstep(1.3, 0.2, abs(ang));
  }

  // diagonal light sweep (pulse)
  float sweep = 0.0;
  float pa = clock - uPointer.w;
  if (uPointer.w > 0.0 && pa > 0.0 && pa < 1.6) {
    float x = uv.x + (uv.y - 0.5) * 0.35;
    sweep = exp(-pow((x - (pa * 1.1 - 0.2)) * 7.0, 2.0)) * (1.0 - pa / 1.6);
  }

  float intro = uShape.w > 0.0 ? smoothstep(0.0, uShape.w, clock) : 1.0;

  // dark theme: additive light over a deep background
  vec3 dark = uBg;
  dark += nebCol * neb * 0.75 * uMix.x;
  dark += aurCol * 0.45 * uMix.y;
  dark += uRays * rays * 0.17 * uMix.z;
  dark += uGlow * ml * (0.14 + neb * 0.45) * uMix.w;
  dark += uGlow * (ring * 0.35 + sweep * 0.12);
  dark = mix(uBg, dark, intro);
  dark *= 1.0 - uFx.z * dot(uv - 0.5, uv - 0.5);

  // light theme: a slow gradient mesh, large smooth fields of the palette's four colors gliding
  // over bright paper (bent by shockwaves and the lens like the rest), the nebula as a faint
  // marbling on top; then its finish (uDay): depth, an iridescent sheen and bokeh
  vec3 light = uBg;
  float fold = 0.0;
  // all of it is skipped while the sky is fully dark
  if (uPointer.z < 0.999) {
  if (uMix.x > 0.0) {
    vec2 w = p * (0.55 + 0.45 * uShape.x);
    w += 0.32 * vec2(sin(w.y * 1.6 + t * 0.05), sin(w.x * 1.3 - t * 0.04 + 1.1));
    float f0 = 0.5 + 0.5 * sin(w.x * 1.5 + t * 0.055);
    float f1 = 0.5 + 0.5 * sin(w.y * 1.9 - w.x * 0.7 - t * 0.047 + 1.7);
    float f2 = 0.5 + 0.5 * sin((w.x + w.y) * 1.25 + t * 0.041 + 3.1);
    float f3 = 0.5 + 0.5 * sin(length(w - vec2(0.45 * sin(t * 0.031), 0.15)) * 3.0 - t * 0.06);
    float k = uMix.x;
    // split: the colors keep to one side of a slowly turning, gently waving diagonal; the
    // background holds the other side, and the third color lights the seam between them
    float side = 1.0;
    float seam = 0.0;
    if (uDay.w > 0.0) {
      float ang = 2.4 + 0.35 * sin(t * 0.021);
      float d = dot(p, vec2(cos(ang), sin(ang))) + 0.08 * sin(p.y * 3.1 + t * 0.07) + 0.05 * sin(p.x * 4.7 - t * 0.05);
      side = mix(1.0, smoothstep(-0.32, 0.38, d), uDay.w);
      seam = exp(-d * d * 9.0) * uDay.w;
    }
    k *= side;
    light = mix(light, uNeb0, smoothstep(0.25, 1.0, f0) * 0.88 * k);
    light = mix(light, uNeb1, smoothstep(0.32, 1.0, f1) * 0.85 * k);
    light = mix(light, uNeb2, smoothstep(0.4, 1.0, f2) * 0.8 * k);
    light = mix(light, uNeb3, smoothstep(0.45, 1.0, f3) * 0.75 * k);
    light = mix(light, mix(light, nebCol, 0.45), smoothstep(0.64, 0.86, nebField) * 0.3 * k);
    light = mix(light, uNeb2, seam * 0.55 * uMix.x);
    // the folds: a slow field of its own where the colors gather and deepen
    fold = smoothstep(0.45, 1.0, 0.5 + 0.5 * sin(w.x * 0.9 - w.y * 1.4 + t * 0.035 + 2.3)) * k;
  }
  // the aurora on a bright sky: a soft veil, the curtains themselves (streaks, edge and all) in
  // their colors, and a glow that lifts them off the colors behind
  if (uMix.y > 0.0) {
    vec3 ac = aurCol / max(aur, 1e-3);
    light = mix(light, ac, clamp(aurSoft * 0.2 * uMix.y, 0.0, 0.5));
    light = mix(light, ac, clamp(aur * 0.62 * uMix.y, 0.0, 0.88));
    light += ac * clamp(aur, 0.0, 1.5) * 0.14 * uMix.y;
  }

  // contrast: a color multiplied by itself is the same hue, richer and deeper. In the folds and
  // towards the edges (a colored vignette, never gray), plus a touch more saturation everywhere
  if (uDay.x > 0.0) {
    vec3 deep = light * light;
    float edge = clamp(dot(uv - 0.5, uv - 0.5) * 2.2, 0.0, 1.0);
    light = mix(light, deep, clamp(fold * 0.5 + edge * 0.4, 0.0, 0.8) * uDay.x);
    float luma = dot(light, vec3(0.299, 0.587, 0.114));
    light = max(mix(vec3(luma), light, 1.0 + 0.22 * uDay.x), 0.0);
  }

  light = mix(light, vec3(1.0), clamp(rays * 0.32 * uMix.z, 0.0, 0.6));
  light = mix(light, uGlow, ml * 0.14 * uMix.w);

  // sheen: a pearly band sweeping slowly across, its colors shifting like a soap bubble
  if (uDay.y > 0.0) {
    float sx = uv.x * 0.85 + uv.y * 0.55 + 0.08 * sin(uv.y * 4.0 + t * 0.12);
    float band = fract(sx * 0.45 - t * 0.012) - 0.5;
    float m = exp(-band * band * 60.0) + 0.35 * exp(-band * band * 12.0);
    vec3 iri = 0.5 + 0.5 * cos(6.2832 * (sx * 1.7 - t * 0.025 + vec3(0.0, 0.33, 0.67)));
    light = mix(light, mix(vec3(1.0), iri, 0.45), clamp(m * 0.38 * uDay.y, 0.0, 0.75));
  }

  // bokeh: two depths of soft discs of light, a brighter rim, drifting up and breathing
  if (uDay.z > 0.0) {
    float bok = 0.0;
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      vec2 bp = p * (3.2 + fi * 2.6) + vec2(t * 0.03 * (1.0 + fi), -t * 0.06 * (1.0 + fi * 0.6)) + fi * 7.3;
      vec2 cell = floor(bp);
      float h = hash(cell + fi * 13.1);
      if (h > 0.68) {
        // every other random value of the disc from the same hash: one per cell, not four
        vec2 o = (fract(vec2(h * 13.7, h * 71.3)) - 0.5) * 0.3;
        float r = 0.17 + 0.14 * fract(h * 29.1);
        float d = length(fract(bp) - 0.5 - o);
        float disc = smoothstep(r, r - 0.05, d);
        float rim = disc * smoothstep(r - 0.09, r - 0.02, d);
        float breathe = 0.55 + 0.45 * sin(t * 0.4 + h * 40.0);
        bok += (disc * 0.5 + rim * 0.5) * breathe * (1.0 - fi * 0.4);
      }
    }
    light = mix(light, vec3(1.0), clamp(bok, 0.0, 1.0) * 0.32 * uDay.z);
  }

  light = mix(light, vec3(1.0), clamp(ring * 0.3 + sweep * 0.25, 0.0, 1.0));
  // the paper shows through towards the top: a bright sky, calm behind headlines
  light = mix(light, uBg, smoothstep(0.55, 1.1, uv.y) * 0.18);
  }
  light = mix(uBg, light, intro);

  vec3 col = mix(light, dark, uPointer.z);
  col += (hash(gl_FragCoord.xy + fract(clock * 7.0) * 113.0) - 0.5) * uFx.y * (0.5 + 0.5 * uPointer.z);
  gl_FragColor = vec4(col, 1.0);
}
`;
