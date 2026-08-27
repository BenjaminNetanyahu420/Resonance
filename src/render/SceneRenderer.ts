import type { SampledAudioFeatures } from '../audio/types';
import { modulationSourceValue, resolveProjectNumber } from '../project/modulation';
import type { BlendMode, CompositionLayer, ProjectState, ShapeType } from '../project/types';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';

const MAX_LAYERS = 8;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to allocate a WebGL shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader compilation error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to allocate a WebGL program.');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unknown program link error';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  if (!Number.isFinite(value)) return [1, 1, 1];
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

const LAYER_TYPE: Record<CompositionLayer['type'], number> = {
  chladni: 0, spectrum: 1, shape: 2, waveform: 3, particles: 4, grid: 5,
};
const SHAPE_TYPE: Record<ShapeType, number> = {
  circle: 0, ring: 1, triangle: 2, square: 2, pentagon: 2, hexagon: 2, octagon: 2,
  star: 3, flower: 4, spiral: 5,
};
const BLEND_MODE: Record<BlendMode, number> = {
  normal: 0, add: 1, screen: 2, multiply: 3, lighten: 4, difference: 5,
};
const BACKGROUND_TYPE: Record<ProjectState['scene']['backgroundType'], number> = { solid: 0, linear: 1, radial: 2, grid: 3 };

export class SceneRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private lost = false;
  private readonly modeA = new Float32Array(16);
  private readonly modeB = new Float32Array(16);
  private readonly layerMeta = new Float32Array(MAX_LAYERS * 4);
  private readonly layerTransform = new Float32Array(MAX_LAYERS * 4);
  private readonly layerStyle = new Float32Array(MAX_LAYERS * 4);
  private readonly layerExtra = new Float32Array(MAX_LAYERS * 4);
  private readonly layerColor = new Float32Array(MAX_LAYERS * 3);
  private readonly layerSecondary = new Float32Array(MAX_LAYERS * 3);
  private readonly silentSpectrum = new Float32Array(64);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is required for the procedural renderer.');
    this.gl = gl;
    this.program = createProgram(gl);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Unable to allocate a vertex array.');
    this.vao = vao;
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private onContextLost = (event: Event) => { event.preventDefault(); this.lost = true; };
  private onContextRestored = () => {
    this.program = createProgram(this.gl);
    this.uniforms.clear();
    const vao = this.gl.createVertexArray();
    if (!vao) throw new Error('Unable to restore the renderer.');
    this.vao = vao;
    this.lost = false;
  };

  resize(width: number, height: number): void {
    const safeWidth = Math.max(2, Math.floor(width));
    const safeHeight = Math.max(2, Math.floor(height));
    if (this.canvas.width !== safeWidth || this.canvas.height !== safeHeight) {
      this.canvas.width = safeWidth;
      this.canvas.height = safeHeight;
    }
  }

  render(time: number, features: SampledAudioFeatures, project: ProjectState, duration = 1): void {
    if (this.lost) return;
    const gl = this.gl;
    const scene = project.scene;
    const resolve = (target: string, value: number) => resolveProjectNumber(project, target, value, features, time, duration);
    const uniform = (name: string) => {
      if (!this.uniforms.has(name)) this.uniforms.set(name, gl.getUniformLocation(this.program, name));
      return this.uniforms.get(name) ?? null;
    };
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(uniform('uResolution'), this.canvas.width, this.canvas.height);
    gl.uniform1f(uniform('uTime'), time);
    gl.uniform1f(uniform('uDuration'), duration);
    gl.uniform1f(uniform('uSeed'), scene.seed);
    gl.uniform3fv(uniform('uPrimary'), hexToRgb(scene.primaryColor));
    gl.uniform3fv(uniform('uSecondary'), hexToRgb(scene.secondaryColor));
    gl.uniform3fv(uniform('uBackground'), hexToRgb(scene.backgroundColor));
    gl.uniform3fv(uniform('uBackground2'), hexToRgb(scene.backgroundColor2));
    gl.uniform2f(uniform('uBackgroundConfig'), BACKGROUND_TYPE[scene.backgroundType], scene.backgroundAngle * Math.PI / 180);
    gl.uniform1f(uniform('uContourCount'), resolve('scene.contourCount', scene.contourCount));
    gl.uniform1f(uniform('uLineWidth'), resolve('scene.lineWidth', scene.lineWidth));
    gl.uniform1f(uniform('uSoftness'), resolve('scene.softness', scene.softness));
    gl.uniform1f(uniform('uGlow'), resolve('scene.glow', scene.glow));
    gl.uniform1f(uniform('uSymmetry'), resolve('scene.symmetry', scene.symmetry));
    gl.uniform1f(uniform('uRotationSpeed'), resolve('scene.rotationSpeed', scene.rotationSpeed));
    gl.uniform1f(uniform('uDistortion'), resolve('scene.distortion', scene.distortion));
    gl.uniform1f(uniform('uSpectrumAmount'), resolve('scene.spectrumAmount', scene.spectrumAmount));
    const effects = scene.effectsEnabled ? resolve('masters.effects', project.masters.effects) : 0;
    gl.uniform4f(uniform('uPostA'), resolve('scene.scanlines', scene.scanlines), resolve('scene.chromaticAberration', scene.chromaticAberration), resolve('scene.vignette', scene.vignette), resolve('scene.grain', scene.grain));
    gl.uniform4f(uniform('uPostB'), resolve('scene.pixelation', scene.pixelation), resolve('scene.hueShift', scene.hueShift), resolve('scene.saturation', scene.saturation), resolve('scene.contrast', scene.contrast));
    gl.uniform2f(uniform('uPostC'), resolve('scene.exposure', scene.exposure), resolve('scene.lensDistortion', scene.lensDistortion));
    gl.uniform4f(uniform('uMasterA'), resolve('masters.reactivity', project.masters.reactivity), resolve('masters.motion', project.masters.motion), resolve('masters.brightness', project.masters.brightness), resolve('masters.scale', project.masters.scale));
    gl.uniform4f(uniform('uMasterB'), resolve('masters.glow', project.masters.glow), resolve('masters.complexity', project.masters.complexity), resolve('masters.particles', project.masters.particles), effects);
    const audio = scene.audioEnabled ? features : null;
    gl.uniform4f(uniform('uAudioA'), audio?.subBass ?? 0, audio?.bass ?? 0, audio?.rms ?? 0, audio?.centroid ?? 0);
    gl.uniform4f(uniform('uAudioB'), audio?.beatPulse ?? 0, audio?.kickPulse ?? 0, audio?.snarePulse ?? 0, audio?.onsetPulse ?? 0);
    this.modeA.fill(0); this.modeB.fill(0);
    scene.modes.slice(0, 4).forEach((mode, index) => {
      this.modeA.set([mode.m, mode.n, mode.amplitude, mode.phase], index * 4);
      this.modeB.set([mode.rotation, mode.scale, 0, 0], index * 4);
    });
    gl.uniform4fv(uniform('uModeA[0]'), this.modeA);
    gl.uniform4fv(uniform('uModeB[0]'), this.modeB);
    gl.uniform1i(uniform('uModeCount'), Math.min(4, scene.modes.length));
    gl.uniform1fv(uniform('uSpectrum[0]'), audio?.spectrum ?? this.silentSpectrum);

    this.layerMeta.fill(0); this.layerTransform.fill(0); this.layerStyle.fill(0); this.layerExtra.fill(0);
    this.layerColor.fill(0); this.layerSecondary.fill(0);
    const hasSolo = project.layers.some((layer) => layer.solo && layer.visible);
    const maxLayers = Math.min(MAX_LAYERS, project.performance.maxLayers);
    const layers = project.layers.slice(0, maxLayers);
    layers.forEach((layer, index) => {
      const offset = index * 4;
      const visible = layer.visible && (!hasSolo || layer.solo);
      const opacity = visible ? resolve(`layer:${layer.id}:opacity`, layer.opacity) : 0;
      const source = scene.audioEnabled ? modulationSourceValue(layer.audioSource, features, time, duration, { lfoRate: Math.max(0.01, Math.abs(layer.speed)), phase: 0 }, scene.seed + index) : 0;
      const particleFactor = layer.type === 'particles' ? project.masters.particles : 1;
      this.layerMeta.set([LAYER_TYPE[layer.type], opacity * particleFactor, BLEND_MODE[layer.blendMode], source * resolve(`layer:${layer.id}:audioAmount`, layer.audioAmount)], offset);
      this.layerTransform.set([
        resolve(`layer:${layer.id}:positionX`, layer.positionX), resolve(`layer:${layer.id}:positionY`, layer.positionY),
        resolve(`layer:${layer.id}:scale`, layer.scale), resolve(`layer:${layer.id}:rotation`, layer.rotation),
      ], offset);
      const sides = layer.shape === 'triangle' ? 3 : layer.shape === 'square' ? 4 : layer.shape === 'pentagon' ? 5 : layer.shape === 'hexagon' ? 6 : layer.shape === 'octagon' ? 8 : layer.sides;
      this.layerStyle.set([SHAPE_TYPE[layer.shape], sides, resolve(`layer:${layer.id}:innerRadius`, layer.innerRadius), resolve(`layer:${layer.id}:thickness`, layer.thickness)], offset);
      this.layerExtra.set([resolve(`layer:${layer.id}:repetition`, layer.repetition), resolve(`layer:${layer.id}:detail`, layer.detail), resolve(`layer:${layer.id}:speed`, layer.speed), 0], offset);
      this.layerColor.set(hexToRgb(layer.color), index * 3);
      this.layerSecondary.set(hexToRgb(layer.secondaryColor), index * 3);
    });
    gl.uniform4fv(uniform('uLayerMeta[0]'), this.layerMeta);
    gl.uniform4fv(uniform('uLayerTransform[0]'), this.layerTransform);
    gl.uniform4fv(uniform('uLayerStyle[0]'), this.layerStyle);
    gl.uniform4fv(uniform('uLayerExtra[0]'), this.layerExtra);
    gl.uniform3fv(uniform('uLayerColor[0]'), this.layerColor);
    gl.uniform3fv(uniform('uLayerSecondary[0]'), this.layerSecondary);
    gl.uniform1i(uniform('uLayerCount'), layers.length);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
    this.uniforms.clear();
  }
}
