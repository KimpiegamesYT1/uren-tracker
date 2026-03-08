import { create } from 'zustand';
import { getAllCompanies } from '../db/companies';
import { calculateBalance } from '../db/payments';
import { getSetting, setSetting } from '../db/settings';
import { Company } from '../db/schema';
import { RoundingUnit, RoundingDirection } from '../utils/rounding';
import { SETTINGS_KEYS } from '../constants/settings-keys';

export type AppTheme = 'dark' | 'light' | 'system';

export type AppSettings = {
  roundingUnit: RoundingUnit;
  roundingDirection: RoundingDirection;
  theme: AppTheme;
  userName: string;
};

type AppState = {
  balance: number;
  companies: Company[];
  settings: AppSettings;

  // Actions
  refreshBalance: () => void;
  loadCompanies: () => void;
  loadSettings: () => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
};

export const useAppStore = create<AppState>((set, get) => ({
  balance: 0,
  companies: [],
  settings: {
    roundingUnit: 1,
    roundingDirection: 'round',
    theme: 'dark',
    userName: '',
  },

  refreshBalance: () => {
    const balance = calculateBalance();
    set({ balance });
  },

  loadCompanies: () => {
    const companies = getAllCompanies();
    set({ companies });
  },

  loadSettings: () => {
    const VALID_ROUNDING_UNITS: RoundingUnit[] = [1, 15, 30];
    const VALID_ROUNDING_DIRECTIONS: RoundingDirection[] = ['up', 'down', 'round'];
    const VALID_THEMES: AppTheme[] = ['dark', 'light', 'system'];

    const rawUnit = Number(getSetting(SETTINGS_KEYS.roundingUnit, '1'));
    const roundingUnit: RoundingUnit = VALID_ROUNDING_UNITS.includes(rawUnit as RoundingUnit)
      ? (rawUnit as RoundingUnit)
      : 1;

    const rawDirection = getSetting(SETTINGS_KEYS.roundingDirection, 'round');
    const roundingDirection: RoundingDirection = VALID_ROUNDING_DIRECTIONS.includes(rawDirection as RoundingDirection)
      ? (rawDirection as RoundingDirection)
      : 'round';

    const rawTheme = getSetting(SETTINGS_KEYS.theme, 'dark');
    const theme: AppTheme = VALID_THEMES.includes(rawTheme as AppTheme)
      ? (rawTheme as AppTheme)
      : 'dark';

    const userName = getSetting(SETTINGS_KEYS.userName, '');
    set({ settings: { roundingUnit, roundingDirection, theme, userName } });
  },

  updateSetting: (key, value) => {
    const dbKeyMap: Record<keyof AppSettings, string> = {
      roundingUnit: SETTINGS_KEYS.roundingUnit,
      roundingDirection: SETTINGS_KEYS.roundingDirection,
      theme: SETTINGS_KEYS.theme,
      userName: SETTINGS_KEYS.userName,
    };
    setSetting(dbKeyMap[key], String(value));
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    }));
  },
}));
