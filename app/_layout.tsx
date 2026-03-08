import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { initDatabase } from '@/db/schema';
import { useAppStore } from '@/store/use-app-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkColors, LightColors } from '@/constants/colors';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const loadCompanies = useAppStore((s) => s.loadCompanies);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const refreshBalance = useAppStore((s) => s.refreshBalance);
  const appTheme = useAppStore((s) => s.settings.theme);
  const systemScheme = useColorScheme();

  const resolvedTheme = appTheme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : appTheme;
  const uiColors = resolvedTheme === 'dark' ? DarkColors : LightColors;
  const navTheme = resolvedTheme === 'dark' 
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: uiColors.bg } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: uiColors.bg } };

  useEffect(() => {
    initDatabase();
    loadCompanies();
    loadSettings();
    refreshBalance();
  }, [loadCompanies, loadSettings, refreshBalance]);

  return (
    <ThemeProvider value={navTheme}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: uiColors.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Onkosten toevoegen', headerStyle: { backgroundColor: uiColors.surface }, headerTintColor: uiColors.textPrimary }} />
        <Stack.Screen name="month/[id]" options={{ title: 'Maandoverzicht', headerStyle: { backgroundColor: uiColors.surface }, headerTintColor: uiColors.textPrimary }} />
        <Stack.Screen name="entry/[id]" options={{ title: 'Dienst bewerken', headerStyle: { backgroundColor: uiColors.surface }, headerTintColor: uiColors.textPrimary }} />
        <Stack.Screen name="expense/[id]" options={{ title: 'Onkost bewerken', headerStyle: { backgroundColor: uiColors.surface }, headerTintColor: uiColors.textPrimary }} />
      </Stack>
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
