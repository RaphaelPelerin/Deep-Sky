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

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
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
  vec3 nebCol = uNeb0;
  if (uMix.x > 0.0) {
    vec2 np = p * uShape.x;
    vec2 q = vec2(fbm(np * 1.3 + vec2(0.0, t * 0.035)),
                  fbm(np * 1.3 + vec2(5.2, -t * 0.03)));
    vec2 r = vec2(fbm(np * 1.7 + 3.0 * q + vec2(1.7, 9.2) + t * 0.045),
                  fbm(np * 1.7 + 3.0 * q + vec2(8.3, 2.8) - t * 0.04));
    neb = smoothstep(0.26, 0.92, fbm(np * 1.5 + 3.2 * r));
    nebCol = mix(uNeb0, uNeb1, clamp(q.x * 1.7 - 0.2, 0.0, 1.0));
    nebCol = mix(nebCol, uNeb2, clamp(r.y * r.y * 2.0, 0.0, 1.0));
    nebCol = mix(nebCol, uNeb3, clamp(r.x * r.x * r.x * 2.2, 0.0, 1.0) * 0.55);
    // slow drift of the palette towards warm highlights
    nebCol = mix(nebCol, nebCol.brg * vec3(1.1, 0.95, 0.6), uFx.w * (0.5 + 0.5 * sin(t * 0.045)));
  }

  // aurora: waving curtains with a sharp lower edge and vertical streaks
  float aur = 0.0;
  vec3 aurCol = vec3(0.0);
  if (uMix.y > 0.0) {
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float yc = uShape.y + fi * 0.1
        + 0.07 * sin(p.x * (1.4 + fi * 0.6) + t * (0.22 + fi * 0.07) + fi * 2.1)
        + 0.03 * sin(p.x * 5.3 - t * 0.41 + fi * 1.3)
        + 0.015 * sin(p.x * 11.0 + t * 0.9 + fi);
      float dy = p.y - yc;
      float band = exp(-max(dy, 0.0) * 7.0) * exp(-max(-dy, 0.0) * 30.0);
      float streak = 0.45 + 0.55 * noise(vec2(p.x * 24.0 + fi * 17.0 + t * 0.15, t * 0.5 + fi));
      float a = band * streak * (1.0 - fi * 0.22);
      aur += a;
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

  // light theme: soft pastel tints over a bright background
  vec3 light = uBg;
  light = mix(light, mix(nebCol, uBg, 0.45), neb * 0.3 * uMix.x);
  light = mix(light, mix(aurCol / max(aur, 1e-3), uBg, 0.5), clamp(aur, 0.0, 1.0) * 0.28 * uMix.y);
  light = mix(light, mix(uRays, uBg, 0.5),
    clamp(rays * 0.25 * uMix.z + ml * 0.22 * uMix.w + ring * 0.2 + sweep * 0.15, 0.0, 1.0));
  light = mix(uBg, light, intro);

  vec3 col = mix(light, dark, uPointer.z);
  col += (hash(gl_FragCoord.xy + fract(clock * 7.0) * 113.0) - 0.5) * uFx.y;
  gl_FragColor = vec4(col, 1.0);
}
`;
