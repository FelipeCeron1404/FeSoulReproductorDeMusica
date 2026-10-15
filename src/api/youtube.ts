import { createId, type Song } from '../models/Song';

const API_URL = 'https://www.googleapis.com/youtube/v3';
const MUSIC_CATEGORY = '10';

export interface YouTubeResult {
  videoId: string;
  title: string;
  artist: string;
  duration: number;
  thumbnail: string;
}

/** Error with a message ready to show to the user (in Spanish). */
export class YouTubeError extends Error {}

/**
 * Searches music videos with the YouTube Data API v3.
 * A search costs 100 quota units and the free quota is 10,000 per day.
 */
export class YouTubeService {
  private readonly apiKey: string;

  constructor(apiKey: string | undefined) {
    this.apiKey = (apiKey ?? '').trim();
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async search(query: string): Promise<YouTubeResult[]> {
    if (!this.isConfigured) throw new YouTubeError('Falta la clave de la API de YouTube.');

    // Each search costs ~100 units of the free daily quota, so repeated queries are served from memory.
    const cacheKey = query.trim().toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const results = await this.fetchResults(query);
    this.cache.set(cacheKey, results);
    return results;
  }

  private readonly cache = new Map<string, YouTubeResult[]>();

  private async fetchResults(query: string): Promise<YouTubeResult[]> {

    const search = await this.get<SearchResponse>('search', {
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      videoCategoryId: MUSIC_CATEGORY,
      maxResults: '12',
      q: query,
    });

    const ids = search.items.map((item) => item.id.videoId).filter(Boolean);
    if (ids.length === 0) return [];

    // A second, cheap call (1 unit) gives us the durations.
    const details = await this.get<VideosResponse>('videos', { part: 'contentDetails', id: ids.join(',') });
    const durations = new Map(details.items.map((item) => [item.id, parseIsoDuration(item.contentDetails.duration)]));

    return search.items
      .filter((item) => durations.has(item.id.videoId))
      .map((item) => {
        const { title, artist } = cleanVideoTitle(decodeEntities(item.snippet.title), decodeEntities(item.snippet.channelTitle));
        const thumbs = item.snippet.thumbnails;
        return {
          videoId: item.id.videoId,
          title,
          artist,
          duration: durations.get(item.id.videoId) ?? 0,
          thumbnail: (thumbs.high ?? thumbs.medium ?? thumbs.default)?.url ?? '',
        };
      });
  }

  private async get<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API_URL}/${endpoint}`);
    Object.entries({ ...params, key: this.apiKey }).forEach(([key, value]) => url.searchParams.set(key, value));

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new YouTubeError('No hay conexión con YouTube. Revisa tu internet.');
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
      const reason = body?.error?.errors?.[0]?.reason ?? '';
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        throw new YouTubeError('Se acabaron las búsquedas de YouTube por hoy. Vuelve a intentarlo mañana.');
      }
      if (reason === 'keyInvalid' || response.status === 400) {
        throw new YouTubeError('La clave de la API de YouTube no es válida.');
      }
      if (response.status === 403) {
        throw new YouTubeError('YouTube rechazó la búsqueda. Revisa que la API esté habilitada y que la clave permita este sitio.');
      }
      throw new YouTubeError('YouTube no respondió. Intenta de nuevo en un momento.');
    }
    return (await response.json()) as T;
  }
}

/** Converts a search result into a Song of the player. */
export function songFromYouTube(result: YouTubeResult): Song {
  return {
    id: createId(),
    source: 'youtube',
    title: result.title,
    artist: result.artist,
    duration: result.duration,
    url: '',
    coverUrl: result.thumbnail || undefined,
    youtubeId: result.videoId,
  };
}

// ---------- Helpers (exported to be tested) ----------

/** "PT1H2M3S" -> 3723 */
export function parseIsoDuration(iso: string): number {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match.map((value) => Number(value ?? 0));
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

const NOISE = /\s*[([](?:official|oficial|video|audio|lyric|letra|visualizer|hd|4k|mv|en vivo|live)[^)\]]*[)\]]/gi;
const TRAILING_NOISE = /[\s,|-]*(?:video\s+)?(?:con\s+)?(?:letra|lyrics?|oficial|official|audio|video)(?:\s+(?:oficial|official|video))?\s*$/i;

/** Lowercase, without accents and symbols, to compare names. */
function simplify(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function cleanPart(text: string): string {
  let result = text.trim();
  // Remove "Video Letra", "Audio Oficial"... at the end (may appear more than once).
  for (let i = 0; i < 3 && TRAILING_NOISE.test(result); i++) result = result.replace(TRAILING_NOISE, '').trim();
  return result.replace(/[\s,|-]+$/, '').trim();
}

/**
 * Splits a video title into song and artist.
 *  "Artist - Song (Official Video)" -> { artist: "Artist", title: "Song" }
 *  "Song - Artist" (artist = channel name) -> { artist: "Artist", title: "Song" }
 * If there is no " - ", the channel name is used as the artist.
 */
export function cleanVideoTitle(rawTitle: string, channel: string): { title: string; artist: string } {
  const title = rawTitle.replace(NOISE, '').replace(/\s+/g, ' ').trim();
  const artistFromChannel = channel.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
  const channelKey = simplify(artistFromChannel);

  const separator = title.match(/\s[-–—|]\s/);
  if (separator?.index) {
    const left = cleanPart(title.slice(0, separator.index));
    const right = cleanPart(title.slice(separator.index + separator[0].length));
    if (left && right) {
      const rightKey = simplify(right);
      // Many Latin channels upload as "Song - Artist": if the right side is
      // the channel name, that side is the artist.
      const rightIsChannel = channelKey.length > 0 && (rightKey === channelKey || rightKey.includes(channelKey) || channelKey.includes(rightKey));
      return rightIsChannel ? { artist: right, title: left } : { artist: left, title: right };
    }
  }
  return { artist: artistFromChannel || 'YouTube', title: cleanPart(title) || rawTitle };
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

// ---------- API response shapes ----------

interface SearchResponse {
  items: {
    id: { videoId: string };
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails: Record<'default' | 'medium' | 'high', { url: string } | undefined>;
    };
  }[];
}

interface VideosResponse {
  items: { id: string; contentDetails: { duration: string } }[];
}

interface ApiErrorResponse {
  error?: { errors?: { reason?: string }[] };
}
