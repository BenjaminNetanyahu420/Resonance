import { estimateBeats } from './beat';
import { RealFft } from './fft';
import { clamp, normalizeInPlace, percentile, smoothEnvelope } from './math';
import { BAND_NAMES, type AnalysisProgress, type AudioAnalysis, type BandName, type SectionEvent, type TimedEvent } from './types';

const FFT_SIZE = 2048;
const HOP_SIZE = 512;
const SPECTRUM_BINS = 64;
const BAND_EDGES = [20, 60, 250, 500, 2_000, 4_000, 6_000, 20_000] as const;

export interface PcmAudio {
  readonly sampleRate: number;
  readonly channels: readonly Float32Array[];
  readonly duration: number;
}

function makeMono(pcm: PcmAudio): Float32Array {
  const length = pcm.channels[0]?.length ?? 0;
  const mono = new Float32Array(length);
  const channelScale = 1 / Math.max(1, pcm.channels.length);
  for (const channel of pcm.channels) {
    for (let i = 0; i < length; i += 1) mono[i] += channel[i] * channelScale;
  }
  return mono;
}

function createWaveform(mono: Float32Array, points = 2000): { peaks: Float32Array; rms: Float32Array } {
  const count = Math.min(points, Math.max(1, mono.length));
  const peaks = new Float32Array(count);
  const rms = new Float32Array(count);
  for (let point = 0; point < count; point += 1) {
    const start = Math.floor((point * mono.length) / count);
    const end = Math.max(start + 1, Math.floor(((point + 1) * mono.length) / count));
    let max = 0;
    let sumSquares = 0;
    for (let i = start; i < end; i += 1) {
      const value = mono[i];
      max = Math.max(max, Math.abs(value));
      sumSquares += value * value;
    }
    peaks[point] = max;
    rms[point] = Math.sqrt(sumSquares / (end - start));
  }
  return { peaks, rms };
}

function findBand(frequency: number): number {
  for (let i = 0; i < BAND_EDGES.length - 1; i += 1) {
    if (frequency >= BAND_EDGES[i] && frequency < BAND_EDGES[i + 1]) return i;
  }
  return BAND_NAMES.length - 1;
}

function classifyBand(bands: Float32Array, frame: number): BandName {
  let best = 0;
  for (let band = 1; band < BAND_NAMES.length; band += 1) {
    if (bands[frame * BAND_NAMES.length + band] > bands[frame * BAND_NAMES.length + best]) best = band;
  }
  return BAND_NAMES[best];
}

function detectEvents(flux: Float32Array, bands: Float32Array, frameRate: number, centerOffset: number, duration: number) {
  const threshold = new Float32Array(flux.length);
  const window = Math.max(3, Math.round(frameRate * 0.32));
  for (let i = 0; i < flux.length; i += 1) {
    const start = Math.max(0, i - window);
    const end = Math.min(flux.length, i + window + 1);
    let mean = 0;
    for (let j = start; j < end; j += 1) mean += flux[j];
    mean /= end - start;
    let variance = 0;
    for (let j = start; j < end; j += 1) variance += (flux[j] - mean) ** 2;
    threshold[i] = mean + 0.65 * Math.sqrt(variance / (end - start));
  }

  const onsets: TimedEvent[] = [];
  const kicks: TimedEvent[] = [];
  const snares: TimedEvent[] = [];
  const percussion: TimedEvent[] = [];
  const bassTransients: TimedEvent[] = [];
  const minimumGap = Math.max(1, Math.round(frameRate * 0.045));
  let last = -minimumGap;
  for (let i = 1; i < flux.length - 1; i += 1) {
    if (i - last < minimumGap || flux[i] <= threshold[i] || flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue;
    last = i;
    const strength = clamp((flux[i] - threshold[i]) / Math.max(0.1, 1 - threshold[i]) + 0.25);
    const band = classifyBand(bands, i);
    const event: TimedEvent = { time: Math.min(duration, i / frameRate + centerOffset), strength, confidence: clamp(strength * 0.85 + 0.15), band };
    onsets.push(event);

    const offset = i * BAND_NAMES.length;
    const low = bands[offset] * 0.7 + bands[offset + 1];
    const body = bands[offset + 2] * 0.4 + bands[offset + 3];
    const high = bands[offset + 4] * 0.4 + bands[offset + 5] + bands[offset + 6] * 0.6;
    if (low > body * 1.08 && low > high * 0.9) kicks.push({ ...event, band: 'bass', confidence: clamp(low / 1.6) });
    else if (body + high * 0.45 > low * 1.1) snares.push({ ...event, band: 'mid', confidence: clamp((body + high * 0.45) / 1.8) });
    else percussion.push(event);
    if (low > 0.65) bassTransients.push({ ...event, band: 'subBass', confidence: clamp(low / 1.5) });
  }
  return { onsets, kicks, snares, percussion, bassTransients };
}

function createSections(rms: Float32Array, frameRate: number, duration: number): SectionEvent[] {
  const sectionFrames = Math.max(1, Math.round(frameRate * 4));
  const energy: number[] = [];
  for (let start = 0; start < rms.length; start += sectionFrames) {
    let sum = 0;
    const end = Math.min(rms.length, start + sectionFrames);
    for (let i = start; i < end; i += 1) sum += rms[i];
    energy.push(sum / (end - start));
  }
  return energy.map((value, index) => {
    const previous = energy[Math.max(0, index - 1)] ?? value;
    return {
      time: (index * sectionFrames) / frameRate,
      endTime: Math.min(duration, ((index + 1) * sectionFrames) / frameRate),
      energy: value,
      kind: value < 0.33 ? 'low' : value < 0.68 ? 'medium' : 'high',
      change: value - previous,
    } satisfies SectionEvent;
  });
}

export async function analyzePcm(
  pcm: PcmAudio,
  onProgress?: (progress: AnalysisProgress) => void,
): Promise<AudioAnalysis> {
  if (pcm.channels.length === 0 || pcm.channels[0].length === 0) throw new Error('The decoded audio contains no samples.');
  onProgress?.({ progress: 0, stage: 'preparing' });
  const mono = makeMono(pcm);
  const waveform = createWaveform(mono);
  const frameCount = Math.max(1, Math.ceil(Math.max(0, mono.length - FFT_SIZE) / HOP_SIZE) + 1);
  const frameRate = pcm.sampleRate / HOP_SIZE;
  const rms = new Float32Array(frameCount);
  const peak = new Float32Array(frameCount);
  const flux = new Float32Array(frameCount);
  const centroid = new Float32Array(frameCount);
  const bands = new Float32Array(frameCount * BAND_NAMES.length);
  const spectrum = new Float32Array(frameCount * SPECTRUM_BINS);
  const fft = new RealFft(FFT_SIZE);
  const input = new Float32Array(FFT_SIZE);
  const magnitudes = new Float32Array(fft.bins);
  const previousMagnitudes = new Float32Array(fft.bins);
  const window = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
  const binHz = pcm.sampleRate / FFT_SIZE;
  const spectrumFrequencies = new Float32Array(SPECTRUM_BINS + 1);
  for (let i = 0; i <= SPECTRUM_BINS; i += 1) spectrumFrequencies[i] = 20 * Math.pow(1000, i / SPECTRUM_BINS);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const offset = frame * HOP_SIZE;
    let sumSquares = 0;
    let max = 0;
    for (let i = 0; i < FFT_SIZE; i += 1) {
      const value = mono[offset + i] ?? 0;
      input[i] = value * window[i];
      sumSquares += value * value;
      max = Math.max(max, Math.abs(value));
    }
    rms[frame] = Math.sqrt(sumSquares / FFT_SIZE);
    peak[frame] = max;
    fft.magnitude(input, magnitudes);

    let fluxSum = 0;
    let weightedFrequency = 0;
    let magnitudeSum = 0;
    const bandCounts = new Uint16Array(BAND_NAMES.length);
    const logCounts = new Uint16Array(SPECTRUM_BINS);
    for (let bin = 1; bin < magnitudes.length; bin += 1) {
      const frequency = bin * binHz;
      if (frequency > 20_000) break;
      const magnitude = Math.log1p(magnitudes[bin] * 32);
      const difference = magnitude - previousMagnitudes[bin];
      if (difference > 0) fluxSum += difference;
      previousMagnitudes[bin] = magnitude;
      weightedFrequency += frequency * magnitude;
      magnitudeSum += magnitude;
      if (frequency >= 20) {
        const band = findBand(frequency);
        bands[frame * BAND_NAMES.length + band] += magnitude;
        bandCounts[band] += 1;
        const logBin = Math.min(SPECTRUM_BINS - 1, Math.floor(Math.log(frequency / 20) / Math.log(1000) * SPECTRUM_BINS));
        spectrum[frame * SPECTRUM_BINS + logBin] += magnitude;
        logCounts[logBin] += 1;
      }
    }
    flux[frame] = fluxSum / Math.max(1, magnitudes.length - 1);
    centroid[frame] = clamp((weightedFrequency / Math.max(magnitudeSum, 1e-9) - 20) / 19_980);
    for (let band = 0; band < BAND_NAMES.length; band += 1) bands[frame * BAND_NAMES.length + band] /= Math.max(1, bandCounts[band]);
    for (let bin = 0; bin < SPECTRUM_BINS; bin += 1) spectrum[frame * SPECTRUM_BINS + bin] /= Math.max(1, logCounts[bin]);

    if (frame % 256 === 0) {
      onProgress?.({ progress: 0.05 + 0.72 * (frame / frameCount), stage: 'transform' });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  normalizeInPlace(rms, 0.05, 0.95);
  normalizeInPlace(peak, 0.05, 0.98);
  normalizeInPlace(flux, 0.25, 0.98);
  smoothEnvelope(rms, 0.38, 0.08);
  smoothEnvelope(peak, 0.55, 0.12);
  smoothEnvelope(flux, 0.72, 0.2);

  for (let band = 0; band < BAND_NAMES.length; band += 1) {
    const values = new Float32Array(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) values[frame] = bands[frame * BAND_NAMES.length + band];
    let floor = percentile(values, 0.08);
    const ceiling = percentile(values, 0.96);
    if (ceiling - floor < Math.max(1e-9, ceiling * 0.05)) floor = 0;
    const span = Math.max(ceiling - floor, 1e-9);
    let state = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const normalized = clamp((bands[frame * BAND_NAMES.length + band] - floor) / span);
      state += (normalized - state) * (normalized > state ? 0.42 : band < 2 ? 0.055 : 0.11);
      bands[frame * BAND_NAMES.length + band] = state;
    }
  }
  for (let bin = 0; bin < SPECTRUM_BINS; bin += 1) {
    const values = new Float32Array(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) values[frame] = spectrum[frame * SPECTRUM_BINS + bin];
    const ceiling = Math.max(percentile(values, 0.97), 1e-7);
    let state = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const normalized = clamp(spectrum[frame * SPECTRUM_BINS + bin] / ceiling);
      state += (normalized - state) * (normalized > state ? 0.5 : 0.13);
      spectrum[frame * SPECTRUM_BINS + bin] = state;
    }
  }

  onProgress?.({ progress: 0.82, stage: 'events' });
  const centerOffset = FFT_SIZE / (2 * pcm.sampleRate);
  const events = detectEvents(flux, bands, frameRate, centerOffset, pcm.duration);
  const beatEstimate = estimateBeats(flux, frameRate);
  const centeredBeats = beatEstimate.beats.map((beat) => ({ ...beat, time: Math.min(pcm.duration, beat.time + centerOffset) }));
  const sections = createSections(rms, frameRate, pcm.duration);
  onProgress?.({ progress: 1, stage: 'complete' });
  return {
    version: 1,
    duration: pcm.duration,
    sampleRate: pcm.sampleRate,
    fftSize: FFT_SIZE,
    hopSize: HOP_SIZE,
    frameRate,
    frameCount,
    spectrumBins: SPECTRUM_BINS,
    waveformPeaks: waveform.peaks,
    waveformRms: waveform.rms,
    rms,
    peak,
    spectralFlux: flux,
    spectralCentroid: centroid,
    bands,
    spectrum,
    bpm: beatEstimate.bpm,
    bpmConfidence: beatEstimate.confidence,
    beats: centeredBeats,
    sections,
    ...events,
  };
}

export function audioBufferToPcm(buffer: AudioBuffer): PcmAudio {
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) channels.push(buffer.getChannelData(channel));
  return { sampleRate: buffer.sampleRate, channels, duration: buffer.duration };
}
