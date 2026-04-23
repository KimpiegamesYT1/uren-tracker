import React, { useState, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as ImageManipulator from 'expo-image-manipulator';

import { getCompanyDisplayColor } from '@/constants/colors';
import { useAppStore } from '@/store/use-app-store';
import { insertExpense, updateExpense, deleteExpense, restoreExpense, getExpenseById } from '@/db/expenses';
import { getAllCompanies } from '@/db/companies';
import { getDb, Expense, Company } from '@/db/schema';
import { dateToDateString, dateStringToDate } from '@/utils/rounding';
import { InAppCamera } from '@/components/in-app-camera';
import { UndoToast } from '@/components/undo-toast';
import { useAppColors } from '@/hooks/use-app-colors';
import { useDialog } from '@/components/ui/app-dialog';

const RECEIPTS_DIR = `${FileSystem.documentDirectory}receipts/`;

function capitalizeWords(value: string) {
  return value
    .split(' ')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

async function ensureReceiptsDir() {
  const info = await FileSystem.getInfoAsync(RECEIPTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RECEIPTS_DIR, { intermediates: true });
  }
}

export default function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const refreshBalance = useAppStore((s) => s.refreshBalance);
  const userName = useAppStore((s) => s.settings.userName);
  const { colors, uiTheme } = useAppColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
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
  const [receiptUris, setReceiptUris] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [isSharingExpense, setIsSharingExpense] = useState(false);
  const [showUndoToast, setShowUndoToast] = useState(false);

  useEffect(() => {
    const loaded = getAllCompanies();
    setCompanies(loaded);
    if (loaded.length > 0) {
      setSelectedCompanyId(loaded[0].id);
    }

    if (!isNew) {
      const expense = getExpenseById(Number(id));
      if (expense) {
        setExistingExpense(expense);
        setIsLocked(expense.is_locked === 1);
        setSelectedDate(dateStringToDate(expense.date));
        setDescription(expense.description);
        setAmount(String(expense.amount));
        setSelectedCompanyId(expense.company_id ?? (loaded[0]?.id ?? null));
        setReceiptUris(expense.receipt_uris || (expense.receipt_photo_uri ? [expense.receipt_photo_uri] : []));
      }
    }
  }, [id, isNew]);

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
        insertExpense(dateStr, selectedCompanyId, description.trim(), parsedAmount, receiptUris);
      } else if (existingExpense) {
        const oldPhotos = existingExpense.receipt_uris || (existingExpense.receipt_photo_uri ? [existingExpense.receipt_photo_uri] : []);
        for (const oldPhoto of oldPhotos) {
          if (!receiptUris.includes(oldPhoto)) {
            try {
              await FileSystem.deleteAsync(oldPhoto, { idempotent: true });
            } catch {}
          }
        }
        updateExpense(existingExpense.id, dateStr, selectedCompanyId, description.trim(), parsedAmount, receiptUris);
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
    if (existingExpense) {
      const photos = existingExpense.receipt_uris || (existingExpense.receipt_photo_uri ? [existingExpense.receipt_photo_uri] : []);
      for (const photo of photos) {
        try {
          await FileSystem.deleteAsync(photo, { idempotent: true });
        } catch {}
      }
    }
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

  const handleRemovePhoto = (index: number) => {
    setReceiptUris(prev => prev.filter((_, i) => i !== index));
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const optimizePhotoForPdf = async (uri: string): Promise<string | null> => {
    try {
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
      });

      const maxEdge = Math.max(size.width, size.height);
      const resizeAction: ImageManipulator.Action[] = [];

      if (maxEdge > 1600) {
        if (size.width >= size.height) {
          resizeAction.push({ resize: { width: 1600 } });
        } else {
          resizeAction.push({ resize: { height: 1600 } });
        }
      }

      const optimized = await ImageManipulator.manipulateAsync(
        uri,
        resizeAction,
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );

      if (optimized.base64) {
        try {
          if (optimized.uri !== uri) {
            await FileSystem.deleteAsync(optimized.uri, { idempotent: true });
          }
        } catch {}
        return optimized.base64;
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleShareExpense = useCallback(async () => {
    if (isNew || isSharingExpense) return;

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      showDialog({ title: 'Niet beschikbaar', message: 'Delen is niet beschikbaar op dit apparaat.' });
      return;
    }

    try {
      setIsSharingExpense(true);

      const companyName = companies.find((c) => c.id === selectedCompanyId)?.name ?? '-';
      const fullDate = capitalizeWords(selectedDate.toLocaleDateString('nl-NL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }));
      const parsedAmount = parseFloat(amount.replace(',', '.'));
      const amountText = Number.isFinite(parsedAmount)
        ? parsedAmount.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
        : amount;

      const photoHtmlBlocks: string[] = [];
      for (const uri of receiptUris) {
        const optimizedBase64 = await optimizePhotoForPdf(uri);
        if (optimizedBase64) {
          photoHtmlBlocks.push(`<img class="photo" src="data:image/jpeg;base64,${optimizedBase64}" />`);
        } else {
          photoHtmlBlocks.push('<p class="photo-fallback">Een foto kon niet geladen worden.</p>');
        }
      }

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                padding: 24px;
                color: #111;
              }
              .header {
                border-bottom: 2px solid #111;
                padding-bottom: 10px;
                margin-bottom: 14px;
              }
              .title {
                margin: 0;
                font-size: 24px;
                font-weight: 800;
              }
              .meta {
                margin-bottom: 18px;
              }
              .row {
                margin: 0 0 7px;
                font-size: 14px;
                line-height: 1.35;
              }
              .label {
                font-weight: 700;
              }
              .photos {
                margin-top: 14px;
              }
              .photo-wrap {
                margin: 0 0 14px;
                page-break-inside: avoid;
              }
              .photo {
                display: block;
                width: 100%;
                max-width: 100%;
                height: auto;
                max-height: 700px;
                object-fit: contain;
                border: none;
                border-radius: 0;
              }
              .photo-fallback {
                font-size: 12px;
                color: #777;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1 class="title">Onkosten</h1>
            </div>
            <div class="meta">
              <p class="row"><span class="label">Naam:</span> ${escapeHtml(userName || '-')}</p>
              <p class="row"><span class="label">Beschrijving:</span> ${escapeHtml(description || '-')}</p>
              <p class="row"><span class="label">Bedrag:</span> ${escapeHtml(amountText || '-')}</p>
              <p class="row"><span class="label">Datum:</span> ${escapeHtml(fullDate)}</p>
              <p class="row"><span class="label">Bedrijf:</span> ${escapeHtml(companyName)}</p>
            </div>
            <div class="photos">
              ${photoHtmlBlocks.length > 0
                ? photoHtmlBlocks.map((block) => `<div class="photo-wrap">${block}</div>`).join('')
                : '<p>Geen bonfoto\'s toegevoegd.</p>'}
            </div>
          </body>
        </html>
      `;

      const pdf = await Print.printToFileAsync({ html });
      const datePart = selectedDate.toISOString().slice(0, 10);
      const descriptionPart = slugify(description).slice(0, 24) || 'onkosten';
      const shareFileName = `onkosten-${datePart}-${descriptionPart}.pdf`;
      const targetUri = `${FileSystem.cacheDirectory}${shareFileName}`;

      try {
        await FileSystem.deleteAsync(targetUri, { idempotent: true });
      } catch {}

      let shareUri = pdf.uri;
      try {
        await FileSystem.copyAsync({ from: pdf.uri, to: targetUri });
        shareUri = targetUri;
      } catch {}

      await Sharing.shareAsync(shareUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Deel onkosten',
      });
    } catch {
      showDialog({ title: 'Fout', message: 'Kon de onkost niet delen.' });
    } finally {
      setIsSharingExpense(false);
    }
  }, [
    isNew,
    isSharingExpense,
    showDialog,
    companies,
    userName,
    selectedCompanyId,
    amount,
    receiptUris,
    description,
    selectedDate,
  ]);

  useLayoutEffect(() => {
    if (isNew) {
      navigation.setOptions({ headerRight: undefined });
      return;
    }

    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={[styles.headerShareButton, isSharingExpense && styles.headerShareButtonDisabled]}
          onPress={() => void handleShareExpense()}
          disabled={isSharingExpense}
          accessibilityLabel="Delen"
          accessibilityRole="button">
          <Text style={styles.headerShareButtonText}>Delen</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, isNew, isSharingExpense, handleShareExpense, styles]);

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
              {capitalizeWords(selectedDate.toLocaleDateString('nl-NL', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }))}
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
                  <TouchableOpacity onPress={() => setPreviewUri(uri)} activeOpacity={0.9}>
                    <Image source={{ uri }} style={styles.receiptImage} resizeMode="cover" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRemovePhoto(index)} style={styles.removePhotoButton}>
                    <Text style={styles.removePhotoText}>✕</Text>
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
        initialUris={receiptUris}
      />
      <Modal visible={!!previewUri} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <TouchableOpacity style={styles.previewModalBackdrop} activeOpacity={1} onPress={() => setPreviewUri(null)}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.previewModalImage} resizeMode="contain" />
          ) : null}
          <Text style={styles.previewModalHint}>Tik om te sluiten</Text>
        </TouchableOpacity>
      </Modal>
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
  receiptActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sharePhotoButton: { padding: 8 },
  sharePhotoText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  removePhotoButton: {
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
  removePhotoText: { color: colors.error, fontSize: 14, fontWeight: '700' },

  actionSection: { gap: 12, marginBottom: 4 },
  primaryButton: {
    backgroundColor: colors.accentSecondary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },

  headerShareButton: {
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerShareButtonDisabled: {
    opacity: 0.6,
  },
  headerShareButtonText: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },

  deleteButton: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  deleteButtonText: { color: colors.error, fontWeight: '600', fontSize: 15 },

  previewModalBackdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 12,
  },
  previewModalImage: {
    width: '100%',
    height: '85%',
    borderRadius: 12,
  },
  previewModalHint: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
});
}
