import { getDb } from './schema';

export function getSetting(key: string, defaultValue: string = ''): string {
  const db = getDb();
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? defaultValue;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.runSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}
