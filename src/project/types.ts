export const PROJECT_VERSION = 2 as const;

export interface ChladniMode {
  readonly m: number;
  readonly n: number;
  readonly amplitude: number;
  readonly phase: number;
  readonly rotation: number;
  readonly scale: number;
}

export type BackgroundType = 'solid' | 'linear' | 'radial' | 'grid';
export type LayerType = 'chladni' | 'spectrum' | 'shape' | 'waveform' | 'particles' | 'grid';
export type ShapeType = 'circle' | 'ring' | 'triangle' | 'square' | 'pentagon' | 'hexagon' | 'octagon' | 'star' | 'flower' | 'spiral';
export type BlendMode = 'normal' | 'add' | 'screen' | 'multiply' | 'lighten' | 'difference';
export type ModulationSource =
  | 'subBass' | 'bass' | 'lowMid' | 'mid' | 'upperMid' | 'presence' | 'high'
  | 'rms' | 'peak' | 'centroid' | 'flux' | 'beatPulse' | 'beatPhase'
  | 'kickPulse' | 'snarePulse' | 'onsetPulse' | 'sectionEnergy'
  | 'songProgress' | 'sineLfo' | 'triangleLfo' | 'sawLfo' | 'smoothRandom';

export interface SceneSettings {
  readonly name: string;
  readonly seed: number;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly backgroundColor: string;
  readonly backgroundColor2: string;
  readonly backgroundType: BackgroundType;
  readonly backgroundAngle: number;
  readonly contourCount: number;
  readonly lineWidth: number;
  readonly softness: number;
  readonly glow: number;
  readonly symmetry: number;
  readonly rotationSpeed: number;
  readonly distortion: number;
  readonly spectrumAmount: number;
  readonly scanlines: number;
  readonly chromaticAberration: number;
  readonly vignette: number;
  readonly grain: number;
  readonly pixelation: number;
  readonly hueShift: number;
  readonly saturation: number;
  readonly contrast: number;
  readonly exposure: number;
  readonly lensDistortion: number;
  readonly effectsEnabled: boolean;
  readonly audioEnabled: boolean;
  readonly modes: readonly ChladniMode[];
}

export interface MasterSettings {
  readonly reactivity: number;
  readonly motion: number;
  readonly brightness: number;
  readonly glow: number;
  readonly complexity: number;
  readonly particles: number;
  readonly effects: number;
  readonly scale: number;
}

export interface CompositionLayer {
  readonly id: string;
  readonly name: string;
  readonly type: LayerType;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly solo: boolean;
  readonly opacity: number;
  readonly blendMode: BlendMode;
  readonly positionX: number;
  readonly positionY: number;
  readonly scale: number;
  readonly rotation: number;
  readonly color: string;
  readonly secondaryColor: string;
  readonly audioSource: ModulationSource;
  readonly audioAmount: number;
  readonly shape: ShapeType;
  readonly sides: number;
  readonly innerRadius: number;
  readonly thickness: number;
  readonly repetition: number;
  readonly detail: number;
  readonly speed: number;
}

export interface ModulationRoute {
  readonly id: string;
  readonly source: ModulationSource;
  readonly target: string;
  readonly amount: number;
  readonly bipolar: boolean;
  readonly invert: boolean;
  readonly curve: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly lfoRate: number;
  readonly phase: number;
  readonly enabled: boolean;
}

export type KeyframeEasing = 'linear' | 'easeInOut' | 'hold';

export interface AutomationKeyframe {
  readonly id: string;
  readonly time: number;
  readonly value: number;
  readonly easing: KeyframeEasing;
}

export interface AutomationTrack {
  readonly id: string;
  readonly target: string;
  readonly enabled: boolean;
  readonly keyframes: readonly AutomationKeyframe[];
}

export type PerformanceMode = 'low' | 'medium' | 'high' | 'ultra' | 'custom';

export interface PerformanceSettings {
  readonly mode: PerformanceMode;
  readonly previewResolution: number;
  readonly maxLayers: number;
}

export interface ExportSettings {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly bitrate: number;
}

export interface ProjectState {
  readonly version: typeof PROJECT_VERSION;
  readonly name: string;
  readonly scene: SceneSettings;
  readonly masters: MasterSettings;
  readonly layers: readonly CompositionLayer[];
  readonly modulation: readonly ModulationRoute[];
  readonly automation: readonly AutomationTrack[];
  readonly performance: PerformanceSettings;
  readonly export: ExportSettings;
}
