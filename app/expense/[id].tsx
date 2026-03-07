import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { Colors, formatEuro, getCompanyDisplayColor } from '@/constants/colors';
import { useAppStore } from '@/store/use-app-store';
import { insertExpense, updateExpense, deleteExpense } from '@/db/expenses';
import { getAllCompanies } from '@/db/companies';
import { getDb, Expense } from '@/db/schema';
import { Company } from '@/db/schema';
import { dateToDateString, dateStringToDate } from '@/utils/rounding';
import { InAppCamera } from '@/components/in-app-camera';
import { useAppColors } from '@/hooks/use-app-colors';

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
  const { uiTheme } = useAppColors();

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
  }, [id]);

  const handleSave = () => {
    if (isLocked && !lockWarningShown) {
      Alert.alert(
        'Onkost al uitbetaald',
        'Deze onkostenpost is al uitbetaald. Weet je zeker dat je dit wilt wijzigen? Dit beïnvloedt je openstaande saldo.',
        [
          { text: 'Annuleren', style: 'cancel' },
          {
            text: 'Toch bewerken',
            style: 'destructive',
            onPress: () => {
              setLockWarningShown(true);
              doSave();
            },
          },
        ]
      );
      return;
    }
    doSave();
  };

  const doSave = () => {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!description.trim()) {
      Alert.alert('Beschrijving vereist', 'Voer een beschrijving in.');
      return;
    }
    if (!selectedCompanyId) {
      Alert.alert('Bedrijf vereist', 'Kies eerst een bedrijf voor deze onkost.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Ongeldig bedrag', 'Voer een geldig bedrag in.');
      return;
    }
    const dateStr = dateToDateString(selectedDate);

    if (isNew) {
      insertExpense(dateStr, selectedCompanyId, description.trim(), parsedAmount, receiptUri);
    } else if (existingExpense) {
      updateExpense(existingExpense.id, dateStr, selectedCompanyId, description.trim(), parsedAmount, receiptUri);
      // If was locked and now edited, reset lock so saldo recalculates on next payment
      if (isLocked) {
        const db = getDb();
        db.runSync('UPDATE expenses SET is_locked = 0 WHERE id = ?', [existingExpense.id]);
      }
    }
    refreshBalance();
    router.back();
  };

  const handleDelete = () => {
    if (!existingExpense) return;
    Alert.alert(
      'Onkost verwijderen',
      'Weet je zeker dat je deze onkostenpost wilt verwijderen?',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: () => {
            deleteExpense(existingExpense.id);
            refreshBalance();
            router.back();
          },
        },
      ]
    );
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
      Alert.alert('Niet beschikbaar', 'Delen is niet beschikbaar op dit apparaat.');
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
        {isLocked && (
          <View style={styles.lockBanner}>
            <Text style={styles.lockBannerText}>🔒 Deze onkost is al uitbetaald</Text>
          </View>
        )}

        <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.dateButtonText}>
            {selectedDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker value={selectedDate} mode="date" display="default" onChange={onDateChange} />
        )}

        <TextInput
          style={styles.input}
          placeholder="Beschrijving"
          placeholderTextColor={Colors.textDisabled}
          value={description}
          onChangeText={setDescription}
        />

        <Text style={styles.sectionLabel}>Bedrijf</Text>
        <View style={styles.companyRow}>
          {companies.map((company) => (
            <TouchableOpacity
              key={company.id}
              style={[
                styles.companyChip,
                { borderColor: getCompanyDisplayColor(company.color, uiTheme) },
                selectedCompanyId === company.id && {
                  backgroundColor: getCompanyDisplayColor(company.color, uiTheme),
                },
              ]}
              onPress={() => setSelectedCompanyId(company.id)}>
              <Text
                style={[
                  styles.companyChipText,
                  selectedCompanyId === company.id && {
                    color: uiTheme === 'dark' ? '#0E141B' : '#FFFFFF',
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
          style={styles.input}
          placeholder="Bedrag (bijv. 25,50)"
          placeholderTextColor={Colors.textDisabled}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />

        {/* Receipt photo */}
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

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Opslaan</Text>
        </TouchableOpacity>

        {!isNew && (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Onkost verwijderen</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <InAppCamera
        visible={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraCapture}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },

  lockBanner: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  lockBannerText: { color: Colors.warning, fontWeight: '600' },

  dateButton: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
  },
  dateButtonText: { color: Colors.textPrimary, fontSize: 15 },

  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    color: Colors.textPrimary,
    fontSize: 16,
  },

  sectionLabel: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  companyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  companyChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  companyChipText: { color: Colors.textSecondary, fontSize: 13 },
  helperText: { color: Colors.textSecondary, fontSize: 12 },

  photoButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    borderStyle: 'dashed',
    padding: 20,
    alignItems: 'center',
  },
  photoButtonText: { color: Colors.textSecondary, fontSize: 15 },

  receiptContainer: { gap: 8 },
  receiptImage: { width: '100%', height: 200, borderRadius: 10 },
  receiptActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sharePhotoButton: { padding: 8 },
  sharePhotoText: { color: Colors.accentSecondary, fontSize: 14, fontWeight: '600' },
  removePhotoButton: { alignItems: 'center', padding: 8 },
  removePhotoText: { color: Colors.error, fontSize: 14 },

  saveButton: {
    backgroundColor: Colors.accentSecondary,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },

  deleteButton: {
    borderWidth: 1,
    borderColor: Colors.error,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  deleteButtonText: { color: Colors.error, fontWeight: '600', fontSize: 15 },
});
