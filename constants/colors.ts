export type UiTheme = 'dark' | 'light';

// Primitive design tokens. Keep these values minimal and reusable.
export const palette = {
  grey900: '#121212',
  grey800: '#1D1D1D',
  grey700: '#272727',
  white: '#FFFFFF',
  white87: 'rgba(255,255,255,0.87)',
  white60: 'rgba(255,255,255,0.60)',
  white38: 'rgba(255,255,255,0.38)',
  green200: '#A5D6A7',
  green100: '#C8E6C9',
  blue200: '#90CAF9',
  blue300: '#64B5F6',
  infoBlue200: '#81D4FA',
  warningOrange300: '#FFB74D',
  errorRed: '#CF6679',

  slate900: '#1D2B3A',
  slate700: '#4A5D73',
  slate500: '#8FA1B4',
  appBgLight: '#F5F8FC',
  appSurfaceLight: '#FFFFFF',
  appSurfaceElevatedLight: '#EEF3F9',
  appSurfaceHighlightLight: '#E3EBF5',
  green600: '#1FA56D',
  green400: '#6EC7A2',
  blue600: '#2F74F6',
  blue700: '#295FC8',
  errorRedLight: '#D6455D',
  warningOrange700: '#B9852A',
  infoBlue600: '#2F8ED6',
  borderLight: '#D6E0EC',
  borderLightStrong: '#C8D5E4',
  tabBarLight: '#F8FBFF',

  darkBorder: 'rgba(255,255,255,0.12)',
  darkBorderStrong: 'rgba(255,255,255,0.16)',
} as const;

export type Palette = {
  bg: string;
  surface: string;
  surfaceElevated: string;
  surfaceHighlight: string;
  scrimSoft: string;
  scrim: string;
  scrimStrong: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  accent: string;
  accentLight: string;
  accentSecondary: string;
  accentSecondaryDark: string;
  onAccent: string;
  error: string;
  warning: string;
  info: string;
  success: string;
  border: string;
  borderLight: string;
  tabBarBg: string;
  tabBarBorder: string;
  statusUnpaid: string;
  statusPartial: string;
  statusPaid: string;
};

export const DarkColors: Palette = {
  bg: palette.grey900,
  surface: palette.grey800,
  surfaceElevated: palette.grey700,
  surfaceHighlight: '#313131',
  scrimSoft: 'rgba(0,0,0,0.35)',
  scrim: 'rgba(0,0,0,0.55)',
  scrimStrong: 'rgba(0,0,0,0.75)',
  textPrimary: palette.white87,
  textSecondary: palette.white60,
  textDisabled: palette.white38,
  accent: palette.green200,
  accentLight: palette.green100,
  accentSecondary: palette.blue200,
  accentSecondaryDark: palette.blue300,
  onAccent: palette.grey900,
  error: palette.errorRed,
  warning: palette.warningOrange300,
  info: palette.infoBlue200,
  success: palette.green200,
  border: palette.darkBorder,
  borderLight: palette.darkBorderStrong,
  tabBarBg: palette.grey900,
  tabBarBorder: palette.darkBorder,
  statusUnpaid: palette.errorRed,
  statusPartial: palette.warningOrange300,
  statusPaid: palette.green200,
};

export const LightColors: Palette = {
  bg: palette.appBgLight,
  surface: palette.appSurfaceLight,
  surfaceElevated: palette.appSurfaceElevatedLight,
  surfaceHighlight: palette.appSurfaceHighlightLight,
  scrimSoft: 'rgba(17,24,28,0.20)',
  scrim: 'rgba(17,24,28,0.38)',
  scrimStrong: 'rgba(17,24,28,0.55)',
  textPrimary: palette.slate900,
  textSecondary: palette.slate700,
  textDisabled: palette.slate500,
  accent: palette.green600,
  accentLight: palette.green400,
  accentSecondary: palette.blue600,
  accentSecondaryDark: palette.blue700,
  onAccent: palette.white,
  error: palette.errorRedLight,
  warning: palette.warningOrange700,
  info: palette.infoBlue600,
  success: palette.green600,
  border: palette.borderLight,
  borderLight: palette.borderLightStrong,
  tabBarBg: palette.tabBarLight,
  tabBarBorder: palette.borderLight,
  statusUnpaid: palette.errorRedLight,
  statusPartial: palette.warningOrange700,
  statusPaid: palette.green600,
};

// Theme map for semantic usage: ThemeColors[theme]
export const ThemeColors: Record<UiTheme, Palette> = {
  light: LightColors,
  dark: DarkColors,
};

// Backward compatibility for existing imports that expect a flat palette object.
export const Colors: Palette = DarkColors;

export type ColorKey = keyof typeof DarkColors;

export const DARK_COMPANY_COLOR_PRESETS = [
  '#8AB4F8',
  '#F28B82',
  '#FDD663',
  '#81C995',
  '#78D9EC',
  '#C58AF9',
  '#FFB86C',
  '#E8A4D5',
  '#B0BEC5',
];

export const LIGHT_COMPANY_COLOR_PRESETS = [
  '#1A73E8',
  '#D93025',
  '#F9AB00',
  '#188038',
  '#0097A7',
  '#9334E6',
  '#EF6C00',
  '#C2185B',
  '#546E7A',
];

export function getCompanyColorPresets(theme: UiTheme): string[] {
  return theme === 'dark' ? DARK_COMPANY_COLOR_PRESETS : LIGHT_COMPANY_COLOR_PRESETS;
}

export function getCompanyDisplayColor(color: string, theme: UiTheme): string {
  const darkIdx = DARK_COMPANY_COLOR_PRESETS.indexOf(color);
  if (darkIdx >= 0) return theme === 'dark' ? DARK_COMPANY_COLOR_PRESETS[darkIdx] : LIGHT_COMPANY_COLOR_PRESETS[darkIdx];

  const lightIdx = LIGHT_COMPANY_COLOR_PRESETS.indexOf(color);
  if (lightIdx >= 0) return theme === 'dark' ? DARK_COMPANY_COLOR_PRESETS[lightIdx] : LIGHT_COMPANY_COLOR_PRESETS[lightIdx];

  return color;
}

/** Formats a number as Euro currency string */
export function formatEuro(amount: number): string {
  return `€\u00A0${amount.toFixed(2).replace('.', ',')}`;
}

/**
 * Returns elevated dark surface tones based on Material-style white overlays.
 * Use when you need extra elevation levels beyond surface/surfaceElevated/surfaceHighlight.
 */
export function darkSurfaceAtOverlay(alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  const channel = Math.round(18 + (255 - 18) * clamped);
  const hex = channel.toString(16).padStart(2, '0').toUpperCase();
  return `#${hex}${hex}${hex}`;
}