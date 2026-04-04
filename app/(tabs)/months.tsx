import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatEuro } from '@/constants/colors';
import { getMonthSummaries } from '@/db/work-entries';
import { useAppColors } from '@/hooks/use-app-colors';

const MONTH_NAMES = [
  '', 'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];

type MonthSummary = { year: number; month: number; total_hours: number; total_amount: number };

export default function MonthsScreen() {
  const router = useRouter();
  const { colors } = useAppColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [summaries, setSummaries] = useState<MonthSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      setSummaries(getMonthSummaries());
    }, [])
  );

  const renderItem = useCallback(({ item }: { item: MonthSummary }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/month/${item.year}-${String(item.month).padStart(2, '0')}`)}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardMonth}>{MONTH_NAMES[item.month]}</Text>
        <Text style={styles.cardYear}>{item.year}</Text>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.cardAmount}>{formatEuro(item.total_amount)}</Text>
        <Text style={styles.cardHours}>{item.total_hours.toFixed(1)}u</Text>
      </View>
    </TouchableOpacity>
  ), [router, styles]);

  const keyExtractor = useCallback((item: MonthSummary) => `${item.year}-${item.month}`, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Maandoverzicht</Text>
      <FlatList
        data={summaries}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        updateCellsBatchingPeriod={16}
        removeClippedSubviews
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nog geen diensten geregistreerd.</Text>
        }
      />
    </SafeAreaView>
  );
}

function getStyles(colors: ReturnType<typeof useAppColors>['colors']) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    padding: 16,
    paddingBottom: 8,
  },
  listContent: { padding: 12, gap: 10, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: { gap: 2 },
  cardMonth: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  cardYear: { color: colors.textSecondary, fontSize: 14 },
  cardRight: { alignItems: 'flex-end', gap: 2 },
  cardHours: { color: colors.textSecondary, fontSize: 14 },
  cardAmount: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 60, fontSize: 15 },
  });
}
