import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
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
  }, [selectedDate, companies]);

  const handleSaveDienst = () => {
    if (!selectedCompanyId) {
      Alert.alert('Geen bedrijf', 'Selecteer eerst een bedrijf.');
      return;
    }

    const company = companies.find((c) => c.id === selectedCompanyId);
    if (!company) return;

    const startStr = dateToTimeString(startTime);
    const endStr = dateToTimeString(endTime);
    const rawMinutes = calcRawDuration(startStr, endStr);

    if (rawMinutes <= 0) {
      Alert.alert('Ongeldige tijd', 'Eindtijd moet na starttijd liggen.');
      return;
    }

    const rounded = roundMinutes(rawMinutes, settings.roundingUnit, settings.roundingDirection);
    const amount = (rounded / 60) * company.hourly_rate;
    const dateStr = dateToDateString(selectedDate);

    insertWorkEntry(dateStr, selectedCompanyId, startStr, endStr, note, rounded, amount);
    refreshBalance();

    // Prepare form for the next entry with workday defaults.
    setNote('');
    setStartTime(createTimeAt(9, 0));
    setEndTime(createTimeAt(16, 0));
    loadDayData();
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

          {/* Header */}
          <Text style={styles.header}>Uren Registreren</Text>

          {/* Date picker */}
          <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateButtonText}>{formatDate(selectedDate)}</Text>
            <Text style={styles.dateButtonIcon}>▼</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="default"
              onChange={onDateChange}
              maximumDate={new Date(today.getFullYear() + 1, 11, 31)}
            />
          )}

          {/* Company selector */}
          {companies.length === 0 ? (
            <View style={styles.noCompanyBanner}>
              <Text style={styles.noCompanyText}>
                Voeg eerst een bedrijf toe via Instellingen.
              </Text>
            </View>
          ) : (
            <View style={styles.companyRow}>
              {companies.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.companyButton,
                    { borderColor: getCompanyDisplayColor(c.color, uiTheme) },
                    selectedCompanyId === c.id && { backgroundColor: getCompanyDisplayColor(c.color, uiTheme) },
                  ]}
                  onPress={() => setSelectedCompanyId(c.id)}>
                  <Text
                    style={[
                      styles.companyButtonText,
                      selectedCompanyId === c.id && { color: uiTheme === 'dark' ? '#0E141B' : '#FFFFFF' },
                    ]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Time pickers */}
          <View style={styles.timeRow}>
            <View style={styles.timeBlock}>
              <Text style={styles.label}>Starttijd</Text>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => setShowStartPicker(true)}>
                <Text style={styles.timeButtonText}>{dateToTimeString(startTime)}</Text>
              </TouchableOpacity>
              {showStartPicker && (
                <DateTimePicker
                  value={startTime}
                  mode="time"
                  is24Hour
                  display="default"
                  onChange={onStartTimeChange}
                />
              )}
            </View>

            <Text style={styles.timeSeparator}>→</Text>

            <View style={styles.timeBlock}>
              <Text style={styles.label}>Eindtijd</Text>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => setShowEndPicker(true)}>
                <Text style={styles.timeButtonText}>{dateToTimeString(endTime)}</Text>
              </TouchableOpacity>
              {showEndPicker && (
                <DateTimePicker
                  value={endTime}
                  mode="time"
                  is24Hour
                  display="default"
                  onChange={onEndTimeChange}
                />
              )}
            </View>
          </View>

          {/* Duration preview */}
          {preview && (
            <View style={styles.previewBox}>
              <Text style={styles.previewText}>
                {formatDuration(preview.rounded)} · {formatEuro(preview.amount)}
              </Text>
            </View>
          )}

          {/* Note */}
          <TextInput
            style={styles.noteInput}
            placeholder="Opmerking (optioneel)"
            placeholderTextColor={colors.textDisabled}
            value={note}
            onChangeText={setNote}
          />

          {/* Save button */}
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveDienst}>
            <Text style={styles.saveButtonText}>Dienst Opslaan</Text>
          </TouchableOpacity>

          {/* Expense button */}
          <TouchableOpacity
            style={styles.expenseButton}
            onPress={() => router.push('/modal')}>
            <Text style={styles.expenseButtonText}>+ Losse Onkosten Toevoegen</Text>
          </TouchableOpacity>

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
    </SafeAreaView>
  );
}

function getStyles(colors: ReturnType<typeof useAppColors>['colors']) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 16, paddingBottom: 40 },
  header: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: 16 },

  // Date
  dateButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateButtonText: { fontSize: 16, color: colors.textPrimary, textTransform: 'capitalize' },
  dateButtonIcon: { color: colors.textSecondary, fontSize: 12 },

  // Company
  noCompanyBanner: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  noCompanyText: { color: colors.warning, textAlign: 'center' },
  companyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  companyButton: {
    borderWidth: 2,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  companyButtonText: { color: colors.textPrimary, fontWeight: '600', fontSize: 14 },

  // Time
  label: { color: colors.textSecondary, fontSize: 12, marginBottom: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  timeBlock: { flex: 1 },
  timeSeparator: { color: colors.textSecondary, fontSize: 20, paddingBottom: 10 },
  timeButton: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeButtonText: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, letterSpacing: 1 },

  // Preview
  previewBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  previewText: { color: colors.accent, fontWeight: '700', fontSize: 16 },

  // Note
  noteInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Buttons
  saveButton: {
    backgroundColor: colors.accentSecondary,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  saveButtonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  expenseButton: {
    borderWidth: 1,
    borderColor: colors.info,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: colors.surface,
  },
  expenseButtonText: { color: colors.info, fontWeight: '600', fontSize: 15 },

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
    borderWidth: 1,
    borderColor: colors.border,
  },
  entryColorBar: { width: 4, alignSelf: 'stretch' },
  entryInfo: { flex: 1, padding: 12 },
  entryTime: { color: colors.textSecondary, fontSize: 12 },
  entryCompany: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  entryNote: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  entryRight: { padding: 12, alignItems: 'flex-end', gap: 2 },
  entryHours: { color: colors.textSecondary, fontSize: 12 },
  entryAmount: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  lockIcon: { fontSize: 12 },
});
}
