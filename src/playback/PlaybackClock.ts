export class PlaybackClock {
  private readonly context: AudioContext;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private offset = 0;
  private playing = false;
  onEnded: (() => void) | null = null;

  constructor(context: AudioContext) {
    this.context = context;
  }

  setBuffer(buffer: AudioBuffer): void {
    this.pause();
    this.buffer = buffer;
    this.offset = 0;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentTime(): number {
    if (!this.buffer) return 0;
    if (!this.playing) return Math.min(this.offset, this.buffer.duration);
    return Math.min(this.buffer.duration, this.offset + (this.context.currentTime - this.startedAt));
  }

  async play(): Promise<void> {
    if (!this.buffer || this.playing) return;
    await this.context.resume();
    if (this.offset >= this.buffer.duration - 1e-4) this.offset = 0;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.context.destination);
    source.onended = () => {
      if (source !== this.source) return;
      this.offset = this.buffer?.duration ?? 0;
      this.playing = false;
      this.source = null;
      this.onEnded?.();
    };
    this.startedAt = this.context.currentTime;
    this.source = source;
    this.playing = true;
    source.start(0, this.offset);
  }

  pause(): void {
    if (!this.playing) return;
    this.offset = this.currentTime;
    const source = this.source;
    this.source = null;
    this.playing = false;
    if (source) {
      source.onended = null;
      try { source.stop(); } catch { /* The source may already have ended. */ }
      source.disconnect();
    }
  }

  seek(time: number): void {
    const shouldResume = this.playing;
    this.pause();
    this.offset = Math.max(0, Math.min(this.duration, time));
    if (shouldResume) void this.play();
  }

  dispose(): void {
    this.pause();
    this.buffer = null;
  }
}

