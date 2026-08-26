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
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uBackground;
uniform float uContourCount;
uniform float uLineWidth;
uniform float uSoftness;
uniform float uGlow;
uniform float uSymmetry;
uniform float uRotationSpeed;
uniform float uDistortion;
uniform float uSpectrumAmount;
uniform float uScanlines;
uniform float uChromatic;
uniform vec4 uAudioA; // sub, bass, rms, centroid
uniform vec4 uAudioB; // beat, kick, snare, onset
uniform vec4 uModeA[4]; // m, n, amplitude, phase
uniform vec4 uModeB[4]; // rotation, scale, reserved, reserved
uniform int uModeCount;
uniform float uSpectrum[64];

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

  float bassWarp = uAudioA.x * 0.16 + uAudioA.y * 0.09;
  p *= 1.0 + bassWarp + uAudioB.y * 0.055;
  p += uDistortion * vec2(
    sin(p.y * 4.0 + uTime * 0.31 + uAudioA.x * 1.8),
    cos(p.x * 3.0 - uTime * 0.23 + uAudioA.y * 1.4)
  ) * (0.08 + radius * 0.05);

  float field = 0.0;
  float normalization = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uModeCount) break;
    vec4 a = uModeA[i];
    vec4 b = uModeB[i];
    vec2 q = rotate2d(b.x + uTime * uRotationSpeed * (float(i) * 0.37 + 0.65)) * p * b.y;
    float phase = a.w + uTime * (0.055 + float(i) * 0.018) + uAudioB.x * 0.22 + colorShift;
    float modal = cos(a.x * PI * q.x + phase) * cos(a.y * PI * q.y - phase)
                - cos(a.y * PI * q.x - phase) * cos(a.x * PI * q.y + phase);
    field += modal * a.z;
    normalization += abs(a.z);
  }
  return field / max(normalization, 0.001);
}

float contour(float field) {
  float repeated = abs(fract(field * uContourCount + 0.5) - 0.5) * 2.0;
  float width = uLineWidth * (1.0 + uAudioA.y * 0.5);
  return 1.0 - smoothstep(width, width + max(fwidth(repeated), uSoftness), repeated);
}

float radialSpectrum(vec2 p) {
  float r = length(p);
  float angle = atan(p.y, p.x) / (2.0 * PI) + 0.5;
  float mirrored = abs(fract(angle * 2.0) - 0.5) * 2.0;
  int index = int(clamp(floor(mirrored * 63.0), 0.0, 63.0));
  float value = uSpectrum[index];
  float target = 0.49 + value * 0.17 * uSpectrumAmount + uAudioB.x * 0.025;
  float ring = 1.0 - smoothstep(0.006, 0.016, abs(r - target));
  float ticks = smoothstep(0.42, 0.49, r) * (1.0 - smoothstep(target + 0.01, target + 0.03, r));
  float segmentation = smoothstep(0.15, 0.72, abs(sin(angle * PI * 128.0)));
  return max(ring, ticks * segmentation * 0.7);
}

vec3 shade(vec2 p, float shift) {
  float field = chladni(p, shift);
  float lines = contour(field);
  float broadGlow = 1.0 - smoothstep(0.08, 0.34, abs(sin(field * uContourCount * PI)));
  float spectrum = radialSpectrum(p);
  float radius = length(p);
  float vignette = 1.0 - smoothstep(0.62, 1.15, radius);
  float stars = step(0.9975, hash21(floor((p + 2.0) * uResolution.y * 0.24))) * (0.12 + uAudioA.w * 0.38);
  vec3 lineColor = mix(uSecondary, uPrimary, 0.35 + 0.65 * lines);
  vec3 color = uBackground + lineColor * (lines * (1.15 + uAudioB.z * 0.8) + broadGlow * 0.16 * uGlow);
  color += mix(uSecondary, uPrimary, 0.7) * spectrum * (0.7 + uAudioA.y * 0.8);
  color += uPrimary * stars;
  color *= 0.3 + 0.7 * vignette;
  return color;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  p.x *= uResolution.x / uResolution.y;
  p = rotate2d(uTime * uRotationSpeed * 0.36) * p;
  float aberration = uChromatic * (0.25 + uAudioB.w * 1.4);
  vec3 base = shade(p, 0.0);
  vec3 shiftedR = shade(p + vec2(aberration, 0.0), aberration * 2.0);
  vec3 shiftedB = shade(p - vec2(aberration, 0.0), -aberration * 2.0);
  vec3 color = vec3(shiftedR.r, base.g, shiftedB.b);
  float scan = 1.0 - uScanlines * (0.5 + 0.5 * sin(vUv.y * uResolution.y * PI));
  float noise = (hash21(gl_FragCoord.xy + floor(uTime * 30.0)) - 0.5) * 0.018;
  color = color * scan + noise;
  color = 1.0 - exp(-color * (1.0 + uGlow * 0.35));
  color = pow(max(color, 0.0), vec3(1.0 / 2.2));
  outColor = vec4(color, 1.0);
}`;

