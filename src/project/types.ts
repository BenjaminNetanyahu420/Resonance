export interface ChladniMode {
  readonly m: number;
  readonly n: number;
  readonly amplitude: number;
  readonly phase: number;
  readonly rotation: number;
  readonly scale: number;
}

export interface SceneSettings {
  readonly name: string;
  readonly seed: number;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly backgroundColor: string;
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
  readonly modes: readonly ChladniMode[];
}

export interface ExportSettings {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly bitrate: number;
}

export interface ProjectState {
  readonly version: 1;
  readonly scene: SceneSettings;
  readonly export: ExportSettings;
}

