import { getDb, Company } from './schema';

/** Active companies, i.e. everything that has not been archived. */
export function getAllCompanies(): Company[] {
  const db = getDb();
  return db.getAllSync<Company>(
    'SELECT * FROM companies WHERE deleted_at IS NULL ORDER BY name ASC'
  );
}

/** Any company by id, archived or not — used to resolve historical entries. */
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

/**
 * Archives a company. Existing work entries and expenses keep pointing at it so
 * their company name, colour and (for work entries) the frozen hourly rate
 * still resolve; the company just disappears from the pickers.
 */
export function deleteCompany(id: number): void {
  const db = getDb();
  db.runSync("UPDATE companies SET deleted_at = datetime('now') WHERE id = ?", [id]);
}
