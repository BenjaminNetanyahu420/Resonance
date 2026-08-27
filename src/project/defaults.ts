import { PROJECT_VERSION, type CompositionLayer, type ProjectState, type SceneSettings } from './types';

export function createId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

export const DEFAULT_SCENE: SceneSettings = {
  name: 'Phosphor Bloom', seed: 73451,
  primaryColor: '#d7fff5', secondaryColor: '#5b63ff', backgroundColor: '#030407', backgroundColor2: '#11152b',
  backgroundType: 'solid', backgroundAngle: 135,
  contourCount: 9, lineWidth: 0.075, softness: 0.028, glow: 1.25, symmetry: 8,
  rotationSpeed: 0.035, distortion: 0.18, spectrumAmount: 0.72,
  scanlines: 0.16, chromaticAberration: 0.018, vignette: 0.7, grain: 0.16, pixelation: 0,
  hueShift: 0, saturation: 1, contrast: 1, exposure: 0, lensDistortion: 0,
  effectsEnabled: true, audioEnabled: true,
  modes: [
    { m: 3, n: 5, amplitude: 1, phase: 0, rotation: 0, scale: 1 },
    { m: 5, n: 8, amplitude: 0.46, phase: 1.12, rotation: 0.42, scale: 0.82 },
    { m: 2, n: 7, amplitude: 0.28, phase: 2.38, rotation: -0.28, scale: 1.24 },
  ],
};

export const LAYER_DEFAULTS: Readonly<Record<string, CompositionLayer>> = {
  chladni: {
    id: 'layer-chladni', name: 'Cymatic field', type: 'chladni', visible: true, locked: false, solo: false,
    opacity: 1, blendMode: 'screen', positionX: 0, positionY: 0, scale: 1, rotation: 0,
    color: '#d7fff5', secondaryColor: '#5b63ff', audioSource: 'bass', audioAmount: 0.28,
    shape: 'circle', sides: 6, innerRadius: 0.48, thickness: 0.045, repetition: 8, detail: 0.75, speed: 0.12,
  },
  spectrum: {
    id: 'layer-spectrum', name: 'Radial spectrum', type: 'spectrum', visible: true, locked: false, solo: false,
    opacity: 0.86, blendMode: 'add', positionX: 0, positionY: 0, scale: 1, rotation: 0,
    color: '#d7fff5', secondaryColor: '#5b63ff', audioSource: 'beatPulse', audioAmount: 0.12,
    shape: 'ring', sides: 64, innerRadius: 0.49, thickness: 0.04, repetition: 64, detail: 0.72, speed: 0,
  },
  particles: {
    id: 'layer-particles', name: 'Particle atmosphere', type: 'particles', visible: true, locked: false, solo: false,
    opacity: 0.42, blendMode: 'add', positionX: 0, positionY: 0, scale: 1, rotation: 0,
    color: '#d7fff5', secondaryColor: '#5b63ff', audioSource: 'centroid', audioAmount: 0.45,
    shape: 'circle', sides: 6, innerRadius: 0.25, thickness: 0.03, repetition: 8, detail: 0.42, speed: 0.06,
  },
};

export function createLayer(type: CompositionLayer['type']): CompositionLayer {
  const base = LAYER_DEFAULTS[type] ?? LAYER_DEFAULTS.chladni;
  const names: Record<CompositionLayer['type'], string> = {
    chladni: 'Cymatic field', spectrum: 'Radial spectrum', shape: 'Geometric shape',
    waveform: 'Waveform ring', particles: 'Particle atmosphere', grid: 'Perspective grid',
  };
  return {
    ...base, id: createId('layer'), type, name: names[type],
    blendMode: type === 'grid' ? 'screen' : base.blendMode,
    opacity: type === 'grid' ? 0.42 : base.opacity,
    audioSource: type === 'grid' ? 'rms' : base.audioSource,
  };
}

export const DEFAULT_PROJECT: ProjectState = {
  version: PROJECT_VERSION,
  name: 'Untitled composition',
  scene: DEFAULT_SCENE,
  masters: { reactivity: 1, motion: 1, brightness: 1, glow: 1, complexity: 1, particles: 1, effects: 1, scale: 1 },
  layers: [LAYER_DEFAULTS.chladni, LAYER_DEFAULTS.spectrum, LAYER_DEFAULTS.particles],
  modulation: [], automation: [],
  performance: { mode: 'high', previewResolution: 1, maxLayers: 8 },
  export: { width: 1920, height: 1080, fps: 60, bitrate: 16_000_000 },
};

function preset(id: string, name: string, scene: Partial<SceneSettings>, layers?: readonly CompositionLayer[]): ProjectState {
  return {
    ...DEFAULT_PROJECT, name, scene: { ...DEFAULT_SCENE, ...scene, name },
    layers: (layers ?? DEFAULT_PROJECT.layers).map((layer, index) => ({
      ...layer, id: `${id}-${index}`, color: scene.primaryColor ?? layer.color,
      secondaryColor: scene.secondaryColor ?? layer.secondaryColor,
    })),
  };
}

export const PRESETS: Readonly<Record<string, ProjectState>> = {
  phosphor: DEFAULT_PROJECT,
  ultraviolet: preset('ultraviolet', 'Ultraviolet Cathedral', {
    primaryColor: '#f6d9ff', secondaryColor: '#7b27ff', backgroundColor: '#06020c', backgroundColor2: '#24104b',
    backgroundType: 'radial', contourCount: 13, symmetry: 10, distortion: 0.28,
    modes: [
      { m: 4, n: 7, amplitude: 1, phase: 0.2, rotation: 0, scale: 1 },
      { m: 6, n: 9, amplitude: 0.5, phase: 1.7, rotation: 0.32, scale: 0.76 },
      { m: 3, n: 11, amplitude: 0.24, phase: -0.7, rotation: -0.18, scale: 1.31 },
    ],
  }),
  ember: preset('ember', 'Ember Plate', {
    primaryColor: '#fff1bc', secondaryColor: '#ff4c16', backgroundColor: '#090302', backgroundColor2: '#351008',
    backgroundType: 'radial', contourCount: 7, lineWidth: 0.09, symmetry: 6, scanlines: 0.1,
    modes: [
      { m: 2, n: 5, amplitude: 1, phase: 0, rotation: 0.1, scale: 0.94 },
      { m: 5, n: 7, amplitude: 0.42, phase: 2.1, rotation: -0.33, scale: 1.15 },
      { m: 4, n: 9, amplitude: 0.18, phase: 0.4, rotation: 0.5, scale: 0.68 },
    ],
  }),
  synthwave: preset('synthwave', 'Synthwave Horizon', {
    primaryColor: '#55f5ff', secondaryColor: '#ff3bd4', backgroundColor: '#07031a', backgroundColor2: '#301050',
    backgroundType: 'linear', backgroundAngle: 90, symmetry: 6, contourCount: 11, hueShift: 0.02, glow: 1.65,
  }, [
    { ...createLayer('grid'), id: 'synthwave-grid', name: 'Horizon grid', positionY: -0.18, detail: 0.72, color: '#ff3bd4' },
    { ...LAYER_DEFAULTS.chladni, id: 'synthwave-field', scale: 0.72, positionY: 0.08, color: '#55f5ff', secondaryColor: '#ff3bd4' },
    { ...LAYER_DEFAULTS.particles, id: 'synthwave-stars', detail: 0.68, color: '#55f5ff' },
  ]),
  oscilloscope: preset('scope', 'CRT Oscilloscope', {
    primaryColor: '#9bff89', secondaryColor: '#2b9f70', backgroundColor: '#010604', scanlines: 0.34,
    chromaticAberration: 0.006, grain: 0.24, vignette: 0.9, glow: 1.1,
  }, [
    { ...createLayer('waveform'), id: 'scope-wave', name: 'Oscilloscope', color: '#9bff89', scale: 0.86, thickness: 0.026 },
    { ...createLayer('grid'), id: 'scope-grid', name: 'Scope grid', color: '#2b9f70', opacity: 0.26, detail: 0.48 },
  ]),
  mandala: preset('mandala', 'Geometric Mandala', {
    primaryColor: '#ffd58a', secondaryColor: '#ed4d8f', backgroundColor: '#090408', symmetry: 12, contourCount: 15, glow: 1.45,
  }, [
    { ...createLayer('shape'), id: 'mandala-star', name: 'Flower lattice', shape: 'flower', sides: 12, repetition: 12, thickness: 0.038, color: '#ffd58a', secondaryColor: '#ed4d8f', audioSource: 'mid', audioAmount: 0.18 },
    { ...LAYER_DEFAULTS.chladni, id: 'mandala-field', opacity: 0.72, scale: 0.82, blendMode: 'add', color: '#ed4d8f', secondaryColor: '#ffd58a' },
  ]),
};
