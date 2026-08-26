import type { ProjectState, SceneSettings } from './types';

export const DEFAULT_SCENE: SceneSettings = {
  name: 'Phosphor Bloom',
  seed: 73451,
  primaryColor: '#d7fff5',
  secondaryColor: '#5b63ff',
  backgroundColor: '#030407',
  contourCount: 9,
  lineWidth: 0.075,
  softness: 0.028,
  glow: 1.25,
  symmetry: 8,
  rotationSpeed: 0.035,
  distortion: 0.18,
  spectrumAmount: 0.72,
  scanlines: 0.16,
  chromaticAberration: 0.018,
  modes: [
    { m: 3, n: 5, amplitude: 1, phase: 0, rotation: 0, scale: 1 },
    { m: 5, n: 8, amplitude: 0.46, phase: 1.12, rotation: 0.42, scale: 0.82 },
    { m: 2, n: 7, amplitude: 0.28, phase: 2.38, rotation: -0.28, scale: 1.24 },
  ],
};

export const PRESETS: Readonly<Record<string, SceneSettings>> = {
  phosphor: DEFAULT_SCENE,
  ultraviolet: {
    ...DEFAULT_SCENE,
    name: 'Ultraviolet Cathedral',
    primaryColor: '#f6d9ff',
    secondaryColor: '#7b27ff',
    backgroundColor: '#06020c',
    contourCount: 13,
    symmetry: 10,
    distortion: 0.28,
    modes: [
      { m: 4, n: 7, amplitude: 1, phase: 0.2, rotation: 0, scale: 1 },
      { m: 6, n: 9, amplitude: 0.5, phase: 1.7, rotation: 0.32, scale: 0.76 },
      { m: 3, n: 11, amplitude: 0.24, phase: -0.7, rotation: -0.18, scale: 1.31 },
    ],
  },
  ember: {
    ...DEFAULT_SCENE,
    name: 'Ember Plate',
    primaryColor: '#fff1bc',
    secondaryColor: '#ff4c16',
    backgroundColor: '#090302',
    contourCount: 7,
    lineWidth: 0.09,
    symmetry: 6,
    scanlines: 0.1,
    modes: [
      { m: 2, n: 5, amplitude: 1, phase: 0, rotation: 0.1, scale: 0.94 },
      { m: 5, n: 7, amplitude: 0.42, phase: 2.1, rotation: -0.33, scale: 1.15 },
      { m: 4, n: 9, amplitude: 0.18, phase: 0.4, rotation: 0.5, scale: 0.68 },
    ],
  },
};

export const DEFAULT_PROJECT: ProjectState = {
  version: 1,
  scene: DEFAULT_SCENE,
  export: { width: 1920, height: 1080, fps: 60, bitrate: 16_000_000 },
};

