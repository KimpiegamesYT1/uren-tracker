import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatEuro } from '@/constants/colors';
import { getWorkEntriesByMonth } from '@/db/work-entries';
import { getExpensesByMonth } from '@/db/expenses';
import { WorkEntry, Expense } from '@/db/schema';
import { formatDuration } from '@/utils/rounding';
import { useAppColors } from '@/hooks/use-app-colors';

const MONTH_NAMES = [
  '', 'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];

type ListItem =
  | (WorkEntry & { itemType: 'work' })
  | (Expense & { itemType: 'expense' });

export default function MonthDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppColors();
  const styles = getStyles(colors);

  const [year, month] = (id ?? '').split('-').map(Number);
  const [items, setItems] = useState<ListItem[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!year || !month) return;
      const entries = getWorkEntriesByMonth(year, month).map((e) => ({ ...e, itemType: 'work' as const }));
      const expenses = getExpensesByMonth(year, month).map((e) => ({ ...e, itemType: 'expense' as const }));

      const combined: ListItem[] = [...entries, ...expenses].sort((a, b) => {
        const da = a.date.localeCompare(b.date);
        if (da !== 0) return da;
        return a.created_at.localeCompare(b.created_at);
      });

      setItems(combined);
      const hrs = entries.reduce((sum, e) => sum + e.duration_minutes, 0);
      const amt = entries.reduce((sum, e) => sum + e.amount, 0) +
        expenses.reduce((sum, e) => sum + e.amount, 0);
      setTotalHours(hrs);
      setTotalAmount(amt);
    }, [year, month])
  );

  const renderItem = ({ item }: { item: ListItem }) => (
    <TouchableOpacity
      style={styles.itemRow}
      onPress={() => {
        if (item.itemType === 'work') router.push(`/entry/${item.id}`);
        else router.push(`/expense/${item.id}`);
      }}>
      <View
        style={[
          styles.itemBar,
          {
            backgroundColor:
              item.itemType === 'work'
                ? (item as WorkEntry).company_color ?? colors.accentSecondary
                : colors.warning,
          },
        ]}
      />
      <View style={styles.itemContent}>
        <Text style={styles.itemDate}>{item.date}</Text>
        {item.itemType === 'work' ? (
          <>
            <Text style={styles.itemTitle}>{(item as WorkEntry).company_name}</Text>
            <Text style={styles.itemSub}>
              {(item as WorkEntry).start_time} – {(item as WorkEntry).end_time} · {formatDuration((item as WorkEntry).duration_minutes)}
            </Text>
            {(item as WorkEntry).note ? (
              <Text style={styles.itemNote}>{(item as WorkEntry).note}</Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.itemTitle}>{(item as Expense).description || 'Onkost'}</Text>
          </>
        )}
      </View>
      <View style={styles.itemRight}>
        <Text style={styles.itemAmount}>{formatEuro(item.amount)}</Text>
        {item.is_locked === 1 && <Text style={styles.lockIcon}>🔒</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Summary header */}
      <View style={styles.summaryHeader}>
        <Text style={styles.summaryTitle}>
          {MONTH_NAMES[month] ?? ''} {year}
        </Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryStatValue}>{(totalHours / 60).toFixed(1)}u</Text>
            <Text style={styles.summaryStatLabel}>Gewerkt</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryStatValue}>
              {formatEuro(totalAmount)}
            </Text>
            <Text style={styles.summaryStatLabel}>Verdiensten</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => `${item.itemType}-${item.id}`}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Geen registraties in deze maand.</Text>
        }
      />
    </SafeAreaView>
  );
}

function getStyles(colors: ReturnType<typeof useAppColors>['colors']) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  summaryHeader: {
    backgroundColor: colors.surface,
    padding: 20,
    gap: 12,
  },
  summaryTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', gap: 24 },
  summaryStat: { gap: 2 },
  summaryStatValue: { color: colors.textPrimary, fontSize: 24, fontWeight: '800' },
  summaryStatLabel: { color: colors.textSecondary, fontSize: 12 },

  listContent: { padding: 12, gap: 8, paddingBottom: 40 },
  itemRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
  },
  itemBar: { width: 4, alignSelf: 'stretch' },
  itemContent: { flex: 1, padding: 12 },
  itemDate: { color: colors.textSecondary, fontSize: 12 },
  itemTitle: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  itemSub: { color: colors.textSecondary, fontSize: 12 },
  itemNote: { color: colors.textSecondary, fontSize: 12, fontStyle: 'italic' },
  itemRight: { padding: 12, alignItems: 'flex-end', gap: 2 },
  itemAmount: { color: colors.textPrimary, fontWeight: '700', fontSize: 15 },
  lockIcon: { fontSize: 12 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 40, fontSize: 15 },
  });
}
