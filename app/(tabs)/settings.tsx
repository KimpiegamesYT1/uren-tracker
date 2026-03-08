import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import {
  getCompanyColorPresets,
  getCompanyDisplayColor,
  formatEuro,
} from '@/constants/colors';
import ColorPicker, { HueSlider, Panel1 } from 'reanimated-color-picker';
import { useAppStore } from '@/store/use-app-store';
import { getAllCompanies, insertCompany, updateCompany, deleteCompany } from '@/db/companies';
import { Company } from '@/db/schema';
import { saveExportJSONToFiles, importFromJSON, exportHoursPdf, HoursPdfAction } from '@/utils/backup';
import { useAppColors } from '@/hooks/use-app-colors';
import { useDialog } from '@/components/ui/app-dialog';
import { getMonthSummaries } from '@/db/work-entries';

type CompanyFormState = { name: string; hourlyRate: string; color: string };
type MonthSummary = { year: number; month: number; total_hours: number; total_amount: number };

const MONTH_NAMES = [
  '', 'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];

export default function SettingsScreen() {
  const { settings, updateSetting, loadCompanies } = useAppStore();
  const { colors, uiTheme } = useAppColors();

  const companyPresets = useMemo(() => getCompanyColorPresets(uiTheme), [uiTheme]);

  const { show: showDialog, dialogNode } = useDialog();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [monthSummaries, setMonthSummaries] = useState<MonthSummary[]>([]);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showColorPickerModal, setShowColorPickerModal] = useState(false);
  const [showHoursExportModal, setShowHoursExportModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [hoursExportStep, setHoursExportStep] = useState<1 | 2>(1);
  const [hoursExportMode, setHoursExportMode] = useState<'open' | 'month'>('open');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [userNameInput, setUserNameInput] = useState('');
  const [pickerColor, setPickerColor] = useState<string>(companyPresets[0]);
  const [form, setForm] = useState<CompanyFormState>({
    name: '',
    hourlyRate: '',
    color: companyPresets[0],
  });

  const styles = getStyles(colors);

  useFocusEffect(
    useCallback(() => {
      setCompanies(getAllCompanies());
      const months = getMonthSummaries();
      setMonthSummaries(months);
      setUserNameInput(settings.userName ?? '');
      if (months.length > 0) {
        setSelectedMonth(`${months[0].year}-${String(months[0].month).padStart(2, '0')}`);
      }
    }, [settings.userName])
  );

  const openAddCompany = () => {
    setEditingCompany(null);
    setForm({ name: '', hourlyRate: '', color: companyPresets[0] });
    setPickerColor(companyPresets[0]);
    setShowCompanyModal(true);
  };

  const openEditCompany = (company: Company) => {
    const displayColor = getCompanyDisplayColor(company.color, uiTheme);
    setEditingCompany(company);
    setForm({
      name: company.name,
      hourlyRate: String(company.hourly_rate),
      color: displayColor,
    });
    setPickerColor(displayColor);
    setShowCompanyModal(true);
  };

  const saveCompany = () => {
    const rate = parseFloat(form.hourlyRate.replace(',', '.'));
    if (!form.name.trim()) {
      showDialog({ title: 'Naam vereist', message: 'Voer een bedrijfsnaam in.' });
      return;
    }
    if (isNaN(rate) || rate < 0) {
      showDialog({ title: 'Ongeldig tarief', message: 'Voer een geldig uurtarief in.' });
      return;
    }

    if (editingCompany) {
      updateCompany(editingCompany.id, form.name.trim(), rate, form.color);
    } else {
      insertCompany(form.name.trim(), rate, form.color);
    }

    loadCompanies();
    setCompanies(getAllCompanies());
    setShowCompanyModal(false);
  };

  const confirmDeleteCompany = (company: Company) => {
    showDialog({
      title: 'Bedrijf verwijderen',
      message: `Weet je zeker dat je "${company.name}" wilt verwijderen? Bestaande diensten worden niet verwijderd.`,
      buttons: [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: () => {
            deleteCompany(company.id);
            loadCompanies();
            setCompanies(getAllCompanies());
          },
        },
      ],
    });
  };

  const handleExport = () => {
    showDialog({
      title: 'Backup exporteren',
      message: 'Let op: bonfoto\'s worden niet meegenomen in de backup. Alleen de tekstgegevens worden geëxporteerd.',
      buttons: [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Exporteren',
          onPress: async () => {
            try {
              const result = await saveExportJSONToFiles();
              if (!result.success) {
                showDialog({ title: 'Export geannuleerd', message: result.message });
                return;
              }
              showDialog({ title: 'Export gelukt', message: result.message });
            } catch {
              showDialog({ title: 'Fout', message: 'Exporteren naar bestand is mislukt.' });
            }
          },
        },
      ],
    });
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled) return;
      const uri = result.assets[0].uri;
      const json = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      showDialog({
        title: 'Backup importeren',
        message: 'Dit overschrijft alle bestaande data. Doorgaan?',
        buttons: [
          { text: 'Annuleren', style: 'cancel' },
          {
            text: 'Importeren',
            style: 'destructive',
            onPress: () => {
              const { success, error } = importFromJSON(json);
              if (success) {
                loadCompanies();
                setCompanies(getAllCompanies());
                showDialog({ title: 'Klaar', message: 'Backup succesvol geïmporteerd.' });
              } else {
                showDialog({ title: 'Fout', message: error ?? 'Importeren mislukt.' });
              }
            },
          },
        ],
      });
    } catch {
      showDialog({ title: 'Fout', message: 'Kon bestand niet lezen.' });
    }
  };

  const openHoursExportModal = () => {
    setHoursExportStep(1);
    setHoursExportMode('open');
    setShowHoursExportModal(true);
  };

  const closeHoursExportModal = () => {
    setShowHoursExportModal(false);
    setHoursExportStep(1);
  };

  const handleHoursPdfExport = async (action: HoursPdfAction) => {
    try {
      const scope =
        hoursExportMode === 'open'
          ? ({ type: 'open' } as const)
          : (() => {
              const [year, month] = selectedMonth.split('-').map(Number);
              return { type: 'month' as const, year, month };
            })();

      const result = await exportHoursPdf(scope, action, settings.userName?.trim() ?? '');
      if (!result.success) {
        showDialog({ title: 'PDF export geannuleerd', message: result.message });
        return;
      }
      showDialog({ title: 'PDF export gelukt', message: result.message });
      closeHoursExportModal();
    } catch {
      showDialog({ title: 'Fout', message: 'PDF exporteren is mislukt.' });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.header}>Instellingen</Text>

        <Text style={styles.sectionTitle}>Bedrijven</Text>
        <View style={styles.card}>
          {companies.map((company) => (
            <TouchableOpacity
              key={company.id}
              style={styles.companyRow}
              onPress={() => openEditCompany(company)}>
              <View
                style={[
                  styles.colorDot,
                  { backgroundColor: getCompanyDisplayColor(company.color, uiTheme) },
                ]}
              />
              <View style={styles.companyInfo}>
                <Text style={styles.companyName}>{company.name}</Text>
                <Text style={styles.companyRate}>{formatEuro(company.hourly_rate)}/uur</Text>
              </View>
              <TouchableOpacity
                onPress={() => confirmDeleteCompany(company)}
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}>
                <Text style={styles.deleteText}>x</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.addButton} onPress={openAddCompany}>
            <Text style={styles.addButtonText}>+ Bedrijf toevoegen</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Uren Afronden</Text>
        <View style={styles.card}>
          <Text style={styles.helperText}>
            Bepaalt hoe werktijd wordt afgerond voordat het bedrag wordt berekend.
          </Text>

          <Text style={styles.optionLabel}>Stapgrootte</Text>
          <View style={styles.segmented}>
            {([1, 15, 30] as const).map((unit, index) => (
              <TouchableOpacity
                key={unit}
                style={[
                  styles.segmentedOption,
                  index > 0 && styles.segmentedOptionWithSeparator,
                  settings.roundingUnit === unit && styles.segmentedOptionActive,
                ]}
                onPress={() => updateSetting('roundingUnit', unit)}>
                <Text
                  style={[
                    styles.segmentedOptionText,
                    settings.roundingUnit === unit && styles.segmentedOptionTextActive,
                  ]}>
                  {unit === 1 ? 'Exact (minuten)' : unit === 15 ? 'Per kwartier' : 'Per half uur'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.optionLabel, { marginTop: 14 }]}>Afrondingsmethode</Text>
          <View style={styles.segmented}>
            {(['up', 'down', 'round'] as const).map((direction, index) => (
              <TouchableOpacity
                key={direction}
                style={[
                  styles.segmentedOption,
                  index > 0 && styles.segmentedOptionWithSeparator,
                  settings.roundingDirection === direction && styles.segmentedOptionActive,
                ]}
                onPress={() => updateSetting('roundingDirection', direction)}>
                <Text
                  style={[
                    styles.segmentedOptionText,
                    settings.roundingDirection === direction && styles.segmentedOptionTextActive,
                  ]}>
                  {direction === 'up'
                    ? 'Altijd omhoog'
                    : direction === 'down'
                      ? 'Altijd omlaag'
                      : 'Dichtstbijzijnde'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Backup & Herstel</Text>
        <View style={styles.card}>
          <View style={styles.backupButtonsGroup}>
            <TouchableOpacity style={styles.backupButton} onPress={openHoursExportModal}>
              <Text style={styles.backupButtonText}>Exporteer uren</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backupButton} onPress={handleExport}>
              <Text style={styles.backupButtonText}>Exporteer naar JSON</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backupButton} onPress={handleImport}>
              <Text style={styles.backupButtonText}>Importeer vanuit JSON</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.backupNote}>
            Foto&apos;s van bonnetjes worden niet meegenomen in de backup om de bestandsgrootte klein te houden.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Profiel</Text>
        <View style={styles.card}>
          <Text style={styles.helperText}>Naam op PDF titel (bijvoorbeeld: Open uren Floris).</Text>
          <TextInput
            style={styles.profileInput}
            placeholder="Jouw naam"
            placeholderTextColor={colors.textDisabled}
            value={userNameInput}
            onChangeText={setUserNameInput}
          />
          <TouchableOpacity
            style={[styles.backupButton, { marginTop: 10 }]}
            onPress={() => {
              updateSetting('userName', userNameInput.trim());
              showDialog({ title: 'Opgeslagen', message: 'Naam voor PDF titel is bijgewerkt.' });
            }}>
            <Text style={styles.backupButtonText}>Naam opslaan</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Thema</Text>
        <View style={styles.card}>
          <View style={styles.segmented}>
            {(['dark', 'light', 'system'] as const).map((theme, index) => (
              <TouchableOpacity
                key={theme}
                style={[
                  styles.segmentedOption,
                  index > 0 && styles.segmentedOptionWithSeparator,
                  settings.theme === theme && styles.segmentedOptionActive,
                ]}
                onPress={() => updateSetting('theme', theme)}>
                <Text
                  style={[
                    styles.segmentedOptionText,
                    settings.theme === theme && styles.segmentedOptionTextActive,
                  ]}>
                  {theme === 'dark' ? 'Donker' : theme === 'light' ? 'Licht' : 'Systeem'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal visible={showCompanyModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {editingCompany ? 'Bedrijf bewerken' : 'Bedrijf toevoegen'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Naam"
              placeholderTextColor={colors.textDisabled}
              value={form.name}
              onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Uurtarief (bijv. 15,00)"
              placeholderTextColor={colors.textDisabled}
              keyboardType="decimal-pad"
              value={form.hourlyRate}
              onChangeText={(value) => setForm((prev) => ({ ...prev, hourlyRate: value }))}
            />

            <Text style={styles.colorLabel}>Kleur</Text>
            <View style={styles.colorRow}>
              {companyPresets.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: color },
                    form.color === color && styles.colorSwatchActive,
                  ]}
                  onPress={() => {
                    setForm((prev) => ({ ...prev, color }));
                    setPickerColor(color);
                  }}
                />
              ))}
            </View>
            <TouchableOpacity
              style={styles.customColorButton}
              onPress={() => setShowColorPickerModal(true)}>
              <Text style={styles.customColorButtonText}>Aangepaste Kleur</Text>
              <View style={[styles.customColorPreviewDot, { backgroundColor: form.color }]} />
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowCompanyModal(false)}>
                <Text style={styles.modalBtnCancelText}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnConfirm]} onPress={saveCompany}>
                <Text style={styles.modalBtnConfirmText}>Opslaan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showColorPickerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.colorPickerBox}>
            <Text style={styles.modalTitle}>Kies kleur</Text>
            <View style={styles.colorPickerWrapper}>
              <ColorPicker
                value={pickerColor}
                onChangeJS={(value) => setPickerColor(value.hex)}
                style={styles.colorPickerCanvas}
              >
                <Panel1 style={styles.panelStyle} />
                <HueSlider style={styles.hueSliderStyle} />
              </ColorPicker>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowColorPickerModal(false)}>
                <Text style={styles.modalBtnCancelText}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={() => {
                  setForm((prev) => ({ ...prev, color: pickerColor }));
                  setShowColorPickerModal(false);
                }}>
                <Text style={styles.modalBtnConfirmText}>Kies deze kleur</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showHoursExportModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, styles.hoursExportModalBox]}>
            <Text style={styles.modalTitle}>Exporteer uren</Text>

            {hoursExportStep === 1 ? (
              <>
                <Text style={styles.optionLabel}>Stap 1: Welke uren wil je exporteren?</Text>
                <View style={[styles.segmented, styles.hoursExportSegmented]}>
                  <TouchableOpacity
                    style={[styles.segmentedOption, hoursExportMode === 'open' && styles.segmentedOptionActive]}
                    onPress={() => setHoursExportMode('open')}>
                    <Text
                      style={[
                        styles.segmentedOptionText,
                        styles.hoursExportOptionText,
                        hoursExportMode === 'open' && styles.segmentedOptionTextActive,
                      ]}>
                      Open uren
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segmentedOption,
                      styles.segmentedOptionWithSeparator,
                      hoursExportMode === 'month' && styles.segmentedOptionActive,
                    ]}
                    onPress={() => setHoursExportMode('month')}>
                    <Text
                      style={[
                        styles.segmentedOptionText,
                        styles.hoursExportOptionText,
                        hoursExportMode === 'month' && styles.segmentedOptionTextActive,
                      ]}>
                      Van een maand
                    </Text>
                  </TouchableOpacity>
                </View>

                {hoursExportMode === 'month' ? (
                  <View style={styles.monthGrid}>
                    {monthSummaries.length === 0 ? (
                      <Text style={styles.helperText}>Nog geen maanden beschikbaar.</Text>
                    ) : (
                      monthSummaries.map((m) => {
                        const value = `${m.year}-${String(m.month).padStart(2, '0')}`;
                        const active = selectedMonth === value;
                        return (
                          <TouchableOpacity
                            key={value}
                            style={[styles.monthChip, active && styles.monthChipActive]}
                            onPress={() => setSelectedMonth(value)}>
                            <Text style={[styles.monthChipText, active && styles.monthChipTextActive]}>
                              {MONTH_NAMES[m.month]} {m.year}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                ) : null}

                <View style={[styles.modalButtons, styles.hoursExportButtons]}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={closeHoursExportModal}>
                    <Text style={styles.modalBtnCancelText}>Annuleren</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnConfirm]}
                    onPress={() => setHoursExportStep(2)}
                    disabled={hoursExportMode === 'month' && monthSummaries.length === 0}>
                    <Text style={styles.modalBtnConfirmText}>Volgende</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.optionLabel}>Stap 2: Wat wil je met het bestand doen?</Text>
                <View style={styles.optionRow}>
                  <TouchableOpacity style={styles.optionButton} onPress={() => handleHoursPdfExport('save')}>
                    <Text style={styles.optionButtonText}>Opslaan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.optionButton} onPress={() => handleHoursPdfExport('share')}>
                    <Text style={styles.optionButtonText}>Delen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.optionButton} onPress={() => handleHoursPdfExport('print')}>
                    <Text style={styles.optionButtonText}>Printen</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.modalButtons, styles.hoursExportButtons]}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setHoursExportStep(1)}>
                    <Text style={styles.modalBtnCancelText}>Terug</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnConfirm]}
                    onPress={closeHoursExportModal}>
                    <Text style={styles.modalBtnConfirmText}>Sluiten</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      {dialogNode}
    </SafeAreaView>
  );
}

function getStyles(colors: ReturnType<typeof useAppColors>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { padding: 16, paddingBottom: 40 },
    header: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, marginBottom: 20 },
    sectionTitle: {
      color: colors.textSecondary,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 8,
      marginTop: 20,
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
    },

    companyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
      gap: 12,
    },
    colorDot: { width: 16, height: 16, borderRadius: 8 },
    companyInfo: { flex: 1 },
    companyName: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
    companyRate: { color: colors.textSecondary, fontSize: 12 },
    deleteText: {
      color: colors.textSecondary,
      fontSize: 22,
      lineHeight: 22,
      width: 22,
      textAlign: 'center',
    },
    addButton: {
      paddingTop: 14,
      alignItems: 'center',
    },
    addButtonText: { color: colors.accentSecondary, fontWeight: '600', fontSize: 15 },

    helperText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 12 },
    optionLabel: { color: colors.textDisabled, fontSize: 13, marginBottom: 8 },
    optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    segmented: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      overflow: 'hidden',
    },
    hoursExportSegmented: {
      backgroundColor: colors.surface,
    },
    segmentedOption: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      minHeight: 42,
      justifyContent: 'center',
    },
    segmentedOptionWithSeparator: {
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.textDisabled,
    },
    segmentedOptionActive: {
      backgroundColor: colors.accentSecondary,
    },
    segmentedOptionText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
    hoursExportOptionText: { color: colors.textPrimary, fontWeight: '600' },
    segmentedOptionTextActive: { color: colors.onAccent, fontWeight: '700' },
    optionButton: {
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
    },
    optionButtonActive: {
      backgroundColor: colors.accentSecondary,
    },
    optionButtonText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
    optionButtonTextActive: { color: colors.onAccent, fontWeight: '700' },

    backupButton: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 10,
      padding: 14,
      alignItems: 'center',
    },
    backupButtonsGroup: {
      gap: 10,
      paddingBottom: 4,
    },
    backupButtonText: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
    backupNote: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 12,
      lineHeight: 18,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: colors.scrimStrong,
      justifyContent: 'flex-end',
    },
    modalBox: {
      backgroundColor: colors.surfaceElevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 24,
      gap: 12,
    },
    hoursExportModalBox: {
      paddingBottom: 200,
    },
    modalTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 4 },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 14,
      color: colors.textPrimary,
      fontSize: 16,
    },
    profileInput: {
      backgroundColor: colors.bg,
      borderRadius: 10,
      padding: 14,
      color: colors.textPrimary,
      fontSize: 16,
    },
    colorLabel: { color: colors.textSecondary, fontSize: 13 },
    colorRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'center',
    },
    colorSwatch: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    colorSwatchActive: {
      borderWidth: 3,
      borderColor: colors.textPrimary,
    },
    customColorButton: {
      marginTop: 8,
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    customColorButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
    customColorPreviewDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
    },
    colorPickerBox: {
      backgroundColor: colors.surfaceElevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 16,
      gap: 12,
      minHeight: 420,
    },
    colorPickerWrapper: {
      height: 320,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      padding: 12,
    },
    colorPickerCanvas: {
      flex: 1,
      gap: 12,
    },
    panelStyle: {
      flex: 1,
      borderRadius: 10,
    },
    hueSliderStyle: {
      marginTop: 10,
      borderRadius: 8,
    },
    monthGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
      marginBottom: 4,
    },
    monthChip: {
      backgroundColor: colors.surfaceHighlight,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    monthChipActive: {
      backgroundColor: colors.accentSecondary,
    },
    monthChipText: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    monthChipTextActive: {
      color: colors.onAccent,
      fontWeight: '700',
    },
    modalButtons: { flexDirection: 'row', gap: 10 },
    hoursExportButtons: { marginTop: 14 },
    modalBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
    modalBtnCancel: { backgroundColor: colors.surface },
    modalBtnCancelText: { color: colors.textPrimary, fontWeight: '600' },
    modalBtnConfirm: { backgroundColor: colors.accentSecondary },
    modalBtnConfirmText: { color: colors.onAccent, fontWeight: '700' },
  });
}
