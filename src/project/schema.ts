import { DEFAULT_PROJECT, DEFAULT_SCENE, createId } from './defaults';
import { PARAMETER_BY_ID, setProjectNumber } from './parameters';
import { PROJECT_VERSION, type CompositionLayer, type ProjectState } from './types';

type LooseObject = Record<string, unknown>;

function object(value: unknown): LooseObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseObject : {};
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function hydrateLayer(value: unknown, index: number): CompositionLayer | null {
  const item = object(value);
  const type = typeof item.type === 'string' && ['chladni', 'spectrum', 'shape', 'waveform', 'particles', 'grid'].includes(item.type)
    ? item.type as CompositionLayer['type'] : null;
  if (!type) return null;
  const base = DEFAULT_PROJECT.layers.find((layer) => layer.type === type) ?? DEFAULT_PROJECT.layers[0];
  return {
    ...base, ...item, type,
    id: typeof item.id === 'string' && item.id.length > 0 ? item.id : createId(`layer-${index}`),
    name: typeof item.name === 'string' ? item.name.slice(0, 80) : base.name,
    color: color(item.color, base.color), secondaryColor: color(item.secondaryColor, base.secondaryColor),
    opacity: number(item.opacity, base.opacity, 0, 1), scale: number(item.scale, base.scale, 0.05, 8),
    positionX: number(item.positionX, base.positionX, -4, 4), positionY: number(item.positionY, base.positionY, -4, 4),
    rotation: number(item.rotation, base.rotation, -20, 20), audioAmount: number(item.audioAmount, base.audioAmount, -4, 4),
    sides: Math.round(number(item.sides, base.sides, 3, 64)), innerRadius: number(item.innerRadius, base.innerRadius, 0.01, 2),
    thickness: number(item.thickness, base.thickness, 0.001, 1), repetition: number(item.repetition, base.repetition, 1, 128),
    detail: number(item.detail, base.detail, 0, 2), speed: number(item.speed, base.speed, -4, 4),
  } as CompositionLayer;
}

export function migrateProject(input: unknown): ProjectState {
  const root = object(input);
  const legacyScene = object(root.scene);
  const scene = {
    ...DEFAULT_SCENE, ...legacyScene,
    name: typeof legacyScene.name === 'string' ? legacyScene.name.slice(0, 100) : DEFAULT_SCENE.name,
    primaryColor: color(legacyScene.primaryColor, DEFAULT_SCENE.primaryColor),
    secondaryColor: color(legacyScene.secondaryColor, DEFAULT_SCENE.secondaryColor),
    backgroundColor: color(legacyScene.backgroundColor, DEFAULT_SCENE.backgroundColor),
    backgroundColor2: color(legacyScene.backgroundColor2, DEFAULT_SCENE.backgroundColor2),
    modes: Array.isArray(legacyScene.modes) && legacyScene.modes.length > 0 ? legacyScene.modes.slice(0, 4) : DEFAULT_SCENE.modes,
  };
  let project: ProjectState = {
    ...DEFAULT_PROJECT,
    version: PROJECT_VERSION,
    name: typeof root.name === 'string' ? root.name.slice(0, 100) : scene.name,
    scene,
    masters: { ...DEFAULT_PROJECT.masters, ...object(root.masters) },
    performance: { ...DEFAULT_PROJECT.performance, ...object(root.performance) },
    export: { ...DEFAULT_PROJECT.export, ...object(root.export) },
    layers: Array.isArray(root.layers) ? root.layers.map(hydrateLayer).filter((layer): layer is CompositionLayer => Boolean(layer)).slice(0, 8) : DEFAULT_PROJECT.layers,
    modulation: Array.isArray(root.modulation) ? root.modulation.filter((item) => item && typeof item === 'object').slice(0, 32) as ProjectState['modulation'] : [],
    automation: Array.isArray(root.automation) ? root.automation.filter((item) => item && typeof item === 'object').slice(0, 32) as ProjectState['automation'] : [],
  };
  if (project.layers.length === 0) project = { ...project, layers: DEFAULT_PROJECT.layers };
  for (const definition of PARAMETER_BY_ID.values()) {
    const [scope, key] = definition.id.split('.');
    const current = (project[scope as 'scene' | 'masters'] as unknown as LooseObject)[key];
    project = setProjectNumber(project, definition.id, number(current, definition.defaultValue, definition.min, definition.max));
  }
  project = {
    ...project,
    export: {
      width: Math.round(number(project.export.width, 1920, 256, 7680) / 2) * 2,
      height: Math.round(number(project.export.height, 1080, 256, 4320) / 2) * 2,
      fps: [24, 30, 60].includes(project.export.fps) ? project.export.fps : 30,
      bitrate: number(project.export.bitrate, 16_000_000, 1_000_000, 100_000_000),
    },
  };
  return project;
}

export function parseProject(text: string): ProjectState {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('The project file is not valid JSON.'); }
  const root = object(value);
  if (typeof root.version === 'number' && root.version > PROJECT_VERSION) {
    throw new Error(`This project uses schema version ${root.version}; this build supports up to version ${PROJECT_VERSION}.`);
  }
  return migrateProject(value);
}

export function serializeProject(project: ProjectState): string {
  return JSON.stringify(migrateProject(project), null, 2);
}
