/**
 * Plays YouTube videos with the official IFrame Player API.
 * YouTube requires the player to be visible (at least 200x200 px),
 * so the app shows it in a small panel while a YouTube song plays.
 */

// Minimal types for the parts of the YouTube IFrame API we use.
interface YTPlayer {
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady: () => void;
        onStateChange: (event: { data: number }) => void;
        onError: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, CUED: 5 } as const;
const SCRIPT_URL = 'https://www.youtube.com/iframe_api';

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads the IFrame API script only once. */
function loadApi(): Promise<YTNamespace> {
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      if (window.YT?.Player) return resolve(window.YT);
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT!);
      };
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error('YouTube API could not be loaded'));
      };
      document.head.append(script);
    });
  }
  return apiPromise;
}

export class YouTubeEngine {
  private readonly container: HTMLElement;
  private player: YTPlayer | null = null;
  private ready: Promise<YTPlayer> | null = null;
  private pollTimer = 0;
  private playing = false;
  private volume = 0.8;
  private muted = false;

  onTimeUpdate: (currentTime: number, duration: number) => void = () => {};
  onPlayStateChange: (isPlaying: boolean) => void = () => {};
  onEnded: () => void = () => {};
  onDurationKnown: (seconds: number) => void = () => {};
  onError: (message: string) => void = () => {};

  constructor(container: HTMLElement) {
    this.container = container;
  }

  private justLoaded = false;

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentTime(): number {
    // Right after loading a new video the iframe still reports the old position.
    if (this.justLoaded) return 0;
    return this.player?.getCurrentTime() ?? 0;
  }

  get duration(): number {
    return this.player?.getDuration() ?? 0;
  }

  async load(videoId: string, autoplay: boolean): Promise<void> {
    this.justLoaded = true;
    try {
      const player = await this.ensurePlayer();
      if (autoplay) player.loadVideoById(videoId);
      else player.cueVideoById(videoId);
      this.applyVolume();
    } catch {
      this.onError('No se pudo cargar el reproductor de YouTube. Revisa tu conexión.');
    }
  }

  play(): void {
    this.player?.playVideo();
  }

  pause(): void {
    this.player?.pauseVideo();
  }

  seek(seconds: number): void {
    this.justLoaded = false;
    this.player?.seekTo(seconds, true);
    this.onTimeUpdate(seconds, this.duration);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.applyVolume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  stop(): void {
    this.player?.stopVideo();
    this.setPlaying(false);
  }

  // ---------- Internals ----------

  private ensurePlayer(): Promise<YTPlayer> {
    if (!this.ready) {
      this.ready = loadApi().then(
        (YT) =>
          new Promise<YTPlayer>((resolve) => {
            const target = document.createElement('div');
            this.container.replaceChildren(target);
            const player = new YT.Player(target, {
              width: '100%',
              height: '100%',
              playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: window.location.origin },
              events: {
                onReady: () => {
                  this.player = player;
                  resolve(player);
                },
                onStateChange: (event) => this.handleState(event.data),
                onError: (event) => this.handleError(event.data),
              },
            });
          }),
      );
      this.ready.catch(() => (this.ready = null));
    }
    return this.ready;
  }

  private handleState(state: number): void {
    if (state === STATE.PLAYING) {
      this.justLoaded = false;
      this.setPlaying(true);
      const duration = this.duration;
      if (duration) this.onDurationKnown(duration);
    } else if (state === STATE.PAUSED || state === STATE.CUED) {
      this.setPlaying(false);
    } else if (state === STATE.ENDED) {
      this.setPlaying(false);
      this.onEnded();
    }
  }

  private handleError(code: number): void {
    this.setPlaying(false);
    const message =
      code === 101 || code === 150
        ? 'El dueño de este video no permite reproducirlo fuera de YouTube. Prueba con otra versión.'
        : code === 100
          ? 'Este video ya no está disponible en YouTube.'
          : 'YouTube no pudo reproducir este video.';
    this.onError(message);
  }

  private setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    window.clearInterval(this.pollTimer);
    if (playing) {
      this.pollTimer = window.setInterval(() => this.onTimeUpdate(this.currentTime, this.duration), 250);
    }
    this.onPlayStateChange(playing);
  }

  private applyVolume(): void {
    if (!this.player) return;
    this.player.setVolume(Math.round(this.volume * 100));
    if (this.muted || this.volume === 0) this.player.mute();
    else this.player.unMute();
  }
}
