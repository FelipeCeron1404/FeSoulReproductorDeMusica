import { escapeHtml } from '../utils/format';

/**
 * FeSoul logo: a vinyl record with a peach label and an "F".
 * The same drawing is used in the header and as the spinning disc.
 */
export function vinylSvg(size: number, withLetter = true): string {
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="48" fill="var(--vinyl)"/>
    <circle cx="50" cy="50" r="40" fill="none" stroke="var(--vinyl-groove)" stroke-width="1.2"/>
    <circle cx="50" cy="50" r="33" fill="none" stroke="var(--vinyl-groove)" stroke-width="1.2"/>
    <circle cx="50" cy="50" r="26" fill="none" stroke="var(--vinyl-groove)" stroke-width="1.2"/>
    <path d="M22 30 A34 34 0 0 1 44 17" fill="none" stroke="var(--vinyl-shine)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="18" fill="var(--peach)"/>
    ${withLetter ? '<path d="M45 60V40h11M45 50h8" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' : '<circle cx="50" cy="50" r="3" fill="var(--bg)"/>'}
  </svg>`;
}

/** Vinyl record whose center label shows the album cover (if there is one). */
export function vinylWithCover(size: number, coverUrl?: string): string {
  const label = coverUrl
    ? `<img class="vinyl__cover" src="${escapeHtml(coverUrl)}" alt="" />`
    : '';
  return `<span class="vinyl" style="--size:${size}px">${vinylSvg(size, false)}${label}</span>`;
}
