import type { Song, SongSource } from '../models/Song';
import { AudioPlayer } from './AudioPlayer';
import { YouTubeEngine } from './YouTubeEngine';

/**
 * Single entry point to play any song. It chooses the right engine
 * (local file or YouTube) and always stops the other one, so two songs
 * can never sound at the same time.
 */
export class Player {
  private readonly local = new AudioPlayer();
  private readonly youtube: YouTubeEngine;
  private active: SongSource | null = null;
  private loadedSongId: string | null = null;
  private volumeLevel = 0.8;
  private isMuted = false;

  onTimeUpdate: (currentTime: number, duration: number) => void = () => {};
  onPlayStateChange: (isPlaying: boolean) => void = () => {};
  onEnded: () => void = () => {};
  onDurationKnown: (songId: string, seconds: number) => void = () => {};
  onError: (message: string) => void = () => {};
  /** Tells the UI which engine is in use (to show or hide the YouTube panel). */
  onSourceChange: (source: SongSource | null) => void = () => {};

  constructor(youtubeContainer: HTMLElement) {
    this.youtube = new YouTubeEngine(youtubeContainer);

    // Events are forwarded only from the engine that is active.
    this.local.onTimeUpdate = (time, duration) => this.active === 'local' && this.onTimeUpdate(time, duration);
    this.local.onPlayStateChange = (playing) => this.active === 'local' && this.onPlayStateChange(playing);
    this.local.onEnded = () => this.active === 'local' && this.onEnded();
    this.local.onDurationKnown = (songId, seconds) => this.active === 'local' && this.onDurationKnown(songId, seconds);
    this.local.onError = (message) => this.active === 'local' && this.onError(message);

    this.youtube.onTimeUpdate = (time, duration) => this.active === 'youtube' && this.onTimeUpdate(time, duration);
    this.youtube.onPlayStateChange = (playing) => this.active === 'youtube' && this.onPlayStateChange(playing);
    this.youtube.onEnded = () => this.active === 'youtube' && this.onEnded();
    this.youtube.onDurationKnown = (seconds) =>
      this.active === 'youtube' && this.loadedSongId && this.onDurationKnown(this.loadedSongId, seconds);
    this.youtube.onError = (message) => this.active === 'youtube' && this.onError(message);
  }

  // ---------- State ----------

  get songId(): string | null {
    return this.loadedSongId;
  }

  get source(): SongSource | null {
    return this.active;
  }

  get isPlaying(): boolean {
    if (this.active === 'local') return this.local.isPlaying;
    if (this.active === 'youtube') return this.youtube.isPlaying;
    return false;
  }

  get currentTime(): number {
    return this.active === 'youtube' ? this.youtube.currentTime : this.local.currentTime;
  }

  get duration(): number {
    return this.active === 'youtube' ? this.youtube.duration : this.local.duration;
  }

  get volume(): number {
    return this.volumeLevel;
  }

  get muted(): boolean {
    return this.isMuted;
  }

  // ---------- Actions ----------

  async load(song: Song, autoplay: boolean): Promise<void> {
    const source = song.source;
    if (source !== this.active) {
      // Stop the engine we are leaving.
      if (this.active === 'local') this.local.unload();
      if (this.active === 'youtube') this.youtube.stop();
      this.active = source;
      this.onSourceChange(source);
    }
    this.loadedSongId = song.id;

    if (source === 'youtube' && song.youtubeId) {
      this.onTimeUpdate(0, song.duration);
      await this.youtube.load(song.youtubeId, autoplay);
    } else {
      await this.local.load(song, autoplay);
    }
  }

  async play(): Promise<void> {
    if (this.active === 'youtube') this.youtube.play();
    else await this.local.play();
  }

  pause(): void {
    if (this.active === 'youtube') this.youtube.pause();
    else this.local.pause();
  }

  toggle(): void {
    if (this.isPlaying) this.pause();
    else void this.play();
  }

  seek(seconds: number): void {
    if (this.active === 'youtube') this.youtube.seek(seconds);
    else this.local.seek(seconds);
  }

  setVolume(volume: number): void {
    this.volumeLevel = Math.max(0, Math.min(1, volume));
    this.local.setVolume(this.volumeLevel);
    this.youtube.setVolume(this.volumeLevel);
    if (this.volumeLevel > 0 && this.isMuted) this.setMuted(false);
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.local.setMuted(muted);
    this.youtube.setMuted(muted);
  }

  unload(): void {
    this.local.unload();
    this.youtube.stop();
    this.loadedSongId = null;
    if (this.active !== null) {
      this.active = null;
      this.onSourceChange(null);
    }
    this.onTimeUpdate(0, 0);
  }
}
