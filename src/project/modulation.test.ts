import { describe, expect, it } from 'vitest';
import type { SampledAudioFeatures } from '../audio/types';
import { DEFAULT_PROJECT } from './defaults';
import { interpolateKeyframes, modulationSourceValue, resolveProjectNumber } from './modulation';

const FEATURES: SampledAudioFeatures = {
  time: 1, rms: 0.4, peak: 0.7, flux: 0.3, centroid: 0.6,
  subBass: 0.1, bass: 0.8, lowMid: 0.2, mid: 0.5, upperMid: 0.4, presence: 0.3, high: 0.2,
  beatPulse: 0.9, beatPhase: 0.25, kickPulse: 0.7, snarePulse: 0.1, onsetPulse: 0.5, sectionEnergy: 0.6,
  spectrum: new Float32Array(64),
};

describe('project modulation and automation', () => {
  it('evaluates LFO and random sources deterministically from composition time', () => {
    const route = { lfoRate: 0.5, phase: 0.1 };
    expect(modulationSourceValue('sineLfo', FEATURES, 2.25, 10, route, 42)).toBe(modulationSourceValue('sineLfo', FEATURES, 2.25, 10, route, 42));
    expect(modulationSourceValue('smoothRandom', FEATURES, 2.25, 10, route, 42)).toBe(modulationSourceValue('smoothRandom', FEATURES, 2.25, 10, route, 42));
  });

  it('interpolates linear, eased, and hold keyframes at exact time', () => {
    const base = [{ id: 'a', time: 0, value: 0, easing: 'linear' as const }, { id: 'b', time: 2, value: 1, easing: 'linear' as const }];
    expect(interpolateKeyframes(base, 1)).toBeCloseTo(0.5);
    expect(interpolateKeyframes([{ ...base[0], easing: 'hold' }, base[1]], 1.9)).toBe(0);
    expect(interpolateKeyframes([{ ...base[0], easing: 'easeInOut' }, base[1]], 0.5)).toBeCloseTo(0.15625);
  });

  it('combines multiple enabled routes and clamps to parameter metadata', () => {
    const project = {
      ...DEFAULT_PROJECT,
      modulation: [
        { id: 'one', source: 'bass' as const, target: 'masters.scale', amount: 0.5, bipolar: false, invert: false, curve: 1, minimum: -2, maximum: 2, lfoRate: 1, phase: 0, enabled: true },
        { id: 'two', source: 'beatPulse' as const, target: 'masters.scale', amount: 0.5, bipolar: false, invert: false, curve: 1, minimum: -2, maximum: 2, lfoRate: 1, phase: 0, enabled: true },
      ],
    };
    expect(resolveProjectNumber(project, 'masters.scale', 1, FEATURES, 1, 10)).toBeCloseTo(1.85);
    expect(resolveProjectNumber({ ...project, modulation: [{ ...project.modulation[0], amount: 20 }] }, 'masters.scale', 1, FEATURES, 1, 10)).toBe(2.5);
  });
});
