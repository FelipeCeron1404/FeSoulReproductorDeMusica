/** Inline SVG icons (stroke based, inherit the current text color). */
const svg = (body: string, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>', 22),
  pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>', 22),
  next: svg('<path d="M5 5v14l10-7z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>'),
  previous: svg('<path d="M19 5v14L9 12z" fill="currentColor" stroke="none"/><path d="M5 5v14"/>'),
  volume: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>'),
  mute: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9 5 6M22 9l-5 6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  toStart: svg('<path d="M12 19V8M7 12l5-5 5 5M5 4h14"/>'),
  toEnd: svg('<path d="M12 5v11M7 12l5 5 5-5M5 20h14"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>', 18),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 18),
  grip: svg('<circle cx="9" cy="6" r="1.2" fill="currentColor"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/><circle cx="9" cy="18" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.2" fill="currentColor"/>', 18),
  playlist: svg('<path d="M4 6h12M4 12h12M4 18h7"/><circle cx="17" cy="17" r="3"/><path d="M20 17V6"/>', 18),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 18),
  shuffle: svg('<path d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6c1.1 1.7 2.3 2.7 4.3 2.7H21"/><path d="M3 17h3.5c1.4 0 2.4-.5 3.2-1.4M14.3 8.4c.8-.9 1.8-1.4 3.2-1.4H21"/><path d="m18 4 3 3-3 3M18 14l3 3-3 3"/>', 18),
  repeat: svg('<path d="M17 3l3 3-3 3"/><path d="M4 12V9a3 3 0 0 1 3-3h13"/><path d="M7 21l-3-3 3-3"/><path d="M20 12v3a3 3 0 0 1-3 3H4"/>', 18),
  repeatOne: svg('<path d="M17 3l3 3-3 3"/><path d="M4 12V9a3 3 0 0 1 3-3h13"/><path d="M7 21l-3-3 3-3"/><path d="M20 12v3a3 3 0 0 1-3 3H4"/><path d="M11 10.5l1.5-1V15" stroke-width="1.8"/>', 18),
  youtube: svg('<rect x="2.5" y="5" width="19" height="14" rx="4" fill="#ff3b3b" stroke="none"/><path d="M10 9v6l5-3z" fill="#fff" stroke="none"/>', 22),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  home: svg('<path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4z"/>', 18),
  heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>', 18),
  heartFilled: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor"/>', 18),
  playNext: svg('<path d="M4 6h10M4 11h10M4 16h6"/><path d="M15 14v6l5-3z" fill="currentColor"/>', 18),
  reverse: svg('<path d="M7 4v16M7 20l-3-3M7 20l3-3"/><path d="M17 20V4M17 4l-3 3M17 4l3 3"/>', 18),
  nodes: svg('<rect x="2" y="9" width="6" height="6" rx="1.5"/><rect x="16" y="9" width="6" height="6" rx="1.5"/><path d="M8 11h8M14 9.5l2 1.5M8 13h8M10 14.5 8 13"/>', 18),
  linkArrows: svg('<path d="M3 9h16M15 5l4 4"/><path d="M21 15H5M9 19l-4-4"/>', 22),
  music: svg('<circle cx="7" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M10 18V6l11-2v12"/>', 40),
};
