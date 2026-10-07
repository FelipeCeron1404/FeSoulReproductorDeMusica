/**
 * A single node of a doubly linked list.
 * Each node knows the node before it (prev) and the node after it (next).
 */
export class ListNode<T> {
  value: T;
  prev: ListNode<T> | null = null;
  next: ListNode<T> | null = null;

  constructor(value: T) {
    this.value = value;
  }
}
