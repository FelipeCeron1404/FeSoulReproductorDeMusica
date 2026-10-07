const DRAG_THRESHOLD = 5;
const AUTO_SCROLL_ZONE = 60;
const AUTO_SCROLL_SPEED = 12;

interface DragSortOptions {
  /** Element that contains the song list (events are delegated to it). */
  container: HTMLElement;
  /** Element that scrolls when the pointer gets close to its edges. */
  scrollContainer: HTMLElement;
  /** Returns false when dragging must be disabled (e.g. while searching). */
  isEnabled: () => boolean;
  /** Called with the song id and the position where it was dropped. */
  onMove: (songId: string, toIndex: number) => void;
}

/**
 * Drag and drop to reorder songs. Built with pointer events so it works
 * with mouse, touch screens and pens.
 *  - Mouse: drag the whole row.
 *  - Touch: drag from the grip (so the list can still be scrolled).
 */
export class DragSort {
  private readonly options: DragSortOptions;

  private row: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private ghost: HTMLElement | null = null;
  private indicator: HTMLElement | null = null;
  private pointerId = -1;
  private startY = 0;
  private lastY = 0;
  private dragging = false;
  private targetIndex = -1;
  private scrollFrame = 0;

  constructor(options: DragSortOptions) {
    this.options = options;
    options.container.addEventListener('pointerdown', (event) => this.onPointerDown(event));
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.options.isEnabled()) return;

    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('.song-list > .song-row');
    if (!row || target.closest('.song-row__delete')) return;
    if (event.pointerType !== 'mouse' && !target.closest('.song-row__grip')) return;

    this.row = row;
    this.list = row.parentElement;
    this.pointerId = event.pointerId;
    this.startY = this.lastY = event.clientY;

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || !this.row) return;
    this.lastY = event.clientY;

    if (!this.dragging) {
      if (Math.abs(event.clientY - this.startY) < DRAG_THRESHOLD) return;
      this.startDrag();
    }
    event.preventDefault();
    this.updateDrag();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    const row = this.row;
    const wasDragging = this.dragging;
    const toIndex = this.targetIndex;
    const fromIndex = row && this.list ? [...this.list.children].indexOf(row) : -1;

    this.cleanup();

    if (wasDragging && row) {
      // The click that follows a drag must not play the song.
      window.addEventListener('click', stopClick, true);
      window.setTimeout(() => window.removeEventListener('click', stopClick, true), 0);
      if (toIndex !== -1 && toIndex !== fromIndex && row.dataset.id) {
        this.options.onMove(row.dataset.id, toIndex);
      }
    }
  };

  private readonly onPointerCancel = (): void => this.cleanup();

  private startDrag(): void {
    if (!this.row || !this.list) return;
    this.dragging = true;

    const rect = this.row.getBoundingClientRect();
    this.ghost = this.row.cloneNode(true) as HTMLElement;
    this.ghost.classList.add('drag-ghost');
    this.ghost.removeAttribute('data-id');
    Object.assign(this.ghost.style, {
      width: `${rect.width}px`,
      left: `${rect.left}px`,
      top: `${rect.top}px`,
    });
    document.body.append(this.ghost);

    this.indicator = document.createElement('li');
    this.indicator.className = 'drop-indicator';
    this.indicator.setAttribute('aria-hidden', 'true');
    this.list.append(this.indicator);

    this.row.classList.add('is-dragging');
    document.body.classList.add('is-sorting');
    this.autoScroll();
  }

  private updateDrag(): void {
    if (!this.row || !this.list || !this.ghost || !this.indicator) return;

    this.ghost.style.transform = `translateY(${this.lastY - this.startY}px)`;

    // Final position = how many of the OTHER rows are above the pointer.
    const others = [...this.list.querySelectorAll<HTMLElement>(':scope > .song-row')].filter(
      (element) => element !== this.row,
    );
    let index = 0;
    for (const element of others) {
      const rect = element.getBoundingClientRect();
      if (this.lastY > rect.top + rect.height / 2) index++;
    }
    this.targetIndex = index;

    // Draw the line where the song will be dropped.
    const listRect = this.list.getBoundingClientRect();
    const reference = others[index] ?? others[others.length - 1];
    let y: number;
    if (!reference) y = this.row.getBoundingClientRect().top;
    else if (others[index]) y = reference.getBoundingClientRect().top;
    else y = reference.getBoundingClientRect().bottom;
    this.indicator.style.top = `${y - listRect.top - 1}px`;
  }

  /** Scrolls the list while the pointer is near the top or bottom edge. */
  private autoScroll = (): void => {
    if (!this.dragging) return;
    const area = this.options.scrollContainer.getBoundingClientRect();
    if (this.lastY < area.top + AUTO_SCROLL_ZONE) {
      this.options.scrollContainer.scrollTop -= AUTO_SCROLL_SPEED;
      this.updateDrag();
    } else if (this.lastY > area.bottom - AUTO_SCROLL_ZONE) {
      this.options.scrollContainer.scrollTop += AUTO_SCROLL_SPEED;
      this.updateDrag();
    }
    this.scrollFrame = requestAnimationFrame(this.autoScroll);
  };

  private cleanup(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    cancelAnimationFrame(this.scrollFrame);

    this.ghost?.remove();
    this.indicator?.remove();
    this.row?.classList.remove('is-dragging');
    document.body.classList.remove('is-sorting');

    this.row = this.list = this.ghost = this.indicator = null;
    this.dragging = false;
    this.targetIndex = -1;
    this.pointerId = -1;
  }
}

function stopClick(event: Event): void {
  event.stopPropagation();
}
