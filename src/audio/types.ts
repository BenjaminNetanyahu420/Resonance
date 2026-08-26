export const BAND_NAMES = [
  'subBass',
  'bass',
  'lowMid',
  'mid',
  'upperMid',
  'presence',
  'high',
] as const;

export type BandName = (typeof BAND_NAMES)[number];

export interface TimedEvent {
  readonly time: number;
  readonly strength: number;
  readonly confidence: number;
  readonly band: BandName;
}

export interface BeatEvent {
  readonly time: number;
  readonly strength: number;
  readonly confidence: number;
  readonly index: number;
  readonly downbeat: boolean;
}

export interface SectionEvent {
  readonly time: number;
  readonly endTime: number;
  readonly energy: number;
  readonly kind: 'low' | 'medium' | 'high';
  readonly change: number;
}

export interface AudioAnalysis {
  readonly version: 1;
  readonly duration: number;
  readonly sampleRate: number;
  readonly fftSize: number;
  readonly hopSize: number;
  readonly frameRate: number;
  readonly frameCount: number;
  readonly spectrumBins: number;
  readonly waveformPeaks: Float32Array;
  readonly waveformRms: Float32Array;
  readonly rms: Float32Array;
  readonly peak: Float32Array;
  readonly spectralFlux: Float32Array;
  readonly spectralCentroid: Float32Array;
  readonly bands: Float32Array;
  readonly spectrum: Float32Array;
  readonly bpm: number;
  readonly bpmConfidence: number;
  readonly beats: readonly BeatEvent[];
  readonly onsets: readonly TimedEvent[];
  readonly kicks: readonly TimedEvent[];
  readonly snares: readonly TimedEvent[];
  readonly percussion: readonly TimedEvent[];
  readonly bassTransients: readonly TimedEvent[];
  readonly sections: readonly SectionEvent[];
}

export interface SampledAudioFeatures {
  readonly time: number;
  readonly rms: number;
  readonly peak: number;
  readonly flux: number;
  readonly centroid: number;
  readonly subBass: number;
  readonly bass: number;
  readonly lowMid: number;
  readonly mid: number;
  readonly upperMid: number;
  readonly presence: number;
  readonly high: number;
  readonly beatPulse: number;
  readonly beatPhase: number;
  readonly kickPulse: number;
  readonly snarePulse: number;
  readonly onsetPulse: number;
  readonly sectionEnergy: number;
  readonly spectrum: Float32Array;
}

export interface AnalysisProgress {
  readonly progress: number;
  readonly stage: 'preparing' | 'transform' | 'events' | 'complete';
}

