import { create } from 'zustand';
import { getAllCompanies } from '../db/companies';
import { calculateBalance } from '../db/payments';
import { getSetting, setSetting } from '../db/settings';
import { Company } from '../db/schema';
import { SETTINGS_KEYS } from '../constants/settings-keys';

export type AppTheme = 'dark' | 'light' | 'system';

export type AppSettings = {
  theme: AppTheme;
  userName: string;
};

/** A pending "undo" prompt shown by the single toast rendered at the app root. */
export type UndoPrompt = { message: string; onUndo: () => void } | null;

type AppState = {
  balance: number;
  companies: Company[];
  settings: AppSettings;
  undo: UndoPrompt;
  /** Bumped when data changes outside the focused screen (e.g. an undo). Screens
   *  that render lists watch this to reload without waiting for a refocus. */
  revision: number;

  // Actions
  refreshBalance: () => void;
  loadCompanies: () => void;
  loadSettings: () => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  showUndo: (message: string, onUndo: () => void) => void;
  hideUndo: () => void;
  bumpRevision: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  balance: 0,
  companies: [],
  settings: {
    theme: 'dark',
    userName: '',
  },
  undo: null,
  revision: 0,

  refreshBalance: () => {
    const balance = calculateBalance();
    set({ balance });
  },

  loadCompanies: () => {
    const companies = getAllCompanies();
    set({ companies });
  },

  loadSettings: () => {
    const VALID_THEMES: AppTheme[] = ['dark', 'light', 'system'];

    const rawTheme = getSetting(SETTINGS_KEYS.theme, 'dark');
    const theme: AppTheme = VALID_THEMES.includes(rawTheme as AppTheme)
      ? (rawTheme as AppTheme)
      : 'dark';

    const userName = getSetting(SETTINGS_KEYS.userName, '');
    set({ settings: { theme, userName } });
  },

  updateSetting: (key, value) => {
    const dbKeyMap: Record<keyof AppSettings, string> = {
      theme: SETTINGS_KEYS.theme,
      userName: SETTINGS_KEYS.userName,
    };
    setSetting(dbKeyMap[key], String(value));
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    }));
  },

  showUndo: (message, onUndo) => set({ undo: { message, onUndo } }),
  hideUndo: () => set({ undo: null }),
  bumpRevision: () => set((state) => ({ revision: state.revision + 1 })),
}));
