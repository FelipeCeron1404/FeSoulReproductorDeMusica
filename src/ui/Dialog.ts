import { escapeHtml } from '../utils/format';

interface NameDialogOptions {
  title: string;
  confirmLabel: string;
  initialValue?: string;
  /** Throws an error with a user-facing message if the value is not valid. */
  onSubmit: (value: string) => void;
}

interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel: string;
}

/**
 * Modal dialogs built on top of the native <dialog> element.
 * (We avoid prompt/confirm because they look different in every browser.)
 */
export class Dialog {
  private readonly dialog: HTMLDialogElement;

  constructor(parent: HTMLElement) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'dialog';
    parent.append(this.dialog);
  }

  /** Asks for a name. Resolves true when the value was accepted. */
  askName(options: NameDialogOptions): Promise<boolean> {
    this.dialog.innerHTML = `
      <form class="dialog__form" method="dialog" novalidate>
        <h2 class="dialog__title">${escapeHtml(options.title)}</h2>
        <label class="dialog__label" for="dialog-input">Nombre</label>
        <input id="dialog-input" class="dialog__input" type="text" maxlength="40"
               autocomplete="off" value="${escapeHtml(options.initialValue ?? '')}" />
        <p class="dialog__error" aria-live="assertive"></p>
        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
          <button type="submit" class="btn btn--primary">${escapeHtml(options.confirmLabel)}</button>
        </div>
      </form>`;

    const form = this.dialog.querySelector<HTMLFormElement>('form')!;
    const input = this.dialog.querySelector<HTMLInputElement>('input')!;
    const error = this.dialog.querySelector<HTMLParagraphElement>('.dialog__error')!;

    return new Promise((resolve) => {
      let accepted = false;

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        try {
          options.onSubmit(input.value);
          accepted = true;
          this.dialog.close();
        } catch (err) {
          error.textContent = err instanceof Error ? err.message : 'Nombre no válido.';
          input.focus();
        }
      });
      input.addEventListener('input', () => (error.textContent = ''));
      this.bindClose(() => resolve(accepted));

      this.dialog.showModal();
      input.select();
    });
  }

  /** Asks the user to confirm an action. */
  confirm(options: ConfirmDialogOptions): Promise<boolean> {
    this.dialog.innerHTML = `
      <form class="dialog__form" method="dialog">
        <h2 class="dialog__title">${escapeHtml(options.title)}</h2>
        <p class="dialog__message">${escapeHtml(options.message)}</p>
        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
          <button type="submit" class="btn btn--danger">${escapeHtml(options.confirmLabel)}</button>
        </div>
      </form>`;

    const form = this.dialog.querySelector<HTMLFormElement>('form')!;

    return new Promise((resolve) => {
      let accepted = false;
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        accepted = true;
        this.dialog.close();
      });
      this.bindClose(() => resolve(accepted));
      this.dialog.showModal();
    });
  }

  private bindClose(onClosed: () => void): void {
    this.dialog.querySelector('[data-close]')?.addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('close', onClosed, { once: true });
  }
}
