import { songFromYouTube, YouTubeService, type YouTubeResult } from '../api/youtube';
import { Player } from '../audio/Player';
import {
  createSongFromFile,
  createSongFromStored,
  createSongFromYouTubeInfo,
  isAudioFile,
  releaseSong,
  toSongInfo,
} from '../audio/songFactory';
import { Playlist } from '../models/Playlist';
import { PlaylistLibrary } from '../models/PlaylistLibrary';
import { createId, fileKey, type Song } from '../models/Song';
import { LibraryStorage, type RepeatMode, type StoredState } from '../storage/LibraryStorage';
import { escapeHtml, formatTime, formatTotalDuration, pluralizeSongs } from '../utils/format';
import { Dialog } from './Dialog';
import { DragSort } from './DragSort';
import { icons } from './icons';
import { vinylSvg, vinylWithCover } from './logo';
import { Toast } from './Toast';
import { YouTubeSearch, type AddPosition } from './YouTubeSearch';

const DEFAULT_PLAYLIST_NAME = 'Mi música';
/** Id of the automatic "Me gusta" playlist. */
const LIKED_ID = 'liked';
const LIKED_NAME = 'Me gusta';
const DEFAULT_VOLUME = 0.8;
const MAX_RECENT = 8;
const MAX_NAME_LENGTH = 30;

type View = 'home' | 'playlist';

type InsertMode = { type: 'first' } | { type: 'last' } | { type: 'next' } | { type: 'at'; index: number };
type SortKey = 'title' | 'artist' | 'duration';

const SORT_LABELS: Record<SortKey, string> = {
  title: 'por título',
  artist: 'por artista',
  duration: 'por duración',
};

const REPEAT_LABELS: Record<RepeatMode, string> = {
  off: 'Repetir: desactivado',
  all: 'Repetir: toda la playlist',
  one: 'Repetir: esta canción',
};

/**
 * Main user interface. It draws the screen from the models
 * (PlaylistLibrary -> Playlist -> DoublyLinkedList) and turns the user
 * actions into calls to those models and to the AudioPlayer.
 */
export class App {
  private readonly library = new PlaylistLibrary();
  private readonly player: Player;
  private readonly storage = new LibraryStorage();
  private readonly root: HTMLElement;
  private readonly dialog: Dialog;
  private readonly toast: Toast;

  private readonly playlistNav: HTMLElement;
  private readonly playlistView: HTMLElement;
  private readonly playerBar: HTMLElement;
  private readonly fileInput: HTMLInputElement;
  private readonly videoDock: HTMLElement;
  private readonly youtubeSearch: YouTubeSearch;

  /** Playlist whose current song is loaded in the player (can differ from the one on screen). */
  private playingPlaylist: Playlist | null = null;
  private repeat: RepeatMode = 'off';
  private shuffle = false;
  /** Songs played in shuffle mode, so "previous" can go back to them. */
  private shuffleHistory: string[] = [];
  private searchQuery = '';
  private pendingInsert: InsertMode = { type: 'last' };
  private isSeeking = false;
  private isLoading = true;
  private saveTimer = 0;
  private storageWarningShown = false;
  private fileDragDepth = 0;
  /** Screen on display: the home page or a playlist. */
  private view: View = 'home';
  private userName = '';
  /** Recently played songs as "playlistId:songId", newest first. */
  private recent: string[] = [];
  /** Shows the "doubly linked list" panel above the songs. */
  private showStructure = false;
  /** Songs that just changed position (highlighted for a moment). */
  private flashIds = new Set<string>();
  private flashTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = this.layoutTemplate();

    this.playlistNav = this.query('#playlist-nav');
    this.playlistView = this.query('#playlist-view');
    this.playerBar = this.query('#player-bar');
    this.fileInput = this.query('#file-input');
    this.videoDock = this.query('#video-dock');
    this.player = new Player(this.query('#yt-frame'));

    this.dialog = new Dialog(this.root);
    this.toast = new Toast(this.root);
    this.youtubeSearch = new YouTubeSearch(
      this.root,
      new YouTubeService(import.meta.env.VITE_YOUTUBE_API_KEY),
      (result, position) => this.addFromYouTube(result, position),
    );

    new DragSort({
      container: this.playlistView,
      scrollContainer: this.playlistView,
      isEnabled: () => !this.searchQuery,
      onMove: (songId, toIndex) => this.moveSong(songId, toIndex),
    });

    this.player.setVolume(DEFAULT_VOLUME);
    this.bindPlayerEvents();
    this.bindEvents();
    this.render();
    void this.restore();
  }

  // ======================================================
  // Rendering
  // ======================================================

  private render(): void {
    this.renderPlaylistNav();
    this.renderPlaylistView();
    this.renderPlayerBar();
  }

  private renderPlaylistNav(): void {
    const selectedId = this.view === 'playlist' ? this.library.selectedPlaylist?.id : undefined;
    const homeLink = this.root.querySelector<HTMLElement>('#home-link');
    homeLink?.classList.toggle('is-active', this.view === 'home');
    if (this.view === 'home') homeLink?.setAttribute('aria-current', 'page');
    else homeLink?.removeAttribute('aria-current');

    const liked = this.likedPlaylist();
    const likedLink = this.root.querySelector<HTMLElement>('#liked-link');
    if (likedLink) {
      const isActive = this.view === 'playlist' && selectedId === LIKED_ID;
      likedLink.classList.toggle('is-active', isActive);
      likedLink.querySelector('.nav-item__count')!.textContent = String(liked?.size ?? 0);
    }

    const items = this.normalPlaylists()
      .map((playlist) => {
        const isSelected = playlist.id === selectedId;
        const isPlaying = playlist === this.playingPlaylist && this.player.isPlaying;
        return `
        <li>
          <button class="nav-item ${isSelected ? 'is-active' : ''}"
                  data-action="select-playlist" data-id="${playlist.id}"
                  ${isSelected ? 'aria-current="true"' : ''}>
            <span class="nav-item__icon">${isPlaying ? '<span class="eq" aria-label="Sonando"><i></i><i></i><i></i></span>' : icons.playlist}</span>
            <span class="nav-item__name">${escapeHtml(playlist.name)}</span>
            <span class="nav-item__count">${playlist.size}</span>
          </button>
        </li>`;
      })
      .join('');

    this.playlistNav.innerHTML = items || '<li class="nav-empty">Aún no tienes playlists.</li>';
  }

  private renderPlaylistView(): void {
    if (this.isLoading) {
      this.playlistView.innerHTML = `
        <div class="empty-state">
          ${icons.music}
          <h2>Cargando tu música…</h2>
        </div>`;
      return;
    }

    if (this.view === 'home') {
      this.renderHome();
      return;
    }

    const playlist = this.library.selectedPlaylist;

    if (!playlist) {
      this.playlistView.innerHTML = `
        <div class="empty-state">
          ${icons.music}
          <h2>Crea tu primera playlist</h2>
          <p>Organiza tu música por género, ánimo o como prefieras.</p>
          <button class="btn btn--primary" data-action="new-playlist">${icons.plus} Nueva playlist</button>
        </div>`;
      return;
    }

    const cover = playlist.getSongs().find((song) => song.coverUrl)?.coverUrl;
    const isLiked = playlist.id === LIKED_ID;
    const coverHtml = isLiked
      ? `<span class="liked-cover">${icons.heartFilled}</span>`
      : cover
        ? `<img src="${escapeHtml(cover)}" alt="" />`
        : vinylSvg(120, false);

    const actions = isLiked
      ? `<p class="playlist-header__hint">Toca ${icons.heart} en cualquier canción para guardarla aquí.</p>`
      : `<button class="btn btn--primary" data-action="add-last">${icons.toEnd} Agregar al final</button>
            <button class="btn btn--soft" data-action="add-first">${icons.toStart} Agregar al inicio</button>
            <button class="btn btn--soft btn--youtube" data-action="youtube-search">${icons.youtube} Buscar en YouTube</button>
            <button class="icon-btn" data-action="rename-playlist" aria-label="Renombrar playlist" title="Renombrar">${icons.edit}</button>
            <button class="icon-btn icon-btn--danger" data-action="delete-playlist" aria-label="Eliminar playlist" title="Eliminar playlist">${icons.trash}</button>`;

    this.playlistView.innerHTML = `
      <header class="playlist-header">
        <div class="playlist-header__cover ${isLiked ? 'playlist-header__cover--liked' : ''}">
          ${coverHtml}
        </div>
        <div class="playlist-header__info">
          <p class="playlist-header__kind">${isLiked ? 'Playlist automática' : 'Playlist'}</p>
          <h1 class="playlist-header__name">${escapeHtml(playlist.name)}</h1>
          <p class="playlist-header__meta">
            ${pluralizeSongs(playlist.size)}${playlist.size > 0 ? `, ${formatTotalDuration(playlist.totalDuration)}` : ''}
          </p>
          <div class="playlist-header__actions">
            ${actions}
          </div>
        </div>
      </header>
      ${
        playlist.isEmpty
          ? ''
          : `<div class="toolbar">
              <label class="search">
                ${icons.search}
                <input type="search" id="search-input" placeholder="Buscar en esta playlist"
                       value="${escapeHtml(this.searchQuery)}" aria-label="Buscar canción" />
              </label>
              <div class="toolbar__tools">
                <select class="select" id="sort-select" aria-label="Ordenar playlist">
                  <option value="">Ordenar…</option>
                  <option value="title">Por título (A-Z)</option>
                  <option value="artist">Por artista (A-Z)</option>
                  <option value="duration">Por duración (más cortas primero)</option>
                </select>
                <button class="btn btn--soft btn--small" data-action="reverse-playlist" title="Invierte la lista: cada nodo intercambia prev y next">${icons.reverse} Invertir</button>
                <button class="btn btn--soft btn--small ${this.showStructure ? 'is-on' : ''}" data-action="toggle-structure"
                        aria-pressed="${this.showStructure}">${icons.nodes} ${this.showStructure ? 'Ocultar lista doble' : 'Ver lista doble'}</button>
              </div>
            </div>
            <p class="toolbar__hint">Arrastra una canción para cambiarla de posición${isLiked ? '' : ', o suelta archivos donde quieras agregarlos'}.</p>`
      }
      <div id="song-region"></div>
    `;
    this.renderSongRegion();
  }

  // ---------- Home ----------

  private renderHome(): void {
    const playlists = this.normalPlaylists();
    const liked = this.likedPlaylist();
    const totalSongs = playlists.reduce((sum, playlist) => sum + playlist.size, 0);
    const current = this.player.songId ? this.playingPlaylist?.currentSong : null;
    const isPlaying = this.player.isPlaying;

    const title = this.userName
      ? `${greetingForNow()}, <span class="home-hero__name">${escapeHtml(this.userName)}</span>`
      : '¡Hola! Bienvenido a FeSoul';

    const nameControl = this.userName
      ? '<button class="link-btn" data-action="change-name">Cambiar nombre</button>'
      : `<form class="name-form" data-form="name">
           <label for="name-input">¿Cómo te llamas?</label>
           <div class="name-form__row">
             <input id="name-input" class="dialog__input" type="text" maxlength="${MAX_NAME_LENGTH}"
                    placeholder="Tu nombre" autocomplete="given-name" />
             <button class="btn btn--primary" type="submit">Guardar</button>
           </div>
         </form>`;

    const summary =
      totalSongs === 0
        ? 'Tu música te está esperando. Agrega canciones desde tu computador o búscalas en YouTube.'
        : `Tienes ${playlists.length} ${playlists.length === 1 ? 'playlist' : 'playlists'} con ${pluralizeSongs(totalSongs)} en total.`;

    this.playlistView.innerHTML = `
      <section class="home-hero ${isPlaying ? 'is-playing' : ''}">
        <div class="home-hero__text">
          <h1 class="home-hero__title">${title}</h1>
          <p class="home-hero__summary">${summary}</p>
          ${nameControl}
          <div class="home-hero__actions">
            <button class="btn btn--primary" data-action="home-add-files">${icons.plus} Agregar canciones</button>
            <button class="btn btn--soft btn--youtube" data-action="home-youtube">${icons.youtube} Buscar en YouTube</button>
          </div>
        </div>
        <div class="home-hero__disc" aria-hidden="true">${vinylWithCover(220, current?.coverUrl)}</div>
      </section>

      ${current ? `
      <section class="home-section">
        <h2 class="home-section__title">Seguir escuchando</h2>
        <div class="now-card">
          ${current.coverUrl ? `<img class="now-card__cover" src="${escapeHtml(current.coverUrl)}" alt="" />` : `<span class="now-card__cover now-card__cover--empty">${vinylSvg(56, false)}</span>`}
          <div class="now-card__text">
            <p class="now-card__title">${escapeHtml(current.title)}</p>
            <p class="now-card__meta">${escapeHtml(current.artist)} · ${escapeHtml(this.playingPlaylist!.name)}</p>
          </div>
          <button class="play-btn" data-action="toggle-play" aria-label="${isPlaying ? 'Pausar' : 'Reproducir'}">${isPlaying ? icons.pause : icons.play}</button>
        </div>
      </section>` : ''}

      <section class="home-section">
        <div class="home-section__head">
          <h2 class="home-section__title">Tus playlists</h2>
        </div>
        <ul class="playlist-grid">
          ${liked ? this.playlistCardTemplate(liked) : ''}
          ${playlists.map((playlist) => this.playlistCardTemplate(playlist)).join('')}
          <li>
            <button class="playlist-card playlist-card--new" data-action="new-playlist">
              <span class="playlist-card__cover">${icons.plus}</span>
              <span class="playlist-card__name">Nueva playlist</span>
              <span class="playlist-card__meta">Por género, ánimo o como quieras</span>
            </button>
          </li>
        </ul>
      </section>

      ${this.recentTemplate()}
    `;
  }

  private playlistCardTemplate(playlist: Playlist): string {
    const cover = playlist.getSongs().find((song) => song.coverUrl)?.coverUrl;
    const isPlayingThis = playlist === this.playingPlaylist && this.player.isPlaying;
    return `
      <li class="playlist-card-wrap">
        <button class="playlist-card" data-action="select-playlist" data-id="${playlist.id}">
          <span class="playlist-card__cover ${playlist.id === LIKED_ID ? 'playlist-card__cover--liked' : ''}">${
            playlist.id === LIKED_ID ? icons.heartFilled : cover ? `<img src="${escapeHtml(cover)}" alt="" />` : vinylSvg(88, false)
          }</span>
          <span class="playlist-card__name">${escapeHtml(playlist.name)}</span>
          <span class="playlist-card__meta">${pluralizeSongs(playlist.size)}${playlist.size ? ` · ${formatTotalDuration(playlist.totalDuration)}` : ''}</span>
        </button>
        ${playlist.size ? `<button class="playlist-card__play ${isPlayingThis ? 'is-playing' : ''}" data-action="play-playlist" data-id="${playlist.id}"
                aria-label="${isPlayingThis ? 'Pausar' : 'Reproducir'} ${escapeHtml(playlist.name)}">${isPlayingThis ? icons.pause : icons.play}</button>` : ''}
      </li>`;
  }

  private recentTemplate(): string {
    const items = this.recent
      .map((key) => {
        const [playlistId, songId] = key.split(':');
        const playlist = this.library.get(playlistId);
        const song = playlist?.getSong(songId);
        return playlist && song ? { key, playlist, song } : null;
      })
      .filter((item) => item !== null)
      .slice(0, 6);

    if (items.length === 0) return '';
    return `
      <section class="home-section">
        <h2 class="home-section__title">Escuchadas recientemente</h2>
        <ul class="recent-list">
          ${items
            .map(
              ({ key, playlist, song }) => `
            <li>
              <button class="recent-item" data-action="play-recent" data-id="${key}">
                ${song.coverUrl ? `<img class="recent-item__cover" src="${escapeHtml(song.coverUrl)}" alt="" />` : `<span class="recent-item__cover recent-item__cover--empty">${vinylSvg(44, false)}</span>`}
                <span class="recent-item__text">
                  <span class="recent-item__title">${escapeHtml(song.title)}</span>
                  <span class="recent-item__meta">${escapeHtml(song.artist)} · ${escapeHtml(playlist.name)}</span>
                </span>
              </button>
            </li>`,
            )
            .join('')}
        </ul>
      </section>`;
  }

  /** Draws only the song list (used while searching, so the input keeps focus). */
  private renderSongRegion(): void {
    const region = this.playlistView.querySelector<HTMLElement>('#song-region');
    const playlist = this.library.selectedPlaylist;
    if (!region || !playlist) return;

    if (playlist.isEmpty && playlist.id === LIKED_ID) {
      region.innerHTML = `
        <div class="empty-state empty-state--inline">
          ${icons.heart}
          <h2>Aún no tienes canciones que te gusten</h2>
          <p>Toca el corazón de cualquier canción y aparecerá aquí.</p>
        </div>`;
      return;
    }

    if (playlist.isEmpty) {
      region.innerHTML = `
        <div class="empty-state empty-state--inline drop-zone">
          ${icons.music}
          <h2>Esta playlist está vacía</h2>
          <p>Elige canciones de tu computador o arrástralas hasta aquí.</p>
          <button class="btn btn--primary" data-action="add-last">${icons.plus} Agregar canciones</button>
        </div>`;
      return;
    }

    const query = normalize(this.searchQuery);
    const songs = playlist.getSongs();
    const visible = songs
      .map((song, index) => ({ song, index }))
      .filter(({ song }) => !query || normalize(`${song.title} ${song.artist} ${song.album ?? ''}`).includes(query));

    if (visible.length === 0) {
      region.innerHTML = `
        <div class="empty-state empty-state--inline">
          <h2>Sin resultados</h2>
          <p>Ninguna canción coincide con "${escapeHtml(this.searchQuery)}".</p>
          <button class="btn btn--soft" data-action="clear-search">Limpiar búsqueda</button>
        </div>`;
      return;
    }

    const loadedId = playlist === this.playingPlaylist ? this.player.songId : null;
    const rows = visible.map(({ song, index }) => this.songRowTemplate(song, index, song.id === loadedId)).join('');

    region.innerHTML = `
      ${this.showStructure ? this.structureTemplate(playlist) : ''}
      <div class="song-table ${this.searchQuery ? 'is-filtered' : ''}" role="table" aria-label="Canciones de la playlist">
        <div class="song-row song-row--head" role="row">
          <span role="columnheader"></span>
          <span role="columnheader">#</span>
          <span role="columnheader">Título</span>
          <span role="columnheader" class="song-row__duration">Duración</span>
          <span role="columnheader"></span>
        </div>
        <ol class="song-list">${rows}</ol>
      </div>`;
  }

  private songRowTemplate(song: Song, index: number, isCurrent: boolean): string {
    const isPlaying = isCurrent && this.player.isPlaying;
    const liked = this.isLiked(song);
    const canPlayNext =
      this.library.selectedPlaylist === this.playingPlaylist && Boolean(this.player.songId) && !isCurrent;
    const inLikedView = this.library.selectedPlaylist?.id === LIKED_ID;
    return `
      <li class="song-row ${isCurrent ? 'is-current' : ''} ${this.flashIds.has(song.id) ? 'is-flash' : ''}" data-id="${song.id}" role="row">
        <span class="song-row__grip" title="Arrastra para mover">${icons.grip}</span>
        <span class="song-row__index">${isPlaying ? '<span class="eq" aria-label="Sonando"><i></i><i></i><i></i></span>' : index + 1}</span>
        <button class="song-row__main" data-action="play-song" data-id="${song.id}"
                aria-label="${isPlaying ? 'Pausar' : 'Reproducir'} ${escapeHtml(song.title)}"
                title="Alt + ↑/↓ para mover con el teclado">
          <span class="song-row__title">${escapeHtml(song.title)}</span>
          <span class="song-row__artist">${song.source === 'youtube' ? '<span class="badge-yt" title="Desde YouTube">YouTube</span>' : ''}${escapeHtml(song.artist)}${song.album ? ` · ${escapeHtml(song.album)}` : ''}</span>
        </button>
        <span class="song-row__duration">${song.duration ? formatTime(song.duration) : '--:--'}</span>
        <span class="song-row__actions">
          <button class="icon-btn like-btn ${liked ? 'is-liked' : ''}" data-action="toggle-like" data-id="${song.id}"
                  aria-pressed="${liked}" aria-label="${liked ? 'Quitar de Me gusta' : 'Agregar a Me gusta'}"
                  title="${liked ? 'Quitar de Me gusta' : 'Me gusta'}">${liked ? icons.heartFilled : icons.heart}</button>
          ${
            canPlayNext
              ? `<button class="icon-btn song-row__tool" data-action="play-next" data-id="${song.id}"
                   aria-label="Reproducir ${escapeHtml(song.title)} a continuación" title="Reproducir a continuación">${icons.playNext}</button>`
              : '<span class="song-row__tool-gap"></span>'
          }
          <button class="icon-btn icon-btn--danger song-row__delete" data-action="delete-song" data-id="${song.id}"
                  aria-label="${inLikedView ? 'Quitar de Me gusta' : 'Eliminar'} ${escapeHtml(song.title)}"
                  title="${inLikedView ? 'Quitar de Me gusta' : 'Eliminar canción'}">${icons.trash}</button>
        </span>
      </li>`;
  }

  /** Draws the nodes of the playlist with their prev/next pointers. */
  private structureTemplate(playlist: Playlist): string {
    const nodes = playlist.describeNodes();
    const short = (song: Song | null) => (song ? escapeHtml(song.title) : 'null');
    const cards = nodes
      .map(({ song, prev, next, isCurrent }, index) => {
        const tags = [
          index === 0 ? '<span class="node__tag">head</span>' : '',
          index === nodes.length - 1 ? '<span class="node__tag">tail</span>' : '',
          isCurrent ? '<span class="node__tag node__tag--current">current</span>' : '',
        ].join('');
        return `
          ${index > 0 ? `<span class="node-link" aria-hidden="true">${icons.linkArrows}</span>` : ''}
          <li class="node ${isCurrent ? 'is-current' : ''} ${this.flashIds.has(song.id) ? 'is-flash' : ''}">
            <div class="node__head"><span>Nodo ${index}</span>${tags}</div>
            <p class="node__value" title="${escapeHtml(song.title)}">${escapeHtml(song.title)}</p>
            <dl class="node__pointers">
              <dt>prev</dt><dd class="${prev ? '' : 'is-null'}">${short(prev)}</dd>
              <dt>next</dt><dd class="${next ? '' : 'is-null'}">${short(next)}</dd>
            </dl>
          </li>`;
      })
      .join('');

    return `
      <section class="structure" aria-label="Lista doblemente enlazada de la playlist">
        <div class="structure__head">
          <h2>Así está la lista doble por dentro</h2>
          <p>size = ${playlist.size}. Cada nodo apunta al anterior (prev) y al siguiente (next).</p>
        </div>
        <ol class="structure__track">
          <li class="node-null" aria-hidden="true">null</li>
          <span class="node-link node-link--end" aria-hidden="true">←</span>
          ${cards}
          <span class="node-link node-link--end" aria-hidden="true">→</span>
          <li class="node-null" aria-hidden="true">null</li>
        </ol>
      </section>`;
  }

  /** Highlights songs for a moment after they move. */
  private flash(ids: string[]): void {
    this.flashIds = new Set(ids);
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      this.flashIds.clear();
      this.playlistView.querySelectorAll('.is-flash').forEach((element) => element.classList.remove('is-flash'));
    }, 1400);
  }

  private renderPlayerBar(): void {
    const playlist = this.playingPlaylist;
    const song = this.player.songId ? (playlist?.currentSong ?? null) : null;
    const canStart = Boolean(song) || Boolean(this.library.selectedPlaylist?.size);
    const wrap = this.repeat === 'all';
    const canGoBack = Boolean(song) && (this.shuffle ? this.shuffleHistory.length > 0 || playlist!.hasPrevious() : Boolean(playlist!.peekPrevious(wrap)));
    const canGoForward = Boolean(song) && (this.shuffle ? playlist!.size > 1 : Boolean(playlist!.peekNext(wrap)));
    const muted = this.player.muted || this.player.volume === 0;

    this.playerBar.classList.toggle('is-playing', this.player.isPlaying);
    this.playerBar.innerHTML = `
      <div class="now-playing">
        <div class="now-playing__disc">${vinylWithCover(56, song?.coverUrl)}</div>
        <div class="now-playing__text">
          <p class="now-playing__title">${song ? escapeHtml(song.title) : 'Nada sonando'}</p>
          <p class="now-playing__artist">${song ? `${escapeHtml(song.artist)} · ${escapeHtml(playlist!.name)}` : 'Elige una canción para empezar'}</p>
        </div>
      </div>

      <div class="transport">
        <div class="transport__buttons">
          <button class="icon-btn mode-btn ${this.shuffle ? 'is-on' : ''}" data-action="toggle-shuffle"
                  aria-pressed="${this.shuffle}" aria-label="Aleatorio" title="Aleatorio: ${this.shuffle ? 'activado' : 'desactivado'}">${icons.shuffle}</button>
          <button class="icon-btn" data-action="previous" aria-label="Canción anterior" title="Anterior (Shift + ←)" ${canGoBack ? '' : 'disabled'}>${icons.previous}</button>
          <button class="play-btn" data-action="toggle-play" id="play-button"
                  aria-label="${this.player.isPlaying ? 'Pausar' : 'Reproducir'}" title="Reproducir / pausar (Espacio)"
                  ${canStart ? '' : 'disabled'}>${this.player.isPlaying ? icons.pause : icons.play}</button>
          <button class="icon-btn" data-action="next" aria-label="Canción siguiente" title="Siguiente (Shift + →)" ${canGoForward ? '' : 'disabled'}>${icons.next}</button>
          <button class="icon-btn mode-btn ${this.repeat !== 'off' ? 'is-on' : ''}" data-action="cycle-repeat"
                  aria-label="${REPEAT_LABELS[this.repeat]}" title="${REPEAT_LABELS[this.repeat]}">${this.repeat === 'one' ? icons.repeatOne : icons.repeat}</button>
        </div>
        <div class="transport__progress">
          <span class="time" id="time-current">${formatTime(this.player.currentTime)}</span>
          <input type="range" class="range" id="progress" min="0" max="${song?.duration || 0}" step="0.1"
                 value="${this.player.currentTime}" aria-label="Progreso de la canción" ${song ? '' : 'disabled'} />
          <span class="time" id="time-total">${formatTime(song?.duration ?? 0)}</span>
        </div>
      </div>

      <div class="player-side">
        <div class="neighbors" aria-label="Canciones vecinas en la lista doble">
          <p><span>Anterior</span> ${this.neighborLabel('previous')}</p>
          <p><span>Siguiente</span> ${this.neighborLabel('next')}</p>
        </div>
        <div class="volume">
          <button class="icon-btn" data-action="toggle-mute" aria-label="${muted ? 'Activar sonido' : 'Silenciar'}" title="Silenciar (M)">${muted ? icons.mute : icons.volume}</button>
          <input type="range" class="range range--volume" id="volume" min="0" max="1" step="0.01"
                 value="${muted ? 0 : this.player.volume}" aria-label="Volumen" />
        </div>
      </div>
    `;
    this.paintRange(this.query<HTMLInputElement>('#volume'));
    this.paintRange(this.query<HTMLInputElement>('#progress'));
  }

  /** Shows prev/next of the current node, straight from the doubly linked list. */
  private neighborLabel(side: 'previous' | 'next'): string {
    const playlist = this.playingPlaylist;
    if (!playlist || !this.player.songId) return '—';
    if (this.shuffle && side === 'next') return 'Aleatoria';
    const wrap = this.repeat === 'all';
    const song = side === 'next' ? playlist.peekNext(wrap) : playlist.peekPrevious(wrap);
    return song ? escapeHtml(song.title) : '—';
  }

  /** Updates only what changes when the music plays or pauses. */
  private updatePlayState(): void {
    const isPlaying = this.player.isPlaying;
    this.playerBar.classList.toggle('is-playing', isPlaying);
    const button = this.playerBar.querySelector<HTMLButtonElement>('#play-button');
    if (button) {
      button.innerHTML = isPlaying ? icons.pause : icons.play;
      button.setAttribute('aria-label', isPlaying ? 'Pausar' : 'Reproducir');
    }
    this.renderPlaylistNav();
    if (this.view === 'home') this.renderHome();
    else if (this.library.selectedPlaylist === this.playingPlaylist) this.renderSongRegion();

    const song = this.playingPlaylist?.currentSong;
    document.title = isPlaying && song ? `▶ ${song.title} | FeSoul` : 'FeSoul | Reproductor de música';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }

  /** Colors the filled part of a range input. */
  private paintRange(input: HTMLInputElement): void {
    const max = Number(input.max) || 0;
    const percent = max > 0 ? (Number(input.value) / max) * 100 : 0;
    input.style.setProperty('--fill', `${percent}%`);
  }

  // ======================================================
  // Events
  // ======================================================

  private bindEvents(): void {
    // One click listener for the whole app: every button has a data-action.
    this.root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target || target.hasAttribute('disabled')) return;
      void this.handleAction(target.dataset.action!, target.dataset.id);
    });

    this.root.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      if (input.id === 'search-input') {
        this.searchQuery = input.value;
        this.renderSongRegion();
      } else if (input.id === 'volume') {
        this.player.setVolume(Number(input.value));
        this.player.setMuted(Number(input.value) === 0);
        this.paintRange(input);
        this.updateMuteButton();
        this.scheduleSave();
      } else if (input.id === 'progress') {
        this.isSeeking = true;
        this.paintRange(input);
        this.query('#time-current').textContent = formatTime(Number(input.value));
      }
    });

    this.root.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      if (input.id === 'progress') {
        this.player.seek(Number(input.value));
        this.isSeeking = false;
      } else if (input.id === 'sort-select' && input.value) {
        this.sortPlaylist(input.value as SortKey);
      } else if (input.id === 'file-input' && input.files) {
        const files = [...input.files];
        input.value = ''; // allows choosing the same files again
        void this.addFiles(files, this.pendingInsert);
      }
    });

    this.root.addEventListener('submit', (event) => {
      const form = event.target as HTMLFormElement;
      if (form.dataset.form !== 'name') return;
      event.preventDefault();
      const input = form.querySelector<HTMLInputElement>('input');
      try {
        this.setUserName(input?.value ?? '');
      } catch (error) {
        this.toast.show(error instanceof Error ? error.message : 'Nombre no válido.', 'error');
        input?.focus();
      }
    });

    document.addEventListener('keydown', (event) => this.handleKeyboard(event));
    this.bindFileDrop();
  }

  private bindPlayerEvents(): void {
    this.player.onPlayStateChange = () => this.updatePlayState();

    this.player.onTimeUpdate = (currentTime, duration) => {
      const progress = this.playerBar.querySelector<HTMLInputElement>('#progress');
      if (!progress || this.isSeeking) return;
      if (duration && Number(progress.max) !== duration) {
        progress.max = String(duration);
        this.query('#time-total').textContent = formatTime(duration);
      }
      progress.value = String(currentTime);
      this.paintRange(progress);
      this.query('#time-current').textContent = formatTime(currentTime);
      if ('mediaSession' in navigator && duration) {
        try {
          navigator.mediaSession.setPositionState({ duration, position: Math.min(currentTime, duration) });
        } catch {
          /* not supported */
        }
      }
    };

    this.player.onEnded = () => {
      if (this.repeat === 'one') {
        this.player.seek(0);
        void this.player.play();
      } else {
        this.goNext(true);
      }
    };

    // Some files only report their real duration when they are played.
    this.player.onDurationKnown = (songId, seconds) => {
      const song = this.playingPlaylist?.getSong(songId);
      if (!song || Math.abs(song.duration - seconds) < 0.5) return;
      song.duration = seconds;
      if (this.library.selectedPlaylist === this.playingPlaylist) this.renderPlaylistView();
      this.scheduleSave();
    };

    this.player.onError = (message) => this.toast.show(message, 'error');
    this.player.onSourceChange = (source) => this.videoDock.classList.toggle('is-visible', source === 'youtube');

    if ('mediaSession' in navigator) {
      const session = navigator.mediaSession;
      session.setActionHandler('play', () => void this.togglePlay());
      session.setActionHandler('pause', () => this.player.pause());
      session.setActionHandler('previoustrack', () => this.goPrevious());
      session.setActionHandler('nexttrack', () => this.goNext());
      try {
        session.setActionHandler('seekto', (details) => {
          if (details.seekTime != null) this.player.seek(details.seekTime);
        });
      } catch {
        /* not supported */
      }
    }
  }

  private async handleAction(action: string, id?: string): Promise<void> {
    switch (action) {
      case 'new-playlist':
        return this.createPlaylist();
      case 'select-playlist':
        if (id && (id !== this.library.selectedPlaylist?.id || this.view !== 'playlist')) {
          this.library.select(id);
          this.searchQuery = '';
          this.view = 'playlist';
          this.render();
          this.playlistView.scrollTop = 0;
          this.scheduleSave();
        }
        return;
      case 'go-home':
        this.view = 'home';
        this.searchQuery = '';
        this.render();
        this.playlistView.scrollTop = 0;
        return;
      case 'change-name':
        await this.dialog.askName({
          title: '¿Cómo quieres que te llamemos?',
          confirmLabel: 'Guardar',
          initialValue: this.userName,
          onSubmit: (name) => this.setUserName(name),
        });
        return;
      case 'play-playlist':
        if (id) this.playPlaylist(id);
        return;
      case 'play-recent': {
        const [playlistId, songId] = (id ?? '').split(':');
        const playlist = this.library.get(playlistId);
        if (playlist?.getSong(songId)) this.playSong(playlist, songId);
        return;
      }
      case 'home-add-files':
      case 'home-youtube': {
        // Work on the playlist the user had open (or the first one, or a new one).
        const selected = this.library.selectedPlaylist;
        let playlist = selected && selected.id !== LIKED_ID ? selected : (this.normalPlaylists()[0] ?? null);
        if (!playlist) playlist = this.library.create(DEFAULT_PLAYLIST_NAME);
        this.library.select(playlist.id);
        this.view = 'playlist';
        this.render();
        if (action === 'home-youtube') this.youtubeSearch.open(playlist.name);
        else {
          this.pendingInsert = { type: 'last' };
          this.fileInput.click();
        }
        return;
      }
      case 'rename-playlist':
        return this.renamePlaylist();
      case 'delete-playlist':
        return this.deletePlaylist();
      case 'add-first':
      case 'add-last':
        this.pendingInsert = { type: action === 'add-first' ? 'first' : 'last' };
        this.fileInput.click();
        return;
      case 'youtube-search':
        if (this.library.selectedPlaylist) this.youtubeSearch.open(this.library.selectedPlaylist.name);
        return;
      case 'play-song':
        if (id && this.library.selectedPlaylist) this.playSong(this.library.selectedPlaylist, id);
        return;
      case 'delete-song':
        if (id && this.library.selectedPlaylist) this.deleteSong(this.library.selectedPlaylist, id);
        return;
      case 'toggle-like':
        if (id && this.library.selectedPlaylist) this.toggleLike(this.library.selectedPlaylist, id);
        return;
      case 'play-next':
        if (id) this.playNext(id);
        return;
      case 'reverse-playlist':
        this.reversePlaylist();
        return;
      case 'toggle-structure':
        this.showStructure = !this.showStructure;
        this.renderPlaylistView();
        return;
      case 'toggle-play':
        return this.togglePlay();
      case 'next':
        return this.goNext();
      case 'previous':
        return this.goPrevious();
      case 'toggle-shuffle':
        this.shuffle = !this.shuffle;
        this.shuffleHistory = [];
        this.renderPlayerBar();
        this.toast.show(this.shuffle ? 'Aleatorio activado.' : 'Aleatorio desactivado.');
        this.scheduleSave();
        return;
      case 'cycle-repeat':
        this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
        this.renderPlayerBar();
        this.toast.show(`${REPEAT_LABELS[this.repeat]}.`);
        this.scheduleSave();
        return;
      case 'toggle-mute':
        return this.toggleMute();
      case 'clear-search':
        this.searchQuery = '';
        this.renderPlaylistView();
        return;
    }
  }

  private handleKeyboard(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const isTyping = target.matches('input[type="search"], input[type="text"], textarea');
    if (isTyping || this.root.querySelector('dialog[open]')) return;

    // Alt + ↑/↓ moves the focused song (keyboard alternative to drag and drop).
    const row = target.closest<HTMLElement>('.song-list > .song-row');
    if (event.altKey && row && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !this.searchQuery) {
      event.preventDefault();
      const playlist = this.library.selectedPlaylist;
      const songId = row.dataset.id!;
      if (!playlist) return;
      const index = playlist.getSongs().findIndex((song) => song.id === songId);
      const toIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
      if (toIndex < 0 || toIndex >= playlist.size) return;
      this.moveSong(songId, toIndex);
      this.playlistView.querySelector<HTMLElement>(`.song-row[data-id="${songId}"] .song-row__main`)?.focus();
      return;
    }

    if (event.key === ' ' && !target.matches('button, input[type="range"]')) {
      event.preventDefault();
      void this.togglePlay();
    } else if (event.shiftKey && event.key === 'ArrowRight') {
      event.preventDefault();
      this.goNext();
    } else if (event.shiftKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      this.goPrevious();
    } else if (event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      this.toggleMute();
    }
  }

  /** Lets the user drop audio files from the computer at any position of the list. */
  private bindFileDrop(): void {
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
    const view = this.playlistView;

    view.addEventListener('dragenter', (event) => {
      if (!hasFiles(event) || !this.canDropFiles()) return;
      event.preventDefault();
      this.fileDragDepth++;
      view.classList.add('is-file-over');
    });

    view.addEventListener('dragover', (event) => {
      if (!hasFiles(event) || !this.canDropFiles()) return;
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'copy';
      this.showFileDropIndicator(event.clientY);
    });

    view.addEventListener('dragleave', (event) => {
      if (!hasFiles(event)) return;
      this.fileDragDepth = Math.max(0, this.fileDragDepth - 1);
      if (this.fileDragDepth === 0) this.clearFileDrop();
    });

    view.addEventListener('drop', (event) => {
      if (!hasFiles(event) || !this.canDropFiles()) return;
      event.preventDefault();
      const index = this.fileDropIndex(event.clientY);
      this.clearFileDrop();
      const files = [...(event.dataTransfer?.files ?? [])];
      const mode: InsertMode = index === null ? { type: 'last' } : { type: 'at', index };
      void this.addFiles(files, mode);
    });

    // Dropping a file outside the list must not open it in the browser.
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => event.preventDefault());
  }

  /** Position (in the full list) where dropped files will be inserted. */
  private fileDropIndex(clientY: number): number | null {
    if (this.searchQuery) return null;
    const rows = [...this.playlistView.querySelectorAll<HTMLElement>('.song-list > .song-row')];
    if (rows.length === 0) return null;
    let index = 0;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (clientY > rect.top + rect.height / 2) index++;
    }
    return index;
  }

  private showFileDropIndicator(clientY: number): void {
    const list = this.playlistView.querySelector<HTMLElement>('.song-list');
    const index = this.fileDropIndex(clientY);
    if (!list || index === null) return;

    let indicator = list.querySelector<HTMLElement>('.drop-indicator');
    if (!indicator) {
      indicator = document.createElement('li');
      indicator.className = 'drop-indicator';
      list.append(indicator);
    }
    const rows = [...list.querySelectorAll<HTMLElement>(':scope > .song-row')];
    const listTop = list.getBoundingClientRect().top;
    const y = rows[index] ? rows[index].getBoundingClientRect().top : rows[rows.length - 1].getBoundingClientRect().bottom;
    indicator.style.top = `${y - listTop - 1}px`;
  }

  private clearFileDrop(): void {
    this.fileDragDepth = 0;
    this.playlistView.classList.remove('is-file-over');
    this.playlistView.querySelector('.drop-indicator')?.remove();
  }

  // ======================================================
  // Songs
  // ======================================================

  /** Adds audio files to the selected playlist (at the start, end or a position). */
  private async addFiles(files: File[], mode: InsertMode): Promise<void> {
    const playlist = this.library.selectedPlaylist;
    if (!playlist || files.length === 0) return;

    const audioFiles = files.filter(isAudioFile);
    const rejected = files.length - audioFiles.length;
    if (audioFiles.length === 0) {
      this.toast.show('Ninguno de los archivos es de audio. Usa MP3, WAV, OGG, M4A o FLAC.', 'error');
      return;
    }

    const songs = await Promise.all(audioFiles.map((file) => createSongFromFile(file)));
    this.insertSongs(playlist, songs, mode);

    const where =
      mode.type === 'first'
        ? 'al inicio'
        : mode.type === 'last'
          ? 'al final'
          : mode.type === 'next'
            ? 'a continuación'
            : `en la posición ${Math.min(mode.index, playlist.size - songs.length) + 1}`;
    const skipped = rejected > 0 ? ` (${rejected} ${rejected === 1 ? 'archivo no es' : 'archivos no son'} de audio)` : '';
    this.toast.show(`${songs.length === 1 ? `"${songs[0].title}" agregada` : `${pluralizeSongs(songs.length)} agregadas`} ${where}${skipped}.`);

    // Save the files so they are still there after reloading the page.
    const results = await Promise.all(songs.map((song, i) => this.storage.saveFile(song.id, audioFiles[i])));
    if (results.includes(false) && !this.storageWarningShown) {
      this.storageWarningShown = true;
      this.toast.show('No se pudieron guardar algunas canciones en el navegador. Se escuchan igual, pero se perderán al recargar.', 'error');
    }
    this.scheduleSave();
  }

  /** Inserts songs in the doubly linked list of the playlist and refreshes the screen. */
  private insertSongs(playlist: Playlist, songs: Song[], mode: InsertMode): void {
    if (mode.type === 'first') {
      // addFirst one by one in reverse keeps the order the user chose.
      [...songs].reverse().forEach((song) => playlist.addFirst(song));
    } else if (mode.type === 'last') {
      songs.forEach((song) => playlist.addLast(song));
    } else if (mode.type === 'next') {
      // addAfterCurrent one by one in reverse keeps the chosen order.
      [...songs].reverse().forEach((song) => playlist.addAfterCurrent(song));
    } else {
      const start = Math.min(mode.index, playlist.size);
      songs.forEach((song, offset) => playlist.addAt(start + offset, song));
    }

    this.flash(songs.map((song) => song.id));
    this.renderPlaylistNav();
    if (this.library.selectedPlaylist === playlist) this.renderPlaylistView();
    this.renderPlayerBar();
  }

  /** Adds a song found on YouTube to the selected playlist. */
  private addFromYouTube(result: YouTubeResult, position: AddPosition): void {
    const playlist = this.library.selectedPlaylist;
    if (!playlist) return;
    const song = songFromYouTube(result);
    const where =
      position === 'first'
        ? 'al inicio'
        : position === 'last'
          ? 'al final'
          : playlist.currentSong
            ? `para sonar después de "${playlist.currentSong.title}"`
            : 'al final (no hay ninguna sonando en esta playlist)';
    this.insertSongs(playlist, [song], { type: position });
    this.toast.show(`"${song.title}" agregada ${where}.`);
    this.scheduleSave();
  }

  /** Plays a song of a playlist (or pauses it if it is already playing). */
  private playSong(playlist: Playlist, songId: string): void {
    if (playlist === this.playingPlaylist && this.player.songId === songId) {
      this.player.toggle();
      return;
    }
    if (playlist !== this.playingPlaylist) this.shuffleHistory = [];
    const song = playlist.select(songId);
    this.playingPlaylist = playlist;
    this.startSong(song, true);
  }

  /** Loads a song in the player and refreshes the screen. */
  private startSong(song: Song, autoplay: boolean): void {
    void this.player.load(song, autoplay);
    if (this.playingPlaylist) {
      const key = `${this.playingPlaylist.id}:${song.id}`;
      this.recent = [key, ...this.recent.filter((item) => item !== key)].slice(0, MAX_RECENT);
    }
    this.renderPlayerBar();
    this.renderPlaylistNav();
    if (this.view === 'home') this.renderHome();
    else if (this.library.selectedPlaylist === this.playingPlaylist) this.renderSongRegion();
    this.updateMediaSession(song);
    this.scheduleSave();
  }

  /** Plays a whole playlist from the home page (or pauses it if it is the one playing). */
  private playPlaylist(playlistId: string): void {
    const playlist = this.library.get(playlistId);
    if (!playlist || playlist.isEmpty) return;
    if (playlist === this.playingPlaylist && this.player.songId) {
      this.player.toggle();
      return;
    }
    const song = playlist.selectFirstIfNone()!;
    this.shuffleHistory = [];
    this.playingPlaylist = playlist;
    this.startSong(song, true);
  }

  private setUserName(name: string): void {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) throw new Error('Escribe tu nombre para saludarte.');
    if (clean.length > MAX_NAME_LENGTH) throw new Error(`El nombre no puede tener más de ${MAX_NAME_LENGTH} caracteres.`);
    this.userName = clean;
    if (this.view === 'home') this.renderHome();
    this.toast.show(`¡Listo, ${clean}!`);
    this.scheduleSave();
  }

  private async togglePlay(): Promise<void> {
    if (this.player.songId) {
      this.player.toggle();
      return;
    }
    const playlist = this.playingPlaylist?.size ? this.playingPlaylist : this.library.selectedPlaylist;
    if (!playlist || playlist.isEmpty) return;
    const song = playlist.selectFirstIfNone()!;
    this.playingPlaylist = playlist;
    this.startSong(song, true);
  }

  /** "Adelantar": goes to the next node of the list. */
  private goNext(fromEnded = false): void {
    const playlist = this.playingPlaylist;
    if (!playlist || !this.player.songId) return;

    let song: Song | null;
    if (this.shuffle && playlist.size > 1) {
      const current = playlist.currentSong;
      if (current) this.shuffleHistory.push(current.id);
      const options = playlist.getSongs().filter((candidate) => candidate.id !== current?.id);
      song = playlist.select(options[Math.floor(Math.random() * options.length)].id);
    } else {
      song = playlist.next(this.repeat === 'all');
    }

    if (!song) {
      // End of the playlist: stop at the beginning of the last song.
      if (fromEnded) {
        this.player.pause();
        this.player.seek(0);
        this.toast.show('Fin de la playlist.');
      }
      return;
    }
    this.startSong(song, true);
  }

  /** "Retroceder": goes to the previous node of the list. */
  private goPrevious(): void {
    const playlist = this.playingPlaylist;
    if (!playlist || !this.player.songId) return;

    let song: Song | null = null;
    if (this.shuffle) {
      while (!song && this.shuffleHistory.length) {
        const id = this.shuffleHistory.pop()!;
        if (playlist.getSong(id)) song = playlist.select(id);
      }
    }
    song ??= playlist.previous(this.repeat === 'all');
    if (song) this.startSong(song, true);
  }

  private moveSong(songId: string, toIndex: number): void {
    const playlist = this.library.selectedPlaylist;
    if (!playlist) return;
    playlist.moveSong(songId, toIndex);
    this.flash([songId]);
    this.renderSongRegion();
    // The "previous / next" labels follow the new order of the list.
    if (playlist === this.playingPlaylist) this.renderPlayerBar();
    this.scheduleSave();
  }

  private deleteSong(playlist: Playlist, songId: string, options: { quiet?: boolean } = {}): void {
    const song = playlist.getSong(songId);
    if (!song) return;

    const index = playlist.getSongs().findIndex((candidate) => candidate.id === songId);
    const isLoaded = playlist === this.playingPlaylist && this.player.songId === songId;
    const wasPlaying = isLoaded && this.player.isPlaying;

    const currentChanged = playlist.removeSong(songId);
    this.shuffleHistory = this.shuffleHistory.filter((id) => id !== songId);

    if (playlist === this.playingPlaylist && (currentChanged || isLoaded)) {
      const next = playlist.currentSong;
      if (next) {
        this.startSong(next, wasPlaying);
      } else {
        this.player.unload();
        this.playingPlaylist = null;
        this.updatePlayState();
      }
    }

    this.renderPlaylistNav();
    this.renderPlaylistView();
    this.renderPlayerBar();
    this.scheduleSave();

    if (options.quiet) {
      this.releaseIfUnused(song);
      return;
    }
    const isLikedList = playlist.id === LIKED_ID;
    this.toast.show(isLikedList ? `"${song.title}" quitada de Me gusta.` : `"${song.title}" eliminada.`, {
      action: {
        label: 'Deshacer',
        onClick: () => {
          if (!this.library.get(playlist.id)) return; // the playlist was deleted meanwhile
          playlist.addAt(Math.min(index, playlist.size), song);
          this.renderPlaylistNav();
          if (this.library.selectedPlaylist === playlist) this.renderPlaylistView();
          this.renderPlayerBar();
          this.scheduleSave();
        },
      },
      onExpire: () => this.releaseIfUnused(song), // only now the song is really gone
    });
  }

  /**
   * Frees the temporary URL and the stored file of a song, but only if
   * no other playlist uses them (copies in "Me gusta" share them).
   */
  private releaseIfUnused(song: Song): void {
    const all = this.library.getAll().flatMap((playlist) => playlist.getSongs());
    if (song.source !== 'local') return;
    if (!all.some((other) => other.url === song.url)) releaseSong(song);
    if (!all.some((other) => other.source === 'local' && fileKey(other) === fileKey(song))) {
      void this.storage.deleteFile(fileKey(song));
    }
  }

  // ---------- Me gusta ----------

  private likedPlaylist(): Playlist | null {
    return this.library.get(LIKED_ID);
  }

  private ensureLikedPlaylist(): Playlist {
    let liked = this.likedPlaylist();
    if (!liked) {
      liked = new Playlist(LIKED_NAME, LIKED_ID);
      this.library.importPlaylist(liked);
    }
    return liked;
  }

  /** Every playlist except the automatic "Me gusta". */
  private normalPlaylists(): Playlist[] {
    return this.library.getAll().filter((playlist) => playlist.id !== LIKED_ID);
  }

  /** Same audio = same song, even if it is a copy in another playlist. */
  private likeKey(song: Song): string {
    return song.source === 'youtube' ? `yt:${song.youtubeId}` : `file:${fileKey(song)}`;
  }

  private isLiked(song: Song): boolean {
    const key = this.likeKey(song);
    return this.likedPlaylist()?.getSongs().some((candidate) => this.likeKey(candidate) === key) ?? false;
  }

  private toggleLike(playlist: Playlist, songId: string): void {
    const song = playlist.getSong(songId);
    if (!song) return;
    const liked = this.ensureLikedPlaylist();
    const key = this.likeKey(song);
    const existing = liked.getSongs().find((candidate) => this.likeKey(candidate) === key);

    if (existing) {
      this.deleteSong(liked, existing.id, { quiet: true });
      this.toast.show(`"${song.title}" quitada de Me gusta.`);
    } else {
      // A copy that shares the same audio (no duplicated file).
      const copy: Song = { ...song, id: createId(), fileId: song.source === 'local' ? fileKey(song) : undefined };
      liked.addLast(copy);
      this.renderPlaylistNav();
      this.renderSongRegion();
      this.toast.show(`"${song.title}" agregada a Me gusta.`);
    }
    this.scheduleSave();
  }

  // ---------- Reorder ----------

  /** "Reproducir a continuación": moves the node right after the current one. */
  private playNext(songId: string): void {
    const playlist = this.library.selectedPlaylist;
    if (!playlist || playlist !== this.playingPlaylist) return;
    const song = playlist.getSong(songId);
    if (!song || !playlist.playNext(songId)) return;
    this.flash([songId]);
    this.renderSongRegion();
    this.renderPlayerBar();
    this.toast.show(`"${song.title}" sonará a continuación.`);
    this.scheduleSave();
  }

  private reversePlaylist(): void {
    const playlist = this.library.selectedPlaylist;
    if (!playlist || playlist.size < 2) return;
    playlist.reverse();
    this.afterReorder(playlist);
    this.toast.show('Playlist invertida: cada nodo intercambió su prev y su next.', {
      action: { label: 'Deshacer', onClick: () => (playlist.reverse(), this.afterReorder(playlist)) },
    });
  }

  private sortPlaylist(key: SortKey): void {
    const playlist = this.library.selectedPlaylist;
    if (!playlist) return;
    const before = playlist.getOrder();
    const text = (value: string) => value.toLocaleLowerCase('es');
    const compare: Record<SortKey, (a: Song, b: Song) => number> = {
      title: (a, b) => text(a.title).localeCompare(text(b.title), 'es'),
      artist: (a, b) => text(a.artist).localeCompare(text(b.artist), 'es') || text(a.title).localeCompare(text(b.title), 'es'),
      duration: (a, b) => a.duration - b.duration,
    };
    playlist.sortBy(compare[key]);
    this.afterReorder(playlist);
    this.toast.show(`Playlist ordenada ${SORT_LABELS[key]}.`, {
      action: { label: 'Deshacer', onClick: () => (playlist.restoreOrder(before), this.afterReorder(playlist)) },
    });
  }

  private afterReorder(playlist: Playlist): void {
    if (this.library.selectedPlaylist === playlist) this.renderPlaylistView();
    if (playlist === this.playingPlaylist) this.renderPlayerBar();
    this.scheduleSave();
  }

  private canDropFiles(): boolean {
    const playlist = this.library.selectedPlaylist;
    return this.view === 'playlist' && Boolean(playlist) && playlist!.id !== LIKED_ID;
  }

  private toggleMute(): void {
    const muted = this.player.muted || this.player.volume === 0;
    if (muted && this.player.volume === 0) this.player.setVolume(DEFAULT_VOLUME);
    this.player.setMuted(!muted);
    const volume = this.playerBar.querySelector<HTMLInputElement>('#volume');
    if (volume) {
      volume.value = String(this.player.muted ? 0 : this.player.volume);
      this.paintRange(volume);
    }
    this.updateMuteButton();
    this.scheduleSave();
  }

  private updateMuteButton(): void {
    const button = this.playerBar.querySelector<HTMLButtonElement>('[data-action="toggle-mute"]');
    if (!button) return;
    const muted = this.player.muted || this.player.volume === 0;
    button.innerHTML = muted ? icons.mute : icons.volume;
    button.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar');
  }

  private updateMediaSession(song: Song): void {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album ?? this.playingPlaylist?.name ?? 'FeSoul',
      artwork: song.coverUrl ? [{ src: song.coverUrl }] : [],
    });
  }

  // ======================================================
  // Playlists
  // ======================================================

  private async createPlaylist(): Promise<void> {
    const created = await this.dialog.askName({
      title: 'Nueva playlist',
      confirmLabel: 'Crear playlist',
      onSubmit: (name) => this.library.create(name),
    });
    if (created) {
      this.searchQuery = '';
      this.view = 'playlist';
      this.render();
      this.toast.show(`Playlist "${this.library.selectedPlaylist!.name}" creada.`);
      this.scheduleSave();
    }
  }

  private async renamePlaylist(): Promise<void> {
    const playlist = this.library.selectedPlaylist;
    if (!playlist || playlist.id === LIKED_ID) return;

    const renamed = await this.dialog.askName({
      title: 'Renombrar playlist',
      confirmLabel: 'Guardar nombre',
      initialValue: playlist.name,
      onSubmit: (name) => this.library.rename(playlist.id, name),
    });
    if (renamed) {
      this.render();
      this.toast.show('Nombre guardado.');
      this.scheduleSave();
    }
  }

  private async deletePlaylist(): Promise<void> {
    const playlist = this.library.selectedPlaylist;
    if (!playlist || playlist.id === LIKED_ID) return;

    const confirmed = await this.dialog.confirm({
      title: `¿Eliminar "${playlist.name}"?`,
      message: `Se quitará la playlist y sus ${pluralizeSongs(playlist.size)}. Los archivos de tu computador no se borran.`,
      confirmLabel: 'Eliminar playlist',
    });
    if (!confirmed) return;

    if (playlist === this.playingPlaylist) {
      this.player.unload();
      this.playingPlaylist = null;
      this.shuffleHistory = [];
      this.updatePlayState();
    }
    this.library.remove(playlist.id);
    for (const song of playlist.getSongs()) this.releaseIfUnused(song);
    this.searchQuery = '';
    this.recent = this.recent.filter((key) => !key.startsWith(`${playlist.id}:`));
    this.view = 'home';
    this.render();
    this.toast.show(`Playlist "${playlist.name}" eliminada.`);
    this.scheduleSave();
  }

  // ======================================================
  // Saving and restoring (IndexedDB)
  // ======================================================

  private scheduleSave(): void {
    if (this.isLoading) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.storage.saveState(this.buildState()), 300);
  }

  private buildState(): StoredState {
    return {
      playlists: this.library.getAll().map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        currentSongId: playlist.currentSong?.id ?? null,
        songs: playlist.getSongs().map(toSongInfo),
      })),
      selectedPlaylistId: this.library.selectedPlaylist?.id ?? null,
      volume: this.player.volume,
      muted: this.player.muted,
      repeat: this.repeat,
      shuffle: this.shuffle,
      userName: this.userName,
      recent: this.recent,
    };
  }

  /** Loads the playlists saved in the browser, or creates the first one. */
  private async restore(): Promise<void> {
    try {
      const state = await this.storage.loadState();
      if (state && state.playlists.length > 0) {
        const validIds = new Set<string>();

        for (const saved of state.playlists) {
          const playlist = new Playlist(saved.name, saved.id);
          for (const info of saved.songs) {
            if (info.source === 'youtube') {
              playlist.addLast(createSongFromYouTubeInfo(info));
              continue;
            }
            const key = info.fileId ?? info.id;
            const file = await this.storage.getFile(key);
            if (!file) continue;
            playlist.addLast(await createSongFromStored(file, info));
            validIds.add(key);
          }
          if (saved.currentSongId && playlist.getSong(saved.currentSongId)) playlist.select(saved.currentSongId);
          this.library.importPlaylist(playlist);
        }

        if (state.selectedPlaylistId && this.library.get(state.selectedPlaylistId)) {
          this.library.select(state.selectedPlaylistId);
        }
        this.player.setVolume(state.volume ?? DEFAULT_VOLUME);
        this.player.setMuted(state.muted ?? false);
        this.repeat = state.repeat ?? 'off';
        this.shuffle = state.shuffle ?? false;
        this.userName = state.userName ?? '';
        this.recent = state.recent ?? [];

        // Leave the last song ready (paused) in the player.
        const selected = this.library.selectedPlaylist;
        if (selected?.currentSong) {
          this.playingPlaylist = selected;
          void this.player.load(selected.currentSong, false);
          this.updateMediaSession(selected.currentSong);
        }
        void this.storage.pruneFiles(validIds);
      }
    } catch {
      // If something goes wrong we just start with an empty library.
    }

    this.ensureLikedPlaylist();
    if (this.normalPlaylists().length === 0) this.library.create(DEFAULT_PLAYLIST_NAME);
    this.isLoading = false;
    this.render();
    this.scheduleSave();
  }

  // ======================================================
  // Layout
  // ======================================================

  private layoutTemplate(): string {
    return `
      <div class="app">
        <aside class="sidebar">
          <button class="brand" data-action="go-home" aria-label="FeSoul, ir al inicio">
            ${vinylSvg(40)}
            <span class="brand__name">FeSoul</span>
          </button>
          <nav class="sidebar__main" aria-label="Principal">
            <button class="nav-item nav-item--home" id="home-link" data-action="go-home">
              <span class="nav-item__icon">${icons.home}</span>
              <span class="nav-item__name">Inicio</span>
            </button>
            <button class="nav-item nav-item--liked" id="liked-link" data-action="select-playlist" data-id="${LIKED_ID}">
              <span class="nav-item__icon">${icons.heartFilled}</span>
              <span class="nav-item__name">${LIKED_NAME}</span>
              <span class="nav-item__count">0</span>
            </button>
          </nav>
          <div class="sidebar__section">
            <div class="sidebar__heading">
              <h2>Tus playlists</h2>
              <button class="icon-btn" data-action="new-playlist" aria-label="Nueva playlist" title="Nueva playlist">${icons.plus}</button>
            </div>
            <ul class="playlist-nav" id="playlist-nav"></ul>
          </div>
          <details class="shortcuts">
            <summary>Atajos de teclado</summary>
            <dl>
              <dt>Espacio</dt><dd>Reproducir / pausar</dd>
              <dt>Shift + →</dt><dd>Siguiente</dd>
              <dt>Shift + ←</dt><dd>Anterior</dd>
              <dt>M</dt><dd>Silenciar</dd>
              <dt>Alt + ↑ / ↓</dt><dd>Mover canción</dd>
            </dl>
          </details>
        </aside>
        <main class="main" id="playlist-view"></main>
        <footer class="player-bar" id="player-bar"></footer>
        <aside class="video-dock" id="video-dock" aria-label="Video de YouTube">
          <div class="video-dock__frame" id="yt-frame"></div>
        </aside>
        <input type="file" id="file-input" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.opus" multiple hidden />
      </div>`;
  }

  private query<T extends HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Element ${selector} was not found`);
    return element;
  }
}

/** "Buenos días" / "Buenas tardes" / "Buenas noches" depending on the time. */
function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Lowercase and without accents, so "cancion" finds "Canción". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
