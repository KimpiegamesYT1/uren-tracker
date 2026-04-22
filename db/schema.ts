import * as SQLite from 'expo-sqlite';
import { SETTINGS_KEYS } from '../constants/settings-keys';

export type Company = {
  id: number;
  name: string;
  hourly_rate: number;
  color: string;
  created_at: string;
};

export type WorkEntry = {
  id: number;
  date: string; // YYYY-MM-DD
  company_id: number;
  company_name?: string;
  company_color?: string;
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  note: string;
  duration_minutes: number; // after rounding
  amount: number; // calculated: (duration_minutes / 60) * hourly_rate
  amount_paid: number;
  is_locked: number; // 0 or 1
  created_at: string;
};

export type Expense = {
  id: number;
  date: string; // YYYY-MM-DD
  company_id: number | null;
  company_name?: string;
  company_color?: string;
  description: string;
  amount: number;
  receipt_photo_uri: string | null;
  receipt_uris: string[]; // Added
  amount_paid: number;
  is_locked: number; // 0 or 1
  created_at: string;
};

export type ExpensePhoto = {
  id: number;
  expense_id: number;
  photo_uri: string;
  sort_order: number;
  created_at: string;
};

export type Payment = {
  id: number;
  date: string; // YYYY-MM-DD
  amount: number;
  note: string;
  created_at: string;
};

export type Setting = {
  key: string;
  value: string;
};

let _db: SQLite.SQLiteDatabase | null = null;
let _isInitialized = false;

function ensureInitialized(db: SQLite.SQLiteDatabase): void {
  if (_isInitialized) return;

  db.execSync(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      hourly_rate REAL NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#4CAF50',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS work_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      company_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      is_locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      company_id INTEGER,
      description TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      receipt_photo_uri TEXT,
      amount_paid REAL NOT NULL DEFAULT 0,
      is_locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS expense_receipt_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      photo_uri TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_work_entries_date ON work_entries(date);
    CREATE INDEX IF NOT EXISTS idx_work_entries_unpaid ON work_entries(amount_paid, amount);
    CREATE INDEX IF NOT EXISTS idx_work_entries_active_date ON work_entries(deleted_at, date);
    CREATE INDEX IF NOT EXISTS idx_work_entries_active_fifo ON work_entries(deleted_at, date, created_at);
    CREATE INDEX IF NOT EXISTS idx_work_entries_active_unpaid ON work_entries(deleted_at, amount_paid, amount);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_unpaid ON expenses(amount_paid, amount);
    CREATE INDEX IF NOT EXISTS idx_expenses_active_date ON expenses(deleted_at, date);
    CREATE INDEX IF NOT EXISTS idx_expenses_active_fifo ON expenses(deleted_at, date, created_at);
    CREATE INDEX IF NOT EXISTS idx_expenses_active_unpaid ON expenses(deleted_at, amount_paid, amount);
    CREATE INDEX IF NOT EXISTS idx_payments_date_created ON payments(date, created_at);

    INSERT OR IGNORE INTO settings (key, value) VALUES ('${SETTINGS_KEYS.roundingUnit}', '1');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('${SETTINGS_KEYS.roundingDirection}', 'round');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('${SETTINGS_KEYS.theme}', 'dark');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('${SETTINGS_KEYS.userName}', '');
  `);

  // Migration for existing installs that were created before expenses had company_id.
  try {
    db.runSync('ALTER TABLE expenses ADD COLUMN company_id INTEGER');
  } catch {
    // Column already exists; ignore.
  }

  // Migration: soft-delete support
  try {
    db.runSync('ALTER TABLE work_entries ADD COLUMN deleted_at TEXT DEFAULT NULL');
  } catch {
    // Column already exists; ignore.
  }
  try {
    db.runSync('ALTER TABLE expenses ADD COLUMN deleted_at TEXT DEFAULT NULL');
  } catch {
    // Column already exists; ignore.
  }

  // Migration: multiple photos
  try {
    // We check if we need to backfill existing photos.
    // If expense_receipt_photos is empty but there are expenses with receipt_photo_uri, insert them.
    const photoCount = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM expense_receipt_photos');
    if (photoCount && photoCount.count === 0) {
      db.runSync(`
        INSERT INTO expense_receipt_photos (expense_id, photo_uri, sort_order)
        SELECT id, receipt_photo_uri, 0 FROM expenses WHERE receipt_photo_uri IS NOT NULL
      `);
    }
  } catch (e) {
    console.error('Migration error for multiple photos:', e);
  }

  _isInitialized = true;
}

export function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync('uren-tracker.db');
  }
  ensureInitialized(_db);
  return _db;
}

export function initDatabase(): void {
  // Kept for explicit startup calls, but now safe if omitted.
  getDb();
}
