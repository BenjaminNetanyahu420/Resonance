import type { ProjectState } from './types';

export type ParameterSection = 'Master' | 'Geometry' | 'Motion' | 'Audio' | 'Post Processing';

export interface ParameterDefinition {
  readonly id: string;
  readonly label: string;
  readonly section: ParameterSection;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  readonly help: string;
}

export const PARAMETERS: readonly ParameterDefinition[] = [
  { id: 'masters.reactivity', label: 'Master reactivity', section: 'Master', min: 0, max: 2, step: 0.01, defaultValue: 1, help: 'Multiplies every audio-driven response without changing its underlying mapping.' },
  { id: 'masters.motion', label: 'Master motion', section: 'Master', min: 0, max: 2, step: 0.01, defaultValue: 1, help: 'Multiplies deterministic time-based movement.' },
  { id: 'masters.brightness', label: 'Master brightness', section: 'Master', min: 0, max: 2, step: 0.01, defaultValue: 1, help: 'Controls the final scene luminance.' },
  { id: 'masters.glow', label: 'Master glow', section: 'Master', min: 0, max: 2, step: 0.01, defaultValue: 1, help: 'Multiplies emissive contour glow.' },
  { id: 'masters.complexity', label: 'Master complexity', section: 'Master', min: 0.25, max: 2, step: 0.01, defaultValue: 1, help: 'Scales procedural detail while respecting the layer limit.' },
  { id: 'masters.particles', label: 'Particle intensity', section: 'Master', min: 0, max: 2, step: 0.01, defaultValue: 1, help: 'Multiplies the density and brightness of particle layers.' },
  { id: 'masters.effects', label: 'Master effects', section: 'Master', min: 0, max: 2, step: 0.01, defaultValue: 1, help: 'Multiplies post-processing intensities.' },
  { id: 'masters.scale', label: 'Master scale', section: 'Master', min: 0.35, max: 2.5, step: 0.01, defaultValue: 1, help: 'Scales the complete foreground composition.' },
  { id: 'scene.symmetry', label: 'Symmetry', section: 'Geometry', min: 2, max: 24, step: 1, defaultValue: 8, help: 'Number of repeated angular sectors in the cymatic field.' },
  { id: 'scene.contourCount', label: 'Contours', section: 'Geometry', min: 2, max: 32, step: 1, defaultValue: 9, help: 'Number of visible nodal contour bands.' },
  { id: 'scene.lineWidth', label: 'Line width', section: 'Geometry', min: 0.01, max: 0.2, step: 0.002, defaultValue: 0.075, help: 'Thickness of the field contours.' },
  { id: 'scene.softness', label: 'Edge softness', section: 'Geometry', min: 0.002, max: 0.12, step: 0.002, defaultValue: 0.028, help: 'Anti-aliased feathering around procedural edges.' },
  { id: 'scene.distortion', label: 'Domain warp', section: 'Geometry', min: 0, max: 0.8, step: 0.01, defaultValue: 0.18, help: 'Warps coordinates before procedural geometry is evaluated.' },
  { id: 'scene.rotationSpeed', label: 'Rotation speed', section: 'Motion', min: -0.5, max: 0.5, step: 0.005, defaultValue: 0.035, help: 'Time-based field rotation in revolutions per composition second.' },
  { id: 'scene.spectrumAmount', label: 'Spectrum depth', section: 'Audio', min: 0, max: 2, step: 0.01, defaultValue: 0.72, help: 'Scales the displacement of spectrum and waveform layers.' },
  { id: 'scene.glow', label: 'Contour glow', section: 'Post Processing', min: 0, max: 3, step: 0.02, defaultValue: 1.25, help: 'Adds broad emissive energy around contours.' },
  { id: 'scene.chromaticAberration', label: 'RGB separation', section: 'Post Processing', min: 0, max: 0.06, step: 0.001, defaultValue: 0.018, help: 'Offsets red and blue sampling along the horizontal axis.' },
  { id: 'scene.scanlines', label: 'Scanlines', section: 'Post Processing', min: 0, max: 0.6, step: 0.01, defaultValue: 0.16, help: 'Resolution-aware CRT scanline strength.' },
  { id: 'scene.vignette', label: 'Vignette', section: 'Post Processing', min: 0, max: 1.5, step: 0.01, defaultValue: 0.7, help: 'Darkens the outer image area.' },
  { id: 'scene.grain', label: 'Film grain', section: 'Post Processing', min: 0, max: 0.6, step: 0.01, defaultValue: 0.16, help: 'Adds deterministic frame-indexed luminance grain.' },
  { id: 'scene.pixelation', label: 'Pixelation', section: 'Post Processing', min: 0, max: 1, step: 0.01, defaultValue: 0, help: 'Quantizes scene sampling while remaining resolution independent.' },
  { id: 'scene.hueShift', label: 'Hue shift', section: 'Post Processing', min: -0.5, max: 0.5, step: 0.005, defaultValue: 0, help: 'Rotates final color around the RGB luminance axis.' },
  { id: 'scene.saturation', label: 'Saturation', section: 'Post Processing', min: 0, max: 2, step: 0.01, defaultValue: 1, help: 'Controls distance from grayscale.' },
  { id: 'scene.contrast', label: 'Contrast', section: 'Post Processing', min: 0.25, max: 2, step: 0.01, defaultValue: 1, help: 'Adjusts final contrast around middle gray.' },
  { id: 'scene.exposure', label: 'Exposure', section: 'Post Processing', min: -2, max: 2, step: 0.02, defaultValue: 0, help: 'Applies photographic exposure before tone mapping.' },
  { id: 'scene.lensDistortion', label: 'Lens distortion', section: 'Post Processing', min: -0.5, max: 0.5, step: 0.005, defaultValue: 0, help: 'Applies barrel or pincushion lens curvature.' },
];

export const PARAMETER_BY_ID = new Map(PARAMETERS.map((definition) => [definition.id, definition]));

export function getProjectNumber(project: ProjectState, id: string): number | undefined {
  const [scope, key] = id.split('.');
  if (scope === 'scene' || scope === 'masters') {
    const value = (project[scope] as unknown as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : undefined;
  }
  const layerMatch = /^layer:([^:]+):(opacity|positionX|positionY|scale|rotation|audioAmount|innerRadius|thickness|repetition|detail|speed)$/.exec(id);
  if (layerMatch) {
    const layer = project.layers.find((candidate) => candidate.id === layerMatch[1]);
    const value = layer?.[layerMatch[2] as keyof typeof layer];
    return typeof value === 'number' ? value : undefined;
  }
  return undefined;
}

export function setProjectNumber(project: ProjectState, id: string, value: number): ProjectState {
  const definition = PARAMETER_BY_ID.get(id);
  const safe = definition ? Math.min(definition.max, Math.max(definition.min, value)) : value;
  const [scope, key] = id.split('.');
  if (scope === 'scene') return { ...project, scene: { ...project.scene, [key]: safe } };
  if (scope === 'masters') return { ...project, masters: { ...project.masters, [key]: safe } };
  const layerMatch = /^layer:([^:]+):(opacity|positionX|positionY|scale|rotation|audioAmount|innerRadius|thickness|repetition|detail|speed)$/.exec(id);
  if (!layerMatch) return project;
  return {
    ...project,
    layers: project.layers.map((layer) => layer.id === layerMatch[1] ? { ...layer, [layerMatch[2]]: safe } : layer),
  };
}
