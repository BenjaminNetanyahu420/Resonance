# Resonance Studio

A browser-based, deterministic audio-reactive cymatics visualizer and MP4 generator. This repository currently implements the critical vertical slice described in the product brief: decode once, analyze the whole song, sample one authoritative musical timeline, render the same timestamp-driven scene in preview and export, and attach AAC audio to the final MP4.

## Run

```bash
npm install
npm run dev
```

Open the shown local URL, drop an audio file, wait for analysis, customize the procedural field, and export. Chrome or Edge is recommended for H.264/AAC WebCodecs support. `npm run check` runs all automated tests and the production build.

## Current scope

The working slice includes offline STFT analysis, beat/onset/percussion/bass features, a seekable waveform timeline, a multi-mode WebGL2 Chladni field, audio-driven radial spectrum and CRT treatment, presets, persistent scene settings, synchronized playback, and an offline MP4/AAC export path with cancellation and validation.

This is not yet the entire multi-phase product specification. Layer composition, custom SDF geometry editing, worker isolation, keyframes, project assets, direct-to-disk long export, and long-duration QA remain ordered in [the roadmap](docs/ROADMAP.md). Architecture and dependency decisions are in [the architecture notes](docs/ARCHITECTURE.md), with research provenance in [the research summary](docs/RESEARCH.md) and current test figures in [the validation report](docs/VALIDATION.md).

