# Architecture

The first production vertical slice is intentionally narrow: one procedural scene, deep audio mapping, deterministic preview, and a real audio-bearing MP4 export. Features outside this slice are tracked in `ROADMAP.md`; no dormant UI is shown for them.

```text
File -> decode once -> AudioBuffer
                    -> mono PCM -> STFT/features -> immutable AudioAnalysis

AudioAnalysis -> sampleAudioFeatures(t) -> RenderFeatures
AudioBuffer   -> PlaybackClock(t) -------^       |
                                                v
                                        WebGL SceneRenderer
                                           ^           ^
                                   preview time    frameIndex/fps
                                                       |
                                               Mediabunny MP4 + AAC
```

## Ownership

- React owns persistent scene settings and low-frequency editor state.
- `PlaybackClock` owns the replace-on-seek `AudioBufferSourceNode` and derives time from `AudioContext.currentTime`.
- `AudioAnalysis` is immutable typed-array data. One sampling function serves preview and export.
- `SceneRenderer` owns all GPU resources and its imperative render loop. React never renders animation frames.
- Export creates a separate renderer/canvas so preview state and export state cannot contaminate each other.

## Audio timeline

Analysis frames have a fixed hop. Dense data (RMS, bands, log spectrum, centroid, flux) uses typed arrays. Sparse semantic events (beats, onsets, percussion, sections) use compact records. Sampling is O(log n) for beat lookup and O(1) for dense interpolation.

## Determinism

- All render inputs are functions of project data, analysis data, explicit time, and a fixed seed.
- The procedural shader uses coordinate hashing with the project seed; there is no per-frame random state.
- Seeking requires no replay because the current visual system is analytical rather than simulated.
- Export uses exact rational frame timestamps and the same renderer method as preview.

## Risks

- Browser codec availability varies. Capability detection blocks export with a useful error before work begins.
- Full PCM plus dense analysis has a real memory cost. The spectrum is limited to 64 perceptual bins and waveform display data is downsampled.
- The current buffer-backed export can consume substantial memory in browsers without File System Access. Direct-to-disk streaming is the next export milestone.
- Beat tracking without a learned model will have difficult material and tempo ambiguities. Confidence is exposed; manual beat-grid correction is planned.

