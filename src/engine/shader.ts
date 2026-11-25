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
uniform vec4 uMeshA;      // gradient mesh: intensity, sharpness, drift, flow
uniform vec2 uMeshB;      // gradient mesh: silk, depth (dark theme)
uniform vec4 uMeshP[6];   // gradient mesh points: xy (0..1, y up), z: reach, w: 1 when used
uniform vec3 uMeshC[6];   // their colors, in OKLab
uniform vec3 uMeshBg;     // the background, in OKLab
uniform vec4 uSun;        // sun: xy (0..1, y up), radius, intensity
uniform vec4 uSunC;       // its color, w: cumulus towers on the horizon
uniform vec4 uClouds;     // clouds: intensity, cover, scale, speed
uniform vec3 uCloudLit;   // their side that faces the sun
uniform vec3 uCloudDim;   // their side away from it
uniform vec4 uSea;        // sea: horizon height (0 = none), waves, glints; w: the sun's halo
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

vec3 fromOklab(vec3 c) {
  vec3 lms = vec3(
    c.x + 0.3963377774 * c.y + 0.2158037573 * c.z,
    c.x - 0.1055613458 * c.y - 0.0638541728 * c.z,
    c.x - 0.0894841775 * c.y - 1.291485548 * c.z);
  lms = lms * lms * lms;
  vec3 rgb = clamp(vec3(
    4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
    -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
    -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.707614701 * lms.z), 0.0, 1.0);
  return mix(rgb * 12.92, 1.055 * pow(max(rgb, 1e-5), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, rgb));
}

// the gradient mesh: every point pulls the pixel towards its color by how near it is. The points
// wander and breathe, and the plane they sit on flows, so that the colors never look like discs.
// Mixed in OKLab: hot and cold meet through a clean color, not through gray
vec3 meshSky(vec2 q, float aspect, float t) {
  // as wide as tall, whatever the screen
  vec2 k = vec2(sqrt(aspect), 1.0 / sqrt(aspect));
  vec2 g = q * k;
  float flow = uMeshA.w;
  vec2 n = noise4(g * 1.15 + vec2(t * 0.021, -t * 0.027)).xy - 0.5;
  g += flow * (0.2 * n
    + 0.075 * vec2(sin(g.y * 3.1 + t * 0.13), sin(g.x * 2.7 - t * 0.11 + 1.3))
    + 0.03 * vec2(sin(g.y * 6.3 - t * 0.17 + 2.0), sin(g.x * 5.7 + t * 0.15 + 4.1)));
  // a little of the night in every pixel: it takes over where no color reaches
  float base = uMeshB.y * 0.32 * uPointer.z + 1e-4;
  vec3 lab = uMeshBg * base;
  float chroma = length(uMeshBg.yz) * base;
  float total = base;
  for (int i = 0; i < 6; i++) {
    vec4 m = uMeshP[i];
    if (m.w < 0.5) break;
    float fi = float(i);
    vec2 c = m.xy + uMeshA.z * vec2(
      0.085 * sin(t * (0.1 + 0.017 * fi) + fi * 2.4) + 0.03 * sin(t * 0.23 + fi * 4.1),
      0.1 * cos(t * (0.085 + 0.021 * fi) + fi * 1.7));
    float s = m.z * (1.0 + 0.12 * uMeshA.z * sin(t * 0.14 + fi * 3.1));
    vec2 d = g - c * k;
    float w = exp(-dot(d, d) * uMeshA.y / (s * s));
    lab += uMeshC[i] * w;
    chroma += length(uMeshC[i].yz) * w;
    total += w;
  }
  lab /= total;
  // opposite hues cancel out on their way to each other: give the mix back most of its color
  float c = length(lab.yz);
  lab.yz *= 1.0 + 0.65 * clamp(chroma / total / max(c, 1e-3) - 1.0, 0.0, 1.6);
  // silk: folds of light across the flow, lighter on their crests, richer in their hollows
  if (uMeshB.x > 0.0) {
    float a = g.x * 2.3 + g.y * 3.4 + 3.2 * n.x + t * 0.1;
    float f = sin(a) * 0.6 + sin(a * 1.9 - n.y * 4.0 - t * 0.07 + 1.0) * 0.4;
    float lift = f * uMeshB.x * 0.085;
    lab.x *= 1.0 + lift * mix(1.0, 1.8, uPointer.z);
    lab.yz *= 1.0 - lift * 1.1;
  }
  // at night the colors burn at their heart and fall off fast into the dark
  float night = uPointer.z * min(uMeshB.y, 1.5);
  float heart = smoothstep(0.16, 0.62, lab.x);
  lab *= mix(1.0, mix(0.52, 1.12, heart), night);
  return fromOklab(lab);
}

// cloud density: large soft shapes, the finer octaves folded into rounded puffs
float cloudField(vec2 p) {
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  float v = 0.5 * noise4(p).x;
  p = rot * p * 2.07 + vec2(3.1, 1.7);
  v += 0.25 * noise4(p).y;
  p = rot * p * 2.11 + vec2(1.3, 4.9);
  vec4 n = noise4(p);
  v += 0.135 * abs(2.0 * n.x - 1.0) + 0.03 * n.y;
  p = rot * p * 2.17 + vec2(5.7, 2.3);
  n = noise4(p);
  v += 0.07 * abs(2.0 * n.z - 1.0) + 0.02 * n.w;
  p = rot * p * 2.3 + vec2(2.9, 8.1);
  return v + 0.04 * abs(2.0 * noise4(p).x - 1.0);
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

  // gradient mesh: what both themes are painted on
  vec3 ground = uBg;
  vec2 q = p / vec2(aspect, 1.0) + 0.5;
  // the sea mirrors what is above its horizon: the same sky, read upside down through the waves
  float hz = uSea.x;
  float under = 0.0;
  float depth = 0.0;
  vec4 wave = vec4(0.5);
  if (hz > 0.0 && q.y < hz) {
    under = 1.0;
    depth = (hz - q.y) / hz;
    float far = 1.0 / (depth + 0.06);
    // long crests, with ripples across them
    float wx = (q.x - 0.5) * aspect * far;
    wave = noise4(vec2(wx * 2.2 + t * 0.06, far * 6.0 + t * 0.55)) * 0.55
      + noise4(vec2(wx * 5.5 - t * 0.12, far * 15.0 + t * 0.95)) * 0.3
      + noise4(vec2(wx * 13.0 + t * 0.2, far * 34.0 + t * 1.5)) * 0.15;
    // waves get bigger towards us
    float swell = uSea.y * depth;
    q = vec2(q.x + (wave.x - 0.5) * 0.07 * swell, hz + (hz - q.y) * 1.02 + (wave.y - 0.5) * 0.32 * swell * (0.35 + depth));
    q.y = hz + abs(q.y - hz);
  }
  if (uMeshA.x > 0.0) ground = mix(uBg, meshSky(q, aspect, t), uMeshA.x);
  float up = max(q.y - hz, 0.0);
  vec2 sv = (q - uSun.xy) * vec2(aspect, 1.0);
  float sd = length(sv);
  float sunOn = min(uSun.w, 1.0);
  // how much of the disc shows through the clouds
  float clear = 1.0;
  if (uClouds.x > 0.0) {
    float near = exp(-sd * 1.9) * sunOn;
    // the shaded side takes the color of the sky around it: clouds belong to the air they are in
    vec3 shade = mix(uCloudDim, ground, 0.22);
    vec3 sunlit = mix(uCloudLit, min(uSunC.rgb * 1.1 + 0.1, 1.0), near * 0.75);
    float low = 0.64 - 0.3 * uClouds.y;

    // a deck of small clouds seen from below, in rows, shrinking as it goes to the horizon
    float far = 0.85 / (up + 0.2);
    vec2 cp = vec2((q.x - 0.5) * aspect * far * 1.25, far * 3.1) * uClouds.z + vec2(t * 0.022, t * 0.014) * uClouds.w;
    vec4 wide = noise4(cp * 0.42 + 5.1);
    cp += 0.7 * (wide.xy - 0.5);
    // patches of them, and clear sky between
    float patchy = (wide.z - 0.5) * 0.34;
    float d = cloudField(cp) + patchy - low;
    float deck = smoothstep(0.0, 0.26, d);
    if (deck > 0.003) {
      // two steps towards the sun: how much cloud the light goes through to get here
      vec2 to = normalize(vec2(-sv.x, 0.4 + max(sv.y, 0.0) * 0.5)) * 0.17;
      float through = max(cloudField(cp + to) + patchy - low, 0.0) + 0.7 * max(cloudField(cp + to * 2.3) + patchy - low, 0.0);
      float lit = exp(-through * 6.5) * (0.5 + 0.6 * smoothstep(0.32, 0.0, d));
      vec3 cloud = mix(shade, sunlit, clamp(lit * 1.25, 0.0, 1.0));
      // thin edges let the light of a sun behind them through
      cloud += (1.0 - cloud) * uSunC.rgb * near * (1.0 - smoothstep(0.05, 0.3, d)) * 0.8;
      deck *= smoothstep(0.02, 0.16, up) * (1.0 - 0.25 * smoothstep(0.4, 0.9, up));
      ground = mix(ground, cloud, deck * uClouds.x * 0.92);
      clear *= 1.0 - deck * uClouds.x * 0.6;
    }

    // towers of cumulus standing on the horizon, their tops rounded and lit
    if (uSunC.w > 0.0 && up < 0.5) {
      float x = (q.x - 0.5) * aspect + t * 0.0035 * uClouds.w;
      vec4 hills = noise4(vec2(x * 1.15 + 3.0, 2.5)) * 0.65 + noise4(vec2(x * 3.1, 9.5)) * 0.35;
      for (int i = 0; i < 2; i++) {
        float fi = float(i);
        float rank = (i == 0 ? hills.x : hills.y);
        float top = uSunC.w * (0.02 + (0.3 - 0.13 * fi) * smoothstep(0.4, 0.82, rank)) * (0.6 + 0.8 * uClouds.y);
        if (up > top + 0.09) continue;
        vec2 bp = vec2(x * (1.0 + 0.35 * fi) + fi * 11.0, up * 1.15) * (6.2 + 2.4 * fi) * uClouds.z - vec2(0.0, t * 0.006);
        bp += 0.35 * (noise4(bp * 0.8 + 3.7).xy - 0.5);
        float puff = cloudField(bp);
        float e = top - up + (puff - 0.5) * 0.2;
        float body = smoothstep(0.0, 0.026, e);
        if (body < 0.003) continue;
        vec2 to = normalize(-sv + vec2(1e-3, 0.02)) * 0.2;
        float e2 = top - up - to.y * 0.1 + (cloudField(bp + to) - 0.5) * 0.2;
        // the side that faces the sun, and the tops, under the open sky
        float lit = clamp(0.36 + (e - e2) * 11.0, 0.0, 1.0) * mix(1.1, 0.5, smoothstep(0.01, 0.17, e));
        vec3 cloud = mix(shade, sunlit, clamp(lit * 1.2, 0.0, 1.0));
        cloud += (1.0 - cloud) * uSunC.rgb * near * (1.0 - smoothstep(0.0, 0.05, e)) * 0.85;
        // their feet melt into the haze
        body *= smoothstep(-0.01, 0.05 + 0.03 * fi, up) * (0.94 - 0.2 * (1.0 - fi));
        ground = mix(ground, cloud, body * uClouds.x);
        clear *= 1.0 - body * 0.85;
      }
    }
  }
  if (uSun.w > 0.0) {
    // light is added up, then exposed like film: the disc burns to white, its glow goes through
    // yellow and orange to red on its own
    float r = uSun.z * min(1.0, aspect * 1.25);
    // the air flattens a low sun
    float flat_ = length(sv * vec2(1.0, 1.07));
    float disc = smoothstep(r * 1.1, r * 0.8, flat_);
    // it burns through most of what passes in front of it
    clear = mix(0.7, 1.0, clear);
    float edge = sd / r;
    float glow = 1.5 * exp(-edge * edge * 0.3) + 1.05 * exp(-edge * 0.5);
    float air = 0.5 * exp(-sd * 2.1) * (1.0 + 0.05 * sin(t * 0.5));
    // a band of lit haze on the horizon, brightest under the sun
    if (hz > 0.0) air += exp(-up * 11.0) * (0.1 + 0.42 * exp(-sv.x * sv.x * 2.2));
    // faint shafts between the clouds
    vec2 dir = sv / (sd + 1e-3);
    air += 0.22 * smoothstep(0.5, 0.85, noise4(dir * 3.4 + vec2(t * 0.012, 4.0)).x) * exp(-sd * 2.8) * smoothstep(r, r * 3.0, sd);
    vec3 tint = uSunC.rgb;
    vec3 deep = tint * tint * vec3(1.0, 0.8, 0.85);
    // the lower the light, the more air it crosses
    vec3 low = mix(vec3(1.0, 0.72, 0.62), vec3(1.0), smoothstep(-r * 1.1, r * 0.9, sv.y));
    // its own color, not the sky's behind it: a red sun stays red at night
    ground *= 1.0 - mix(0.25, 0.75, uPointer.z) * disc * clear * sunOn;
    vec3 light0 = tint * low * disc * mix(2.2, 2.4, uPointer.z) * clear
      + mix(deep, tint, exp(-edge * 0.7)) * glow * (0.35 + 0.65 * clear) * uSea.w
      + deep * air * uSea.w;
    ground = 1.0 - (1.0 - ground) * exp(-light0 * uSun.w * mix(1.0, 0.85, uPointer.z));
  }
  if (under > 0.0) {
    // water: deeper than the sky it mirrors, more and more as it comes to us
    ground = mix(ground, ground * ground * 0.92, clamp(0.25 + 0.6 * depth, 0.0, 1.0));
    float path = exp(-pow((uv.x - uSun.x) * aspect / (0.1 + 0.42 * depth), 2.0));
    // a long path of light, broken by the crests
    float glint = (smoothstep(0.42, 0.66, wave.z) * 0.85 + 0.12) * path * (1.0 - 0.3 * depth);
    glint += 0.16 * smoothstep(0.62, 0.78, wave.w);
    ground += (1.0 - ground) * uSunC.rgb * glint * uSea.z * min(uSun.w, 1.0) * 0.8;
  }

  // dark theme: additive light over a deep background
  vec3 dark = ground;
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
  vec3 light = ground;
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
    // a gradient mesh already paints the sky: only the marbling goes on it
    float k = uMix.x * (1.0 - uMeshA.x);
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
    light = mix(light, mix(light, nebCol, 0.45), smoothstep(0.64, 0.86, nebField) * 0.3 * mix(k, uMix.x, uMeshA.x));
    light = mix(light, uNeb2, seam * 0.55 * uMix.x * (1.0 - uMeshA.x));
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
  light = mix(light, uBg, smoothstep(0.55, 1.1, uv.y) * 0.18 * (1.0 - uMeshA.x));
  }
  light = mix(uBg, light, intro);

  vec3 col = mix(light, dark, uPointer.z);
  col += (hash(gl_FragCoord.xy + fract(clock * 7.0) * 113.0) - 0.5) * uFx.y * (0.5 + 0.5 * uPointer.z);
  gl_FragColor = vec4(col, 1.0);
}
`;
