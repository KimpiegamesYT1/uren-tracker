import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { formatEuro } from '@/constants/colors';
import { useAppStore } from '@/store/use-app-store';
import { updateWorkEntry, deleteWorkEntry, restoreWorkEntry } from '@/db/work-entries';
import { getDb, WorkEntry } from '@/db/schema';
import { useAppColors } from '@/hooks/use-app-colors';
import { UndoToast } from '@/components/undo-toast';
import { useDialog } from '@/components/ui/app-dialog';
import {
  roundMinutes,
  calcRawDuration,
  dateToTimeString,
  dateToDateString,
  dateStringToDate,
  formatDuration,
} from '@/utils/rounding';

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const companies = useAppStore((s) => s.companies);
  const settings = useAppStore((s) => s.settings);
  const refreshBalance = useAppStore((s) => s.refreshBalance);
  const { colors } = useAppColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { show: showDialog, dialogNode } = useDialog();

  const [entry, setEntry] = useState<WorkEntry | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockWarningShown, setLockWarningShown] = useState(false);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [note, setNote] = useState('');
  const [showUndoToast, setShowUndoToast] = useState(false);

  useEffect(() => {
    if (!id) return;
    const db = getDb();
    const e = db.getFirstSync<WorkEntry>('SELECT * FROM work_entries WHERE id = ?', [Number(id)]);
    if (e) {
      setEntry(e);
      setIsLocked(e.is_locked === 1);
      setSelectedDate(dateStringToDate(e.date));
      setSelectedCompanyId(e.company_id);
      setNote(e.note);
      const [sh, sm] = e.start_time.split(':').map(Number);
      const [eh, em] = e.end_time.split(':').map(Number);
      const s = new Date();
      s.setHours(sh, sm, 0, 0);
      const en = new Date();
      en.setHours(eh, em, 0, 0);
      setStartTime(s);
      setEndTime(en);
    }
  }, [id]);

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

  const startStr = dateToTimeString(startTime);
  const endStr = dateToTimeString(endTime);
  const rawMinutes = calcRawDuration(startStr, endStr);
  const rounded =
    rawMinutes > 0
      ? roundMinutes(rawMinutes, settings.roundingUnit, settings.roundingDirection)
      : 0;
  const previewAmount =
    rounded > 0
      ? (rounded / 60) * (companies.find((c) => c.id === selectedCompanyId)?.hourly_rate ?? 0)
      : 0;

  const doSave = () => {
    if (rawMinutes <= 0) {
      showDialog({ title: 'Ongeldige tijd', message: 'Eindtijd moet na starttijd liggen.' });
      return;
    }
    if (!entry || !selectedCompanyId) return;
    const company = companies.find((c) => c.id === selectedCompanyId);
    if (!company) return;
    const dateStr = dateToDateString(selectedDate);
    const amount = (rounded / 60) * company.hourly_rate;
    try {
      updateWorkEntry(entry.id, dateStr, selectedCompanyId, startStr, endStr, note, rounded, amount);
      if (isLocked) {
        const db = getDb();
        db.runSync('UPDATE work_entries SET is_locked = 0 WHERE id = ?', [entry.id]);
      }
      refreshBalance();
      router.back();
    } catch {
      showDialog({ title: 'Fout', message: 'Kon de dienst niet opslaan. Probeer het opnieuw.' });
    }
  };

  const handleSave = () => {
    if (isLocked && !lockWarningShown) {
      showDialog({
        title: 'Dienst al uitbetaald',
        message:
          'Deze registratie is al uitbetaald. Weet je zeker dat je dit wilt wijzigen? Dit beinvloedt je openstaande saldo.',
        buttons: [
          { text: 'Annuleren', style: 'cancel' },
          {
            text: 'Toch bewerken',
            style: 'destructive',
            onPress: () => {
              setLockWarningShown(true);
              doSave();
            },
          },
        ],
      });
      return;
    }
    doSave();
  };

  const handleDelete = () => {
    if (!entry) return;
    deleteWorkEntry(entry.id);
    refreshBalance();
    setShowUndoToast(true);
  };

  const handleUndoDelete = () => {
    if (!entry) return;
    restoreWorkEntry(entry.id);
    refreshBalance();
    setShowUndoToast(false);
  };

  const handleToastDismiss = () => {
    setShowUndoToast(false);
    router.back();
  };

  const onDateChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(false);
    if (date) setSelectedDate(date);
  };

  const onStartChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowStartPicker(false);
    if (date) setStartTime(date);
  };

  const onEndChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowEndPicker(false);
    if (date) setEndTime(date);
  };

  if (!entry) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.notFound}>Dienst niet gevonden.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerSection}>
          <Text style={styles.headerTitle}>Dienst Bewerken</Text>
          <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateSelectorText}>
              {selectedDate.toLocaleDateString('nl-NL', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
            <Text style={styles.dateSelectorIcon}>&#9662;</Text>
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            onChange={onDateChange}
          />
        )}

        {isLocked && (
          <View style={styles.lockBanner}>
            <Text style={styles.lockBannerText}>Deze dienst is al uitbetaald</Text>
          </View>
        )}

        {companies.length !== 1 && (
          <View style={styles.companySection}>
            <Text style={styles.sectionLabel}>BEDRIJF</Text>
            {companies.length === 0 ? (
              <Text style={styles.helperText}>Voeg eerst een bedrijf toe in Instellingen.</Text>
            ) : (
              <View style={styles.companyRow}>
                {companies.map((c) => {
                  const active = selectedCompanyId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.companyChip,
                        active
                          ? { backgroundColor: c.color }
                          : { backgroundColor: colors.surfaceElevated },
                      ]}
                      onPress={() => setSelectedCompanyId(c.id)}>
                      <Text style={[styles.companyChipText, active && { color: colors.bg }]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        <View style={styles.mainCard}>
          <View style={styles.timeGrid}>
            <TouchableOpacity style={styles.timeInput} onPress={() => setShowStartPicker(true)}>
              <Text style={styles.timeLabel}>START</Text>
              <Text style={styles.timeValue}>{dateToTimeString(startTime)}</Text>
            </TouchableOpacity>
            <View style={styles.timeDivider}>
              <Text style={styles.arrowIcon}>&#8594;</Text>
            </View>
            <TouchableOpacity style={styles.timeInput} onPress={() => setShowEndPicker(true)}>
              <Text style={styles.timeLabel}>EIND</Text>
              <Text style={styles.timeValue}>{dateToTimeString(endTime)}</Text>
            </TouchableOpacity>
          </View>

          {showStartPicker && (
            <DateTimePicker
              value={startTime}
              mode="time"
              is24Hour
              display="default"
              onChange={onStartChange}
            />
          )}
          {showEndPicker && (
            <DateTimePicker
              value={endTime}
              mode="time"
              is24Hour
              display="default"
              onChange={onEndChange}
            />
          )}

          {rounded > 0 && (
            <View style={styles.resultBar}>
              <Text style={styles.resultText}>
                {formatDuration(rounded)} {'·'}{' '}
                <Text style={styles.resultAmount}>{formatEuro(previewAmount)}</Text>
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actionSection}>
          <TextInput
            style={styles.modernInput}
            placeholder="Opmerking toevoegen..."
            placeholderTextColor={colors.textDisabled}
            value={note}
            onChangeText={setNote}
          />

          <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
            <Text style={styles.primaryButtonText}>Opslaan</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Dienst verwijderen</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <UndoToast
        visible={showUndoToast}
        message="Dienst verwijderd"
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
    notFound: { color: colors.textSecondary, textAlign: 'center', marginTop: 40 },

    headerSection: { marginBottom: 8 },
    headerTitle: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
    dateSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      alignSelf: 'flex-start',
      gap: 6,
    },
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

    companySection: { marginBottom: 2 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textDisabled,
      marginBottom: 10,
      letterSpacing: 1,
    },
    helperText: { color: colors.textSecondary, marginBottom: 6 },
    companyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    companyChip: {
      borderRadius: 20,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    companyChipText: { color: colors.textPrimary, fontWeight: '600', fontSize: 14 },

    mainCard: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 20,
      marginBottom: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 5,
    },
    timeGrid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    timeInput: { flex: 1, alignItems: 'center' },
    timeLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textDisabled,
      marginBottom: 4,
      letterSpacing: 0.5,
    },
    timeValue: { fontSize: 32, fontWeight: '700', color: colors.textPrimary },
    timeDivider: { paddingHorizontal: 10 },
    arrowIcon: { fontSize: 20, color: colors.textDisabled },
    resultBar: {
      marginTop: 20,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.textDisabled,
      alignItems: 'center',
    },
    resultText: { color: colors.textSecondary, fontSize: 16, fontWeight: '500' },
    resultAmount: { color: colors.textPrimary, fontWeight: '700' },

    actionSection: { gap: 12, marginBottom: 4 },
    modernInput: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      padding: 16,
      color: colors.textPrimary,
      fontSize: 15,
    },

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
      borderRadius: 16,
      padding: 18,
      alignItems: 'center',
    },
    deleteButtonText: { color: colors.error, fontWeight: '600', fontSize: 16 },
  });
}
