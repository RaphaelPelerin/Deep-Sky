/**
 * GLSL ES 3.00 for the 3D layer. Models live in the same light as the sky: the roaming light
 * is a point light, the aurora colors are rim lights, the nebula frame is what metals reflect
 * and glass refracts, and shockwaves bend the meshes as they pass.
 *
 * Colors are decoded with a gamma of 2 (c²) and encoded back (√c) after tone mapping.
 */

const NOISE = /* glsl */ `
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`;

export const SCENE_VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in vec4 aColor;
layout(location = 4) in vec3 aBary;

uniform mat4 uProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform vec4 uScreen;      // width, height, time, clock
uniform vec4 uRipples[4];  // x, y (0..1, y up), start, strength
uniform vec4 uFx;          // appear, morph, react, glitch

out vec3 vPos;
out vec3 vNormal;
out vec2 vUv;
out vec4 vColor;
out vec3 vBary;
out vec3 vObj;
${NOISE}
// liquid surface: the mesh breathes along its normals
vec3 morph(vec3 p, vec3 n) {
  float t = uScreen.z;
  float k = noise3(p * 2.4 + vec3(0.0, t * 0.5, t * 0.3)) * 0.65 + noise3(p * 5.1 - t * 0.4) * 0.35;
  return p + n * (k - 0.45) * 0.3 * uFx.y;
}

void main() {
  vec3 p = aPos;
  vec3 n = aNormal;
  if (uFx.y > 0.0) {
    vec3 q = morph(p, n);
    // normal of the moved surface, from two neighbours
    vec3 t = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
    vec3 b = cross(n, t);
    vec3 n2 = cross(morph(p + t * 0.01, n) - q, morph(p + b * 0.01, n) - q);
    n = length(n2) > 0.0 ? normalize(n2) : n;
    p = q;
  }

  // shockwaves from the sky: a bulge rides the ring across the model
  vec4 clip = uProj * (uModel * vec4(p, 1.0));
  float aspect = uScreen.x / uScreen.y;
  vec2 sp = clip.xy / clip.w * 0.5 * vec2(aspect, 1.0);
  float push = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 rp = uRipples[i];
    float age = uScreen.w - rp.z;
    if (rp.w > 0.0 && age > 0.0 && age < 3.0) {
      float w = length(sp - (rp.xy - 0.5) * vec2(aspect, 1.0)) - age * 0.85;
      push += exp(-w * w * 90.0) * (1.0 - age / 3.0) * rp.w;
    }
  }
  p += n * push * 0.08 * uFx.z;

  // hologram: slices jump sideways now and then
  if (uFx.w > 0.0) {
    float slice = floor(p.y * 22.0);
    float tick = floor(uScreen.w * 14.0);
    float g = step(0.94 - uFx.w * 0.2, hash3(vec3(slice, tick, 1.0)));
    p.x += g * (hash3(vec3(slice, tick, 7.0)) - 0.5) * 0.12 * uFx.w;
  }

  vec4 view = uModel * vec4(p, 1.0);
  vPos = view.xyz;
  vNormal = uNormalMat * n;
  vUv = aUv;
  vColor = aColor;
  vBary = aBary;
  vObj = aPos;
  gl_Position = uProj * view;
}
`;

export const SCENE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNormal;
in vec2 vUv;
in vec4 vColor;
in vec3 vBary;
in vec3 vObj;
out vec4 outColor;

uniform vec4 uScreen;      // width, height, time, clock
uniform vec4 uRipples[4];
uniform vec4 uLights;      // sweep start, dark mix, roaming light, rim lights
uniform vec4 uMat;         // material, metallic, roughness, opacity
uniform vec4 uBase;        // base color (decoded), alpha
uniform vec4 uEmissive;    // emissive (decoded), alpha cutoff (< 0: none)
uniform vec4 uFx;          // appear, morph, react, glitch
uniform vec4 uTex;         // has base color, metal-rough, normal, emissive maps
uniform float uHasOcc;
uniform vec3 uLightPos;    // roaming light, view space
uniform vec3 uBg;
uniform vec3 uNeb0;
uniform vec3 uNeb1;
uniform vec3 uNeb2;
uniform vec3 uNeb3;
uniform vec3 uAur0;
uniform vec3 uAur1;
uniform vec3 uGlow;
uniform sampler2D uBackdrop;
uniform sampler2D uBaseTex;
uniform sampler2D uMrTex;
uniform sampler2D uNormalTex;
uniform sampler2D uEmissiveTex;
uniform sampler2D uOccTex;
${NOISE}
float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3(p);
    p = p * 2.03 + vec3(3.1, 1.7, 4.3);
    a *= 0.5;
  }
  return v;
}

/** the sky behind the model, blurred by roughness (the frame is stored top row first) */
vec3 backdrop(vec2 uv, float lod) {
  uv = clamp(uv, 0.002, 0.998);
  vec3 c = textureLod(uBackdrop, vec2(uv.x, 1.0 - uv.y), lod).rgb;
  return c * c;
}

/** what a mirror sees: the sky around, plus soft studio lights tinted by the palette */
vec3 env(vec3 r, float rough) {
  float t = uScreen.z;
  vec2 uv = gl_FragCoord.xy / uScreen.xy + r.xy * 0.22;
  vec3 c = backdrop(uv, 1.0 + rough * 6.0) * mix(0.9, 1.5, uLights.y);
  float up = r.y * 0.5 + 0.5;
  c += mix(uNeb0, uNeb2, smoothstep(0.15, 0.95, up)) * 0.22;
  // a dark floor below the horizon gives metals their contrast
  c *= mix(0.25, 1.0, smoothstep(-0.55, 0.05, r.y));
  float soft = mix(1.0, 0.35, rough);
  float top = smoothstep(0.7, 0.7 + 0.12 / soft, r.y);
  float ang = atan(r.x, -r.z);
  float horizon = exp(-pow((r.y - 0.02) * 14.0 * soft, 2.0)) * (0.5 + 0.5 * sin(ang * 3.0 + t * 0.25));
  float left = smoothstep(-0.72, -0.86, r.x) * smoothstep(-0.1, 0.3, r.y);
  float right = smoothstep(0.72, 0.86, r.x) * smoothstep(0.5, 0.0, r.y);
  c += mix(uGlow, vec3(1.0), 0.5) * top * 1.7 * soft;
  c += mix(uAur0, uAur1, 0.5 + 0.5 * sin(ang * 2.0 - t * 0.2)) * horizon * 1.5;
  c += (uAur0 * left + uAur1 * right) * 1.4 * soft;
  return c;
}

vec3 brdf(vec3 N, vec3 V, vec3 L, vec3 albedo, float metal, float rough, vec3 f0) {
  float NoL = dot(N, L);
  if (NoL <= 0.0) return vec3(0.0);
  vec3 H = normalize(L + V);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);
  float NoV = max(dot(N, V), 1e-3);
  float a = rough * rough;
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * d * d);
  float k = a * 0.5 + 0.0001;
  float G = 0.25 / ((NoV * (1.0 - k) + k) * (NoL * (1.0 - k) + k));
  vec3 F = f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0);
  return ((1.0 - F) * (1.0 - metal) * albedo / 3.14159 + F * min(D * G, 60.0)) * NoL;
}

/** the roaming light, two aurora rim lights behind, a soft key from above, and a rim glow */
vec3 lights(vec3 N, vec3 V, vec3 albedo, float metal, float rough, vec3 f0) {
  vec3 toL = uLightPos - vPos;
  float d2 = dot(toL, toL);
  vec3 c = brdf(N, V, toL * inversesqrt(d2), albedo, metal, rough, f0) * uGlow * uLights.z * 10.0 / (1.0 + d2 * 0.35);
  c += brdf(N, V, normalize(vec3(-0.8, 0.35, -0.5)), albedo, metal, rough, f0) * uAur0 * uLights.w * 2.2;
  c += brdf(N, V, normalize(vec3(0.85, 0.5, -0.35)), albedo, metal, rough, f0) * uAur1 * uLights.w * 2.2;
  c += brdf(N, V, normalize(vec3(0.2, 1.0, 0.45)), albedo, metal, rough, f0) * mix(uNeb2, vec3(1.0), 0.3) * 0.9;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  c += mix(uAur0, uAur1, N.x * 0.5 + 0.5) * rim * uLights.w * 0.8;
  return c;
}

/** normal maps without tangents: the frame comes from screen-space derivatives */
vec3 perturb(vec3 N, vec3 p, vec2 uv, vec3 m) {
  vec3 dp1 = dFdx(p);
  vec3 dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N);
  vec3 dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return normalize(mat3(T * inv, B * inv, N) * (m * 2.0 - 1.0));
}

void main() {
  float t = uScreen.z;
  float clock = uScreen.w;
  vec2 suv = gl_FragCoord.xy / uScreen.xy;
  float aspect = uScreen.x / uScreen.y;
  int mode = int(uMat.x + 0.5);

  // materialize: a noise front builds the model, with a burning edge
  float dn = noise3(vObj * 6.0) * 0.7 + noise3(vObj * 15.0) * 0.3;
  float ap = uFx.x * 1.3 - 0.15;
  if (dn > ap) discard;
  float edge = uFx.x < 1.0 ? 1.0 - smoothstep(0.0, 0.06, ap - dn) : 0.0;

  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vPos);

  vec4 base = uBase * vColor;
  if (uTex.x > 0.5) {
    vec4 tb = texture(uBaseTex, vUv);
    base *= vec4(tb.rgb * tb.rgb, tb.a);
  }
  if (uEmissive.w >= 0.0 && base.a < uEmissive.w) discard;
  if (uTex.z > 0.5) N = perturb(N, vPos, vUv, texture(uNormalTex, vUv).xyz);
  float NoV = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - NoV, 5.0);
  vec3 R = reflect(-V, N);

  vec3 col;
  float alpha = base.a;
  bool emissive = false;

  if (mode == 2) {
    // glass: the sky behind, bent per channel (dispersion), and reflections on top
    vec3 tr = refract(-V, N, 0.67);
    vec2 off = tr.xy * (0.05 + 0.12 * (1.0 - NoV));
    vec3 refr = vec3(
      backdrop(suv + off * 0.82, 0.6).r,
      backdrop(suv + off, 0.6).g,
      backdrop(suv + off * 1.18, 0.6).b);
    float F = 0.04 + 0.96 * fres;
    col = refr * base.rgb * mix(1.15, 1.6, uLights.y) * (1.0 - F) + env(R, 0.04) * F;
    col += lights(N, V, vec3(0.0), 0.0, 0.05, vec3(0.04));
    col += base.rgb * mix(uAur0, uAur1, N.y * 0.5 + 0.5) * pow(1.0 - NoV, 2.0) * 0.6;
    alpha = 1.0;
  } else if (mode == 3) {
    // hologram: fresnel shell, scanlines, a scanning band and some flicker
    vec3 hc = uBase.r < 0.0 ? mix(uAur0, uAur1, smoothstep(-0.5, 0.5, vObj.y)) : base.rgb;
    float rim = pow(1.0 - NoV, 3.0);
    float lines = smoothstep(0.35, 0.95, 0.5 + 0.5 * sin(gl_FragCoord.y * 0.85 - t * 10.0));
    float band = pow(0.5 + 0.5 * sin(suv.y * 7.0 - t * 2.2), 16.0);
    float flick = 0.82 + 0.18 * hash3(vec3(floor(clock * 24.0), 0.0, 3.0));
    col = hc * (0.03 + rim * 1.7 + lines * rim * 0.5 + lines * 0.05 + band * 0.45) * flick * (gl_FrontFacing ? 1.0 : 0.35);
    alpha = clamp(0.02 + rim * 0.3, 0.0, 0.5);
    emissive = true;
  } else if (mode == 5) {
    // neon wireframe: glowing edges, brighter corners, a faint fill
    float e = min(min(vBary.x, vBary.y), vBary.z);
    float fw = max(fwidth(e), 1e-4);
    float line = 1.0 - smoothstep(fw * 0.5, fw * 1.7, e);
    float corner = smoothstep(0.9, 1.0, max(max(vBary.x, vBary.y), vBary.z));
    float face = gl_FrontFacing ? 1.0 : 0.4;
    col = base.rgb * (line * 2.3 + corner * 2.2 + 0.04 + pow(1.0 - NoV, 3.0) * 0.3) * face;
    alpha = clamp(line * 0.85 + 0.07, 0.0, 1.0);
    emissive = true;
  } else if (mode == 6) {
    // nebula: the sky's own clouds, folded inside the model, under a glossy coat
    vec3 p = vObj * 2.3;
    vec3 q = vec3(fbm3(p + vec3(0.0, t * 0.07, 0.0)), fbm3(p + vec3(5.2, 1.3, -t * 0.05)), fbm3(p + vec3(1.7, 9.2, 4.1)));
    float n = fbm3(p + 2.6 * q);
    vec3 nc = mix(uNeb0, uNeb1, clamp(q.x * 1.7 - 0.2, 0.0, 1.0));
    nc = mix(nc, uNeb2, clamp(n * n * 2.0, 0.0, 1.0));
    nc = mix(nc, uNeb3, clamp(q.z * q.z * q.z * 2.2, 0.0, 1.0) * 0.6);
    float dens = smoothstep(0.28, 0.85, n);
    // the palette is dark on purpose (it is a background): lift it, inside the model it glows
    nc = mix(nc, sqrt(nc), 0.45);
    col = nc * base.rgb * (0.05 + dens * dens * 2.4);
    // stars: one point in a few cells of a 3D grid, where the surface passes close to it
    vec3 sp3 = vObj * 26.0;
    vec3 cell = floor(sp3);
    vec3 at = vec3(hash3(cell + 1.0), hash3(cell + 2.0), hash3(cell + 5.0)) * 0.6 + 0.2;
    float star = step(0.9, hash3(cell)) * smoothstep(0.16, 0.0, length(fract(sp3) - at));
    col += star * (0.6 + 0.4 * sin(t * 3.0 + hash3(cell + 3.0) * 30.0)) * 3.0 * (1.0 - dens);
    float F = 0.04 + 0.96 * fres;
    col = col * (1.0 - F) + env(R, 0.06) * F;
    col += lights(N, V, vec3(0.0), 0.0, 0.07, vec3(0.04));
    alpha = 1.0;
  } else {
    // physically based: the file's materials, chrome, or a thin-film coat
    float metal = uMat.y;
    float rough = uMat.z;
    if (uTex.y > 0.5) {
      vec4 mr = texture(uMrTex, vUv);
      rough *= mr.g;
      metal *= mr.b;
    }
    rough = clamp(rough, 0.03, 1.0);
    vec3 albedo = base.rgb;
    vec3 f0 = mix(vec3(0.04), albedo, metal);
    if (mode == 4) {
      float th = noise3(vObj * 3.0 + t * 0.08);
      vec3 film = 0.5 + 0.5 * cos(6.2832 * (NoV * 1.5 + th * 0.9 + vec3(0.0, 0.33, 0.67)));
      f0 = mix(f0, film * film, 0.92);
    }
    vec3 F = f0 + (max(vec3(1.0 - rough), f0) - f0) * fres;
    vec3 kd = (1.0 - F) * (1.0 - metal) * albedo;
    vec3 amb = mix(uNeb0, uNeb2, N.y * 0.5 + 0.5) * 0.7 + uBg * 0.4;
    float occ = uHasOcc > 0.5 ? texture(uOccTex, vUv).r : 1.0;
    col = (kd * amb + env(R, rough) * F) * occ;
    col += lights(N, V, albedo, metal, rough, f0);
    vec3 em = uEmissive.rgb;
    if (uTex.w > 0.5) {
      vec3 te = texture(uEmissiveTex, vUv).rgb;
      em *= te * te;
    }
    col += em;
  }

  // the sky's events light the model too: shockwave rings, light sweeps
  vec2 sp = (suv - 0.5) * vec2(aspect, 1.0);
  float ring = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 rp = uRipples[i];
    float age = clock - rp.z;
    if (rp.w > 0.0 && age > 0.0 && age < 3.0) {
      float w = length(sp - (rp.xy - 0.5) * vec2(aspect, 1.0)) - age * 0.85;
      ring += exp(-w * w * 380.0) * (1.0 - age / 3.0) * rp.w;
    }
  }
  float sweep = 0.0;
  float pa = clock - uLights.x;
  if (uLights.x > 0.0 && pa > 0.0 && pa < 1.6) {
    float x = suv.x + (suv.y - 0.5) * 0.35;
    sweep = exp(-pow((x - (pa * 1.1 - 0.2)) * 7.0, 2.0)) * (1.0 - pa / 1.6);
  }
  col += uGlow * (ring * 3.5 * (0.5 + uFx.z) + sweep * 2.0 + edge * 7.0);

  float o = uMat.w;
  if (emissive) {
    // premultiplied, with light beyond the coverage: adds up like light
    outColor = vec4(col * o, max(alpha, edge) * o);
  } else {
    outColor = vec4(col * alpha * o, alpha * o);
  }
}
`;

export const POST_VERT = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

/** keeps what is brighter than white, averaged over 4 taps (it also downsamples) */
export const BRIGHT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb
    + texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb
    + texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb
    + texture(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  outColor = vec4(c * smoothstep(0.8, 2.2, l), 1.0);
}
`;

/** 9-tap gaussian in 5 bilinear samples */
export const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.227027;
  c += (texture(uTex, vUv + uDir * 1.3846).rgb + texture(uTex, vUv - uDir * 1.3846).rgb) * 0.316216;
  c += (texture(uTex, vUv + uDir * 3.2308).rgb + texture(uTex, vUv - uDir * 3.2308).rgb) * 0.070270;
  outColor = vec4(c, 1.0);
}
`;

/** scene + bloom + light shafts from the roaming light, tone mapped */
export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uBloomWide;
uniform vec4 uPost;   // bloom, shafts, exposure
uniform vec2 uLight;  // roaming light, uv
void main() {
  vec4 s = texture(uScene, vUv);
  vec3 b = texture(uBloom, vUv).rgb + texture(uBloomWide, vUv).rgb * 1.6;
  vec3 shafts = vec3(0.0);
  if (uPost.y > 0.0) {
    vec2 dir = (vUv - uLight) * (0.6 / 32.0);
    vec2 p = vUv;
    float w = 1.0;
    for (int i = 0; i < 32; i++) {
      p -= dir;
      shafts += texture(uBloomWide, p).rgb * w;
      w *= 0.92;
    }
    shafts *= 0.065;
  }
  vec3 c = s.rgb + b * uPost.x + shafts * uPost.y;
  c = vec3(1.0) - exp(-c * uPost.z);
  outColor = vec4(sqrt(c), s.a);
}
`;
