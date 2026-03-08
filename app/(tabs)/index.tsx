import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatEuro, getCompanyDisplayColor } from '@/constants/colors';
import { useAppStore } from '@/store/use-app-store';
import { insertWorkEntry, getWorkEntriesByDate } from '@/db/work-entries';
import { getExpensesByDate as fetchExpenses } from '@/db/expenses';
import { useAppColors } from '@/hooks/use-app-colors';
import { suggestCompanyForDate } from '@/utils/smart-company';
import { useDialog } from '@/components/ui/app-dialog';
import {
  roundMinutes,
  calcRawDuration,
  dateToTimeString,
  dateToDateString,
  formatDuration,
} from '@/utils/rounding';
import { WorkEntry, Expense } from '@/db/schema';

function createTimeAt(hours: number, minutes: number): Date {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export default function HomeScreen() {
  const router = useRouter();
  const { companies, settings, refreshBalance } = useAppStore();
  const { colors, uiTheme } = useAppColors();
  const styles = getStyles(colors);
  const { show: showDialog, dialogNode } = useDialog();

  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<Date>(() => createTimeAt(9, 0));
  const [endTime, setEndTime] = useState<Date>(() => createTimeAt(16, 0));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [note, setNote] = useState('');

  const [dayEntries, setDayEntries] = useState<WorkEntry[]>([]);
  const [dayExpenses, setDayExpenses] = useState<Expense[]>([]);

  // Load entries for the selected date
  const loadDayData = useCallback(() => {
    const dateStr = dateToDateString(selectedDate);
    setDayEntries(getWorkEntriesByDate(dateStr));
    setDayExpenses(fetchExpenses(dateStr));
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      loadDayData();
    }, [loadDayData])
  );

  // Auto-suggest company when date changes
  useEffect(() => {
    const suggested = suggestCompanyForDate(selectedDate);
    if (suggested !== null) {
      setSelectedCompanyId(suggested);
    } else if (companies.length > 0 && selectedCompanyId === null) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [selectedDate, companies, selectedCompanyId]);

  const handleSaveDienst = () => {
    if (!selectedCompanyId) {
      showDialog({ title: 'Geen bedrijf', message: 'Selecteer eerst een bedrijf.' });
      return;
    }

    const company = companies.find((c) => c.id === selectedCompanyId);
    if (!company) return;

    const startStr = dateToTimeString(startTime);
    const endStr = dateToTimeString(endTime);
    const rawMinutes = calcRawDuration(startStr, endStr);

    if (rawMinutes <= 0) {
      showDialog({ title: 'Ongeldige tijd', message: 'Eindtijd moet na starttijd liggen.' });
      return;
    }

    const rounded = roundMinutes(rawMinutes, settings.roundingUnit, settings.roundingDirection);
    const amount = (rounded / 60) * company.hourly_rate;
    const dateStr = dateToDateString(selectedDate);

    try {
      insertWorkEntry(dateStr, selectedCompanyId, startStr, endStr, note, rounded, amount);
      refreshBalance();
      // Prepare form for the next entry with workday defaults.
      setNote('');
      setStartTime(createTimeAt(9, 0));
      setEndTime(createTimeAt(16, 0));
      loadDayData();
    } catch {
      showDialog({ title: 'Fout', message: 'Kon de dienst niet opslaan. Probeer het opnieuw.' });
    }
  };

  const onDateChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(false);
    if (date) setSelectedDate(date);
  };

  const onStartTimeChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowStartPicker(false);
    if (date) setStartTime(date);
  };

  const onEndTimeChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowEndPicker(false);
    if (date) setEndTime(date);
  };

  const previewDuration = () => {
    const startStr = dateToTimeString(startTime);
    const endStr = dateToTimeString(endTime);
    const raw = calcRawDuration(startStr, endStr);
    if (raw <= 0) return null;
    const rounded = roundMinutes(raw, settings.roundingUnit, settings.roundingDirection);
    const company = companies.find((c) => c.id === selectedCompanyId);
    const amount = company ? (rounded / 60) * company.hourly_rate : 0;
    return { rounded, amount };
  };

  const preview = previewDuration();

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const formatDate = (d: Date) => {
    if (isSameDay(d, new Date())) return 'Vandaag';
    return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">

          {/* Header context */}
          <View style={styles.headerSection}>
            <Text style={styles.headerTitle}>Uren Registreren</Text>
            <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}
              accessibilityLabel={`Datum selecteren: ${formatDate(selectedDate)}`}
              accessibilityRole="button">
              <Text style={styles.dateSelectorText}>{formatDate(selectedDate)}</Text>
              <Text style={styles.dateSelectorIcon}>▾</Text>
            </TouchableOpacity>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="default"
              onChange={onDateChange}
              maximumDate={new Date(today.getFullYear() + 1, 11, 31)}
            />
          )}

          {/* Company selection */}
          <View style={styles.companySection}>
            <Text style={styles.sectionLabel}>BEDRIJF</Text>
            {companies.length === 0 ? (
              <Text style={styles.noCompanyInlineText}>Voeg eerst een bedrijf toe via Instellingen.</Text>
            ) : (
              <View style={styles.companyRow}>
                {companies.map((c) => {
                  const isActive = selectedCompanyId === c.id;
                  const companyColor = getCompanyDisplayColor(c.color, uiTheme);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.companyChip,
                        isActive
                          ? { backgroundColor: companyColor }
                          : { backgroundColor: colors.surfaceElevated },
                      ]}
                      onPress={() => setSelectedCompanyId(c.id)}
                      accessibilityLabel={`Bedrijf: ${c.name}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}>
                      <View
                        style={[
                          styles.companyDot,
                          { backgroundColor: isActive ? colors.onAccent : companyColor },
                        ]}
                      />
                      <Text
                        style={[
                          styles.companyChipText,
                          isActive && { color: uiTheme === 'dark' ? colors.bg : colors.surface },
                        ]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Interaction card */}
          <View style={styles.mainCard}>
            <View style={styles.timeGrid}>
              <TouchableOpacity style={styles.timeInput} onPress={() => setShowStartPicker(true)}
                accessibilityLabel={`Starttijd instellen: ${dateToTimeString(startTime)}`}
                accessibilityRole="button">
                <Text style={styles.timeLabel}>START</Text>
                <Text style={styles.timeValue}>{dateToTimeString(startTime)}</Text>
              </TouchableOpacity>

              <View style={styles.timeDivider}>
                <Text style={styles.arrowIcon}>→</Text>
              </View>

              <TouchableOpacity style={styles.timeInput} onPress={() => setShowEndPicker(true)}
                accessibilityLabel={`Eindtijd instellen: ${dateToTimeString(endTime)}`}
                accessibilityRole="button">
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
                onChange={onStartTimeChange}
              />
            )}
            {showEndPicker && (
              <DateTimePicker
                value={endTime}
                mode="time"
                is24Hour
                display="default"
                onChange={onEndTimeChange}
              />
            )}

            {preview && (
              <View style={styles.resultBar}>
                {preview.rounded > 0 ? (
                  <Text style={styles.resultText}>
                    {formatDuration(preview.rounded)} ·{' '}
                    <Text style={styles.resultAmount}>{formatEuro(preview.amount)}</Text>
                  </Text>
                ) : (
                  <Text style={styles.previewWarning}>
                    Afgerond naar 0 minuten - pas de tijden of afrondingsinstelling aan.
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Details and actions */}
          <View style={styles.actionSection}>
            <TextInput
              style={styles.modernInput}
              placeholder="Opmerking toevoegen..."
              placeholderTextColor={colors.textDisabled}
              value={note}
              onChangeText={setNote}
            />

            <TouchableOpacity style={styles.primaryButton} onPress={handleSaveDienst}
              accessibilityLabel="Dienst opslaan"
              accessibilityRole="button">
              <Text style={styles.primaryButtonText}>Dienst Opslaan</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/modal')}
              accessibilityLabel="Onkosten toevoegen"
              accessibilityRole="button">
              <Text style={styles.secondaryButtonText}>+ Onkosten toevoegen</Text>
            </TouchableOpacity>
          </View>

          {/* Day overview */}
          {(dayEntries.length > 0 || dayExpenses.length > 0) && (
            <View style={styles.dayList}>
              <Text style={styles.dayListHeader}>
                {formatDate(selectedDate)}
              </Text>

              {dayEntries.map((entry) => (
                <TouchableOpacity
                  key={`we-${entry.id}`}
                  style={styles.entryRow}
                  onPress={() => router.push(`/entry/${entry.id}`)}>
                  <View style={[styles.entryColorBar, { backgroundColor: getCompanyDisplayColor(entry.company_color ?? colors.accent, uiTheme) }]} />
                  <View style={styles.entryInfo}>
                    <Text style={styles.entryTime}>
                      {entry.start_time} – {entry.end_time}
                    </Text>
                    <Text style={styles.entryCompany}>{entry.company_name}</Text>
                    {entry.note ? <Text style={styles.entryNote}>{entry.note}</Text> : null}
                  </View>
                  <View style={styles.entryRight}>
                    <Text style={styles.entryHours}>{formatDuration(entry.duration_minutes)}</Text>
                    <Text style={styles.entryAmount}>{formatEuro(entry.amount)}</Text>
                    {entry.is_locked === 1 && <Text style={styles.lockIcon}>🔒</Text>}
                  </View>
                </TouchableOpacity>
              ))}

              {dayExpenses.map((exp) => (
                <TouchableOpacity
                  key={`exp-${exp.id}`}
                  style={styles.entryRow}
                  onPress={() => router.push(`/expense/${exp.id}`)}>
                  <View style={[styles.entryColorBar, { backgroundColor: colors.info }]} />
                  <View style={styles.entryInfo}>
                    <Text style={styles.entryTime}>Onkost</Text>
                    <Text style={styles.entryCompany}>{exp.description}</Text>
                  </View>
                  <View style={styles.entryRight}>
                    <Text style={styles.entryAmount}>{formatEuro(exp.amount)}</Text>
                    {exp.is_locked === 1 && <Text style={styles.lockIcon}>🔒</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {dialogNode}
    </SafeAreaView>
  );
}

function getStyles(colors: ReturnType<typeof useAppColors>['colors']) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 20, paddingBottom: 40 },

  headerSection: { marginBottom: 20 },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    alignSelf: 'flex-start',
    gap: 6,
  },
  dateSelectorText: {
    fontSize: 18,
    color: colors.accentSecondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dateSelectorIcon: { color: colors.accentSecondary, fontSize: 15 },

  companySection: { marginBottom: 18 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textDisabled,
    marginBottom: 10,
    letterSpacing: 1,
  },
  noCompanyInlineText: { color: colors.textSecondary, fontSize: 14 },
  companyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  companyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  companyDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  companyChipText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },

  mainCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },

  timeGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeInput: { flex: 1, alignItems: 'center' },
  timeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textDisabled,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  timeValue: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timeDivider: { paddingHorizontal: 10 },
  arrowIcon: { fontSize: 20, color: colors.textDisabled },

  resultBar: {
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.textDisabled,
    alignItems: 'center',
  },
  resultText: { fontSize: 16, color: colors.textSecondary, fontWeight: '500' },
  resultAmount: { color: colors.textPrimary, fontWeight: '700' },
  previewWarning: {
    color: colors.warning,
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },

  actionSection: { gap: 12, marginBottom: 24 },
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
  secondaryButton: { padding: 12, alignItems: 'center' },
  secondaryButtonText: { color: colors.accentSecondary, fontWeight: '600', fontSize: 14 },

  // Day list
  dayList: { gap: 8 },
  dayListHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  entryRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
  },
  entryColorBar: { width: 4, alignSelf: 'stretch' },
  entryInfo: { flex: 1, padding: 12 },
  entryTime: { color: colors.textSecondary, fontSize: 12 },
  entryCompany: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  entryNote: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  entryRight: { padding: 12, alignItems: 'flex-end', gap: 2 },
  entryHours: { color: colors.textSecondary, fontSize: 12 },
  entryAmount: { color: colors.textPrimary, fontWeight: '700', fontSize: 15 },
  lockIcon: { fontSize: 12 },
});
}
