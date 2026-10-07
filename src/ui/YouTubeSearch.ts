import { YouTubeError, type YouTubeResult, type YouTubeService } from '../api/youtube';
import { escapeHtml, formatTime } from '../utils/format';
import { icons } from './icons';

export type AddPosition = 'first' | 'last' | 'next';

/**
 * Dialog to search songs on YouTube and add them to the selected playlist.
 * It stays open so several songs can be added in a row.
 */
export class YouTubeSearch {
  private readonly dialog: HTMLDialogElement;
  private readonly service: YouTubeService;
  private readonly onAdd: (result: YouTubeResult, position: AddPosition) => void;
  private results: YouTubeResult[] = [];
  private lastQuery = '';

  constructor(
    parent: HTMLElement,
    service: YouTubeService,
    onAdd: (result: YouTubeResult, position: AddPosition) => void,
  ) {
    this.service = service;
    this.onAdd = onAdd;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'dialog dialog--wide yt-search';
    parent.append(this.dialog);

    this.dialog.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = this.dialog.querySelector<HTMLInputElement>('#yt-query');
      if (input) void this.search(input.value);
    });

    this.dialog.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target === this.dialog || target.closest('[data-yt-close]')) {
        this.dialog.close();
        return;
      }
      const button = target.closest<HTMLButtonElement>('[data-yt-add]');
      if (!button) return;
      const result = this.results[Number(button.dataset.index)];
      if (!result) return;
      this.onAdd(result, button.dataset.ytAdd as AddPosition);
      button.classList.add('is-added');
      button.textContent = '✓ Agregada';
    });
  }

  open(playlistName: string): void {
    this.dialog.innerHTML = `
      <div class="yt-search__body">
      <div class="yt-search__head">
        <div>
          <h2 class="dialog__title">${icons.youtube} Buscar en YouTube</h2>
          <p class="yt-search__target">Se agregarán a <strong>${escapeHtml(playlistName)}</strong></p>
        </div>
        <button class="icon-btn" data-yt-close aria-label="Cerrar">${icons.close}</button>
      </div>
      ${this.service.isConfigured ? this.formTemplate() : this.setupTemplate()}
      <div class="yt-search__results" id="yt-results" aria-live="polite"></div>
      </div>`;

    this.dialog.showModal();
    if (this.results.length) this.renderResults();
    this.dialog.querySelector<HTMLInputElement>('#yt-query')?.focus();
  }

  private formTemplate(): string {
    return `
      <form class="yt-search__form" role="search">
        <label class="search search--big">
          ${icons.search}
          <input id="yt-query" type="search" placeholder="Canción o artista" autocomplete="off"
                 value="${escapeHtml(this.lastQuery)}" aria-label="Buscar en YouTube" />
        </label>
        <button class="btn btn--primary" type="submit">Buscar</button>
      </form>`;
  }

  private setupTemplate(): string {
    return `
      <div class="yt-setup">
        <p>Para buscar en YouTube, FeSoul necesita una clave gratuita de la <strong>YouTube Data API v3</strong>:</p>
        <ol>
          <li>Entra a <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a> y crea un proyecto.</li>
          <li>Busca <em>YouTube Data API v3</em> y presiona <strong>Habilitar</strong>.</li>
          <li>Ve a <em>Credenciales → Crear credenciales → Clave de API</em> y cópiala.</li>
          <li>Pégala en el archivo <code>.env.local</code> del proyecto: <code>VITE_YOUTUBE_API_KEY=tu_clave</code> y reinicia <code>npm run dev</code>.</li>
        </ol>
      </div>`;
  }

  private async search(query: string): Promise<void> {
    const clean = query.trim();
    const box = this.dialog.querySelector<HTMLElement>('#yt-results');
    if (!clean || !box) return;
    this.lastQuery = clean;
    box.innerHTML = '<p class="yt-search__status">Buscando…</p>';

    try {
      this.results = await this.service.search(clean);
      this.renderResults();
    } catch (error) {
      this.results = [];
      const message = error instanceof YouTubeError ? error.message : 'Algo salió mal al buscar en YouTube.';
      box.innerHTML = `<p class="yt-search__status yt-search__status--error">${escapeHtml(message)}</p>`;
    }
  }

  private renderResults(): void {
    const box = this.dialog.querySelector<HTMLElement>('#yt-results');
    if (!box) return;
    if (this.results.length === 0) {
      box.innerHTML = `<p class="yt-search__status">No encontramos canciones para "${escapeHtml(this.lastQuery)}".</p>`;
      return;
    }
    box.innerHTML = `
      <ul class="yt-results">
        ${this.results
          .map(
            (result, index) => `
          <li class="yt-result">
            <img class="yt-result__thumb" src="${escapeHtml(result.thumbnail)}" alt="" loading="lazy" />
            <div class="yt-result__info">
              <p class="yt-result__title">${escapeHtml(result.title)}</p>
              <p class="yt-result__artist">${escapeHtml(result.artist)} · ${formatTime(result.duration)}</p>
            </div>
            <div class="yt-result__actions">
              <button class="btn btn--soft btn--small" data-yt-add="first" data-index="${index}">Al inicio</button>
              <button class="btn btn--soft btn--small" data-yt-add="next" data-index="${index}" title="Justo después de la canción que suena">A continuación</button>
              <button class="btn btn--primary btn--small" data-yt-add="last" data-index="${index}">Al final</button>
            </div>
          </li>`,
          )
          .join('')}
      </ul>`;
  }
}
