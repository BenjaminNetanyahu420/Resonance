import type { SampledAudioFeatures } from '../audio/types';
import { PARAMETER_BY_ID } from './parameters';
import type { AutomationKeyframe, ModulationRoute, ModulationSource, ProjectState } from './types';

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function hash(value: number): number {
  const x = Math.sin(value * 127.1) * 43758.5453123;
  return x - Math.floor(x);
}

export function modulationSourceValue(
  source: ModulationSource,
  features: SampledAudioFeatures,
  time: number,
  duration: number,
  route?: Pick<ModulationRoute, 'lfoRate' | 'phase'>,
  seed = 0,
): number {
  if (source in features) {
    const value = features[source as keyof SampledAudioFeatures];
    if (typeof value === 'number') return clamp(value);
  }
  const rate = route?.lfoRate ?? 0.25;
  const phase = route?.phase ?? 0;
  const cycle = time * rate + phase;
  if (source === 'songProgress') return clamp(time / Math.max(duration, 1e-6));
  if (source === 'sineLfo') return 0.5 + 0.5 * Math.sin(cycle * Math.PI * 2);
  if (source === 'triangleLfo') return 1 - Math.abs((cycle - Math.floor(cycle)) * 2 - 1);
  if (source === 'sawLfo') return cycle - Math.floor(cycle);
  if (source === 'smoothRandom') {
    const whole = Math.floor(cycle);
    const fraction = cycle - whole;
    const eased = fraction * fraction * (3 - 2 * fraction);
    return hash(whole + seed) * (1 - eased) + hash(whole + 1 + seed) * eased;
  }
  return 0;
}

export function interpolateKeyframes(keyframes: readonly AutomationKeyframe[], time: number): number | undefined {
  if (keyframes.length === 0) return undefined;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (time <= sorted[0].time) return sorted[0].value;
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
  const index = sorted.findIndex((keyframe) => keyframe.time > time);
  const before = sorted[index - 1];
  const after = sorted[index];
  if (before.easing === 'hold') return before.value;
  let mix = clamp((time - before.time) / Math.max(1e-9, after.time - before.time));
  if (before.easing === 'easeInOut') mix = mix * mix * (3 - 2 * mix);
  return before.value * (1 - mix) + after.value * mix;
}

export function resolveProjectNumber(
  project: ProjectState,
  target: string,
  baseValue: number,
  features: SampledAudioFeatures,
  time: number,
  duration: number,
): number {
  let value = baseValue;
  const track = project.automation.find((candidate) => candidate.enabled && candidate.target === target);
  const automated = track && interpolateKeyframes(track.keyframes, time);
  if (automated !== undefined) value = automated;
  if (project.scene.audioEnabled) {
    for (const route of project.modulation) {
      if (!route.enabled || route.target !== target) continue;
      let source = modulationSourceValue(route.source, features, time, duration, route, project.scene.seed);
      if (route.invert) source = 1 - source;
      source = Math.pow(clamp(source), Math.max(0.05, route.curve));
      if (route.bipolar) source = source * 2 - 1;
      const routed = clamp(source * route.amount, route.minimum, route.maximum);
      value += routed * project.masters.reactivity;
    }
  }
  const definition = PARAMETER_BY_ID.get(target);
  return definition ? clamp(value, definition.min, definition.max) : Number.isFinite(value) ? value : baseValue;
}
