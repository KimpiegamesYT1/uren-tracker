import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppStore } from '@/store/use-app-store';
import { DarkColors, LightColors, UiTheme } from '@/constants/colors';

export function useAppColors() {
  const appTheme = useAppStore((s) => s.settings.theme);
  const systemScheme = useColorScheme();

  const uiTheme: UiTheme =
    appTheme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : appTheme;

  return {
    colors: uiTheme === 'dark' ? DarkColors : LightColors,
    uiTheme,
  };
}
