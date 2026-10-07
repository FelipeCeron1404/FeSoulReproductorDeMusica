import { DoublyLinkedList } from '../structures/DoublyLinkedList';
import type { ListNode } from '../structures/ListNode';
import { Playlist } from './Playlist';

const MAX_NAME_LENGTH = 40;

/**
 * Error with a message meant to be shown to the user (in Spanish).
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

/**
 * Holds every playlist of the user.
 * The playlists themselves are also stored in a doubly linked list.
 */
export class PlaylistLibrary {
  private readonly playlists = new DoublyLinkedList<Playlist>();
  private selected: ListNode<Playlist> | null = null;

  // ---------- Read-only info ----------

  get size(): number {
    return this.playlists.size;
  }

  /** Playlist the user is currently viewing. */
  get selectedPlaylist(): Playlist | null {
    return this.selected?.value ?? null;
  }

  getAll(): Playlist[] {
    return this.playlists.toArray();
  }

  get(playlistId: string): Playlist | null {
    return this.findNode(playlistId)?.value ?? null;
  }

  // ---------- Create / rename / delete ----------

  /** Creates a new playlist at the end and selects it. */
  create(name: string): Playlist {
    const cleanName = this.validateName(name);
    const node = this.playlists.addLast(new Playlist(cleanName));
    this.selected = node;
    return node.value;
  }

  /**
   * Adds an already built playlist (used when restoring saved data).
   * It does not change the selection unless nothing is selected.
   */
  importPlaylist(playlist: Playlist): void {
    const node = this.playlists.addLast(playlist);
    if (!this.selected) this.selected = node;
  }

  rename(playlistId: string, newName: string): void {
    const playlist = this.requireNode(playlistId).value;
    playlist.name = this.validateName(newName, playlistId);
  }

  /**
   * Deletes a playlist. If it was selected, the selection moves to the
   * next playlist (or the previous one if it was the last).
   */
  remove(playlistId: string): Playlist {
    const node = this.requireNode(playlistId);
    if (node === this.selected) {
      this.selected = node.next ?? node.prev;
    }
    return this.playlists.remove(node);
  }

  // ---------- Selection ----------

  select(playlistId: string): Playlist {
    this.selected = this.requireNode(playlistId);
    return this.selected.value;
  }

  // ---------- Helpers ----------

  /**
   * Trims the name and checks that it is not empty, not too long and
   * not repeated. `ignoreId` lets a playlist keep its own name on rename.
   */
  private validateName(name: string, ignoreId?: string): string {
    const cleanName = name.trim().replace(/\s+/g, ' ');

    if (!cleanName) {
      throw new UserFacingError('El nombre de la playlist no puede estar vacío.');
    }
    if (cleanName.length > MAX_NAME_LENGTH) {
      throw new UserFacingError(`El nombre no puede tener más de ${MAX_NAME_LENGTH} caracteres.`);
    }

    const duplicate = this.playlists.find(
      (playlist) =>
        playlist.id !== ignoreId && playlist.name.toLowerCase() === cleanName.toLowerCase(),
    );
    if (duplicate) {
      throw new UserFacingError(`Ya existe una playlist llamada "${duplicate.value.name}".`);
    }

    return cleanName;
  }

  private findNode(playlistId: string): ListNode<Playlist> | null {
    return this.playlists.find((playlist) => playlist.id === playlistId);
  }

  private requireNode(playlistId: string): ListNode<Playlist> {
    const node = this.findNode(playlistId);
    if (!node) throw new Error(`Playlist ${playlistId} was not found`);
    return node;
  }
}
