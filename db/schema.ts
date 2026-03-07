import * as SQLite from 'expo-sqlite';

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
  amount_paid: number;
  is_locked: number; // 0 or 1
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

    INSERT OR IGNORE INTO settings (key, value) VALUES ('rounding_unit', '1');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('rounding_direction', 'round');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'dark');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('user_name', '');
  `);

  // Migration for existing installs that were created before expenses had company_id.
  try {
    db.runSync('ALTER TABLE expenses ADD COLUMN company_id INTEGER');
  } catch {
    // Column already exists; ignore.
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
