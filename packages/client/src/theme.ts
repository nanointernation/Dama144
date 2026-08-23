// Personalización de colores del tablero y las fichas.
// Los colores se guardan en localStorage y se aplican como CSS custom properties.

export interface ThemeColors {
  lightSquare: string;
  darkSquare: string;
  pieceB: string;
  pieceN: string;
  accent: string;
}

const STORAGE_KEY = 'dama144-theme';

export const DEFAULT_THEME: ThemeColors = {
  lightSquare: '#efe1c8',
  darkSquare: '#3b2a20',
  pieceB: '#f4ead9',
  pieceN: '#241e1a',
  accent: '#c99a53',
};

function applyTheme(theme: ThemeColors) {
  const root = document.documentElement.style;
  root.setProperty('--walnut-light', theme.lightSquare);
  root.setProperty('--walnut-dark', theme.darkSquare);
  root.setProperty('--piece-light', theme.pieceB);
  root.setProperty('--piece-dark', theme.pieceN);
  root.setProperty('--brass', theme.accent);
  root.setProperty('--brass-hi', lighten(theme.accent, 20));
}

function lighten(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor(((num >> 16) & 0xff) * (1 + percent / 100)));
  const g = Math.min(255, Math.floor(((num >> 8) & 0xff) * (1 + percent / 100)));
  const b = Math.min(255, Math.floor((num & 0xff) * (1 + percent / 100)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function loadTheme(): ThemeColors {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THEME };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_THEME, ...parsed };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function saveTheme(theme: ThemeColors) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // almacenamiento no disponible (modo privado, etc.): se ignora silenciosamente
  }
}

export function initTheme(): ThemeColors {
  const theme = loadTheme();
  applyTheme(theme);
  return theme;
}

export function updateTheme(theme: ThemeColors) {
  applyTheme(theme);
  saveTheme(theme);
}

export function resetTheme(): ThemeColors {
  const theme = { ...DEFAULT_THEME };
  applyTheme(theme);
  saveTheme(theme);
  return theme;
}
