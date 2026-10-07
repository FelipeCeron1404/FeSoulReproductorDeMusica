import { createId, type Song, type SongSource } from '../models/Song';
import { readDuration, readTags } from './metadata';

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'webm'];
const UNKNOWN_ARTIST = 'Artista desconocido';

/** Metadata saved in the browser storage for each song. */
export interface SongInfo {
  id: string;
  /** Missing in data saved by older versions (they were all local). */
  source?: SongSource;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  fileName?: string;
  youtubeId?: string;
  fileId?: string;
  /** Only for YouTube songs (local covers are read again from the file). */
  coverUrl?: string;
}

/** Checks if the file is an audio file the browser can play. */
export function isAudioFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const looksLikeAudio = file.type.startsWith('audio/') || AUDIO_EXTENSIONS.includes(extension);
  if (!looksLikeAudio) return false;

  // If the browser knows the type, ask if it can play it.
  if (file.type) {
    return new Audio().canPlayType(file.type) !== '';
  }
  return true;
}

/** Creates a Song from a file chosen by the user. */
export async function createSongFromFile(file: File): Promise<Song> {
  const url = URL.createObjectURL(file);
  const [tags, duration] = await Promise.all([readTags(file), readDuration(url)]);
  const fromName = parseFileName(file.name);

  return {
    id: createId(),
    source: 'local',
    title: tags.title ?? fromName.title,
    artist: tags.artist ?? fromName.artist ?? UNKNOWN_ARTIST,
    album: tags.album,
    duration,
    url,
    coverUrl: tags.cover ? URL.createObjectURL(tags.cover) : undefined,
    fileName: file.name,
  };
}

/** Rebuilds a Song from a file that was saved in the browser storage. */
export async function createSongFromStored(file: Blob, info: SongInfo): Promise<Song> {
  const tags = await readTags(file);
  return {
    ...info,
    source: 'local',
    url: URL.createObjectURL(file),
    coverUrl: tags.cover ? URL.createObjectURL(tags.cover) : undefined,
  };
}

/** Rebuilds a YouTube song from the browser storage (it has no file). */
export function createSongFromYouTubeInfo(info: SongInfo): Song {
  return { ...info, source: 'youtube', url: '' };
}

/** Frees the memory used by the temporary URLs of a local song. */
export function releaseSong(song: Song): void {
  if (song.url.startsWith('blob:')) URL.revokeObjectURL(song.url);
  if (song.coverUrl?.startsWith('blob:')) URL.revokeObjectURL(song.coverUrl);
}

export function toSongInfo(song: Song): SongInfo {
  const { id, source, title, artist, album, duration, fileName, youtubeId, fileId } = song;
  const info: SongInfo = { id, source, title, artist, album, duration, fileName, youtubeId, fileId };
  if (source === 'youtube') info.coverUrl = song.coverUrl;
  return info;
}

/**
 * Gets a readable title from the file name.
 * "Artist - Title.mp3" -> { artist: "Artist", title: "Title" }
 */
function parseFileName(fileName: string): { title: string; artist?: string } {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = base.split(' - ');
  if (parts.length >= 2 && parts[0].trim() && parts.slice(1).join(' - ').trim()) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { title: base || fileName };
}
