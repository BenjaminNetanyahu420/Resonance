import { BAND_NAMES, type AudioAnalysis, type SampledAudioFeatures, type TimedEvent } from './types';
import { clamp, lowerBoundByTime } from './math';

function interpolate(values: Float32Array, position: number): number {
  const low = Math.max(0, Math.min(values.length - 1, Math.floor(position)));
  const high = Math.min(values.length - 1, low + 1);
  const mix = clamp(position - low);
  return values[low] * (1 - mix) + values[high] * mix;
}

function interpolateStride(values: Float32Array, position: number, stride: number, item: number): number {
  const frames = values.length / stride;
  const low = Math.max(0, Math.min(frames - 1, Math.floor(position)));
  const high = Math.min(frames - 1, low + 1);
  const mix = clamp(position - low);
  return values[low * stride + item] * (1 - mix) + values[high * stride + item] * mix;
}

function pulse(events: readonly TimedEvent[], time: number, decaySeconds: number): number {
  const index = lowerBoundByTime(events, time + 1e-9) - 1;
  if (index < 0) return 0;
  const event = events[index];
  const elapsed = time - event.time;
  return elapsed < 0 ? 0 : event.strength * Math.exp(-elapsed / decaySeconds);
}

export function sampleAudioFeatures(analysis: AudioAnalysis, requestedTime: number): SampledAudioFeatures {
  const time = clamp(requestedTime, 0, analysis.duration);
  // STFT features describe the center of each analysis window, not its leading edge.
  const position = time * analysis.frameRate - analysis.fftSize / (2 * analysis.hopSize);
  const bandValues = BAND_NAMES.map((_, band) => interpolateStride(analysis.bands, position, BAND_NAMES.length, band));
  const spectrum = new Float32Array(analysis.spectrumBins);
  for (let bin = 0; bin < spectrum.length; bin += 1) spectrum[bin] = interpolateStride(analysis.spectrum, position, spectrum.length, bin);

  const nextBeat = lowerBoundByTime(analysis.beats, time + 1e-9);
  const previous = analysis.beats[Math.max(0, nextBeat - 1)];
  const upcoming = analysis.beats[Math.min(analysis.beats.length - 1, nextBeat)];
  let beatPhase = 0;
  let beatPulse = 0;
  if (previous && upcoming) {
    const interval = Math.max(1e-6, upcoming.time - previous.time || 60 / Math.max(analysis.bpm, 1));
    beatPhase = clamp((time - previous.time) / interval);
    beatPulse = previous.strength * Math.exp(-(time - previous.time) / 0.13);
  }

  const sectionIndex = Math.max(0, lowerBoundByTime(analysis.sections, time + 1e-9) - 1);
  return {
    time,
    rms: interpolate(analysis.rms, position),
    peak: interpolate(analysis.peak, position),
    flux: interpolate(analysis.spectralFlux, position),
    centroid: interpolate(analysis.spectralCentroid, position),
    subBass: bandValues[0],
    bass: bandValues[1],
    lowMid: bandValues[2],
    mid: bandValues[3],
    upperMid: bandValues[4],
    presence: bandValues[5],
    high: bandValues[6],
    beatPulse,
    beatPhase,
    kickPulse: pulse(analysis.kicks, time, 0.11),
    snarePulse: pulse(analysis.snares, time, 0.09),
    onsetPulse: pulse(analysis.onsets, time, 0.075),
    sectionEnergy: analysis.sections[sectionIndex]?.energy ?? 0,
    spectrum,
  };
}
