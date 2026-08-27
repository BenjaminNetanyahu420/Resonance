import { analyzePcm, audioBufferToPcm } from '../audio/analyze';
import { exportComposition } from '../export/exportVideo';
import { DEFAULT_PROJECT } from '../project/defaults';

async function run(): Promise<void> {
  const resultElement = document.querySelector<HTMLPreElement>('#result')!;
  try {
    const parameters = new URLSearchParams(location.search);
    const audioUrl = parameters.get('audio');
    let buffer: AudioBuffer;
    if (audioUrl) {
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error(`Unable to read QA audio: HTTP ${response.status}`);
      const context = new AudioContext();
      try {
        buffer = await context.decodeAudioData(await response.arrayBuffer());
      } finally {
        await context.close();
      }
    } else {
      const sampleRate = 48_000;
      const duration = Number(parameters.get('duration') ?? 1);
      const samples = new Float32Array(sampleRate * duration);
      for (let i = 0; i < samples.length; i += 1) {
        const time = i / sampleRate;
        const beatPhase = time % 0.5;
        const click = beatPhase < 0.02 ? Math.exp(-beatPhase * 180) * Math.sin(2 * Math.PI * 90 * time) : 0;
        samples[i] = 0.18 * Math.sin(2 * Math.PI * 50 * time) + click * 0.7;
      }
      buffer = new AudioBuffer({ numberOfChannels: 1, length: samples.length, sampleRate });
      buffer.copyToChannel(samples, 0);
    }
    const analysis = await analyzePcm(audioBufferToPcm(buffer));
    const width = Number(parameters.get('width') ?? 320);
    const height = Number(parameters.get('height') ?? 180);
    const fps = Number(parameters.get('fps') ?? 30);
    const result = await exportComposition({
      audioBuffer: buffer,
      analysis,
      project: DEFAULT_PROJECT,
      settings: { width, height, fps, bitrate: Number(parameters.get('bitrate') ?? 800_000) },
    });
    const signature = Array.from(new Uint8Array(await result.blob.slice(4, 8).arrayBuffer()))
      .map((value) => String.fromCharCode(value)).join('');
    resultElement.textContent = JSON.stringify({
      status: result.valid && signature === 'ftyp' ? 'PASS' : 'FAIL',
      mimeType: result.blob.type,
      bytes: result.blob.size,
      signature,
      expectedFrames: result.expectedFrames,
      encodedFrames: result.encodedFrames,
      expectedDuration: result.expectedDuration,
      videoDuration: result.videoDuration,
      audioDuration: result.audioDuration,
      source: audioUrl ? 'file' : 'synthetic',
    });
    document.title = result.valid ? 'PASS' : 'FAIL';
  } catch (error) {
    resultElement.textContent = JSON.stringify({ status: 'ERROR', message: error instanceof Error ? error.message : String(error) });
    document.title = 'ERROR';
  }
}

void run();
