import { create } from 'zustand';
import { getAllCompanies } from '../db/companies';
import { calculateBalance } from '../db/payments';
import { getSetting, setSetting } from '../db/settings';
import { Company } from '../db/schema';
import { RoundingUnit, RoundingDirection } from '../utils/rounding';

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
    const roundingUnit = Number(getSetting('rounding_unit', '1')) as RoundingUnit;
    const roundingDirection = getSetting('rounding_direction', 'round') as RoundingDirection;
    const theme = getSetting('theme', 'dark') as AppTheme;
    const userName = getSetting('user_name', '');
    set({ settings: { roundingUnit, roundingDirection, theme, userName } });
  },

  updateSetting: (key, value) => {
    const dbKeyMap: Record<keyof AppSettings, string> = {
      roundingUnit: 'rounding_unit',
      roundingDirection: 'rounding_direction',
      theme: 'theme',
      userName: 'user_name',
    };
    setSetting(dbKeyMap[key], String(value));
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    }));
  },
}));
