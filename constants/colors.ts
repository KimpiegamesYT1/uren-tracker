export type Palette = {
  bg: string;
  surface: string;
  surfaceElevated: string;
  surfaceHighlight: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  accent: string;
  accentLight: string;
  accentSecondary: string;
  accentSecondaryDark: string;
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
  // Backgrounds
  bg: '#0E141B',
  surface: '#151D26',
  surfaceElevated: '#1B2430',
  surfaceHighlight: '#243142',

  // Text
  textPrimary: '#EAF1F7',
  textSecondary: '#A9B6C4',
  textDisabled: '#6F8193',

  // Accents
  accent: '#35C98A',
  accentLight: '#64D9A7',
  accentSecondary: '#4F8CFF',
  accentSecondaryDark: '#3D6FCB',

  // Semantic
  error: '#E56A78',
  warning: '#D4A24C',
  info: '#5DA9E9',
  success: '#35C98A',

  // UI elements
  border: '#283545',
  borderLight: '#34465A',
  tabBarBg: '#121922',
  tabBarBorder: '#223041',

  // Status pill colors
  statusUnpaid: '#E56A78',
  statusPartial: '#D4A24C',
  statusPaid: '#35C98A',
};

export const LightColors: Palette = {
  bg: '#F5F8FC',
  surface: '#FFFFFF',
  surfaceElevated: '#EEF3F9',
  surfaceHighlight: '#E3EBF5',
  textPrimary: '#1D2B3A',
  textSecondary: '#4A5D73',
  textDisabled: '#8FA1B4',
  accent: '#1FA56D',
  accentLight: '#6EC7A2',
  accentSecondary: '#2F74F6',
  accentSecondaryDark: '#295FC8',
  error: '#D6455D',
  warning: '#B9852A',
  info: '#2F8ED6',
  success: '#1FA56D',
  border: '#D6E0EC',
  borderLight: '#C8D5E4',
  tabBarBg: '#F8FBFF',
  tabBarBorder: '#D6E0EC',
  statusUnpaid: '#D6455D',
  statusPartial: '#B9852A',
  statusPaid: '#1FA56D',
};

// Default export kept for existing imports.
export const Colors = DarkColors;

export type ColorKey = keyof typeof DarkColors;

export type UiTheme = 'dark' | 'light';

export const DARK_COMPANY_COLOR_PRESETS = [
  '#8AB4F8', // blue
  '#F28B82', // red
  '#FDD663', // yellow
  '#81C995', // green
  '#78D9EC', // cyan
  '#C58AF9', // purple
  '#FFB86C', // orange
  '#E8A4D5', // pink
  '#B0BEC5', // slate
];

export const LIGHT_COMPANY_COLOR_PRESETS = [
  '#1A73E8', // blue
  '#D93025', // red
  '#F9AB00', // yellow
  '#188038', // green
  '#0097A7', // cyan
  '#9334E6', // purple
  '#EF6C00', // orange
  '#C2185B', // pink
  '#546E7A', // slate
];

export function getCompanyColorPresets(theme: UiTheme): string[] {
  return theme === 'dark' ? DARK_COMPANY_COLOR_PRESETS : LIGHT_COMPANY_COLOR_PRESETS;
}

export function getCompanyDisplayColor(color: string, theme: UiTheme): string {
  const darkIdx = DARK_COMPANY_COLOR_PRESETS.indexOf(color);
  if (darkIdx >= 0) {
    return theme === 'dark' ? DARK_COMPANY_COLOR_PRESETS[darkIdx] : LIGHT_COMPANY_COLOR_PRESETS[darkIdx];
  }

  const lightIdx = LIGHT_COMPANY_COLOR_PRESETS.indexOf(color);
  if (lightIdx >= 0) {
    return theme === 'dark' ? DARK_COMPANY_COLOR_PRESETS[lightIdx] : LIGHT_COMPANY_COLOR_PRESETS[lightIdx];
  }

  return color;
}

/** Formats a number as Euro currency string */
export function formatEuro(amount: number): string {
  return `€\u00A0${amount.toFixed(2).replace('.', ',')}`;
}
