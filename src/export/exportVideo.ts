import { registerAacEncoder } from '@mediabunny/aac-encoder';
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import type { AudioAnalysis } from '../audio/types';
import { sampleAudioFeatures } from '../audio/timeline';
import type { ExportSettings, ProjectState } from '../project/types';
import { SceneRenderer } from '../render/SceneRenderer';

export interface ExportProgress {
  readonly frame: number;
  readonly totalFrames: number;
  readonly progress: number;
  readonly stage: 'checking' | 'video' | 'audio' | 'muxing';
}

export interface ExportResult {
  readonly blob: Blob;
  readonly expectedFrames: number;
  readonly encodedFrames: number;
  readonly expectedDuration: number;
  readonly videoDuration: number;
  readonly audioDuration: number;
  readonly valid: boolean;
}

export async function exportComposition(options: {
  audioBuffer: AudioBuffer;
  analysis: AudioAnalysis;
  project: ProjectState;
  settings: ExportSettings;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}): Promise<ExportResult> {
  const { audioBuffer, analysis, project, settings, signal, onProgress } = options;
  const scene = project.scene;
  onProgress?.({ frame: 0, totalFrames: 0, progress: 0, stage: 'checking' });
  if (settings.width % 2 !== 0 || settings.height % 2 !== 0) throw new Error('H.264 export dimensions must be even.');
  const quality = new Quality({ bitrate: settings.bitrate, bitrateMode: 'variable' });
  if (!(await canEncodeVideo('avc', { width: settings.width, height: settings.height, quality }))) {
    throw new Error('This browser cannot encode H.264 at the selected resolution. Try Chrome/Edge or a lower resolution.');
  }
  const audioQuality = new Quality({ bitrate: 256_000, bitrateMode: 'variable' });
  if (!(await canEncodeAudio('aac', {
    numberOfChannels: audioBuffer.numberOfChannels,
    sampleRate: audioBuffer.sampleRate,
    quality: audioQuality,
  }))) {
    registerAacEncoder();
  }

  const canvas = document.createElement('canvas');
  const renderer = new SceneRenderer(canvas);
  renderer.resize(settings.width, settings.height);
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });
  const videoSource = new CanvasSource(canvas, {
    codec: 'avc',
    quality,
    keyFrameInterval: 2,
    alpha: 'discard',
  });
  const audioSource = new AudioBufferSource({
    codec: 'aac',
    quality: audioQuality,
  });
  const totalFrames = Math.ceil(analysis.duration * settings.fps);
  output.addVideoTrack(videoSource, { frameRate: settings.fps, maximumPacketCount: totalFrames });
  output.addAudioTrack(audioSource);
  output.setMetadataTags({ title: scene.name, comment: 'Rendered by Resonance Studio' });

  let encodedFrames = 0;
  try {
    await output.start();
    for (let frame = 0; frame < totalFrames; frame += 1) {
      if (signal?.aborted) throw new DOMException('Export canceled', 'AbortError');
      const time = frame / settings.fps;
      const duration = Math.min(1 / settings.fps, Math.max(1e-6, analysis.duration - time));
      renderer.render(time, sampleAudioFeatures(analysis, time), project, analysis.duration);
      await videoSource.add(time, duration, { keyFrame: frame % Math.max(1, Math.round(settings.fps * 2)) === 0 });
      encodedFrames += 1;
      if (frame % 4 === 0 || frame === totalFrames - 1) {
        onProgress?.({ frame: frame + 1, totalFrames, progress: 0.9 * ((frame + 1) / totalFrames), stage: 'video' });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    onProgress?.({ frame: totalFrames, totalFrames, progress: 0.92, stage: 'audio' });
    await audioSource.add(audioBuffer);
    onProgress?.({ frame: totalFrames, totalFrames, progress: 0.97, stage: 'muxing' });
    await output.finalize();
  } catch (error) {
    if (output.state === 'started') await output.cancel();
    throw error;
  } finally {
    renderer.dispose();
  }

  if (!target.buffer) throw new Error('The encoder finalized without producing an output file.');
  const videoDuration = encodedFrames === 0 ? 0 : Math.min(analysis.duration, encodedFrames / settings.fps);
  const durationTolerance = Math.max(1 / settings.fps, 1 / audioBuffer.sampleRate);
  const valid = encodedFrames === totalFrames
    && Math.abs(videoDuration - analysis.duration) <= durationTolerance
    && Math.abs(audioBuffer.duration - analysis.duration) <= durationTolerance;
  return {
    blob: new Blob([target.buffer], { type: 'video/mp4' }),
    expectedFrames: totalFrames,
    encodedFrames,
    expectedDuration: analysis.duration,
    videoDuration,
    audioDuration: audioBuffer.duration,
    valid,
  };
}
