type ToastKind = 'info' | 'error';

interface ToastOptions {
  kind?: ToastKind;
  /** Optional button inside the toast, e.g. "Deshacer". */
  action?: { label: string; onClick: () => void };
  /** Called when the toast disappears without the action being used. */
  onExpire?: () => void;
  duration?: number;
}

/** Small notification that appears at the bottom and disappears by itself. */
export class Toast {
  private readonly container: HTMLElement;

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'toasts';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    parent.append(this.container);
  }

  show(message: string, options: ToastOptions | ToastKind = {}): void {
    const { kind = 'info', action, onExpire, duration = action ? 5000 : 3200 } =
      typeof options === 'string' ? { kind: options } : options;

    const toast = document.createElement('div');
    toast.className = `toast toast--${kind}`;

    const text = document.createElement('span');
    text.textContent = message;
    toast.append(text);

    let actionUsed = false;
    const hide = () => {
      if (toast.classList.contains('toast--leaving')) return;
      toast.classList.add('toast--leaving');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      window.setTimeout(() => toast.remove(), 400); // fallback when animations are off
      if (!actionUsed) onExpire?.();
    };

    if (action) {
      const button = document.createElement('button');
      button.className = 'toast__action';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        actionUsed = true;
        action.onClick();
        hide();
      });
      toast.append(button);
    }

    this.container.append(toast);
    window.setTimeout(hide, duration);
  }
}
