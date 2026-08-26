import { useEffect, useRef } from 'react';
import type { AudioAnalysis } from '../audio/types';
import { sampleAudioFeatures } from '../audio/timeline';
import type { SceneSettings } from '../project/types';
import { SceneRenderer } from '../render/SceneRenderer';

interface Props {
  analysis: AudioAnalysis | null;
  scene: SceneSettings;
  getTime: () => number;
  onFrame: (time: number) => void;
  pausedTime: number;
}

const SILENT_FEATURES = {
  time: 0, rms: 0.15, peak: 0.2, flux: 0.1, centroid: 0.45,
  subBass: 0.15, bass: 0.2, lowMid: 0.16, mid: 0.12, upperMid: 0.1, presence: 0.08, high: 0.06,
  beatPulse: 0.15, beatPhase: 0, kickPulse: 0, snarePulse: 0, onsetPulse: 0, sectionEnergy: 0.2,
  spectrum: new Float32Array(64).fill(0.12),
};

export function VisualizerCanvas({ analysis, scene, getTime, onFrame, pausedTime }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ analysis, scene, getTime, onFrame, pausedTime });
  stateRef.current = { analysis, scene, getTime, onFrame, pausedTime };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: SceneRenderer;
    try {
      renderer = new SceneRenderer(canvas);
    } catch (error) {
      onFrame(0);
      throw error;
    }
    let animationFrame = 0;
    let lastUiUpdate = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.resize(rect.width * ratio, rect.height * ratio);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const draw = (now: number) => {
      const state = stateRef.current;
      const time = state.getTime();
      const features = state.analysis ? sampleAudioFeatures(state.analysis, time) : { ...SILENT_FEATURES, time };
      renderer.render(time, features, state.scene);
      if (now - lastUiUpdate > 33) {
        state.onFrame(time);
        lastUiUpdate = now;
      }
      animationFrame = requestAnimationFrame(draw);
    };
    animationFrame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.dispose();
    };
  }, [onFrame]);

  return <canvas ref={canvasRef} className="visualizer-canvas" aria-label="Procedural visual preview" />;
}

