import type { BeatEvent } from './types';
import { clamp, percentile } from './math';

export interface BeatEstimate {
  bpm: number;
  confidence: number;
  beats: BeatEvent[];
}

function autocorrelation(envelope: Float32Array, lag: number): number {
  let sum = 0;
  let energyA = 0;
  let energyB = 0;
  for (let i = lag; i < envelope.length; i += 1) {
    const a = envelope[i];
    const b = envelope[i - lag];
    sum += a * b;
    energyA += a * a;
    energyB += b * b;
  }
  return sum / Math.max(Math.sqrt(energyA * energyB), 1e-12);
}

/** Whole-track tempo hypothesis plus onset-aware dynamic beat placement. */
export function estimateBeats(onsetEnvelope: Float32Array, frameRate: number): BeatEstimate {
  if (onsetEnvelope.length < frameRate * 2 || percentile(onsetEnvelope, 0.95) < 0.02) {
    return { bpm: 0, confidence: 0, beats: [] };
  }

  const minLag = Math.max(1, Math.floor((60 * frameRate) / 190));
  const maxLag = Math.min(onsetEnvelope.length - 1, Math.ceil((60 * frameRate) / 60));
  let bestLag = minLag;
  let bestScore = -Infinity;
  let scoreSum = 0;
  let scoreCount = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const bpm = (60 * frameRate) / lag;
    const tempoPrior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.8, 2));
    const score = autocorrelation(onsetEnvelope, lag) * (0.85 + 0.15 * tempoPrior);
    scoreSum += Math.max(0, score);
    scoreCount += 1;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  const period = bestLag;
  let bestPhase = 0;
  let bestPhaseScore = -Infinity;
  for (let phase = 0; phase < period; phase += 1) {
    let score = 0;
    let count = 0;
    for (let frame = phase; frame < onsetEnvelope.length; frame += period) {
      score += onsetEnvelope[frame];
      count += 1;
    }
    score /= Math.sqrt(Math.max(1, count));
    if (score > bestPhaseScore) {
      bestPhaseScore = score;
      bestPhase = phase;
    }
  }

  const positions: number[] = [];
  const searchRadius = Math.max(1, Math.floor(period * 0.18));
  for (let expected = bestPhase; expected < onsetEnvelope.length; expected += period) {
    let chosen = expected;
    let chosenScore = -Infinity;
    const start = Math.max(0, expected - searchRadius);
    const end = Math.min(onsetEnvelope.length - 1, expected + searchRadius);
    for (let frame = start; frame <= end; frame += 1) {
      const distancePenalty = 0.3 * Math.abs(frame - expected) / searchRadius;
      const score = onsetEnvelope[frame] - distancePenalty;
      if (score > chosenScore) {
        chosenScore = score;
        chosen = frame;
      }
    }
    if (positions.length === 0 || chosen - positions[positions.length - 1] > period * 0.55) {
      positions.push(chosen);
    }
  }

  const meanScore = scoreSum / Math.max(1, scoreCount);
  const confidence = clamp((bestScore - meanScore) / Math.max(0.35, 1 - meanScore));
  const beats = positions.map((frame, index): BeatEvent => ({
    time: frame / frameRate,
    strength: onsetEnvelope[frame],
    confidence,
    index,
    downbeat: index % 4 === 0,
  }));
  return { bpm: (60 * frameRate) / period, confidence, beats };
}

