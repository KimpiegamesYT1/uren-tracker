import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { Platform } from 'react-native';
import { getDb } from '../db/schema';
import { getAllUnpaidWorkEntries } from '../db/work-entries';
import { getWorkEntriesByMonth } from '../db/work-entries';
import { getAllUnpaidExpenses, getExpensesByMonth } from '../db/expenses';
import { formatDuration } from './rounding';
import { formatEuro } from '../constants/colors';
import { Expense, WorkEntry } from '../db/schema';

export type HoursPdfScope =
  | { type: 'open' }
  | { type: 'month'; year: number; month: number };

export type HoursPdfAction = 'save' | 'share' | 'print';

const MONTH_NAMES = [
  '', 'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];

type BackupData = {
  version: number;
  exported_at: string;
  companies: object[];
  work_entries: object[];
  expenses: object[];
  payments: object[];
  settings: object[];
};

export function exportToJSON(): string {
  const db = getDb();

  const data: BackupData = {
    version: 1,
    exported_at: new Date().toISOString(),
    companies: db.getAllSync('SELECT * FROM companies'),
    work_entries: db.getAllSync('SELECT * FROM work_entries'),
    // Deliberately exclude receipt_photo_uri (blob data stays local)
    expenses: db
      .getAllSync<Record<string, unknown>>('SELECT * FROM expenses')
      .map(({ receipt_photo_uri: _photo, ...rest }) => rest),
    payments: db.getAllSync('SELECT * FROM payments'),
    settings: db.getAllSync('SELECT * FROM settings'),
  };

  return JSON.stringify(data, null, 2);
}

export async function shareExportJSON(): Promise<void> {
  const json = exportToJSON();
  const fileUri = `${FileSystem.cacheDirectory}uren-backup-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Exporteer backup' });
}

export async function saveExportJSONToFiles(): Promise<{ success: boolean; message: string }> {
  const json = exportToJSON();

  if (Platform.OS === 'android') {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted || !permission.directoryUri) {
      return { success: false, message: 'Geen map geselecteerd.' };
    }

    const fileName = `uren-backup-${Date.now()}.json`;
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      fileName,
      'application/json'
    );

    await FileSystem.writeAsStringAsync(fileUri, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    return { success: true, message: `Backup opgeslagen als ${fileName}` };
  }

  // iOS/web fallback: use native share sheet.
  await shareExportJSON();
  return { success: true, message: 'Backup gedeeld via systeemvenster.' };
}

function roundRate(value: number): string {
  return formatEuro(Number(value.toFixed(2)));
}

function formatDateWithWeekday(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  const d = new Date(year, month - 1, day);
  const weekday = d.toLocaleDateString('nl-NL', { weekday: 'long' });
  return `${date} (${weekday})`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createHoursPdfHtml(scope: HoursPdfScope, userName: string) {
  const workEntries =
    scope.type === 'open'
      ? getAllUnpaidWorkEntries()
      : getWorkEntriesByMonth(scope.year, scope.month);

  const expenses =
    scope.type === 'open'
      ? getAllUnpaidExpenses()
      : getExpensesByMonth(scope.year, scope.month);

  type PdfRow =
    | (WorkEntry & { rowType: 'work' })
    | (Expense & { rowType: 'expense' });

  const rowsData: PdfRow[] = [
    ...workEntries.map((entry) => ({ ...entry, rowType: 'work' as const })),
    ...expenses.map((expense) => ({ ...expense, rowType: 'expense' as const })),
  ].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.created_at.localeCompare(b.created_at);
  });

  const hourlyRatesByCompany = new Map<string, Set<string>>();

  const rows = rowsData
    .map((row) => {
      const openAmount = Math.max(0, row.amount - row.amount_paid);
      const moneyColumns =
        scope.type === 'open'
          ? `<td>${formatEuro(openAmount)}</td>`
          : `<td>${formatEuro(row.amount)}</td>`;

      if (row.rowType === 'work') {
        const companyName = row.company_name ?? 'Bedrijf';
        const usedRate = row.duration_minutes > 0 ? (row.amount * 60) / row.duration_minutes : 0;
        if (!hourlyRatesByCompany.has(companyName)) {
          hourlyRatesByCompany.set(companyName, new Set<string>());
        }
        hourlyRatesByCompany.get(companyName)?.add(roundRate(usedRate));

        const noteText = row.note?.trim();
        const companyCell = noteText
          ? `${escapeHtml(companyName)}<br/><span class="subtext">${escapeHtml(noteText)}</span>`
          : escapeHtml(companyName);

        return `
          <tr>
            <td>${formatDateWithWeekday(row.date)}</td>
            <td>${companyCell}</td>
            <td>${row.start_time}</td>
            <td>${row.end_time}</td>
            <td>${formatDuration(row.duration_minutes)}</td>
            ${moneyColumns}
          </tr>
        `;
      }

      const companyName = row.company_name?.trim() || 'Losse onkost / bonnetje';
      const companyCell =
        row.description?.trim() && row.company_name
          ? `${escapeHtml(companyName)}<br/><span class="subtext">${escapeHtml(row.description.trim())}</span>`
          : escapeHtml(companyName);
      return `
        <tr>
          <td>${formatDateWithWeekday(row.date)}</td>
          <td>${companyCell}</td>
          <td>-</td>
          <td>-</td>
          <td>Onkost</td>
          ${moneyColumns}
        </tr>
      `;
    })
    .join('');

  const totalHours = workEntries.reduce((sum, item) => sum + item.duration_minutes, 0);
  const totalAmount = rowsData.reduce((sum, item) => {
    const amount = scope.type === 'open' ? Math.max(0, item.amount - item.amount_paid) : item.amount;
    return sum + amount;
  }, 0);

  const titleBase = scope.type === 'open' ? 'Open uren' : `Uren ${MONTH_NAMES[scope.month]} ${scope.year}`;
  const title =
    userName.trim().length > 0 ? `${titleBase} ${userName.trim()}` : titleBase;

  const amountHeader = scope.type === 'open' ? '<th>Open bedrag</th>' : '<th>Bedrag</th>';
  const emptyColspan = 6;
  const totalRow =
    scope.type === 'open'
      ? `
        <tr>
          <td colspan="4"><strong>Totaal</strong></td>
          <td><strong>${formatDuration(totalHours)}</strong></td>
          <td><strong>${formatEuro(totalAmount)}</strong></td>
        </tr>
      `
      : `
        <tr>
          <td colspan="4"><strong>Totaal</strong></td>
          <td><strong>${formatDuration(totalHours)}</strong></td>
          <td><strong>${formatEuro(totalAmount)}</strong></td>
        </tr>
      `;

  const ratesRows = Array.from(hourlyRatesByCompany.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([company, rates]) => `<tr><td>${company}</td><td>${Array.from(rates).join(', ')}/uur</td></tr>`)
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1d2b3a; }
          h1 { margin: 0 0 6px 0; font-size: 22px; }
          p.meta { margin: 0 0 16px 0; color: #4a5d73; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #d6e0ec; text-align: left; padding: 10px; font-size: 13px; }
          th { background: #eef3f9; }
          .subtext { color: #6f8193; font-size: 11px; }
          .totals { margin-top: 16px; font-size: 14px; }
          .section-title { margin-top: 20px; font-size: 15px; font-weight: 700; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p class="meta">Geexporteerd op ${new Date().toLocaleString('nl-NL')}</p>
        <table>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Bedrijf</th>
              <th>Start</th>
              <th>Eind</th>
              <th>Duur</th>
              ${amountHeader}
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="${emptyColspan}">Geen uren gevonden.</td></tr>`}
            ${rows ? totalRow : ''}
          </tbody>
        </table>

        <div class="section-title">Uurloon per bedrijf overzicht</div>
        <table>
          <thead>
            <tr>
              <th>Bedrijf</th>
              <th>Gebruikt uurloon</th>
            </tr>
          </thead>
          <tbody>
            ${ratesRows || '<tr><td colspan="2">Geen bedrijven gevonden.</td></tr>'}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

export async function exportHoursPdf(
  scope: HoursPdfScope,
  action: HoursPdfAction,
  userName: string = ''
): Promise<{ success: boolean; message: string }> {
  const html = createHoursPdfHtml(scope, userName);

  if (action === 'print') {
    await Print.printAsync({ html });
    return { success: true, message: 'Printvenster geopend.' };
  }

  const { uri } = await Print.printToFileAsync({ html });
  const prefix = scope.type === 'open' ? 'open-uren' : `uren-${scope.year}-${String(scope.month).padStart(2, '0')}`;
  const fileName = `${prefix}-${Date.now()}.pdf`;

  if (action === 'share') {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Exporteer uren als PDF',
    });
    return { success: true, message: 'PDF gedeeld via systeemvenster.' };
  }

  if (Platform.OS === 'android') {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted || !permission.directoryUri) {
      return { success: false, message: 'Geen map geselecteerd.' };
    }

    const pdfContent = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      fileName,
      'application/pdf'
    );

    await FileSystem.writeAsStringAsync(targetUri, pdfContent, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return { success: true, message: `PDF opgeslagen als ${fileName}` };
  }

  const targetUri = `${FileSystem.documentDirectory}${fileName}`;
  const pdfContent = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.writeAsStringAsync(targetUri, pdfContent, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { success: true, message: `PDF opgeslagen in app-map als ${fileName}` };
}

export function importFromJSON(json: string): { success: boolean; error?: string } {
  try {
    const data: BackupData = JSON.parse(json);
    if (!data.version || !data.companies) {
      return { success: false, error: 'Ongeldig backup-bestand.' };
    }

    const db = getDb();

    db.withTransactionSync(() => {
      // Clear all existing data
      db.execSync(`
        DELETE FROM work_entries;
        DELETE FROM expenses;
        DELETE FROM payments;
        DELETE FROM companies;
        DELETE FROM settings;
      `);

      for (const c of data.companies as any[]) {
        db.runSync(
          'INSERT INTO companies (id, name, hourly_rate, color, created_at) VALUES (?, ?, ?, ?, ?)',
          [c.id, c.name, c.hourly_rate, c.color, c.created_at]
        );
      }

      for (const we of data.work_entries as any[]) {
        db.runSync(
          `INSERT INTO work_entries (id, date, company_id, start_time, end_time, note, duration_minutes, amount, amount_paid, is_locked, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [we.id, we.date, we.company_id, we.start_time, we.end_time, we.note, we.duration_minutes, we.amount, we.amount_paid, we.is_locked, we.created_at]
        );
      }

      for (const e of data.expenses as any[]) {
        db.runSync(
          `INSERT INTO expenses (id, date, company_id, description, amount, receipt_photo_uri, amount_paid, is_locked, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            e.id,
            e.date,
            typeof e.company_id === 'number' ? e.company_id : null,
            e.description,
            e.amount,
            null,
            e.amount_paid,
            e.is_locked,
            e.created_at,
          ]
        );
      }

      for (const p of data.payments as any[]) {
        db.runSync(
          'INSERT INTO payments (id, date, amount, note, created_at) VALUES (?, ?, ?, ?, ?)',
          [p.id, p.date, p.amount, p.note, p.created_at]
        );
      }

      for (const s of data.settings as any[]) {
        db.runSync(
          'INSERT INTO settings (key, value) VALUES (?, ?)',
          [s.key, s.value]
        );
      }
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Onbekende fout bij importeren.' };
  }
}
