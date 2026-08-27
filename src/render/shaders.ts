export const VERTEX_SHADER = `#version 300 es
precision highp float;
const vec2 positions[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vUv;
void main() {
  vec2 p = positions[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec2 uResolution;
uniform float uTime;
uniform float uSeed;
uniform float uDuration;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uBackground;
uniform vec3 uBackground2;
uniform vec2 uBackgroundConfig; // type, angle radians
uniform float uContourCount;
uniform float uLineWidth;
uniform float uSoftness;
uniform float uGlow;
uniform float uSymmetry;
uniform float uRotationSpeed;
uniform float uDistortion;
uniform float uSpectrumAmount;
uniform vec4 uPostA; // scanlines, chromatic, vignette, grain
uniform vec4 uPostB; // pixelation, hue, saturation, contrast
uniform vec2 uPostC; // exposure, lens distortion
uniform vec4 uMasterA; // reactivity, motion, brightness, scale
uniform vec4 uMasterB; // glow, complexity, particles, effects
uniform vec4 uAudioA; // sub, bass, rms, centroid
uniform vec4 uAudioB; // beat, kick, snare, onset
uniform vec4 uModeA[4]; // m, n, amplitude, phase
uniform vec4 uModeB[4]; // rotation, scale, reserved, reserved
uniform int uModeCount;
uniform float uSpectrum[64];
uniform vec4 uLayerMeta[8]; // type, opacity, blend, audio drive
uniform vec4 uLayerTransform[8]; // x, y, scale, rotation
uniform vec4 uLayerStyle[8]; // shape, sides, inner radius, thickness
uniform vec4 uLayerExtra[8]; // repetition, detail, speed, reserved
uniform vec3 uLayerColor[8];
uniform vec3 uLayerSecondary[8];
uniform int uLayerCount;

#define PI 3.141592653589793

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed * 0.00013);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

mat2 rotate2d(float angle) {
  float c = cos(angle), s = sin(angle);
  return mat2(c, -s, s, c);
}

float chladni(vec2 p, float colorShift) {
  float radius = length(p);
  float angle = atan(p.y, p.x);
  float sector = 2.0 * PI / max(2.0, uSymmetry);
  angle = abs(mod(angle + sector * 0.5, sector) - sector * 0.5);
  p = vec2(cos(angle), sin(angle)) * radius;
  float bassWarp = (uAudioA.x * 0.16 + uAudioA.y * 0.09 + uAudioB.y * 0.055) * uMasterA.x;
  p *= 1.0 + bassWarp;
  p += uDistortion * vec2(
    sin(p.y * 4.0 + uTime * 0.31 * uMasterA.y + uAudioA.x * 1.8),
    cos(p.x * 3.0 - uTime * 0.23 * uMasterA.y + uAudioA.y * 1.4)
  ) * (0.08 + radius * 0.05);
  float field = 0.0;
  float normalization = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uModeCount) break;
    vec4 a = uModeA[i];
    vec4 b = uModeB[i];
    vec2 q = rotate2d(b.x + uTime * uRotationSpeed * uMasterA.y * (float(i) * 0.37 + 0.65)) * p * b.y;
    float phase = a.w + uTime * uMasterA.y * (0.055 + float(i) * 0.018) + uAudioB.x * 0.22 * uMasterA.x + colorShift;
    float modal = cos(a.x * PI * q.x + phase) * cos(a.y * PI * q.y - phase)
                - cos(a.y * PI * q.x - phase) * cos(a.x * PI * q.y + phase);
    field += modal * a.z;
    normalization += abs(a.z);
  }
  return field / max(normalization, 0.001);
}

float contour(float field) {
  float repeated = abs(fract(field * uContourCount * uMasterB.y + 0.5) - 0.5) * 2.0;
  float width = uLineWidth * (1.0 + uAudioA.y * 0.5 * uMasterA.x);
  return 1.0 - smoothstep(width, width + max(fwidth(repeated), uSoftness), repeated);
}

float polygonDistance(vec2 p, float sides, float radius) {
  float angle = atan(p.y, p.x);
  float sector = 2.0 * PI / max(3.0, sides);
  return cos(floor(0.5 + angle / sector) * sector - angle) * length(p) - radius;
}

float shapeLine(vec2 p, float shape, float sides, float radius, float thickness, float repetition) {
  float angle = atan(p.y, p.x);
  float r = length(p);
  float distanceValue;
  if (shape < 0.5) distanceValue = r - radius;
  else if (shape < 1.5) distanceValue = abs(r - radius) - thickness;
  else if (shape < 2.5) distanceValue = polygonDistance(p, sides, radius);
  else if (shape < 3.5) {
    float starRadius = radius * mix(0.52, 1.0, 0.5 + 0.5 * cos(angle * sides));
    distanceValue = r - starRadius;
  } else if (shape < 4.5) {
    float petalRadius = radius * (0.7 + 0.3 * cos(angle * sides));
    distanceValue = r - petalRadius;
  } else {
    float spiralRadius = radius * fract(angle / (2.0 * PI) * max(1.0, repetition) - r * 0.35);
    distanceValue = abs(r - spiralRadius) - thickness;
  }
  return 1.0 - smoothstep(thickness, thickness + max(fwidth(distanceValue), 0.002), abs(distanceValue));
}

float spectrumRing(vec2 p, float radius, float thickness, float amount, bool waveform) {
  float r = length(p);
  float angle = atan(p.y, p.x) / (2.0 * PI) + 0.5;
  float mirrored = abs(fract(angle * 2.0) - 0.5) * 2.0;
  int index = int(clamp(floor(mirrored * 63.0), 0.0, 63.0));
  float value = uSpectrum[index];
  float target = radius + value * 0.17 * amount * uSpectrumAmount;
  float width = waveform ? thickness * 0.6 : thickness;
  float ring = 1.0 - smoothstep(width, width + 0.012, abs(r - target));
  if (waveform) return ring;
  float ticks = smoothstep(radius - 0.07, radius, r) * (1.0 - smoothstep(target + 0.01, target + 0.035, r));
  float segmentation = smoothstep(0.15, 0.72, abs(sin(angle * PI * 128.0)));
  return max(ring, ticks * segmentation * 0.7);
}

float particles(vec2 p, float detail, float speed) {
  float density = mix(18.0, 70.0, clamp(detail * uMasterB.y, 0.0, 1.5));
  vec2 moving = p + vec2(uTime * speed * uMasterA.y, -uTime * speed * 0.63 * uMasterA.y);
  vec2 cell = floor(moving * density);
  vec2 local = fract(moving * density) - 0.5;
  float chance = hash21(cell);
  vec2 jitter = vec2(hash21(cell + 13.7), hash21(cell + 41.9)) - 0.5;
  float point = 1.0 - smoothstep(0.025, 0.14, length(local - jitter * 0.55));
  return point * step(mix(0.985, 0.90, clamp(detail * uMasterB.z, 0.0, 1.0)), chance);
}

float gridPattern(vec2 p, float detail) {
  vec2 q = p;
  float perspective = max(0.18, q.y + 1.2);
  q.x /= perspective;
  q.y = 1.0 / perspective + uTime * 0.08 * uMasterA.y;
  float density = mix(5.0, 22.0, clamp(detail * uMasterB.y, 0.0, 1.5));
  vec2 lineDistance = abs(fract(q * density) - 0.5) / max(fwidth(q * density), vec2(0.001));
  return 1.0 - min(min(lineDistance.x, lineDistance.y), 1.0);
}

vec3 blendLayer(vec3 base, vec3 layer, float alpha, float mode) {
  alpha = clamp(alpha, 0.0, 1.0);
  if (mode < 0.5) return mix(base, layer, alpha);
  if (mode < 1.5) return base + layer * alpha;
  if (mode < 2.5) return 1.0 - (1.0 - base) * (1.0 - layer * alpha);
  if (mode < 3.5) return mix(base, base * layer, alpha);
  if (mode < 4.5) return mix(base, max(base, layer), alpha);
  return mix(base, abs(base - layer), alpha);
}

vec3 backgroundColor(vec2 p) {
  float mode = uBackgroundConfig.x;
  if (mode < 0.5) return uBackground;
  if (mode < 1.5) {
    vec2 direction = vec2(cos(uBackgroundConfig.y), sin(uBackgroundConfig.y));
    return mix(uBackground, uBackground2, clamp(dot(p, direction) * 0.5 + 0.5, 0.0, 1.0));
  }
  if (mode < 2.5) return mix(uBackground2, uBackground, smoothstep(0.0, 1.15, length(p)));
  vec2 lineDistance = abs(fract(p * 12.0) - 0.5) / max(fwidth(p * 12.0), vec2(0.001));
  float grid = (1.0 - min(min(lineDistance.x, lineDistance.y), 1.0)) * 0.18;
  return mix(uBackground, uBackground2, grid);
}

vec3 sceneColor(vec2 p) {
  vec3 color = backgroundColor(p);
  for (int i = 0; i < 8; i++) {
    if (i >= uLayerCount) break;
    vec4 meta = uLayerMeta[i];
    if (meta.y <= 0.0) continue;
    vec4 transform = uLayerTransform[i];
    vec4 style = uLayerStyle[i];
    vec4 extra = uLayerExtra[i];
    float audioScale = max(0.1, 1.0 + meta.w * uMasterA.x);
    vec2 q = p - transform.xy;
    q = rotate2d(-(transform.w + uTime * extra.z * uMasterA.y)) * q;
    q /= max(0.03, transform.z * uMasterA.w * audioScale);
    float intensity = 0.0;
    vec3 layerColor = uLayerColor[i];
    if (meta.x < 0.5) {
      float field = chladni(q, 0.0);
      float lines = contour(field);
      float broadGlow = 1.0 - smoothstep(0.08, 0.34, abs(sin(field * uContourCount * PI)));
      intensity = lines + broadGlow * 0.16 * uGlow * uMasterB.x;
      layerColor = mix(uLayerSecondary[i], uLayerColor[i], 0.35 + 0.65 * lines);
    } else if (meta.x < 1.5) {
      intensity = spectrumRing(q, style.z, style.w, max(0.0, extra.y), false);
      layerColor = mix(uLayerSecondary[i], uLayerColor[i], 0.35 + 0.65 * uAudioA.y);
    } else if (meta.x < 2.5) {
      intensity = shapeLine(q, style.x, style.y, style.z, style.w, extra.x);
      layerColor = mix(uLayerSecondary[i], uLayerColor[i], 0.5 + 0.5 * sin(atan(q.y, q.x) * max(1.0, extra.x)));
    } else if (meta.x < 3.5) {
      intensity = spectrumRing(q, style.z, style.w, max(0.0, extra.y), true);
      layerColor = mix(uLayerSecondary[i], uLayerColor[i], uAudioA.w);
    } else if (meta.x < 4.5) {
      intensity = particles(q, extra.y, extra.z) * (0.35 + uAudioB.w * uMasterA.x);
    } else {
      intensity = gridPattern(q, extra.y) * (0.45 + uAudioA.z * 0.55 * uMasterA.x);
    }
    color = blendLayer(color, layerColor * intensity, intensity * meta.y, meta.z);
  }
  return color;
}

vec3 hueRotate(vec3 color, float angle) {
  vec3 axis = normalize(vec3(1.0));
  return color * cos(angle) + cross(axis, color) * sin(angle) + axis * dot(axis, color) * (1.0 - cos(angle));
}

void main() {
  vec2 uv = vUv;
  float pixelSize = mix(1.0, 96.0, uPostB.x * uPostB.x) * uMasterB.w;
  if (pixelSize > 1.01) uv = (floor(uv * uResolution / pixelSize) + 0.5) * pixelSize / uResolution;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= uResolution.x / uResolution.y;
  float lens = uPostC.y * uMasterB.w;
  p *= 1.0 + lens * dot(p, p);
  float aberration = uPostA.y * uMasterB.w * (0.25 + uAudioB.w * 1.4 * uMasterA.x);
  vec3 base = sceneColor(p);
  vec3 shiftedR = sceneColor(p + vec2(aberration, 0.0));
  vec3 shiftedB = sceneColor(p - vec2(aberration, 0.0));
  vec3 color = vec3(shiftedR.r, base.g, shiftedB.b);
  float effectAmount = uMasterB.w;
  float scan = 1.0 - uPostA.x * effectAmount * (0.5 + 0.5 * sin(uv.y * uResolution.y * PI));
  float noise = (hash21(gl_FragCoord.xy + floor(uTime * 30.0)) - 0.5) * 0.11 * uPostA.w * effectAmount;
  color = color * scan + noise;
  float vignette = 1.0 - smoothstep(0.35, 1.35, length(p)) * clamp(uPostA.z * effectAmount, 0.0, 1.0);
  color *= vignette;
  color *= exp2(uPostC.x * effectAmount);
  color = hueRotate(color, uPostB.y * PI * 2.0 * effectAmount);
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luminance), color, mix(1.0, uPostB.z, effectAmount));
  color = mix(vec3(0.5), color, mix(1.0, uPostB.w, effectAmount));
  color *= uMasterA.z;
  color = 1.0 - exp(-max(color, 0.0) * (1.0 + uGlow * uMasterB.x * 0.35));
  color = pow(max(color, 0.0), vec3(1.0 / 2.2));
  outColor = vec4(color, 1.0);
}`;
