import { describe, expect, it } from 'vitest';
import type { AudioAnalysis } from './types';
import { sampleAudioFeatures } from './timeline';

function fixture(): AudioAnalysis {
  return {
    version: 1, duration: 1, sampleRate: 48_000, fftSize: 2, hopSize: 2, frameRate: 2, frameCount: 3, spectrumBins: 2,
    waveformPeaks: new Float32Array([0, 1]), waveformRms: new Float32Array([0, 0.5]),
    rms: new Float32Array([0, 0.5, 1]), peak: new Float32Array([0, 0.5, 1]), spectralFlux: new Float32Array([0, 0.5, 1]), spectralCentroid: new Float32Array([0, 0.5, 1]),
    bands: new Float32Array(3 * 7).map((_, index) => Math.floor(index / 7) / 2),
    spectrum: new Float32Array([0, 0, 0.5, 0.25, 1, 0.5]),
    bpm: 120, bpmConfidence: 1,
    beats: [{ time: 0, strength: 1, confidence: 1, index: 0, downbeat: true }, { time: 0.5, strength: 1, confidence: 1, index: 1, downbeat: false }, { time: 1, strength: 1, confidence: 1, index: 2, downbeat: false }],
    onsets: [{ time: 0.5, strength: 1, confidence: 1, band: 'mid' }], kicks: [], snares: [], percussion: [], bassTransients: [],
    sections: [{ time: 0, endTime: 1, energy: 0.5, kind: 'medium', change: 0 }],
  };
}

describe('sampleAudioFeatures', () => {
  it('interpolates dense features at exact composition time', () => {
    const sampled = sampleAudioFeatures(fixture(), 0.5);
    expect(sampled.rms).toBeCloseTo(0.25);
    expect(sampled.subBass).toBeCloseTo(0.25);
    expect(sampled.spectrum[0]).toBeCloseTo(0.25);
  });

  it('is deterministic and clamps out-of-range requests', () => {
    const analysis = fixture();
    expect(sampleAudioFeatures(analysis, 0.67)).toEqual(sampleAudioFeatures(analysis, 0.67));
    expect(sampleAudioFeatures(analysis, -2).time).toBe(0);
    expect(sampleAudioFeatures(analysis, 4).time).toBe(1);
  });
});
