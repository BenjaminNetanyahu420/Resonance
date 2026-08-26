# Research findings

Research date: 2026-08-25.

## Audio analysis

- `decodeAudioData()` is broadly available and decodes a complete file to an `AudioBuffer`, resampled to the context sample rate. The application therefore decodes once, keeps the resulting PCM as the playback/export authority, and performs analysis over a mono mixdown.
- Onset detection uses the established spectral-flux pattern: Hann-windowed STFT, half-wave rectification of positive magnitude differences, local adaptive thresholding, and peak picking. Beat tracking uses whole-track autocorrelation to choose a tempo hypothesis, then dynamic programming to favor strong onsets while penalizing deviations from the tempo period. This follows the practical family of approaches described by Ellis rather than treating every transient as a beat.
- Essentia.js was evaluated but not selected. Essentia is AGPLv3 for non-commercial use and requires a commercial license for proprietary/commercial distribution. The initial engine uses original implementations of standard DSP primitives so the application has no hidden licensing constraint.

## Rendering

- WebGL2 is the baseline GPU API. It is mature enough for a desktop creative tool, supports deterministic fragment-shader field evaluation, and avoids browser-specific WebGPU behavior in the first vertical slice.
- Preview and export call the same `render(time, features, scene)` entry point. Shader time is always the requested composition time; neither wall-clock time nor frame count enters visual state.
- Context loss is handled explicitly. Preview resolution is capped independently of export resolution.

## Export

- WebCodecs accepts timestamped `VideoFrame` and `AudioData` inputs but does not create containers. Mediabunny supplies typed canvas/audio sources and MP4 muxing, and supports direct-to-disk output through the File System Access API.
- Frames use `time = frameIndex / fps`; total frames use `ceil(duration * fps)`. Audio comes from the same decoded PCM used for playback and analysis. The final video frame is duration-clamped, preventing a video track that unintentionally exceeds the audio duration.
- Native AAC support is not universal. `@mediabunny/aac-encoder` is registered only when `canEncodeAudio('aac')` reports no native support.

## Sources and licenses

- [MDN Web Audio decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)
- [MDN WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [W3C WebCodecs codec registry](https://www.w3.org/TR/webcodecs-codec-registry/)
- [Mediabunny quick start](https://mediabunny.dev/guide/quick-start), MPL-2.0
- [Mediabunny AAC encoder](https://mediabunny.dev/guide/extensions/aac-encoder), MPL-2.0
- Daniel P. W. Ellis, *Beat Tracking by Dynamic Programming*, Journal of New Music Research 36(1), 2007
- [Essentia licensing](https://essentia.upf.edu/licensing_information.html)

