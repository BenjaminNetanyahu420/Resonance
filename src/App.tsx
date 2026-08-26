import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyzePcm, audioBufferToPcm } from './audio/analyze';
import type { AnalysisProgress, AudioAnalysis } from './audio/types';
import { sampleAudioFeatures } from './audio/timeline';
import type { ExportProgress, ExportResult } from './export/exportVideo';
import { PlaybackClock } from './playback/PlaybackClock';
import { DEFAULT_PROJECT, PRESETS } from './project/defaults';
import type { ExportSettings, SceneSettings } from './project/types';
import { ColorControl, RangeControl } from './ui/Control';
import { VisualizerCanvas } from './ui/VisualizerCanvas';
import { WaveformTimeline } from './ui/WaveformTimeline';

const PROJECT_STORAGE_KEY = 'resonance-studio-project-v1';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00.000';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(3).padStart(6, '0')}`;
}

function loadScene(): SceneSettings {
  try {
    const value = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!value) return DEFAULT_PROJECT.scene;
    const parsed = JSON.parse(value) as { scene?: SceneSettings };
    if (parsed.scene?.modes?.length && typeof parsed.scene.primaryColor === 'string') return parsed.scene;
  } catch {
    // Corrupt local state must never prevent startup.
  }
  return DEFAULT_PROJECT.scene;
}

export default function App() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackRef = useRef<PlaybackClock | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const exportControllerRef = useRef<AbortController | null>(null);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [scene, setScene] = useState<SceneSettings>(loadScene);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_PROJECT.export);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const updateScene = useCallback(<K extends keyof SceneSettings>(key: K, value: SceneSettings[K]) => {
    setScene((current) => ({ ...current, [key]: value }));
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({ version: 1, scene, export: exportSettings }));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [scene, exportSettings]);

  useEffect(() => () => {
    playbackRef.current?.dispose();
    void audioContextRef.current?.close();
    exportControllerRef.current?.abort();
  }, []);

  const ensurePlayback = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ latencyHint: 'interactive' });
      playbackRef.current = new PlaybackClock(audioContextRef.current);
      playbackRef.current.onEnded = () => {
        setPlaying(false);
        setTime(playbackRef.current?.currentTime ?? 0);
      };
    }
    return { context: audioContextRef.current, playback: playbackRef.current! };
  }, []);

  const loadAudio = useCallback(async (file: File) => {
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|flac|m4a|aac|ogg|opus)$/i.test(file.name)) {
      setError('Choose a supported audio file (MP3, WAV, FLAC, M4A, AAC, OGG, or Opus).');
      return;
    }
    setError(null);
    setExportResult(null);
    setAnalysis(null);
    setAnalysisProgress({ progress: 0, stage: 'preparing' });
    setFileName(file.name);
    setTime(0);
    setPlaying(false);
    try {
      const { context, playback } = ensurePlayback();
      playback.pause();
      const bytes = await file.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes);
      if (buffer.duration > 60 * 30) throw new Error('Tracks longer than 30 minutes are not supported in this browser build.');
      audioBufferRef.current = buffer;
      playback.setBuffer(buffer);
      const result = await analyzePcm(audioBufferToPcm(buffer), setAnalysisProgress);
      setAnalysis(result);
      setAnalysisProgress(null);
    } catch (caught) {
      setAnalysisProgress(null);
      setFileName(null);
      const message = caught instanceof Error ? caught.message : 'The audio could not be decoded or analyzed.';
      setError(message);
    }
  }, [ensurePlayback]);

  const togglePlayback = useCallback(async () => {
    const playback = playbackRef.current;
    if (!playback || !analysis) return;
    if (playback.isPlaying) {
      playback.pause();
      setTime(playback.currentTime);
      setPlaying(false);
    } else {
      try {
        await playback.play();
        setPlaying(true);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Playback failed.');
      }
    }
  }, [analysis]);

  const seek = useCallback((nextTime: number) => {
    playbackRef.current?.seek(nextTime);
    setTime(nextTime);
  }, []);

  const getTime = useCallback(() => playbackRef.current?.currentTime ?? time, [time]);
  const onPreviewFrame = useCallback((nextTime: number) => {
    if (playbackRef.current?.isPlaying) setTime(nextTime);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.code === 'Space') {
        event.preventDefault();
        void togglePlayback();
      } else if (event.code === 'Home') {
        event.preventDefault();
        seek(0);
      } else if (event.code === 'ArrowLeft' && analysis) {
        event.preventDefault();
        seek(Math.max(0, time - 1 / exportSettings.fps));
      } else if (event.code === 'ArrowRight' && analysis) {
        event.preventDefault();
        seek(Math.min(analysis.duration, time + 1 / exportSettings.fps));
      } else if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') {
        event.preventDefault();
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({ version: 1, scene, export: exportSettings }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [analysis, exportSettings, scene, seek, time, togglePlayback]);

  const sampled = useMemo(() => analysis ? sampleAudioFeatures(analysis, time) : null, [analysis, time]);

  const startExport = useCallback(async () => {
    const audioBuffer = audioBufferRef.current;
    if (!audioBuffer || !analysis || exportProgress) return;
    playbackRef.current?.pause();
    setPlaying(false);
    setError(null);
    setExportResult(null);
    const controller = new AbortController();
    exportControllerRef.current = controller;
    try {
      const { exportComposition } = await import('./export/exportVideo');
      const result = await exportComposition({
        audioBuffer,
        analysis,
        scene,
        settings: exportSettings,
        signal: controller.signal,
        onProgress: setExportProgress,
      });
      setExportResult(result);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName?.replace(/\.[^.]+$/, '') ?? 'visualizer'}-${exportSettings.width}x${exportSettings.height}.mp4`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setError(caught instanceof Error ? caught.message : 'Export failed.');
      }
    } finally {
      setExportProgress(null);
      exportControllerRef.current = null;
    }
  }, [analysis, exportProgress, exportSettings, fileName, scene]);

  const exportPercent = Math.round((exportProgress?.progress ?? 0) * 100);
  const disabled = analysisProgress !== null || exportProgress !== null;

  return (
    <main
      className={`app-shell ${dragging ? 'is-dragging' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void loadAudio(file);
      }}
    >
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><i /><i /><i /></div>
        <div className="brand-copy">
          <strong>RESONANCE</strong>
          <span>PROCEDURAL AUDIO STUDIO</span>
        </div>
        <div className="project-title">
          <span>PROJECT</span>
          <strong>{fileName ? fileName.replace(/\.[^.]+$/, '') : 'Untitled composition'}</strong>
        </div>
        <div className="top-actions">
          <span className="status-dot"><i /> WebGL2</span>
          <button className="button ghost" onClick={() => inputRef.current?.click()} disabled={disabled}>Import audio</button>
          <button className="button primary" onClick={() => void startExport()} disabled={!analysis || disabled}>Export MP4</button>
        </div>
      </header>

      <aside className="sidebar left-panel">
        <section className="panel-section">
          <div className="section-heading"><span>Source</span><b>01</b></div>
          <button className="audio-source" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <span className="source-icon">♪</span>
            <span><strong>{fileName ?? 'Drop an audio track'}</strong><small>{analysis ? `${formatTime(analysis.duration)} · ${analysis.sampleRate / 1000} kHz` : 'MP3, WAV, FLAC, M4A, OGG'}</small></span>
          </button>
          <input ref={inputRef} hidden type="file" accept="audio/*,.flac,.m4a,.aac,.opus" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadAudio(file);
            event.currentTarget.value = '';
          }} />
        </section>

        <section className="panel-section">
          <div className="section-heading"><span>Analysis</span><b>02</b></div>
          {analysis ? (
            <div className="analysis-grid">
              <div><span>Tempo</span><strong>{analysis.bpm ? analysis.bpm.toFixed(1) : '—'} <small>BPM</small></strong></div>
              <div><span>Confidence</span><strong>{Math.round(analysis.bpmConfidence * 100)}<small>%</small></strong></div>
              <div><span>Beats</span><strong>{analysis.beats.length}</strong></div>
              <div><span>Onsets</span><strong>{analysis.onsets.length}</strong></div>
            </div>
          ) : <p className="empty-copy">Musical features are computed once and reused by preview and export.</p>}
          {analysisProgress && (
            <div className="progress-block">
              <div><span>{analysisProgress.stage}</span><strong>{Math.round(analysisProgress.progress * 100)}%</strong></div>
              <progress value={analysisProgress.progress} max={1} />
            </div>
          )}
        </section>

        <section className="panel-section">
          <div className="section-heading"><span>Visual preset</span><b>03</b></div>
          <div className="preset-list">
            {Object.entries(PRESETS).map(([id, preset]) => (
              <button key={id} className={scene.name === preset.name ? 'active' : ''} onClick={() => setScene(preset)}>
                <i style={{ background: `linear-gradient(135deg, ${preset.primaryColor}, ${preset.secondaryColor})` }} />
                <span><strong>{preset.name}</strong><small>{preset.symmetry}-fold · {preset.contourCount} contours</small></span>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="workspace">
        <div className="canvas-toolbar">
          <span>COMPOSITION / OUTPUT</span>
          <div><i className="live-dot" /> PREVIEW <b>16:9</b></div>
        </div>
        <div className="stage-wrap">
          <div className="stage-frame">
            <VisualizerCanvas analysis={analysis} scene={scene} getTime={getTime} onFrame={onPreviewFrame} pausedTime={time} />
            {!analysis && !analysisProgress && (
              <button className="drop-callout" onClick={() => inputRef.current?.click()}>
                <span>+</span><strong>DROP AUDIO TO BEGIN</strong><small>Analysis first. Deterministic rendering second.</small>
              </button>
            )}
          </div>
        </div>
        <div className="transport">
          <button className="transport-button" onClick={() => seek(0)} disabled={!analysis} aria-label="Go to beginning">|◀</button>
          <button className="play-button" onClick={() => void togglePlayback()} disabled={!analysis}>{playing ? 'Ⅱ' : '▶'}</button>
          <div className="time-readout"><strong>{formatTime(time)}</strong><span>/ {formatTime(analysis?.duration ?? 0)}</span></div>
          <div className="transport-spacer" />
          <span>{exportSettings.fps} FPS</span>
        </div>
        <div className="timeline-panel">
          <div className="timeline-labels"><span>MASTER AUDIO</span><small>{analysis ? `${analysis.beats.length} beat markers` : 'No track loaded'}</small></div>
          {analysis ? <WaveformTimeline analysis={analysis} time={time} onSeek={seek} /> : <div className="empty-timeline" />}
        </div>
      </section>

      <aside className="sidebar inspector">
        <div className="inspector-title"><span>INSPECTOR</span><small>{scene.name}</small></div>
        <div className="inspector-scroll">
          <section className="inspector-section">
            <h3>FIELD GEOMETRY</h3>
            <RangeControl label="Symmetry" value={scene.symmetry} min={2} max={16} step={1} onChange={(value) => updateScene('symmetry', value)} />
            <RangeControl label="Contours" value={scene.contourCount} min={2} max={24} step={1} onChange={(value) => updateScene('contourCount', value)} />
            <RangeControl label="Line width" value={scene.lineWidth} min={0.015} max={0.2} step={0.005} onChange={(value) => updateScene('lineWidth', value)} />
            <RangeControl label="Softness" value={scene.softness} min={0.002} max={0.09} step={0.002} onChange={(value) => updateScene('softness', value)} />
            <RangeControl label="Domain warp" value={scene.distortion} min={0} max={0.65} step={0.01} onChange={(value) => updateScene('distortion', value)} />
            <RangeControl label="Rotation" value={scene.rotationSpeed} min={-0.2} max={0.2} step={0.005} onChange={(value) => updateScene('rotationSpeed', value)} />
          </section>
          <section className="inspector-section">
            <h3>MATERIAL + CRT</h3>
            <ColorControl label="Phosphor" value={scene.primaryColor} onChange={(value) => updateScene('primaryColor', value)} />
            <ColorControl label="Secondary" value={scene.secondaryColor} onChange={(value) => updateScene('secondaryColor', value)} />
            <ColorControl label="Background" value={scene.backgroundColor} onChange={(value) => updateScene('backgroundColor', value)} />
            <RangeControl label="Glow" value={scene.glow} min={0} max={2.5} step={0.05} onChange={(value) => updateScene('glow', value)} />
            <RangeControl label="RGB separation" value={scene.chromaticAberration} min={0} max={0.05} step={0.001} onChange={(value) => updateScene('chromaticAberration', value)} />
            <RangeControl label="Scanlines" value={scene.scanlines} min={0} max={0.5} step={0.01} onChange={(value) => updateScene('scanlines', value)} />
          </section>
          <section className="inspector-section">
            <h3>AUDIO MAPPING</h3>
            <RangeControl label="Radial spectrum" value={scene.spectrumAmount} min={0} max={1.5} step={0.01} onChange={(value) => updateScene('spectrumAmount', value)} />
            <div className="meter-list">
              {sampled && [
                ['SUB', sampled.subBass], ['BASS', sampled.bass], ['MID', sampled.mid], ['HIGH', sampled.high],
              ].map(([label, value]) => (
                <div className="meter" key={String(label)}><span>{label}</span><i><b style={{ width: `${Number(value) * 100}%` }} /></i><output>{Number(value).toFixed(2)}</output></div>
              ))}
            </div>
          </section>
          <section className="inspector-section export-section">
            <h3>EXPORT</h3>
            <label className="select-control"><span>Preset</span><select value={`${exportSettings.width}x${exportSettings.height}`} onChange={(event) => {
              const [width, height] = event.target.value.split('x').map(Number);
              setExportSettings((current) => ({ ...current, width, height }));
            }}><option value="1920x1080">YouTube 1080p</option><option value="3840x2160">YouTube 4K</option><option value="1080x1920">TikTok / Reels</option><option value="1080x1080">Square</option><option value="1280x720">720p test</option></select></label>
            <label className="select-control"><span>Frame rate</span><select value={exportSettings.fps} onChange={(event) => setExportSettings((current) => ({ ...current, fps: Number(event.target.value) }))}><option>24</option><option>30</option><option>60</option></select></label>
            {exportProgress && <div className="progress-block export-progress"><div><span>{exportProgress.stage} · {exportProgress.frame}/{exportProgress.totalFrames}</span><strong>{exportPercent}%</strong></div><progress value={exportProgress.progress} max={1} /><button onClick={() => exportControllerRef.current?.abort()}>Cancel export</button></div>}
            {exportResult && <p className={`validation ${exportResult.valid ? 'valid' : 'invalid'}`}>{exportResult.valid ? '✓' : '!'} {exportResult.encodedFrames}/{exportResult.expectedFrames} frames · A/V duration validated</p>}
          </section>
        </div>
      </aside>

      {error && <div className="error-toast" role="alert"><span>!</span><p><strong>Operation failed</strong>{error}</p><button onClick={() => setError(null)}>×</button></div>}
      {dragging && <div className="drop-overlay"><strong>DROP AUDIO</strong><span>Decode and analyze this track</span></div>}
    </main>
  );
}
