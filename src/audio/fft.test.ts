import { describe, expect, it } from 'vitest';
import { RealFft } from './fft';

describe('RealFft', () => {
  it('places a bin-centered sinusoid in the correct bin', () => {
    const size = 1024;
    const targetBin = 37;
    const input = new Float32Array(size);
    for (let i = 0; i < size; i += 1) input[i] = Math.sin((2 * Math.PI * targetBin * i) / size);
    const fft = new RealFft(size);
    const magnitude = new Float32Array(fft.bins);
    fft.magnitude(input, magnitude);
    let maxBin = 0;
    for (let i = 1; i < magnitude.length; i += 1) if (magnitude[i] > magnitude[maxBin]) maxBin = i;
    expect(maxBin).toBe(targetBin);
    expect(magnitude[targetBin]).toBeCloseTo(1, 4);
  });

  it('rejects non-power-of-two sizes', () => {
    expect(() => new RealFft(1000)).toThrow(/power of two/);
  });
});

