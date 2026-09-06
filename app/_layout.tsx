import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { initDatabase } from '@/db/schema';
import { recalculateAllPayments } from '@/db/payments';
import { useAppStore } from '@/store/use-app-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkColors, LightColors } from '@/constants/colors';
import { GlobalUndoToast } from '@/components/undo-toast';

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
    // Heal any pre-existing drift between per-entry amount_paid and the payment
    // total (e.g. after a migration or importing an old backup).
    recalculateAllPayments();
    loadCompanies();
    loadSettings();
    refreshBalance();
  }, [loadCompanies, loadSettings, refreshBalance]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(uiColors.bg);
  }, [uiColors.bg]);

  return (
    <ThemeProvider value={navTheme}>
      <View style={{ flex: 1, backgroundColor: uiColors.bg }}>
        <Stack screenOptions={{ contentStyle: { backgroundColor: uiColors.bg } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Onkost toevoegen', headerStyle: { backgroundColor: uiColors.surface }, headerTintColor: uiColors.textPrimary }} />
          <Stack.Screen name="month/[id]" options={{ title: 'Maandoverzicht', headerStyle: { backgroundColor: uiColors.surface }, headerTintColor: uiColors.textPrimary }} />
          <Stack.Screen name="entry/[id]" options={{ title: 'Dienst bewerken', headerStyle: { backgroundColor: uiColors.surface }, headerTintColor: uiColors.textPrimary }} />
          <Stack.Screen name="expense/[id]" options={{ title: 'Onkost bewerken', headerStyle: { backgroundColor: uiColors.surface }, headerTintColor: uiColors.textPrimary }} />
        </Stack>
        <GlobalUndoToast />
      </View>
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
