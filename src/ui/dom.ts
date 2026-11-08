/** Tiny DOM helpers used by the UI layer. */

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const clear = (node: HTMLElement): void => {
  while (node.firstChild) node.removeChild(node.firstChild);
};

export const setPressed = (button: HTMLButtonElement, pressed: boolean): void => {
  button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  button.classList.toggle('is-active', pressed);
};

export const formatNumber = (value: number, digits = 0): string =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const formatClock = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
};

export const setText = (node: Element | null | undefined, text: string): void => {
  if (node) node.textContent = text;
};

export const createIcon = (path: string, viewBox = '0 0 24 24'): SVGSVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shape.setAttribute('d', path);
  shape.setAttribute('fill', 'none');
  shape.setAttribute('stroke', 'currentColor');
  shape.setAttribute('stroke-width', '1.8');
  shape.setAttribute('stroke-linecap', 'round');
  shape.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(shape);
  return svg;
};

export const ICONS = {
  pause: 'M8 5v14M16 5v14',
  play: 'M8 5l11 7-11 7V5z',
  sound: 'M4 9v6h4l5 4V5L8 9H4zm12.5-2a6 6 0 0 1 0 10M19 4a9.5 9.5 0 0 1 0 16',
  muted: 'M4 9v6h4l5 4V5L8 9H4zm12 1l5 5m0-5l-5 5',
  vibrate: 'M7 4h10v16H7zM10 17h4M3 8v8M21 8v8',
  language: 'M4 5h9M8.5 5c0 5-2 9-4.5 11M6 9c1.8 3.2 4 5.4 6.5 6.5M13 19l4-11 4 11M14.5 15h5',
  credits: 'M12 3l2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9L12 3z',
  close: 'M6 6l12 12M18 6L6 18',
  fire: 'M12 3v5m0 8v5M5 12H3m18 0h-2M7.5 7.5L6 6m12 12l-1.5-1.5m0-9L18 6M6 18l1.5-1.5M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  mine: 'M12 3l7 4v10l-7 4-7-4V7l7-4zm0 5l3 1.7v4.6L12 16l-3-1.7V9.7L12 8z',
  boost: 'M5 19l6-14 2 6 6-4-3 7 3 1-8 4-2-4-4 4z',
  target: 'M12 3v4m0 10v4M3 12h4m10 0h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zm6-3v15m6-12v15',
  ship: 'M12 3l7 6v7l-7 5-7-5V9l7-6zM9 12h6',
  wrench: 'M14.5 4a4.5 4.5 0 0 0-3.9 6.7L4 17.3V20h2.7l6.6-6.6A4.5 4.5 0 1 0 14.5 4z',
  colony: 'M3 20h18M5 20V11l7-5 7 5v9M9 20v-5h6v5',
  market: 'M4 6h16l-1.5 9h-13L4 6zm3 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm10 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 3v2.2M12 18.8V21M4.6 7.4l1.9 1.1M17.5 15.5l1.9 1.1M4.6 16.6l1.9-1.1M17.5 8.5l1.9-1.1',
  arrow: 'M5 12h14m-6-6l6 6-6 6',
  shield: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4V8zm0 0l8 4 8-4M12 12v8',
  scanner: 'M12 12a1.5 1.5 0 1 0 0 3M12 8a4 4 0 0 1 4 4M12 4a8 8 0 0 1 8 8M4 20l4-4',
  codex: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4zm3 0v16m4-11h4m-4 4h4',
  chevron: 'M8 10l4 4 4-4',
  warp: 'M5 19L19 5M9 5h10v10',
} as const;
