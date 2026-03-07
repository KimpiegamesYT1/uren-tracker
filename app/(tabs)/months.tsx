import React, { useCallback, useState } from 'react';
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
  const styles = getStyles(colors);
  const [summaries, setSummaries] = useState<MonthSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      setSummaries(getMonthSummaries());
    }, [])
  );

  const renderItem = ({ item }: { item: MonthSummary }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/month/${item.year}-${String(item.month).padStart(2, '0')}`)}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardMonth}>{MONTH_NAMES[item.month]}</Text>
        <Text style={styles.cardYear}>{item.year}</Text>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.cardHours}>{item.total_hours.toFixed(1)}u</Text>
        <Text style={styles.cardAmount}>{formatEuro(item.total_amount)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Maandoverzicht</Text>
      <FlatList
        data={summaries}
        keyExtractor={(item) => `${item.year}-${item.month}`}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLeft: { gap: 2 },
  cardMonth: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  cardYear: { color: colors.textSecondary, fontSize: 14 },
  cardRight: { alignItems: 'flex-end', gap: 2 },
  cardHours: { color: colors.textSecondary, fontSize: 14 },
  cardAmount: { color: colors.accent, fontSize: 20, fontWeight: '700' },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 60, fontSize: 15 },
  });
}
