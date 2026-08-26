import type { SampledAudioFeatures } from '../audio/types';
import type { SceneSettings } from '../project/types';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';

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
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export class SceneRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private lost = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
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

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
  };

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

  render(time: number, features: SampledAudioFeatures, scene: SceneSettings): void {
    if (this.lost) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    const uniform = (name: string) => {
      if (!this.uniforms.has(name)) this.uniforms.set(name, gl.getUniformLocation(this.program, name));
      return this.uniforms.get(name) ?? null;
    };
    gl.uniform2f(uniform('uResolution'), this.canvas.width, this.canvas.height);
    gl.uniform1f(uniform('uTime'), time);
    gl.uniform1f(uniform('uSeed'), scene.seed);
    gl.uniform3fv(uniform('uPrimary'), hexToRgb(scene.primaryColor));
    gl.uniform3fv(uniform('uSecondary'), hexToRgb(scene.secondaryColor));
    gl.uniform3fv(uniform('uBackground'), hexToRgb(scene.backgroundColor));
    gl.uniform1f(uniform('uContourCount'), scene.contourCount);
    gl.uniform1f(uniform('uLineWidth'), scene.lineWidth);
    gl.uniform1f(uniform('uSoftness'), scene.softness);
    gl.uniform1f(uniform('uGlow'), scene.glow);
    gl.uniform1f(uniform('uSymmetry'), scene.symmetry);
    gl.uniform1f(uniform('uRotationSpeed'), scene.rotationSpeed);
    gl.uniform1f(uniform('uDistortion'), scene.distortion);
    gl.uniform1f(uniform('uSpectrumAmount'), scene.spectrumAmount);
    gl.uniform1f(uniform('uScanlines'), scene.scanlines);
    gl.uniform1f(uniform('uChromatic'), scene.chromaticAberration);
    gl.uniform4f(uniform('uAudioA'), features.subBass, features.bass, features.rms, features.centroid);
    gl.uniform4f(uniform('uAudioB'), features.beatPulse, features.kickPulse, features.snarePulse, features.onsetPulse);
    const modeA = new Float32Array(16);
    const modeB = new Float32Array(16);
    scene.modes.slice(0, 4).forEach((mode, index) => {
      modeA.set([mode.m, mode.n, mode.amplitude, mode.phase], index * 4);
      modeB.set([mode.rotation, mode.scale, 0, 0], index * 4);
    });
    gl.uniform4fv(uniform('uModeA[0]'), modeA);
    gl.uniform4fv(uniform('uModeB[0]'), modeB);
    gl.uniform1i(uniform('uModeCount'), Math.min(4, scene.modes.length));
    gl.uniform1fv(uniform('uSpectrum[0]'), features.spectrum);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}
