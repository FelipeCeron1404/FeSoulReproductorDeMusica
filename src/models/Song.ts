/** Where the audio of a song comes from. */
export type SongSource = 'local' | 'youtube';

/**
 * A song of the player: a file from the user's computer or a YouTube video.
 */
export interface Song {
  /** Unique identifier, used to find the song inside a playlist. */
  id: string;
  source: SongSource;
  title: string;
  artist: string;
  album?: string;
  /** Duration in seconds (0 while it is still unknown). */
  duration: number;
  /** Local songs: temporary browser URL of the audio file. YouTube songs: empty. */
  url: string;
  /** Album cover (temporary URL for local files, thumbnail URL for YouTube). */
  coverUrl?: string;
  /** Local songs: original file name, e.g. "my-song.mp3". */
  fileName?: string;
  /** YouTube songs: id of the video. */
  youtubeId?: string;
  /**
   * Local songs: key of the stored audio file. Copies of a song (for
   * example in "Me gusta") share the same file instead of duplicating it.
   * When missing, the file is stored under the song id.
   */
  fileId?: string;
}

/** Key of the stored file of a local song. */
export function fileKey(song: Pick<Song, 'id' | 'fileId'>): string {
  return song.fileId ?? song.id;
}

/** Creates a unique id for a new song or playlist. */
export function createId(): string {
  return crypto.randomUUID();
}
