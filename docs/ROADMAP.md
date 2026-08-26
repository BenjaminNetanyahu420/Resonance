# Implementation roadmap

## Implemented vertical slice

- Complete-file audio decode and single PCM authority
- Hann STFT, RMS/peak envelopes, seven perceptual bands, 64-bin log spectrum, centroid, spectral flux
- Adaptive onset detection, percussion heuristics, bass transients, whole-track tempo estimation, beat grid and confidence
- Authoritative interpolated timeline sampler
- Deterministic WebGL2 Chladni/cymatic field with modal superposition, continuous motion, radial spectrum, CRT and chromatic contour treatment
- Synchronized seekable playback and waveform/beat timeline
- Offline frame-indexed MP4 export with AAC audio, progress, cancellation, frame/duration validation
- Synthetic metronome and deterministic sampling tests

## Next dependency-ordered milestones

1. Move STFT and export orchestration to dedicated workers; add direct-to-disk fragmented MP4 streaming.
2. Add editable beat markers, BPM/offset overrides, analysis cache serialization, and richer section detection.
3. Generalize the renderer into persistent layers, generic audio mappings, keyframes, and undoable commands.
4. Add image/text/waveform/particle layers and deterministic/checkpointed particle seeking.
5. Add field nodes, custom paths/SDF primitives, nondestructive modifier stacks, and multiple cymatic domains.
6. Add reorderable multipass bloom/effect graph with managed render-target pooling and history preroll.
7. Add project files, IndexedDB asset management/autosave, export presets, and crash recovery.
8. Validate 3/5/10-minute direct-to-disk exports, long-run GPU memory, context recovery, and cross-browser codec fallbacks.

