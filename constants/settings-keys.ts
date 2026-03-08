/** Database keys for the settings table. Use these instead of raw strings to prevent typos. */
export const SETTINGS_KEYS = {
  roundingUnit: 'rounding_unit',
  roundingDirection: 'rounding_direction',
  theme: 'theme',
  userName: 'user_name',
} as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];
