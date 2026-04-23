import React, { useEffect, useState, useMemo } from 'react';
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

function capitalizeWords(value: string) {
  return value
    .split(' ')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

async function ensureReceiptsDir() {
  const info = await FileSystem.getInfoAsync(RECEIPTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RECEIPTS_DIR, { intermediates: true });
  }
}

export default function ExpenseModalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const refreshBalance = useAppStore((s) => s.refreshBalance);
  const { colors, uiTheme } = useAppColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { show: showDialog, dialogNode } = useDialog();

  const initialDate = params.date ? dateStringToDate(params.date) : new Date();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptUris, setReceiptUris] = useState<string[]>([]);
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
      receiptUris
    );
    refreshBalance();
    router.back();
  };

  const handleCameraCapture = async (sourceUris: string[]) => {
    await ensureReceiptsDir();
    const nextUris: string[] = [];

    for (const sourceUri of sourceUris.slice(0, 5)) {
      let resolvedUri = sourceUri;
      const alreadyStored = receiptUris.includes(sourceUri) || sourceUri.startsWith(RECEIPTS_DIR);

      if (!alreadyStored) {
        const fileName = `receipt_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
        const destUri = `${RECEIPTS_DIR}${fileName}`;
        try {
          await FileSystem.copyAsync({ from: sourceUri, to: destUri });
        } catch {
          await FileSystem.moveAsync({ from: sourceUri, to: destUri });
        }
        resolvedUri = destUri;
      }

      if (!nextUris.includes(resolvedUri)) {
        nextUris.push(resolvedUri);
      }
    }

    setReceiptUris(nextUris);
  };

  const onDateChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(false);
    if (date) setSelectedDate(date);
  };

  const handleRemovePhoto = (index: number) => {
    setReceiptUris(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerSection}>
          <Text style={styles.headerTitle}>Onkost Toevoegen</Text>
          <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateSelectorText}>
              {capitalizeWords(selectedDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }))}
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

          {receiptUris.length > 0 && (
            <ScrollView
              style={styles.receiptStrip}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.receiptStripContent}>
              {receiptUris.map((uri, index) => (
                <View key={index} style={styles.receiptContainer}>
                  <Image source={{ uri }} style={styles.receiptImage} resizeMode="cover" />
                  <TouchableOpacity onPress={() => handleRemovePhoto(index)} style={styles.removeBtn}>
                    <Text style={styles.removeText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          {receiptUris.length < 5 && (
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
        initialUris={receiptUris}
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

    receiptStrip: {
      marginTop: 12,
    },
    receiptStripContent: {
      gap: 12,
      paddingTop: 8,
      paddingBottom: 2,
    },

    receiptContainer: {
      position: 'relative',
      height: 120,
      width: 120,
      borderRadius: 16,
      overflow: 'hidden',
    },
    receiptImage: { width: '100%', height: '100%' },
    removeBtn: {
      position: 'absolute',
      top: 4,
      right: 4,
      backgroundColor: colors.scrim,
      borderRadius: 12,
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeText: { color: colors.error, fontWeight: '700', fontSize: 14 },

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
