import { useEffect, useRef } from 'react';
import type { AudioAnalysis } from '../audio/types';

interface Props {
  analysis: AudioAnalysis;
  time: number;
  onSeek: (time: number) => void;
}

export function WaveformTimeline({ analysis, time, onSeek }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0c0e13';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#3f4656';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < analysis.waveformPeaks.length; i += 1) {
      const x = (i / Math.max(1, analysis.waveformPeaks.length - 1)) * width;
      const amplitude = analysis.waveformPeaks[i] * height * 0.43;
      ctx.moveTo(x, height / 2 - amplitude);
      ctx.lineTo(x, height / 2 + amplitude);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(141, 255, 227, 0.55)';
    for (const beat of analysis.beats) {
      const x = (beat.time / analysis.duration) * width;
      ctx.fillRect(x, beat.downbeat ? 0 : height * 0.15, beat.downbeat ? 2 : 1, beat.downbeat ? height : height * 0.7);
    }
    const playhead = (time / analysis.duration) * width;
    ctx.fillStyle = '#f7fbff';
    ctx.fillRect(playhead - 1, 0, 2, height);
  }, [analysis, time]);

  return (
    <canvas
      ref={ref}
      className="waveform"
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onSeek(((event.clientX - rect.left) / rect.width) * analysis.duration);
      }}
      aria-label="Audio waveform timeline. Click to seek."
    />
  );
}

