import { getDb, Company } from './schema';

export function getAllCompanies(): Company[] {
  const db = getDb();
  return db.getAllSync<Company>('SELECT * FROM companies ORDER BY name ASC');
}

export function getCompanyById(id: number): Company | null {
  const db = getDb();
  return db.getFirstSync<Company>('SELECT * FROM companies WHERE id = ?', [id]) ?? null;
}

export function insertCompany(name: string, hourlyRate: number, color: string): number {
  const db = getDb();
  const result = db.runSync(
    'INSERT INTO companies (name, hourly_rate, color) VALUES (?, ?, ?)',
    [name, hourlyRate, color]
  );
  return result.lastInsertRowId;
}

export function updateCompany(id: number, name: string, hourlyRate: number, color: string): void {
  const db = getDb();
  db.runSync(
    'UPDATE companies SET name = ?, hourly_rate = ?, color = ? WHERE id = ?',
    [name, hourlyRate, color, id]
  );
}

export function deleteCompany(id: number): void {
  const db = getDb();
  db.runSync('DELETE FROM companies WHERE id = ?', [id]);
}
