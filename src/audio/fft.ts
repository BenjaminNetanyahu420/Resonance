/** Allocation-free radix-2 FFT for real input frames. */
export class RealFft {
  readonly size: number;
  readonly bins: number;
  private readonly real: Float64Array;
  private readonly imag: Float64Array;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly reverse: Uint32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, received ${size}`);
    }
    this.size = size;
    this.bins = size / 2 + 1;
    this.real = new Float64Array(size);
    this.imag = new Float64Array(size);
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    this.reverse = new Uint32Array(size);

    const bits = Math.log2(size);
    for (let i = 0; i < size; i += 1) {
      let value = i;
      let result = 0;
      for (let bit = 0; bit < bits; bit += 1) {
        result = (result << 1) | (value & 1);
        value >>>= 1;
      }
      this.reverse[i] = result;
    }
    for (let i = 0; i < size / 2; i += 1) {
      const angle = (-2 * Math.PI * i) / size;
      this.cos[i] = Math.cos(angle);
      this.sin[i] = Math.sin(angle);
    }
  }

  magnitude(input: Float32Array, output: Float32Array): void {
    if (input.length !== this.size || output.length < this.bins) {
      throw new Error('FFT input or output has the wrong length');
    }
    const { size, real, imag, reverse, cos, sin } = this;
    for (let i = 0; i < size; i += 1) {
      real[i] = input[reverse[i]];
      imag[i] = 0;
    }

    for (let length = 2; length <= size; length *= 2) {
      const half = length / 2;
      const tableStep = size / length;
      for (let start = 0; start < size; start += length) {
        for (let j = 0; j < half; j += 1) {
          const tableIndex = j * tableStep;
          const even = start + j;
          const odd = even + half;
          const tr = real[odd] * cos[tableIndex] - imag[odd] * sin[tableIndex];
          const ti = real[odd] * sin[tableIndex] + imag[odd] * cos[tableIndex];
          real[odd] = real[even] - tr;
          imag[odd] = imag[even] - ti;
          real[even] += tr;
          imag[even] += ti;
        }
      }
    }

    const scale = 2 / size;
    for (let i = 0; i < this.bins; i += 1) {
      output[i] = Math.hypot(real[i], imag[i]) * scale;
    }
  }
}

