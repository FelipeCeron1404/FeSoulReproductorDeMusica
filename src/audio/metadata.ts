/**
 * Reads basic information from audio files without external libraries:
 * ID3v2 tags (title, artist, album, cover) and the duration.
 */

export interface AudioTags {
  title?: string;
  artist?: string;
  album?: string;
  cover?: Blob;
}

const HEADER_SIZE = 10;

/** Reads ID3v2.3 / ID3v2.4 tags (the ones used by most MP3 files). */
export async function readTags(file: Blob): Promise<AudioTags> {
  try {
    const header = new Uint8Array(await file.slice(0, HEADER_SIZE).arrayBuffer());
    const isId3 = header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33; // "ID3"
    const version = header[3];
    if (!isId3 || (version !== 3 && version !== 4)) return {};

    const flags = header[5];
    const tagSize = readSynchsafe(header, 6);
    const data = new Uint8Array(await file.slice(HEADER_SIZE, HEADER_SIZE + tagSize).arrayBuffer());

    let offset = 0;
    if (flags & 0x40) {
      // Extended header: skip it.
      offset += version === 4 ? readSynchsafe(data, 0) : readUint32(data, 0) + 4;
    }

    const tags: AudioTags = {};
    while (offset + HEADER_SIZE <= data.length) {
      const frameId = String.fromCharCode(...data.subarray(offset, offset + 4));
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break; // padding reached

      const frameSize = version === 4 ? readSynchsafe(data, offset + 4) : readUint32(data, offset + 4);
      const start = offset + HEADER_SIZE;
      const end = start + frameSize;
      if (frameSize <= 0 || end > data.length) break;

      const frame = data.subarray(start, end);
      if (frameId === 'TIT2') tags.title = decodeText(frame);
      else if (frameId === 'TPE1') tags.artist = decodeText(frame);
      else if (frameId === 'TALB') tags.album = decodeText(frame);
      else if (frameId === 'APIC' && !tags.cover) tags.cover = decodePicture(frame);

      offset = end;
    }
    return tags;
  } catch {
    // A broken tag must never stop the song from being added.
    return {};
  }
}

/** Gets the duration (in seconds) by loading only the file metadata. */
export function readDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const timeout = window.setTimeout(() => finish(0), 8000);

    function finish(seconds: number) {
      window.clearTimeout(timeout);
      audio.removeAttribute('src');
      resolve(Number.isFinite(seconds) ? seconds : 0);
    }

    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => finish(audio.duration), { once: true });
    audio.addEventListener('error', () => finish(0), { once: true });
    audio.src = url;
  });
}

// ---------- Helpers ----------

function readSynchsafe(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function decoderFor(encoding: number): TextDecoder {
  switch (encoding) {
    case 1:
      return new TextDecoder('utf-16'); // uses the BOM to detect endianness
    case 2:
      return new TextDecoder('utf-16be');
    case 3:
      return new TextDecoder('utf-8');
    default:
      return new TextDecoder('windows-1252');
  }
}

function decodeText(frame: Uint8Array): string | undefined {
  const text = decoderFor(frame[0]).decode(frame.subarray(1)).replace(/\0+$/g, '').split('\0')[0].trim();
  return text || undefined;
}

function decodePicture(frame: Uint8Array): Blob | undefined {
  const encoding = frame[0];
  let offset = 1;

  // MIME type, ends with a single 0 byte.
  const mimeEnd = frame.indexOf(0, offset);
  if (mimeEnd === -1) return undefined;
  const mime = new TextDecoder('windows-1252').decode(frame.subarray(offset, mimeEnd)) || 'image/jpeg';
  offset = mimeEnd + 1;

  offset += 1; // picture type

  // Description: ends with 0 (or 00 for UTF-16 encodings).
  if (encoding === 1 || encoding === 2) {
    while (offset + 1 < frame.length && !(frame[offset] === 0 && frame[offset + 1] === 0)) offset += 2;
    offset += 2;
  } else {
    while (offset < frame.length && frame[offset] !== 0) offset++;
    offset += 1;
  }

  if (offset >= frame.length) return undefined;
  const type = mime.includes('/') ? mime : `image/${mime.toLowerCase()}`;
  return new Blob([frame.slice(offset)], { type });
}
