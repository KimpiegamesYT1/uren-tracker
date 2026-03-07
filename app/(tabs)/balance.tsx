import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatEuro } from '@/constants/colors';
import { useAppStore } from '@/store/use-app-store';
import { useAppColors } from '@/hooks/use-app-colors';
import { getAllUnpaidWorkEntries } from '@/db/work-entries';
import { getAllUnpaidExpenses } from '@/db/expenses';
import { getAllPayments, insertPayment, applyPayment, deletePaymentAndRecalculate, updatePayment } from '@/db/payments';
import { WorkEntry, Expense, Payment } from '@/db/schema';
import { dateToDateString, formatDuration } from '@/utils/rounding';

type UnpaidItem =
  | (WorkEntry & { itemType: 'work' })
  | (Expense & { itemType: 'expense' });

export default function BalanceScreen() {
  const router = useRouter();
  const { balance, refreshBalance } = useAppStore();
  const { colors } = useAppColors();
  const styles = getStyles(colors);

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
    const combined: UnpaidItem[] = [...workItems, ...expenseItems].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    setUnpaidItems(combined);
    setPayments(getAllPayments());
    refreshBalance();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handlePayment = () => {
    const amount = parseFloat(paymentAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Ongeldig bedrag', 'Voer een geldig positief bedrag in.');
      return;
    }
    const today = dateToDateString(new Date());
    insertPayment(today, amount, '');
    applyPayment(amount);
    refreshBalance();
    setPaymentAmount('');
    setShowPayModal(false);
    loadData();
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
      Alert.alert('Ongeldig bedrag', 'Voer een geldig positief bedrag in.');
      return;
    }
    updatePayment(editingPayment.id, amount, editNote);
    setEditingPayment(null);
    setEditAmount('');
    setEditNote('');
    loadData();
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
    const statusColor = isPartial ? colors.statusPartial : colors.statusUnpaid;

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
      <View style={styles.listItem}>
        <View
          style={[
            styles.listItemBar,
            { backgroundColor: item.itemType === 'work' ? colors.accentSecondary : colors.info },
          ]}
        />
        <View style={styles.listItemContent}>
          <Text style={styles.listItemDate}>{item.date}</Text>
          <Text style={styles.listItemTitle}>
            {item.itemType === 'work'
              ? `${(item as WorkEntry).company_name ?? 'Bedrijf'} · ${formatDuration((item as WorkEntry).duration_minutes)}`
              : `${(item as Expense).company_name ?? 'Geen bedrijf'} · ${(item as Expense).description || 'Onkost'}`}
          </Text>
          {isPartial && (
            <Text style={[styles.listItemStatus, { color: colors.statusPartial }]}>
              Deels betaald ({formatEuro(item.amount_paid)} / {formatEuro(item.amount)})
            </Text>
          )}
        </View>
        <Text style={[styles.listItemAmount, { color: statusColor }]}>
          {formatEuro(remaining)}
        </Text>
      </View>
      </TouchableOpacity>
    );
  };

  const renderPayment = ({ item }: { item: Payment }) => (
    <TouchableOpacity onPress={() => handlePaymentPress(item)} activeOpacity={0.7}>
      <View style={styles.listItem}>
        <View style={[styles.listItemBar, { backgroundColor: colors.accent }]} />
        <View style={styles.listItemContent}>
          <Text style={styles.listItemDate}>{item.date}</Text>
          <Text style={styles.listItemTitle}>
            {item.note || 'Contante betaling'}
          </Text>
        </View>
        <Text style={[styles.listItemAmount, { color: colors.accent }]}>
          {formatEuro(item.amount)}
        </Text>
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
        <Text style={[styles.balanceAmount, balance < 0 && { color: colors.error }]}>
          {formatEuro(balance)}
        </Text>
        <TouchableOpacity style={styles.payButton} onPress={() => setShowPayModal(true)}>
          <Text style={styles.payButtonText}>Betaling Ontvangen</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'openstaand' && styles.tabActive]}
          onPress={() => setActiveTab('openstaand')}>
          <Text style={[styles.tabText, activeTab === 'openstaand' && styles.tabTextActive]}>
            Openstaand ({unpaidItems.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}>
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
              De oudste openstaande posten worden automatisch afgestreept (FIFO).
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  payButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  listItemBar: { width: 4, alignSelf: 'stretch' },
  listItemContent: { flex: 1, padding: 12 },
  listItemDate: { color: colors.textSecondary, fontSize: 12 },
  listItemTitle: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  listItemStatus: { fontSize: 12, marginTop: 2 },
  listItemAmount: { paddingRight: 12, fontWeight: '700', fontSize: 16 },

  emptyText: { color: colors.textSecondary, textAlign: 'center', marginTop: 40, fontSize: 15 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  modalInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    fontSize: 22,
    color: colors.textPrimary,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHint: { color: colors.textSecondary, fontSize: 13 },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  modalBtnCancelText: { color: colors.textPrimary, fontWeight: '600' },
  modalBtnConfirm: { backgroundColor: colors.accentSecondary },
  deleteBtn: { backgroundColor: colors.error },
  modalBtnConfirmText: { color: '#FFFFFF', fontWeight: '700' },
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
