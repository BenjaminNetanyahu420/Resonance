import { describe, expect, it } from 'vitest';
import { analyzePcm, type PcmAudio } from './analyze';

function makeMetronome(bpm: number, duration = 10, sampleRate = 44_100): PcmAudio {
  const data = new Float32Array(Math.round(duration * sampleRate));
  const interval = 60 / bpm;
  for (let time = 0.25; time < duration; time += interval) {
    const start = Math.round(time * sampleRate);
    for (let i = 0; i < Math.round(sampleRate * 0.018) && start + i < data.length; i += 1) {
      const envelope = Math.exp(-i / (sampleRate * 0.0035));
      data[start + i] += envelope * (Math.sin(2 * Math.PI * 90 * i / sampleRate) + 0.32 * Math.sin(2 * Math.PI * 1600 * i / sampleRate));
    }
  }
  return { sampleRate, channels: [data], duration };
}

describe('offline audio analysis', () => {
  it.each([60, 120, 128, 140])('detects a known %i BPM click track and reports timing error', async (bpm) => {
    const analysis = await analyzePcm(makeMetronome(bpm));
    expect(analysis.bpm).toBeGreaterThan(bpm - 4);
    expect(analysis.bpm).toBeLessThan(bpm + 4);
    expect(analysis.beats.length).toBeGreaterThan(Math.floor((10 * bpm) / 60) - 4);

    const expected: number[] = [];
    for (let time = 0.25; time < 9.75; time += 60 / bpm) expected.push(time);
    const errors = expected.map((time) => Math.min(...analysis.beats.map((beat) => Math.abs(beat.time - time))));
    const meanError = errors.reduce((sum, value) => sum + value, 0) / errors.length;
    const maxError = Math.max(...errors);
    console.info(JSON.stringify({ expectedBpm: bpm, detectedBpm: analysis.bpm, meanErrorMs: meanError * 1000, maxErrorMs: maxError * 1000, expectedBeats: expected.length, detectedBeats: analysis.beats.length }));
    expect(meanError).toBeLessThan(0.035);
    expect(maxError).toBeLessThan(0.065);
  }, 15_000);

  it('does not invent beats in silence', async () => {
    const sampleRate = 44_100;
    const analysis = await analyzePcm({ sampleRate, channels: [new Float32Array(sampleRate * 3)], duration: 3 });
    expect(analysis.bpm).toBe(0);
    expect(analysis.beats).toHaveLength(0);
    expect(analysis.onsets).toHaveLength(0);
    expect(Array.from(analysis.rms).every(Number.isFinite)).toBe(true);
  });

  it('retains a sustained low-frequency envelope', async () => {
    const sampleRate = 44_100;
    const duration = 3;
    const data = new Float32Array(sampleRate * duration);
    for (let i = 0; i < data.length; i += 1) data[i] = 0.4 * Math.sin(2 * Math.PI * 50 * i / sampleRate);
    const analysis = await analyzePcm({ sampleRate, channels: [data], duration });
    const middle = Math.floor(analysis.frameCount / 2) * 7;
    expect(analysis.bands[middle]).toBeGreaterThan(0.4);
    expect(analysis.bands[middle]).toBeGreaterThan(analysis.bands[middle + 3]);
  });
});
