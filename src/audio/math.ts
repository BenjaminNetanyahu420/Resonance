export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function percentile(values: Float32Array, p: number): number {
  if (values.length === 0) return 0;
  const copy = Array.from(values).sort((a, b) => a - b);
  const position = clamp(p) * (copy.length - 1);
  const low = Math.floor(position);
  const mix = position - low;
  return copy[low] * (1 - mix) + copy[Math.min(low + 1, copy.length - 1)] * mix;
}

export function normalizeInPlace(values: Float32Array, floorPercentile = 0.1, ceilingPercentile = 0.95): void {
  let floor = percentile(values, floorPercentile);
  const ceiling = percentile(values, ceilingPercentile);
  if (ceiling - floor < Math.max(1e-9, ceiling * 0.05)) floor = 0;
  const span = Math.max(ceiling - floor, 1e-9);
  for (let i = 0; i < values.length; i += 1) {
    values[i] = clamp((values[i] - floor) / span);
  }
}

export function smoothEnvelope(values: Float32Array, attack: number, release: number): void {
  let state = values[0] ?? 0;
  for (let i = 0; i < values.length; i += 1) {
    const coefficient = values[i] > state ? attack : release;
    state += (values[i] - state) * coefficient;
    values[i] = state;
  }
}

export function lowerBoundByTime<T extends { readonly time: number }>(events: readonly T[], time: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (events[middle].time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}
