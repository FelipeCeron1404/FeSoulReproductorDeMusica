/** Formats seconds as m:ss (e.g. 3:07). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/** Formats a long duration in words (e.g. "1 h 12 min", "8 min"). */
export function formatTotalDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 1) return seconds > 0 ? 'menos de 1 min' : '0 min';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** "1 canción" / "5 canciones" */
export function pluralizeSongs(count: number): string {
  return `${count} ${count === 1 ? 'canción' : 'canciones'}`;
}

/** Escapes text before inserting it into HTML (file names can contain anything). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
