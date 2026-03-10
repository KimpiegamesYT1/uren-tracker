import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { getCompanyDisplayColor } from '@/constants/colors';
import { useAppStore } from '@/store/use-app-store';
import { insertExpense } from '@/db/expenses';
import { getAllCompanies } from '@/db/companies';
import { Company } from '@/db/schema';
import { dateToDateString, dateStringToDate } from '@/utils/rounding';
import { InAppCamera } from '@/components/in-app-camera';
import { useAppColors } from '@/hooks/use-app-colors';
import { useDialog } from '@/components/ui/app-dialog';

const RECEIPTS_DIR = `${FileSystem.documentDirectory}receipts/`;

async function ensureReceiptsDir() {
  const info = await FileSystem.getInfoAsync(RECEIPTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RECEIPTS_DIR, { intermediates: true });
  }
}

export default function ExpenseModalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const { refreshBalance } = useAppStore();
  const { colors, uiTheme } = useAppColors();
  const styles = getStyles(colors);
  const { show: showDialog, dialogNode } = useDialog();

  const initialDate = params.date ? dateStringToDate(params.date) : new Date();
  const [selectedDate, setSelectedDate] = useState(initialDate);
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
  }, []);

  useEffect(() => {
    if (companies.length === 1) {
      const onlyCompanyId = companies[0].id;
      if (selectedCompanyId !== onlyCompanyId) {
        setSelectedCompanyId(onlyCompanyId);
      }
      return;
    }

    if (companies.length > 1 && selectedCompanyId !== null && !companies.some((c) => c.id === selectedCompanyId)) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [companies, selectedCompanyId]);

  const handleSave = () => {
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
      showDialog({ title: 'Ongeldig bedrag', message: 'Voer een geldig positief bedrag in.' });
      return;
    }
    insertExpense(
      dateToDateString(selectedDate),
      selectedCompanyId,
      description.trim(),
      parsedAmount,
      receiptUri
    );
    refreshBalance();
    router.back();
  };

  const handleCameraCapture = async (sourceUri: string) => {
    await ensureReceiptsDir();
    const fileName = `receipt_${Date.now()}.jpg`;
    const destUri = `${RECEIPTS_DIR}${fileName}`;
    try {
      await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    } catch {
      await FileSystem.moveAsync({ from: sourceUri, to: destUri });
    }
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
          <Text style={styles.headerTitle}>Onkost Toevoegen</Text>
          <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateSelectorText}>
              {selectedDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            <Text style={styles.dateSelectorIcon}>▾</Text>
          </TouchableOpacity>
        </View>

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
            autoFocus
          />

          {companies.length !== 1 && (
            <>
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
            </>
          )}

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
                <TouchableOpacity onPress={handleSharePhoto} style={styles.shareBtn}>
                  <Text style={styles.shareText}>Deel foto</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setReceiptUri(null)} style={styles.removeBtn}>
                  <Text style={styles.removeText}>Foto verwijderen</Text>
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
            <Text style={styles.primaryButtonText}>Onkost Opslaan</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
            <Text style={styles.secondaryButtonText}>Annuleren</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <InAppCamera
        visible={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraCapture}
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

    sectionLabel: {
      color: colors.textDisabled,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 2,
      letterSpacing: 1,
    },
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
    shareBtn: { padding: 8 },
    shareText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
    removeBtn: { alignItems: 'center', padding: 8 },
    removeText: { color: colors.error, fontSize: 14 },

    actionSection: { gap: 12, marginBottom: 4 },
    primaryButton: {
      backgroundColor: colors.accentSecondary,
      borderRadius: 16,
      padding: 18,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },

    secondaryButton: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      alignItems: 'center',
    },
    secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  });
}
