import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { Colors, formatEuro } from '@/constants/colors';
import { useAppStore } from '@/store/use-app-store';
import { updateWorkEntry, deleteWorkEntry } from '@/db/work-entries';
import { getDb, WorkEntry } from '@/db/schema';
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
  const { companies, settings, refreshBalance } = useAppStore();

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
      const startD = new Date();
      startD.setHours(sh, sm, 0, 0);
      setStartTime(startD);

      const [eh, em] = e.end_time.split(':').map(Number);
      const endD = new Date();
      endD.setHours(eh, em, 0, 0);
      setEndTime(endD);
    }
  }, [id]);

  const handleSave = () => {
    if (isLocked && !lockWarningShown) {
      Alert.alert(
        'Dienst al uitbetaald',
        'Deze registratie is al uitbetaald. Weet je zeker dat je dit wilt wijzigen? Dit beïnvloedt je openstaande saldo.',
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
    if (!entry || !selectedCompanyId) return;
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

    updateWorkEntry(entry.id, dateStr, selectedCompanyId, startStr, endStr, note, rounded, amount);

    // Reset lock so FIFO can re-evaluate if needed
    if (isLocked) {
      const db = getDb();
      db.runSync('UPDATE work_entries SET is_locked = 0 WHERE id = ?', [entry.id]);
    }

    refreshBalance();
    router.back();
  };

  const handleDelete = () => {
    if (!entry) return;
    Alert.alert(
      'Dienst verwijderen',
      'Weet je zeker dat je deze dienst wilt verwijderen?',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: () => {
            deleteWorkEntry(entry.id);
            refreshBalance();
            router.back();
          },
        },
      ]
    );
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

  const startStr = dateToTimeString(startTime);
  const endStr = dateToTimeString(endTime);
  const rawMinutes = calcRawDuration(startStr, endStr);
  const rounded = rawMinutes > 0 ? roundMinutes(rawMinutes, settings.roundingUnit, settings.roundingDirection) : 0;
  const company = companies.find((c) => c.id === selectedCompanyId);
  const previewAmount = company ? (rounded / 60) * company.hourly_rate : 0;

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
        {isLocked && (
          <View style={styles.lockBanner}>
            <Text style={styles.lockBannerText}>🔒 Deze dienst is al uitbetaald</Text>
          </View>
        )}

        {/* Date */}
        <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.dateButtonText}>
            {selectedDate.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker value={selectedDate} mode="date" display="default" onChange={onDateChange} />
        )}

        {/* Company */}
        <View style={styles.companyRow}>
          {companies.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[
                styles.companyButton,
                { borderColor: c.color },
                selectedCompanyId === c.id && { backgroundColor: c.color },
              ]}
              onPress={() => setSelectedCompanyId(c.id)}>
              <Text
                style={[
                  styles.companyButtonText,
                  selectedCompanyId === c.id && { color: '#121212' },
                ]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Times */}
        <View style={styles.timeRow}>
          <View style={styles.timeBlock}>
            <Text style={styles.label}>Starttijd</Text>
            <TouchableOpacity style={styles.timeButton} onPress={() => setShowStartPicker(true)}>
              <Text style={styles.timeButtonText}>{dateToTimeString(startTime)}</Text>
            </TouchableOpacity>
            {showStartPicker && (
              <DateTimePicker value={startTime} mode="time" is24Hour display="default" onChange={onStartChange} />
            )}
          </View>
          <Text style={styles.timeSep}>→</Text>
          <View style={styles.timeBlock}>
            <Text style={styles.label}>Eindtijd</Text>
            <TouchableOpacity style={styles.timeButton} onPress={() => setShowEndPicker(true)}>
              <Text style={styles.timeButtonText}>{dateToTimeString(endTime)}</Text>
            </TouchableOpacity>
            {showEndPicker && (
              <DateTimePicker value={endTime} mode="time" is24Hour display="default" onChange={onEndChange} />
            )}
          </View>
        </View>

        {/* Preview */}
        {rounded > 0 && (
          <View style={styles.previewBox}>
            <Text style={styles.previewText}>
              {formatDuration(rounded)} · {formatEuro(previewAmount)}
            </Text>
          </View>
        )}

        {/* Note */}
        <TextInput
          style={styles.input}
          placeholder="Opmerking (optioneel)"
          placeholderTextColor={Colors.textDisabled}
          value={note}
          onChangeText={setNote}
        />

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Opslaan</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>Dienst verwijderen</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  notFound: { color: Colors.textSecondary, textAlign: 'center', marginTop: 40 },

  lockBanner: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  lockBannerText: { color: Colors.warning, fontWeight: '600' },

  dateButton: { backgroundColor: Colors.surface, borderRadius: 10, padding: 14 },
  dateButtonText: { color: Colors.textPrimary, fontSize: 15 },

  companyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  companyButton: {
    borderWidth: 2,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  companyButtonText: { color: Colors.textPrimary, fontWeight: '600', fontSize: 14 },

  label: { color: Colors.textSecondary, fontSize: 12, marginBottom: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  timeBlock: { flex: 1 },
  timeSep: { color: Colors.textSecondary, fontSize: 20, paddingBottom: 10 },
  timeButton: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  timeButtonText: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },

  previewBox: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  previewText: { color: Colors.accent, fontWeight: '700', fontSize: 16 },

  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    color: Colors.textPrimary,
    fontSize: 15,
  },

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
