import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyzePcm, audioBufferToPcm } from './audio/analyze';
import type { AnalysisProgress, AudioAnalysis } from './audio/types';
import { sampleAudioFeatures } from './audio/timeline';
import type { ExportProgress, ExportResult } from './export/exportVideo';
import { PlaybackClock } from './playback/PlaybackClock';
import { DEFAULT_PROJECT, PRESETS } from './project/defaults';
import { migrateProject, parseProject, serializeProject } from './project/schema';
import type { ProjectState } from './project/types';
import { useProjectHistory } from './project/useProjectHistory';
import { VisualDesigner } from './ui/VisualDesigner';
import { VisualizerCanvas } from './ui/VisualizerCanvas';
import { WaveformTimeline } from './ui/WaveformTimeline';

const PROJECT_STORAGE_KEY = 'resonance-studio-project-v2';
const LEGACY_STORAGE_KEY = 'resonance-studio-project-v1';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00.000';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(3).padStart(6, '0')}`;
}

function loadProject(): ProjectState {
  try {
    const stored = localStorage.getItem(PROJECT_STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    return stored ? parseProject(stored) : migrateProject(DEFAULT_PROJECT);
  } catch {
    return migrateProject(DEFAULT_PROJECT);
  }
}

function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export default function App() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackRef = useRef<PlaybackClock | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const exportControllerRef = useRef<AbortController | null>(null);
  const spotlightFrameRef = useRef<number | null>(null);
  const { project, updateProject, undo, redo, canUndo, canRedo } = useProjectHistory(loadProject());
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [compareA, setCompareA] = useState<ProjectState | null>(null);
  const [compareB, setCompareB] = useState<ProjectState | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => localStorage.setItem(PROJECT_STORAGE_KEY, serializeProject(project)), 250);
    return () => window.clearTimeout(handle);
  }, [project]);

  useEffect(() => () => {
    playbackRef.current?.dispose();
    void audioContextRef.current?.close();
    exportControllerRef.current?.abort();
    if (spotlightFrameRef.current !== null) window.cancelAnimationFrame(spotlightFrameRef.current);
  }, []);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
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
    setError(null); setExportResult(null); setAnalysis(null);
    setAnalysisProgress({ progress: 0, stage: 'preparing' });
    setFileName(file.name); setTime(0); setPlaying(false);
    try {
      const { context, playback } = ensurePlayback();
      playback.pause();
      const bytes = await file.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes);
      if (buffer.duration > 60 * 30) throw new Error('Tracks longer than 30 minutes are not supported in this browser build.');
      audioBufferRef.current = buffer;
      playback.setBuffer(buffer);
      const result = await analyzePcm(audioBufferToPcm(buffer), setAnalysisProgress);
      setAnalysis(result); setAnalysisProgress(null);
    } catch (caught) {
      setAnalysisProgress(null); setFileName(null);
      setError(caught instanceof Error ? caught.message : 'The audio could not be decoded or analyzed.');
    }
  }, [ensurePlayback]);

  const togglePlayback = useCallback(async () => {
    const playback = playbackRef.current;
    if (!playback || !analysis) return;
    if (playback.isPlaying) {
      playback.pause(); setTime(playback.currentTime); setPlaying(false);
    } else {
      try { await playback.play(); setPlaying(true); }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'Playback failed.'); }
    }
  }, [analysis]);

  const seek = useCallback((nextTime: number) => {
    const clamped = Math.max(0, Math.min(analysis?.duration ?? 0, nextTime));
    playbackRef.current?.seek(clamped); setTime(clamped);
  }, [analysis?.duration]);
  const getTime = useCallback(() => playbackRef.current?.currentTime ?? time, [time]);
  const onPreviewFrame = useCallback((nextTime: number) => { if (playbackRef.current?.isPlaying) setTime(nextTime); }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      const command = event.ctrlKey || event.metaKey;
      if (event.code === 'Space') { event.preventDefault(); void togglePlayback(); }
      else if (event.code === 'Home') { event.preventDefault(); seek(0); }
      else if (event.code === 'ArrowLeft' && analysis) { event.preventDefault(); seek(time - 1 / project.export.fps); }
      else if (event.code === 'ArrowRight' && analysis) { event.preventDefault(); seek(time + 1 / project.export.fps); }
      else if (command && event.code === 'KeyZ' && event.shiftKey) { event.preventDefault(); redo(); }
      else if (command && event.code === 'KeyZ') { event.preventDefault(); undo(); }
      else if (command && event.code === 'KeyY') { event.preventDefault(); redo(); }
      else if (command && event.code === 'KeyS') { event.preventDefault(); localStorage.setItem(PROJECT_STORAGE_KEY, serializeProject(project)); }
      else if (event.code === 'KeyE') { updateProject((current) => ({ ...current, scene: { ...current.scene, effectsEnabled: !current.scene.effectsEnabled } }), 'bypass-effects'); }
      else if (event.code === 'KeyF') { void (document.fullscreenElement ? document.exitFullscreen() : stageRef.current?.requestFullscreen()); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [analysis, project, redo, seek, time, togglePlayback, undo, updateProject]);

  const sampled = useMemo(() => analysis ? sampleAudioFeatures(analysis, time) : null, [analysis, time]);

  const startExport = useCallback(async () => {
    const audioBuffer = audioBufferRef.current;
    if (!audioBuffer || !analysis || exportProgress) return;
    playbackRef.current?.pause(); setPlaying(false); setError(null); setExportResult(null);
    const controller = new AbortController(); exportControllerRef.current = controller;
    try {
      const { exportComposition } = await import('./export/exportVideo');
      const result = await exportComposition({
        audioBuffer, analysis, project, settings: project.export,
        signal: controller.signal, onProgress: setExportProgress,
      });
      setExportResult(result);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a'); link.href = url;
      link.download = `${fileName?.replace(/\.[^.]+$/, '') ?? 'visualizer'}-${project.export.width}x${project.export.height}.mp4`;
      link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : 'Export failed.');
    } finally { setExportProgress(null); exportControllerRef.current = null; }
  }, [analysis, exportProgress, fileName, project]);

  const importProject = async (file: File) => {
    try { updateProject(parseProject(await file.text()), 'import-project'); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The project could not be loaded.'); }
  };

  const disabled = analysisProgress !== null || exportProgress !== null;
  const exportPercent = Math.round((exportProgress?.progress ?? 0) * 100);
  const webglAvailable = useMemo(() => Boolean(document.createElement('canvas').getContext('webgl2')), []);
  const progressUi = <>
    {exportProgress && <div className="progress-block export-progress"><div><span>{exportProgress.stage} · {exportProgress.frame}/{exportProgress.totalFrames}</span><strong>{exportPercent}%</strong></div><progress value={exportProgress.progress} max={1} /><button onClick={() => exportControllerRef.current?.abort()}>Cancel export</button></div>}
    {exportResult && <p className={`validation ${exportResult.valid ? 'valid' : 'invalid'}`}>{exportResult.valid ? '✓' : '!'} {exportResult.encodedFrames}/{exportResult.expectedFrames} frames · A/V duration validated</p>}
  </>;

  return (
    <main className={`app-shell ${dragging ? 'is-dragging' : ''}`}
      onPointerMove={(event) => {
        if (spotlightFrameRef.current !== null) return;
        const shell = event.currentTarget;
        const { clientX, clientY } = event;
        spotlightFrameRef.current = window.requestAnimationFrame(() => {
          const bounds = shell.getBoundingClientRect();
          shell.style.setProperty('--pointer-x', `${clientX - bounds.left}px`);
          shell.style.setProperty('--pointer-y', `${clientY - bounds.top}px`);
          spotlightFrameRef.current = null;
        });
      }}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void loadAudio(file); }}>
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><i /><i /><i /></div>
        <div className="brand-copy"><strong>RESONANCE</strong><span>VISUAL SYNTHESIS STUDIO</span></div>
        <div className="project-title"><span>WORKSPACE / PROJECT</span><strong>{project.name}</strong></div>
        <div className="top-actions">
          <span className={`status-dot ${webglAvailable ? '' : 'unavailable'}`}><i /> {webglAvailable ? 'WebGL2 ready' : 'WebGL2 unavailable'}</span>
          <button className="button ghost" onClick={() => audioInputRef.current?.click()} disabled={disabled}>Import audio</button>
          <button className="button primary" onClick={() => void startExport()} disabled={!analysis || disabled}>Export MP4</button>
        </div>
      </header>

      <aside className="sidebar left-panel">
        <section className="panel-section">
          <div className="section-heading"><span>Source</span><b>01</b></div>
          <button className="audio-source" onClick={() => audioInputRef.current?.click()} disabled={disabled}>
            <span className="source-icon">♪</span><span><strong>{fileName ?? 'Drop an audio track'}</strong><small>{analysis ? `${formatTime(analysis.duration)} · ${analysis.sampleRate / 1000} kHz` : 'MP3, WAV, FLAC, M4A, OGG'}</small></span>
          </button>
          <input ref={audioInputRef} hidden type="file" accept="audio/*,.flac,.m4a,.aac,.opus" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadAudio(file); event.currentTarget.value = ''; }} />
          {analysisProgress && <div className="progress-block"><div><span>{analysisProgress.stage}</span><strong>{Math.round(analysisProgress.progress * 100)}%</strong></div><progress value={analysisProgress.progress} max={1} /></div>}
        </section>

        <section className="panel-section">
          <div className="section-heading"><span>Analysis</span><b>02</b></div>
          {analysis ? <div className="analysis-grid">
            <div><span>Tempo</span><strong>{analysis.bpm ? analysis.bpm.toFixed(1) : '—'} <small>BPM</small></strong></div>
            <div><span>Confidence</span><strong>{Math.round(analysis.bpmConfidence * 100)}<small>%</small></strong></div>
            <div><span>Beats</span><strong>{analysis.beats.length}</strong></div><div><span>Onsets</span><strong>{analysis.onsets.length}</strong></div>
          </div> : <p className="empty-copy">Whole-track features drive one deterministic timeline shared by preview and export.</p>}
        </section>

        <section className="panel-section">
          <div className="section-heading"><span>Visual presets</span><b>03</b></div>
          <div className="preset-list">{Object.entries(PRESETS).map(([id, preset]) => <button key={id} className={project.scene.name === preset.scene.name ? 'active' : ''} aria-pressed={project.scene.name === preset.scene.name} onClick={() => updateProject(migrateProject(preset), 'load-preset')}>
            <i style={{ background: `linear-gradient(135deg, ${preset.scene.primaryColor}, ${preset.scene.secondaryColor})` }} /><span><strong>{preset.scene.name}</strong><small>{preset.layers.length} layers · {preset.scene.symmetry}-fold</small></span>
          </button>)}</div>
        </section>

        <section className="panel-section project-panel">
          <div className="section-heading"><span>Project</span><b>04</b></div>
          <label className="project-name"><span>Name</span><input value={project.name} onChange={(event) => updateProject((current) => ({ ...current, name: event.target.value }), 'project-name')} /></label>
          <div className="project-buttons"><button onClick={() => downloadText(`${project.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'resonance'}.resonance.json`, serializeProject(project))}>Export file</button><button onClick={() => projectInputRef.current?.click()}>Import file</button></div>
          <input ref={projectInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProject(file); event.currentTarget.value = ''; }} />
          <div className="compare-grid">
            <button onClick={() => setCompareA(project)}>Set A</button><button disabled={!compareA} onClick={() => compareA && updateProject(compareA, 'compare-a')}>Recall A</button>
            <button onClick={() => setCompareB(project)}>Set B</button><button disabled={!compareB} onClick={() => compareB && updateProject(compareB, 'compare-b')}>Recall B</button>
          </div>
        </section>
      </aside>

      <section className="workspace">
        <div className="canvas-toolbar"><span>COMPOSITION <b>{project.export.width} × {project.export.height}</b></span><div className="preview-actions">
          <button className={project.scene.audioEnabled ? 'active' : ''} aria-pressed={project.scene.audioEnabled} onClick={() => updateProject((current) => ({ ...current, scene: { ...current.scene, audioEnabled: !current.scene.audioEnabled } }), 'bypass-audio')}>Audio mod</button>
          <button className={project.scene.effectsEnabled ? 'active' : ''} aria-pressed={project.scene.effectsEnabled} onClick={() => updateProject((current) => ({ ...current, scene: { ...current.scene, effectsEnabled: !current.scene.effectsEnabled } }), 'bypass-effects')}>Effects</button>
          <button aria-label={fullscreen ? 'Exit fullscreen preview' : 'Enter fullscreen preview'} onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : stageRef.current?.requestFullscreen())}>{fullscreen ? 'Exit' : 'Fullscreen'}</button>
          <span><i className="live-dot" /> PREVIEW</span>
        </div></div>
        <div className="stage-wrap"><div className="stage-frame" ref={stageRef}>
          <VisualizerCanvas analysis={analysis} project={project} getTime={getTime} onFrame={onPreviewFrame} pausedTime={time} />
          {!analysis && !analysisProgress && <button className="drop-callout" onClick={() => audioInputRef.current?.click()}><span>+</span><strong>DROP AUDIO TO BEGIN</strong><small>The designer remains live without audio.</small></button>}
        </div></div>
        <div className="transport">
          <button className="transport-button" onClick={() => seek(0)} disabled={!analysis} aria-label="Go to beginning">|◀</button>
          <button className="play-button" onClick={() => void togglePlayback()} disabled={!analysis} aria-label={playing ? 'Pause audio' : 'Play audio'}>{playing ? 'Ⅱ' : '▶'}</button>
          <div className="time-readout"><strong>{formatTime(time)}</strong><span>/ {formatTime(analysis?.duration ?? 0)}</span></div>
          <div className="transport-spacer" /><span>{project.export.fps} FPS</span>
        </div>
        <div className="timeline-panel"><div className="timeline-labels"><span>MASTER AUDIO</span><small>{analysis ? `${analysis.beats.length} beats · ${project.automation.reduce((sum, track) => sum + track.keyframes.length, 0)} keys` : 'No track loaded'}</small></div>{analysis ? <WaveformTimeline analysis={analysis} time={time} onSeek={seek} /> : <div className="empty-timeline" />}</div>
      </section>

      <aside className="sidebar inspector"><div className="inspector-title"><span>VISUAL DESIGNER</span><small>{project.layers.length} layers · {project.modulation.length} routes · schema v{project.version}</small></div><div className="inspector-scroll"><VisualDesigner project={project} updateProject={updateProject} currentTime={time} duration={analysis?.duration ?? 0} sampled={sampled} undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} exportProgress={progressUi} /></div></aside>

      {error && <div className="error-toast" role="alert"><span>!</span><p><strong>Operation failed</strong>{error}</p><button onClick={() => setError(null)}>×</button></div>}
      {dragging && <div className="drop-overlay"><strong>DROP AUDIO</strong><span>Decode and analyze this track</span></div>}
    </main>
  );
}
