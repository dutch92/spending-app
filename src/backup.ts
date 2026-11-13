import { db, type Category, type Expense } from './db';

export type SpendingBackup = {
  schemaVersion: 1;
  exportedAt: string;
  categories: Category[];
  expenses: Expense[];
};

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function validCategory(value: unknown): value is Category {
  return isRecord(value) &&
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.name === 'string' && value.name.trim().length > 0 &&
    typeof value.icon === 'string' &&
    typeof value.archived === 'boolean';
}

function validExpense(value: unknown): value is Expense {
  return isRecord(value) &&
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.categoryId === 'string' && value.categoryId.length > 0 &&
    typeof value.amountKopecks === 'number' && Number.isSafeInteger(value.amountKopecks) && value.amountKopecks > 0 &&
    typeof value.comment === 'string' &&
    validIso(value.spentAt) && validIso(value.createdAt) && validIso(value.updatedAt);
}

export function validateBackup(value: unknown): SpendingBackup {
  if (!isRecord(value) || value.schemaVersion !== 1 || !validIso(value.exportedAt) ||
      !Array.isArray(value.categories) || !Array.isArray(value.expenses)) {
    throw new Error('Неверный формат резервной копии или неподдерживаемая версия.');
  }
  if (!value.categories.every(validCategory) || !value.expenses.every(validExpense)) {
    throw new Error('В файле есть некорректные категории или расходы.');
  }
  const categories = value.categories as Category[];
  const expenses = value.expenses as Expense[];
  const categoryIds = new Set(categories.map((item) => item.id));
  if (categoryIds.size !== categories.length ||
      new Set(expenses.map((item) => item.id)).size !== expenses.length) {
    throw new Error('В резервной копии обнаружены повторяющиеся ID.');
  }
  if (expenses.some((item) => !categoryIds.has(item.categoryId))) {
    throw new Error('Некоторые расходы ссылаются на отсутствующие категории.');
  }
  return { schemaVersion: 1, exportedAt: value.exportedAt, categories, expenses };
}

export async function buildBackup(): Promise<SpendingBackup> {
  return db.transaction('r', db.categories, db.expenses, async () => ({
    schemaVersion: 1 as const,
    exportedAt: new Date().toISOString(),
    categories: await db.categories.toArray(),
    expenses: await db.expenses.toArray(),
  }));
}

export async function downloadBackup(): Promise<{ categories: number; expenses: number }> {
  const backup = await buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'spending-app-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari may need the object URL to remain alive while the download begins.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { categories: backup.categories.length, expenses: backup.expenses.length };
}

export async function readBackupFile(file: File): Promise<SpendingBackup> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error('Файл слишком большой (максимум 10 МБ).');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Не удалось прочитать JSON-файл.');
  }
  return validateBackup(parsed);
}

export async function restoreBackup(backup: SpendingBackup): Promise<void> {
  // Validate again before touching existing records.
  const safe = validateBackup(backup);
  await db.transaction('rw', db.categories, db.expenses, async () => {
    await db.expenses.clear();
    await db.categories.clear();
    await db.categories.bulkAdd(safe.categories);
    await db.expenses.bulkAdd(safe.expenses);
  });
}
