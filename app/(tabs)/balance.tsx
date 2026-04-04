import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  TextInput,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatEuro, getCompanyDisplayColor } from '@/constants/colors';
import { useAppStore } from '@/store/use-app-store';
import { useAppColors } from '@/hooks/use-app-colors';
import { useDialog } from '@/components/ui/app-dialog';
import { getAllUnpaidWorkEntries } from '@/db/work-entries';
import { getAllUnpaidExpenses } from '@/db/expenses';
import { getAllPayments, insertPayment, applyPayment, deletePaymentAndRecalculate, updatePayment } from '@/db/payments';
import { WorkEntry, Expense, Payment } from '@/db/schema';
import { dateToDateString, dateStringToDate, formatDuration } from '@/utils/rounding';

type UnpaidItem =
  | (WorkEntry & { itemType: 'work' })
  | (Expense & { itemType: 'expense' });

const WEEKDAY_LABELS = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
const MONTH_LABELS = [
  'Januari',
  'Februari',
  'Maart',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Augustus',
  'September',
  'Oktober',
  'November',
  'December',
];

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim();
  const shorthand = /^#([\da-fA-F]{3})$/;
  const full = /^#([\da-fA-F]{6})$/;

  const shortMatch = normalized.match(shorthand);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    };
  }

  const fullMatch = normalized.match(full);
  if (fullMatch) {
    return {
      r: parseInt(fullMatch[1].slice(0, 2), 16),
      g: parseInt(fullMatch[1].slice(2, 4), 16),
      b: parseInt(fullMatch[1].slice(4, 6), 16),
    };
  }

  return null;
}

function blendGrayTint(baseHex: string, sourceHex?: string, ratio = 0.22): string {
  const base = parseHexColor(baseHex);
  const source = sourceHex ? parseHexColor(sourceHex) : null;

  if (!base || !source) return baseHex;

  const gray = Math.round((source.r + source.g + source.b) / 3);
  const mix = (channel: number) => Math.round(channel * (1 - ratio) + gray * ratio);

  return `rgb(${mix(base.r)}, ${mix(base.g)}, ${mix(base.b)})`;
}

function formatDisplayDate(date: string): string {
  const parsed = dateStringToDate(date);
  const weekday = WEEKDAY_LABELS[parsed.getDay()];
  const day = parsed.getDate();
  const month = MONTH_LABELS[parsed.getMonth()];
  const year = parsed.getFullYear();
  return `${weekday} ${day} ${month} ${year}`;
}

export default function BalanceScreen() {
  const router = useRouter();
  const { balance, refreshBalance, companies } = useAppStore();
  const { colors, uiTheme } = useAppColors();
  const styles = getStyles(colors);
  const { show: showDialog, dialogNode } = useDialog();

  const [activeTab, setActiveTab] = useState<'openstaand' | 'history'>('openstaand');
  const [unpaidItems, setUnpaidItems] = useState<UnpaidItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [showPayModal, setShowPayModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadData = useCallback(() => {
    const workItems = getAllUnpaidWorkEntries().map((w) => ({ ...w, itemType: 'work' as const }));
    const expenseItems = getAllUnpaidExpenses().map((e) => ({ ...e, itemType: 'expense' as const }));
    const combined: UnpaidItem[] = [...workItems, ...expenseItems].sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      return b.created_at.localeCompare(a.created_at);
    });

    setUnpaidItems(combined);
    setPayments(getAllPayments());
    refreshBalance();
  }, [refreshBalance]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handlePayment = () => {
    const amount = parseFloat(paymentAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      showDialog({ title: 'Ongeldig bedrag', message: 'Voer een geldig positief bedrag in.' });
      return;
    }
    try {
      const today = dateToDateString(new Date());
      insertPayment(today, amount, '');
      applyPayment(amount);
      refreshBalance();
      setPaymentAmount('');
      setShowPayModal(false);
      loadData();
    } catch {
      showDialog({ title: 'Fout', message: 'Kon de betaling niet verwerken. Probeer het opnieuw.' });
    }
  };

  const handlePaymentPress = (payment: Payment) => {
    setEditingPayment(payment);
    setEditAmount(String(payment.amount).replace('.', ','));
    setEditNote(payment.note || '');
    setShowDeleteConfirm(false);
  };

  const handleEditPayment = () => {
    if (!editingPayment) return;
    const amount = parseFloat(editAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      showDialog({ title: 'Ongeldig bedrag', message: 'Voer een geldig positief bedrag in.' });
      return;
    }
    try {
      updatePayment(editingPayment.id, amount, editNote);
      setEditingPayment(null);
      setEditAmount('');
      setEditNote('');
      loadData();
    } catch {
      showDialog({ title: 'Fout', message: 'Kon de betaling niet bijwerken. Probeer het opnieuw.' });
    }
  };

  const handleDeletePayment = () => {
    if (!editingPayment) return;
    deletePaymentAndRecalculate(editingPayment.id);
    setEditingPayment(null);
    setEditAmount('');
    setEditNote('');
    setShowDeleteConfirm(false);
    loadData();
  };

  const renderUnpaidItem = ({ item }: { item: UnpaidItem }) => {
    const remaining = item.amount - item.amount_paid;
    const isPartial = item.amount_paid > 0;
    const formattedDate = formatDisplayDate(item.date);
    const isWork = item.itemType === 'work';
    const showCompanyInTitle = companies.length > 1;
    const companyName = item.company_name ?? (isWork ? 'Bedrijf' : 'Geen bedrijf');
    const companyColor = item.company_color
      ? getCompanyDisplayColor(item.company_color, uiTheme)
      : colors.accentSecondary;
    const titleWithCompany = showCompanyInTitle ? `${formattedDate} - ${companyName}` : formattedDate;
    const companyGrayBg =
      item.itemType === 'expense' ? blendGrayTint(colors.surface, companyColor, 0.28) : colors.surface;
    const companyGrayBar =
      item.itemType === 'expense'
        ? blendGrayTint(companyColor, companyColor, 0.36)
        : companyColor;

    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => {
          if (item.itemType === 'work') {
            router.push(`/entry/${item.id}`);
          } else {
            router.push(`/expense/${item.id}`);
          }
        }}>
      <View style={[styles.listItem, item.itemType === 'expense' && { backgroundColor: companyGrayBg }]}>
        <View
          style={[
            styles.listItemBar,
            { backgroundColor: companyGrayBar },
          ]}
        />
        <View style={styles.listItemContent}>
          <View style={styles.listItemTopRow}>
            <Text style={styles.listItemTitle}>
              {titleWithCompany}
            </Text>
            <Text style={styles.listItemAmount}>{formatEuro(remaining)}</Text>
          </View>
          {item.itemType === 'expense' ? (
            <Text style={styles.listItemNote}>{(item as Expense).description || 'Onkost'}</Text>
          ) : null}
          {isWork ? (
            <View style={styles.listItemBottomRow}>
              <View style={styles.listItemBottomLeft}>
                <Text style={styles.listItemTime}>
                  {(item as WorkEntry).start_time} - {(item as WorkEntry).end_time}
                </Text>
                {(item as WorkEntry).note ? (
                  <Text style={styles.listItemNote}>{(item as WorkEntry).note}</Text>
                ) : null}
              </View>
              <Text style={styles.listItemHours}>{formatDuration((item as WorkEntry).duration_minutes)}</Text>
            </View>
          ) : null}
          {isPartial && (
            <Text style={styles.listItemStatus}>
              Deels betaald ({formatEuro(item.amount_paid)} / {formatEuro(item.amount)})
            </Text>
          )}
        </View>
      </View>
      </TouchableOpacity>
    );
  };

  const renderPayment = ({ item }: { item: Payment }) => (
    <TouchableOpacity onPress={() => handlePaymentPress(item)} activeOpacity={0.7}>
      <View style={styles.listItem}>
        <View style={[styles.listItemBar, { backgroundColor: colors.accent }]} />
        <View style={styles.listItemContent}>
          <View style={styles.listItemTopRow}>
            <Text style={styles.listItemTitle}>
              {item.note || 'Contante betaling'}
            </Text>
            <Text style={styles.listItemAmount}>
              {formatEuro(item.amount)}
            </Text>
          </View>
          <Text style={styles.listItemDate}>{formatDisplayDate(item.date)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Balance header */}
      <View style={styles.balanceHeader}>
        <Text style={styles.balanceLabel}>
          {balance < 0 ? 'Te veel ontvangen' : 'Nog te ontvangen'}
        </Text>
        <Text style={styles.balanceAmount}>
          {formatEuro(balance)}
        </Text>
        <TouchableOpacity style={styles.payButton} onPress={() => setShowPayModal(true)}
          accessibilityLabel="Betaling ontvangen"
          accessibilityRole="button">
          <Text style={styles.payButtonText}>Betaling Ontvangen</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'openstaand' && styles.tabActive]}
          onPress={() => setActiveTab('openstaand')}
          accessibilityLabel={`Openstaand, ${unpaidItems.length} posten`}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'openstaand' }}>
          <Text style={[styles.tabText, activeTab === 'openstaand' && styles.tabTextActive]}>
            Openstaand ({unpaidItems.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
          accessibilityLabel={`Betalingen, ${payments.length} posten`}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'history' }}>
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            Betalingen ({payments.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {activeTab === 'openstaand' ? (
        <FlatList
          data={unpaidItems}
          keyExtractor={(item) => `${item.itemType}-${item.id}`}
          renderItem={renderUnpaidItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Geen openstaande posten. Alles is betaald.</Text>
          }
        />
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderPayment}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Nog geen betalingen geregistreerd.</Text>
          }
        />
      )}

      {/* Payment modal */}
      <Modal visible={showPayModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Betaling Ontvangen</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Bedrag in euro (bijv. 150,00)"
              placeholderTextColor={colors.textDisabled}
              keyboardType="decimal-pad"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              autoFocus
            />
            <Text style={styles.modalHint}>
              De oudste openstaande posten worden automatisch afgestreept.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => {
                  setShowPayModal(false);
                  setPaymentAmount('');
                }}>
                <Text style={styles.modalBtnCancelText}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnConfirm]} onPress={handlePayment}>
                <Text style={styles.modalBtnConfirmText}>Opslaan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit payment modal */}
      <Modal visible={editingPayment !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Betaling Bewerken</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Bedrag in euro (bijv. 150,00)"
              placeholderTextColor={colors.textDisabled}
              keyboardType="decimal-pad"
              value={editAmount}
              onChangeText={setEditAmount}
              autoFocus
            />
            <Text style={styles.modalHint}>Bedrag in euro (EUR).</Text>
            <TextInput
              style={[styles.modalInput, { fontSize: 16, fontWeight: '400' }]}
              placeholder="Notitie (optioneel)"
              placeholderTextColor={colors.textDisabled}
              value={editNote}
              onChangeText={setEditNote}
            />
            {showDeleteConfirm ? (
              <View style={styles.deleteConfirmBox}>
                <Text style={styles.deleteConfirmText}>
                  Weet je zeker dat je deze betaling wilt verwijderen?
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setShowDeleteConfirm(false)}>
                    <Text style={styles.modalBtnCancelText}>Nee</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalBtn, styles.deleteBtn]} onPress={handleDeletePayment}>
                    <Text style={styles.modalBtnConfirmText}>Ja, verwijderen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.deleteBtn]}
                onPress={() => setShowDeleteConfirm(true)}>
                <Text style={styles.modalBtnConfirmText}>Verwijderen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => {
                  setEditingPayment(null);
                  setEditAmount('');
                  setEditNote('');
                  setShowDeleteConfirm(false);
                }}>
                <Text style={styles.modalBtnCancelText}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnConfirm]} onPress={handleEditPayment}>
                <Text style={styles.modalBtnConfirmText}>Opslaan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {dialogNode}
    </SafeAreaView>
  );
}

function getStyles(colors: ReturnType<typeof useAppColors>['colors']) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Balance header
  balanceHeader: {
    backgroundColor: colors.surface,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  balanceLabel: { color: colors.textSecondary, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  balanceAmount: { color: colors.textPrimary, fontSize: 42, fontWeight: '800', letterSpacing: -1 },
  payButton: {
    backgroundColor: colors.accentSecondary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  payButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },

  // Tabs
  tabRow: {
    flexDirection: 'row',
  },
  tab: { flex: 1, padding: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.accentSecondary },
  tabText: { color: colors.textSecondary, fontSize: 14 },
  tabTextActive: { color: colors.accentSecondary, fontWeight: '700' },

  // List
  listContent: { padding: 12, gap: 8, paddingBottom: 40 },
  listItem: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
  },
  listItemBar: { width: 4, alignSelf: 'stretch' },
  listItemContent: { flex: 1, padding: 12 },
  listItemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  listItemBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  listItemBottomLeft: { flex: 1 },
  listItemTime: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  listItemDate: { color: colors.textSecondary, fontSize: 12 },
  listItemNote: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  listItemTitle: { color: colors.textPrimary, fontWeight: '600', fontSize: 15, flex: 1 },
  listItemStatus: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  listItemAmount: { color: colors.textPrimary, fontWeight: '700', fontSize: 16 },
  listItemHours: { color: colors.textSecondary, fontWeight: '700', fontSize: 16 },

  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 40, fontSize: 15 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.scrimStrong,
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    padding: 24,
    gap: 14,
  },
  modalTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  modalInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    fontSize: 22,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  modalHint: { color: colors.textSecondary, fontSize: 13 },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: colors.surface },
  modalBtnCancelText: { color: colors.textPrimary, fontWeight: '600' },
  modalBtnConfirm: { backgroundColor: colors.accentSecondary },
  deleteBtn: { backgroundColor: colors.error },
  modalBtnConfirmText: { color: colors.onAccent, fontWeight: '700' },
  deleteConfirmBox: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  deleteConfirmText: { color: colors.textPrimary, fontSize: 13 },
});
}
