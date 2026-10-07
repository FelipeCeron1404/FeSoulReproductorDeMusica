import { DoublyLinkedList } from '../structures/DoublyLinkedList';
import type { ListNode } from '../structures/ListNode';
import { createId, type Song } from './Song';

/**
 * A playlist stores its songs in a doubly linked list and keeps a
 * reference to the node that is currently selected (playing).
 */
export class Playlist {
  readonly id: string;
  name: string;
  private readonly songs = new DoublyLinkedList<Song>();
  private current: ListNode<Song> | null = null;

  constructor(name: string, id: string = createId()) {
    this.id = id;
    this.name = name;
  }

  // ---------- Read-only info ----------

  get size(): number {
    return this.songs.size;
  }

  get isEmpty(): boolean {
    return this.songs.isEmpty();
  }

  /** Song that is currently selected, or null. */
  get currentSong(): Song | null {
    return this.current?.value ?? null;
  }

  /** Position of the current song, or -1 if none is selected. */
  get currentIndex(): number {
    return this.current ? this.songs.indexOf(this.current) : -1;
  }

  /** Total duration of the playlist in seconds. */
  get totalDuration(): number {
    let total = 0;
    for (const song of this.songs) total += song.duration;
    return total;
  }

  /** Songs in order, ready to be drawn on screen. */
  getSongs(): Song[] {
    return this.songs.toArray();
  }

  getSong(songId: string): Song | null {
    return this.findNode(songId)?.value ?? null;
  }

  hasNext(): boolean {
    return this.current?.next != null;
  }

  hasPrevious(): boolean {
    return this.current?.prev != null;
  }

  /** Song that next() would select, without moving (uses current.next). */
  peekNext(wrap = false): Song | null {
    if (!this.current) return null;
    return (this.current.next ?? (wrap ? this.songs.first : null))?.value ?? null;
  }

  /** Song that previous() would select, without moving (uses current.prev). */
  peekPrevious(wrap = false): Song | null {
    if (!this.current) return null;
    return (this.current.prev ?? (wrap ? this.songs.last : null))?.value ?? null;
  }

  // ---------- Add ----------

  addFirst(song: Song): void {
    this.songs.addFirst(song);
  }

  addLast(song: Song): void {
    this.songs.addLast(song);
  }

  addAt(index: number, song: Song): void {
    this.songs.addAt(index, song);
  }

  /**
   * "Play next": puts a new song right after the current one
   * (or at the end if nothing is selected).
   */
  addAfterCurrent(song: Song): void {
    if (this.current) this.songs.insertAfter(this.current, song);
    else this.songs.addLast(song);
  }

  // ---------- Remove ----------

  /**
   * Removes a song. If it was the current one, the selection moves to
   * the next song (or to the previous one if it was the last).
   * Returns true when the current song changed, so the player can react.
   */
  removeSong(songId: string): boolean {
    const node = this.requireNode(songId);
    const wasCurrent = node === this.current;

    if (wasCurrent) {
      this.current = node.next ?? node.prev;
    }
    this.songs.remove(node);
    return wasCurrent;
  }

  // ---------- Reorder (drag and drop) ----------

  /**
   * Moves a song to a new position. The current song keeps pointing to
   * the same node, so "next" always follows the new order.
   */
  moveSong(songId: string, toIndex: number): void {
    this.songs.move(this.requireNode(songId), toIndex);
  }

  /**
   * "Play next" for a song that is already in the playlist: moves its
   * node right after the current one. Returns false if it cannot.
   */
  playNext(songId: string): boolean {
    const node = this.requireNode(songId);
    if (!this.current || node === this.current) return false;
    this.songs.moveAfter(node, this.current);
    return true;
  }

  /** Reverses the order of the playlist (swaps prev/next in every node). */
  reverse(): void {
    this.songs.reverse();
  }

  /** Sorts the playlist (merge sort over the linked nodes). */
  sortBy(compare: (a: Song, b: Song) => number): void {
    this.songs.sort(compare);
  }

  /** Ids in the current order (used to undo a sort). */
  getOrder(): string[] {
    return this.getSongs().map((song) => song.id);
  }

  /** Puts the songs back in a saved order. */
  restoreOrder(ids: string[]): void {
    ids.forEach((id, index) => {
      const node = this.findNode(id);
      if (node && index < this.songs.size) this.songs.move(node, index);
    });
  }

  /**
   * Describes every node exactly as it is linked in memory
   * (used by the "doubly linked list" view).
   */
  describeNodes(): { song: Song; prev: Song | null; next: Song | null; isCurrent: boolean }[] {
    return [...this.songs.nodes()].map((node) => ({
      song: node.value,
      prev: node.prev?.value ?? null,
      next: node.next?.value ?? null,
      isCurrent: node === this.current,
    }));
  }

  // ---------- Navigation ----------

  /** Selects a specific song. */
  select(songId: string): Song {
    this.current = this.requireNode(songId);
    return this.current.value;
  }

  /** Selects the first song if nothing is selected yet. */
  selectFirstIfNone(): Song | null {
    if (!this.current) this.current = this.songs.first;
    return this.currentSong;
  }

  /**
   * Moves forward to the next song (current.next).
   * With `wrap`, after the last song it goes back to the first one.
   * Returns null when there is no next song.
   */
  next(wrap = false): Song | null {
    if (!this.current) return this.selectFirstIfNone();

    const target = this.current.next ?? (wrap ? this.songs.first : null);
    if (!target) return null;

    this.current = target;
    return target.value;
  }

  /**
   * Moves back to the previous song (current.prev).
   * With `wrap`, before the first song it jumps to the last one.
   */
  previous(wrap = false): Song | null {
    if (!this.current) return this.selectFirstIfNone();

    const target = this.current.prev ?? (wrap ? this.songs.last : null);
    if (!target) return null;

    this.current = target;
    return target.value;
  }

  // ---------- Helpers ----------

  private findNode(songId: string): ListNode<Song> | null {
    return this.songs.find((song) => song.id === songId);
  }

  private requireNode(songId: string): ListNode<Song> {
    const node = this.findNode(songId);
    if (!node) throw new Error(`Song ${songId} was not found in playlist "${this.name}"`);
    return node;
  }
}
