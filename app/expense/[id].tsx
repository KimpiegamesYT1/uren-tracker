import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { getCompanyDisplayColor } from '@/constants/colors';
import { useAppStore } from '@/store/use-app-store';
import { insertExpense, updateExpense, deleteExpense, restoreExpense } from '@/db/expenses';
import { getAllCompanies } from '@/db/companies';
import { getDb, Expense, Company } from '@/db/schema';
import { dateToDateString, dateStringToDate } from '@/utils/rounding';
import { InAppCamera } from '@/components/in-app-camera';
import { UndoToast } from '@/components/undo-toast';
import { useAppColors } from '@/hooks/use-app-colors';
import { useDialog } from '@/components/ui/app-dialog';

const RECEIPTS_DIR = `${FileSystem.documentDirectory}receipts/`;

async function ensureReceiptsDir() {
  const info = await FileSystem.getInfoAsync(RECEIPTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RECEIPTS_DIR, { intermediates: true });
  }
}

export default function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refreshBalance } = useAppStore();
  const { colors, uiTheme } = useAppColors();
  const styles = getStyles(colors);
  const { show: showDialog, dialogNode } = useDialog();

  const isNew = !id || id === 'new';

  const [existingExpense, setExistingExpense] = useState<Expense | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockWarningShown, setLockWarningShown] = useState(false);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showUndoToast, setShowUndoToast] = useState(false);

  useEffect(() => {
    const loaded = getAllCompanies();
    setCompanies(loaded);
    if (loaded.length > 0) {
      setSelectedCompanyId(loaded[0].id);
    }

    if (!isNew) {
      const db = getDb();
      const expense = db.getFirstSync<Expense>('SELECT * FROM expenses WHERE id = ?', [Number(id)]);
      if (expense) {
        setExistingExpense(expense);
        setIsLocked(expense.is_locked === 1);
        setSelectedDate(dateStringToDate(expense.date));
        setDescription(expense.description);
        setAmount(String(expense.amount));
        setSelectedCompanyId(expense.company_id ?? (loaded[0]?.id ?? null));
        setReceiptUri(expense.receipt_photo_uri);
      }
    }
  }, [id, isNew]);

  const handleSave = () => {
    if (isLocked && !lockWarningShown) {
      showDialog({
        title: 'Onkost al uitbetaald',
        message:
          'Deze onkostenpost is al uitbetaald. Weet je zeker dat je dit wilt wijzigen? Dit beïnvloedt je openstaande saldo.',
        buttons: [
          { text: 'Annuleren', style: 'cancel' },
          {
            text: 'Toch bewerken',
            style: 'destructive',
            onPress: () => {
              setLockWarningShown(true);
              void doSave();
            },
          },
        ],
      });
      return;
    }
    void doSave();
  };

  const doSave = async () => {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!description.trim()) {
      showDialog({ title: 'Beschrijving vereist', message: 'Voer een beschrijving in.' });
      return;
    }
    if (!selectedCompanyId) {
      showDialog({ title: 'Bedrijf vereist', message: 'Kies eerst een bedrijf voor deze onkost.' });
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showDialog({ title: 'Ongeldig bedrag', message: 'Voer een geldig bedrag in.' });
      return;
    }
    const dateStr = dateToDateString(selectedDate);

    try {
      if (isNew) {
        insertExpense(dateStr, selectedCompanyId, description.trim(), parsedAmount, receiptUri);
      } else if (existingExpense) {
        const oldPhoto = existingExpense.receipt_photo_uri;
        if (oldPhoto && oldPhoto !== receiptUri) {
          try {
            await FileSystem.deleteAsync(oldPhoto, { idempotent: true });
          } catch {}
        }
        updateExpense(existingExpense.id, dateStr, selectedCompanyId, description.trim(), parsedAmount, receiptUri);
        // If was locked and now edited, reset lock so saldo recalculates on next payment
        if (isLocked) {
          const db = getDb();
          db.runSync('UPDATE expenses SET is_locked = 0 WHERE id = ?', [existingExpense.id]);
        }
      }
      refreshBalance();
      router.back();
    } catch {
      showDialog({ title: 'Fout', message: 'Kon de onkost niet opslaan. Probeer het opnieuw.' });
    }
  };

  const handleDelete = () => {
    if (!existingExpense) return;
    deleteExpense(existingExpense.id);
    refreshBalance();
    setShowUndoToast(true);
  };

  const handleUndoDelete = () => {
    if (!existingExpense) return;
    restoreExpense(existingExpense.id);
    refreshBalance();
    setShowUndoToast(false);
  };

  const handleToastDismiss = async () => {
    setShowUndoToast(false);
    if (existingExpense?.receipt_photo_uri) {
      try {
        await FileSystem.deleteAsync(existingExpense.receipt_photo_uri, { idempotent: true });
      } catch {}
    }
    router.back();
  };

  const handleCameraCapture = async (sourceUri: string) => {
    await ensureReceiptsDir();
    const fileName = `receipt_${Date.now()}.jpg`;
    const destUri = `${RECEIPTS_DIR}${fileName}`;
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    setReceiptUri(destUri);
  };

  const handleSharePhoto = async () => {
    if (!receiptUri) return;
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      showDialog({ title: 'Niet beschikbaar', message: 'Delen is niet beschikbaar op dit apparaat.' });
      return;
    }
    await Sharing.shareAsync(receiptUri, {
      mimeType: 'image/jpeg',
      dialogTitle: 'Deel bonfoto',
    });
  };

  const onDateChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(false);
    if (date) setSelectedDate(date);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerSection}>
          <Text style={styles.headerTitle}>{isNew ? 'Onkost Toevoegen' : 'Onkost Bewerken'}</Text>
          <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateSelectorText}>
              {selectedDate.toLocaleDateString('nl-NL', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
            <Text style={styles.dateSelectorIcon}>▾</Text>
          </TouchableOpacity>
        </View>

        {isLocked && (
          <View style={styles.lockBanner}>
            <Text style={styles.lockBannerText}>🔒 Deze onkost is al uitbetaald</Text>
          </View>
        )}
        {showDatePicker && (
          <DateTimePicker value={selectedDate} mode="date" display="default" onChange={onDateChange} />
        )}

        <View style={styles.mainCard}>
          <TextInput
            style={styles.modernInput}
            placeholder="Beschrijving"
            placeholderTextColor={colors.textDisabled}
            value={description}
            onChangeText={setDescription}
          />

          <Text style={styles.sectionLabel}>BEDRIJF</Text>
          <View style={styles.companyRow}>
            {companies.map((company) => (
              <TouchableOpacity
                key={company.id}
                style={[
                  styles.companyChip,
                  selectedCompanyId === company.id && {
                    backgroundColor: getCompanyDisplayColor(company.color, uiTheme),
                  },
                ]}
                onPress={() => setSelectedCompanyId(company.id)}>
                <Text
                  style={[
                    styles.companyChipText,
                    selectedCompanyId === company.id && {
                      color: uiTheme === 'dark' ? colors.bg : colors.surface,
                      fontWeight: '700',
                    },
                  ]}>
                  {company.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {companies.length === 0 ? (
            <Text style={styles.helperText}>Voeg eerst een bedrijf toe in Instellingen.</Text>
          ) : null}

          <TextInput
            style={styles.modernInput}
            placeholder="Bedrag (bijv. 25,50)"
            placeholderTextColor={colors.textDisabled}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />

          {receiptUri ? (
            <View style={styles.receiptContainer}>
              <Image source={{ uri: receiptUri }} style={styles.receiptImage} resizeMode="cover" />
              <View style={styles.receiptActions}>
                <TouchableOpacity style={styles.sharePhotoButton} onPress={handleSharePhoto}>
                  <Text style={styles.sharePhotoText}>Deel foto</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.removePhotoButton} onPress={() => setReceiptUri(null)}>
                  <Text style={styles.removePhotoText}>Foto verwijderen</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.photoButton} onPress={() => setShowCamera(true)}>
              <Text style={styles.photoButtonText}>Bonnetje fotograferen</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.actionSection}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
            <Text style={styles.primaryButtonText}>Opslaan</Text>
          </TouchableOpacity>

          {!isNew && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Text style={styles.deleteButtonText}>Onkost verwijderen</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <InAppCamera
        visible={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraCapture}
      />
      <UndoToast
        visible={showUndoToast}
        message="Onkost verwijderd"
        onUndo={handleUndoDelete}
        onDismiss={handleToastDismiss}
      />
      {dialogNode}
    </SafeAreaView>
  );
}

function getStyles(colors: ReturnType<typeof useAppColors>['colors']) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 40 },

  headerSection: { marginBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  dateSelector: { flexDirection: 'row', alignItems: 'center', marginTop: 4, alignSelf: 'flex-start', gap: 6 },
  dateSelectorText: {
    color: colors.accentSecondary,
    fontWeight: '600',
    fontSize: 17,
    textTransform: 'capitalize',
  },
  dateSelectorIcon: { color: colors.accentSecondary, fontSize: 14 },

  lockBanner: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  lockBannerText: { color: colors.warning, fontWeight: '600' },

  mainCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },

  modernInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 16,
    color: colors.textPrimary,
    fontSize: 15,
  },

  sectionLabel: { color: colors.textDisabled, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  companyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  companyChip: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  companyChipText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  helperText: { color: colors.textSecondary, fontSize: 12 },

  photoButton: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  photoButtonText: { color: colors.textSecondary, fontSize: 15 },

  receiptContainer: { gap: 8 },
  receiptImage: { width: '100%', height: 200, borderRadius: 10 },
  receiptActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sharePhotoButton: { padding: 8 },
  sharePhotoText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  removePhotoButton: { alignItems: 'center', padding: 8 },
  removePhotoText: { color: colors.error, fontSize: 14 },

  actionSection: { gap: 12, marginBottom: 4 },
  primaryButton: {
    backgroundColor: colors.accentSecondary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },

  deleteButton: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  deleteButtonText: { color: colors.error, fontWeight: '600', fontSize: 15 },
});
}
