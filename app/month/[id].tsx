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

import { formatEuro, getCompanyDisplayColor } from '@/constants/colors';
import { getWorkEntriesByMonth } from '@/db/work-entries';
import { WorkEntry } from '@/db/schema';
import { dateStringToDate, formatDuration } from '@/utils/rounding';
import { useAppColors } from '@/hooks/use-app-colors';
import { useAppStore } from '@/store/use-app-store';

const MONTH_NAMES = [
  '', 'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];

const WEEKDAY_LABELS = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];

function formatDisplayDate(date: string): string {
  const parsed = dateStringToDate(date);
  const weekday = WEEKDAY_LABELS[parsed.getDay()];
  const day = parsed.getDate();
  const month = MONTH_NAMES[parsed.getMonth() + 1] ?? '';
  const year = parsed.getFullYear();
  return `${weekday} ${day} ${month} ${year}`;
}

export default function MonthDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, uiTheme } = useAppColors();
  const companies = useAppStore((s) => s.companies);
  const styles = getStyles(colors);

  const [year, month] = (id ?? '').split('-').map(Number);
  const [items, setItems] = useState<WorkEntry[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [workedDays, setWorkedDays] = useState(0);

  const workedHours = totalHours / 60;
  const workedHoursLabel = totalHours === 60 ? 'Uur gewerkt' : 'Uren gewerkt';
  const workedDaysLabel = workedDays === 1 ? 'Dag gewerkt' : 'Dagen gewerkt';

  useFocusEffect(
    useCallback(() => {
      if (!year || !month) return;
      const entries = getWorkEntriesByMonth(year, month).sort((a, b) => {
        const da = b.date.localeCompare(a.date);
        if (da !== 0) return da;
        return b.created_at.localeCompare(a.created_at);
      });

      setItems(entries);
      const hrs = entries.reduce((sum, e) => sum + e.duration_minutes, 0);
      const amt = entries.reduce((sum, e) => sum + e.amount, 0);
      const dayCount = new Set(entries.map((e) => e.date)).size;
      setTotalHours(hrs);
      setTotalAmount(amt);
      setWorkedDays(dayCount);
    }, [year, month])
  );

  const renderItem = ({ item }: { item: WorkEntry }) => {
    const showCompanyInTitle = companies.length > 1;
    const companyName = item.company_name ?? 'Bedrijf';
    const title = showCompanyInTitle
      ? `${formatDisplayDate(item.date)} - ${companyName}`
      : formatDisplayDate(item.date);
    const barColor = item.company_color
      ? getCompanyDisplayColor(item.company_color, uiTheme)
      : colors.accentSecondary;

    return (
      <TouchableOpacity
        style={styles.itemRow}
        onPress={() => router.push(`/entry/${item.id}`)}>
        <View
          style={[
            styles.itemBar,
            { backgroundColor: barColor },
          ]}
        />
        <View style={styles.itemContent}>
          <View style={styles.itemTopRow}>
            <View style={styles.itemTopLeft}>
              <Text style={styles.itemTitle}>{title}</Text>
              <Text style={styles.itemTime}>
                {item.start_time} - {item.end_time}
              </Text>
            </View>
            <View style={styles.itemAmountColumn}>
              <Text style={styles.itemAmount}>{formatEuro(item.amount)}</Text>
              <Text style={styles.itemHours}>{formatDuration(item.duration_minutes)}</Text>
            </View>
          </View>
          {item.note ? (
            <Text style={styles.itemNote}>{item.note}</Text>
          ) : null}
          {item.is_locked === 1 ? <Text style={styles.lockText}>🔒 Vergrendeld</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Summary header */}
      <View style={styles.summaryHeader}>
        <Text style={styles.summaryTitle}>
          {MONTH_NAMES[month] ?? ''} {year}
        </Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryStatValue}>
              {formatEuro(totalAmount)}
            </Text>
            <Text style={styles.summaryStatLabel}>Verdiensten</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryStatValue}>{workedHours.toFixed(1)}u</Text>
            <Text style={styles.summaryStatLabel}>{workedHoursLabel}</Text>
          </View>
          <View style={styles.summaryStat}>
            <Text style={styles.summaryStatValue}>{workedDays}</Text>
            <Text style={styles.summaryStatLabel}>{workedDaysLabel}</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
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
  summaryRow: { flexDirection: 'row', gap: 16 },
  summaryStat: { gap: 2, flex: 1 },
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
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemTopLeft: {
    flex: 1,
  },
  itemAmountColumn: {
    alignItems: 'flex-end',
    minWidth: 96,
  },
  itemTitle: { color: colors.textPrimary, fontWeight: '600', fontSize: 15, flex: 1 },
  itemTime: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  itemNote: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  itemAmount: { color: colors.textPrimary, fontWeight: '700', fontSize: 16 },
  itemHours: { color: colors.textSecondary, fontWeight: '700', fontSize: 16 },
  lockText: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 40, fontSize: 15 },
  });
}
