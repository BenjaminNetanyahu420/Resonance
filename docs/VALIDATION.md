# Validation report

## Automated DSP and determinism checks

Synthetic audio is generated in memory at 44.1 kHz. Timing errors compare each known click timestamp with its nearest detected beat after accounting for the STFT window-center convention.

| Expected tempo | Detected tempo | Mean absolute error | Maximum error | Expected / detected beats |
|---:|---:|---:|---:|---:|
| 60 BPM | 60.093 BPM | 3.33 ms | 6.19 ms | 10 / 10 |
| 120 BPM | 120.185 BPM | 4.18 ms | 8.46 ms | 19 / 20 |
| 128 BPM | 129.199 BPM | 3.50 ms | 7.63 ms | 21 / 21 |
| 140 BPM | 139.675 BPM | 3.33 ms | 7.82 ms | 23 / 23 |

Additional passing checks cover:

- exact FFT-bin placement and amplitude;
- silence producing no BPM, beats, onsets, or non-finite values;
- a sustained 50 Hz tone retaining its sub-bass envelope;
- exact dense-feature interpolation;
- identical timeline requests producing identical values;
- clamped seek sampling outside the composition duration.

These synthetic figures validate the timebase and controlled inputs. They are not a claim that heuristic beat tracking is equally accurate on every musical genre; the UI exposes confidence for that reason.

## Browser smoke checks

- Microsoft Edge headless, 1440×900: application startup, WebGL2 shader compilation, responsive editor layout, and deterministic default-frame rendering passed.
- Microsoft Edge WebCodecs export: PASS. The harness created a 163,426-byte, one-second 320×180/30 FPS MP4; signature `ftyp`; 30 expected / 30 encoded frames; video duration 1.000 s; audio duration 1.000 s.
- `qa-export.html` is retained as a browser QA harness because WebCodecs cannot be exercised in the Node test environment.

## Full-length export matrix

All diagnostic exports used Edge, H.264 + AAC in MP4, 320×180 at 30 FPS, and the complete generated audio buffer. The low resolution isolates timing, frame lifecycle, muxing, cancellation-safe resource cleanup, and duration behavior from 4K shader cost.

| Source | Duration | Expected / encoded frames | Output bytes | Video / audio duration | Result |
|---|---:|---:|---:|---:|---:|
| Synthetic | 30.000 s | 900 / 900 | 3,582,839 | 30.000 / 30.000 s | PASS |
| Project MP3 | 167.654 s | 5,030 / 5,030 | 22,500,477 | 167.654 / 167.654 s | PASS |
| Project WAV | 167.619 s | 5,029 / 5,029 | 22,525,339 | 167.619 / 167.619 s | PASS |
| Synthetic | 180.000 s | 5,400 / 5,400 | 21,416,643 | 180.000 / 180.000 s | PASS |
| Synthetic | 300.000 s | 9,000 / 9,000 | 35,658,236 | 300.000 / 300.000 s | PASS |
| Synthetic | 600.000 s | 18,000 / 18,000 | 71,335,117 | 600.000 / 600.000 s | PASS |

No encoder error, skipped/duplicated frame count, or progressive A/V duration drift occurred in this matrix. Production-resolution long exports still need separate performance characterization on target hardware, and direct-to-disk output remains a roadmap item for output sizes where a memory-backed target is inappropriate.

Set `QA_AUDIO` to run the same harness against a complete local track, or `QA_DURATION` for a synthetic long-duration run. Optional `QA_WIDTH`, `QA_HEIGHT`, and `QA_FPS` variables control stress-test render settings.

## Commands

```bash
npm test
npm run build
npm run qa:export
npm run dev
```
