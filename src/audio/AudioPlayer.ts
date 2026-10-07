import type { Song } from '../models/Song';

/**
 * Wraps a single <audio> element.
 * Because there is only ONE audio element, two songs can never play at
 * the same time: loading a new song always replaces the previous one.
 */
export class AudioPlayer {
  private readonly audio = new Audio();
  private loadedSongId: string | null = null;

  onTimeUpdate: (currentTime: number, duration: number) => void = () => {};
  onPlayStateChange: (isPlaying: boolean) => void = () => {};
  onEnded: () => void = () => {};
  onDurationKnown: (songId: string, seconds: number) => void = () => {};
  onError: (message: string) => void = () => {};

  constructor() {
    this.audio.preload = 'auto';

    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate(this.audio.currentTime, this.duration));
    this.audio.addEventListener('play', () => this.onPlayStateChange(true));
    this.audio.addEventListener('pause', () => this.onPlayStateChange(false));
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('loadedmetadata', () => {
      if (this.loadedSongId && Number.isFinite(this.audio.duration)) {
        this.onDurationKnown(this.loadedSongId, this.audio.duration);
      }
      this.onTimeUpdate(this.audio.currentTime, this.duration);
    });
    this.audio.addEventListener('error', () => {
      if (this.loadedSongId) this.onError('No se pudo reproducir este archivo. Puede estar dañado o en un formato no compatible.');
    });
  }

  // ---------- State ----------

  get songId(): string | null {
    return this.loadedSongId;
  }

  get isPlaying(): boolean {
    return this.loadedSongId !== null && !this.audio.paused;
  }

  get currentTime(): number {
    return this.audio.currentTime;
  }

  get duration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  get volume(): number {
    return this.audio.volume;
  }

  get muted(): boolean {
    return this.audio.muted;
  }

  // ---------- Actions ----------

  /** Loads a song (stopping the previous one) and optionally starts it. */
  async load(song: Song, autoplay: boolean): Promise<void> {
    this.audio.pause();
    this.loadedSongId = song.id;
    this.audio.src = song.url;
    this.onTimeUpdate(0, song.duration);
    if (autoplay) await this.play();
  }

  async play(): Promise<void> {
    if (!this.loadedSongId) return;
    try {
      await this.audio.play();
    } catch (error) {
      // AbortError happens when the user changes song very fast: it is expected.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        this.onError('El navegador bloqueó la reproducción. Presiona play para escuchar.');
        return;
      }
      this.onError('No se pudo reproducir esta canción.');
    }
  }

  pause(): void {
    this.audio.pause();
  }

  toggle(): void {
    if (this.audio.paused) void this.play();
    else this.pause();
  }

  seek(seconds: number): void {
    if (!this.loadedSongId) return;
    this.audio.currentTime = Math.max(0, Math.min(seconds, this.duration || seconds));
  }

  setVolume(volume: number): void {
    this.audio.volume = Math.max(0, Math.min(1, volume));
    if (volume > 0 && this.audio.muted) this.audio.muted = false;
  }

  setMuted(muted: boolean): void {
    this.audio.muted = muted;
  }

  /** Stops and forgets the current song. */
  unload(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.loadedSongId = null;
    this.onTimeUpdate(0, 0);
  }
}
