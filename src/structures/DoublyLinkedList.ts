import { ListNode } from './ListNode';

/**
 * Generic doubly linked list.
 *
 * Methods that work with nodes (remove, move) keep the same node object,
 * so any external reference to a node (for example, the song that is
 * currently playing) stays valid after the list is reordered.
 */
export class DoublyLinkedList<T> {
  private head: ListNode<T> | null = null;
  private tail: ListNode<T> | null = null;
  private length = 0;

  // ---------- Read-only info ----------

  get size(): number {
    return this.length;
  }

  get first(): ListNode<T> | null {
    return this.head;
  }

  get last(): ListNode<T> | null {
    return this.tail;
  }

  isEmpty(): boolean {
    return this.length === 0;
  }

  // ---------- Add ----------

  /** Adds a value at the beginning of the list. */
  addFirst(value: T): ListNode<T> {
    const node = new ListNode(value);
    this.linkFirst(node);
    return node;
  }

  /** Adds a value at the end of the list. */
  addLast(value: T): ListNode<T> {
    const node = new ListNode(value);
    this.linkLast(node);
    return node;
  }

  /** Adds a value at the given position (0 = first, size = last). */
  addAt(index: number, value: T): ListNode<T> {
    this.assertInsertIndex(index);
    const node = new ListNode(value);
    this.linkAt(index, node);
    return node;
  }

  /** Adds a value right after an existing node ("play next"). */
  insertAfter(reference: ListNode<T>, value: T): ListNode<T> {
    this.assertBelongs(reference);
    const node = new ListNode(value);
    this.linkAfter(reference, node);
    return node;
  }

  // ---------- Remove ----------

  /** Removes the given node from the list and returns its value. */
  remove(node: ListNode<T>): T {
    this.assertBelongs(node);
    this.unlink(node);
    return node.value;
  }

  /** Removes the node at the given position and returns its value. */
  removeAt(index: number): T {
    return this.remove(this.getNodeAt(index));
  }

  /** Removes every node. */
  clear(): void {
    let current = this.head;
    while (current) {
      const next = current.next;
      current.prev = null;
      current.next = null;
      current = next;
    }
    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  // ---------- Move (used by drag and drop) ----------

  /**
   * Moves an existing node to a new position.
   * The node object is reused, it is not copied.
   */
  move(node: ListNode<T>, toIndex: number): void {
    this.assertBelongs(node);
    if (toIndex < 0 || toIndex >= this.length) {
      throw new RangeError(`Index ${toIndex} is out of range (0 - ${this.length - 1})`);
    }
    this.unlink(node);
    this.linkAt(toIndex, node);
  }

  /** Moves an existing node so it ends up right after `reference`. */
  moveAfter(node: ListNode<T>, reference: ListNode<T>): void {
    this.assertBelongs(node);
    this.assertBelongs(reference);
    if (node === reference || reference.next === node) return;
    this.unlink(node);
    this.linkAfter(reference, node);
  }

  // ---------- Reorder the whole list ----------

  /**
   * Reverses the list in place: every node swaps its prev and next
   * pointers, and head and tail are exchanged. O(n), no new nodes.
   */
  reverse(): void {
    let current = this.head;
    while (current) {
      const next = current.next;
      current.next = current.prev;
      current.prev = next;
      current = next;
    }
    [this.head, this.tail] = [this.tail, this.head];
  }

  /**
   * Sorts the list with merge sort, relinking the existing nodes
   * (no arrays, no copies). O(n log n) and stable.
   */
  sort(compare: (a: T, b: T) => number): void {
    if (this.length < 2) return;

    // Work only with "next" while sorting, then rebuild every "prev".
    this.head = mergeSort(this.head, compare);
    let previous: ListNode<T> | null = null;
    let current = this.head;
    while (current) {
      current.prev = previous;
      previous = current;
      current = current.next;
    }
    this.tail = previous;
  }

  // ---------- Search ----------

  /** Returns the node at the given position. */
  getNodeAt(index: number): ListNode<T> {
    if (index < 0 || index >= this.length) {
      throw new RangeError(`Index ${index} is out of range (0 - ${this.length - 1})`);
    }
    // Walk from the closest end: this is an advantage of a doubly linked list.
    if (index < this.length / 2) {
      let current = this.head!;
      for (let i = 0; i < index; i++) current = current.next!;
      return current;
    }
    let current = this.tail!;
    for (let i = this.length - 1; i > index; i--) current = current.prev!;
    return current;
  }

  /** Returns the position of a node, or -1 if it is not in the list. */
  indexOf(node: ListNode<T>): number {
    let index = 0;
    for (let current = this.head; current; current = current.next) {
      if (current === node) return index;
      index++;
    }
    return -1;
  }

  /** Returns the first node whose value matches the condition. */
  find(predicate: (value: T) => boolean): ListNode<T> | null {
    for (let current = this.head; current; current = current.next) {
      if (predicate(current.value)) return current;
    }
    return null;
  }

  contains(node: ListNode<T>): boolean {
    return this.indexOf(node) !== -1;
  }

  // ---------- Conversion ----------

  /** Values from first to last. */
  toArray(): T[] {
    return [...this];
  }

  /** Values from last to first (walks the list backwards using prev). */
  toArrayReversed(): T[] {
    const values: T[] = [];
    for (let current = this.tail; current; current = current.prev) {
      values.push(current.value);
    }
    return values;
  }

  *nodes(): IterableIterator<ListNode<T>> {
    for (let current = this.head; current; current = current.next) {
      yield current;
    }
  }

  *[Symbol.iterator](): IterableIterator<T> {
    for (const node of this.nodes()) yield node.value;
  }

  // ---------- Internal helpers ----------

  private linkFirst(node: ListNode<T>): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    else this.tail = node;
    this.head = node;
    this.length++;
  }

  private linkLast(node: ListNode<T>): void {
    node.next = null;
    node.prev = this.tail;
    if (this.tail) this.tail.next = node;
    else this.head = node;
    this.tail = node;
    this.length++;
  }

  /** Inserts the node so that it ends up at position `index`. */
  private linkAt(index: number, node: ListNode<T>): void {
    if (index === 0) return this.linkFirst(node);
    if (index === this.length) return this.linkLast(node);

    const after = this.getNodeAt(index);
    const before = after.prev!;

    node.prev = before;
    node.next = after;
    before.next = node;
    after.prev = node;
    this.length++;
  }

  private linkAfter(reference: ListNode<T>, node: ListNode<T>): void {
    if (reference === this.tail) return this.linkLast(node);
    const after = reference.next!;
    node.prev = reference;
    node.next = after;
    reference.next = node;
    after.prev = node;
    this.length++;
  }

  /** Disconnects the node from its neighbours without destroying it. */
  private unlink(node: ListNode<T>): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;

    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;

    node.prev = null;
    node.next = null;
    this.length--;
  }

  private assertInsertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index > this.length) {
      throw new RangeError(`Index ${index} is out of range (0 - ${this.length})`);
    }
  }

  private assertBelongs(node: ListNode<T>): void {
    if (!this.contains(node)) {
      throw new Error('The node does not belong to this list');
    }
  }
}

// ---------- Merge sort over "next" links ----------

function mergeSort<T>(head: ListNode<T> | null, compare: (a: T, b: T) => number): ListNode<T> | null {
  if (!head || !head.next) return head;

  // Find the middle with a slow and a fast pointer, then split.
  let slow: ListNode<T> = head;
  let fast: ListNode<T> | null = head.next;
  while (fast && fast.next) {
    slow = slow.next!;
    fast = fast.next.next;
  }
  const secondHalf = slow.next;
  slow.next = null;

  return merge(mergeSort(head, compare), mergeSort(secondHalf, compare), compare);
}

function merge<T>(
  a: ListNode<T> | null,
  b: ListNode<T> | null,
  compare: (a: T, b: T) => number,
): ListNode<T> | null {
  const start = { next: null } as { next: ListNode<T> | null };
  let tail = start as unknown as ListNode<T>;
  while (a && b) {
    if (compare(a.value, b.value) <= 0) {
      tail.next = a;
      a = a.next;
    } else {
      tail.next = b;
      b = b.next;
    }
    tail = tail.next!;
  }
  tail.next = a ?? b;
  return start.next;
}
