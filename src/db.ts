import Dexie, { type EntityTable } from 'dexie';

export type Category = {
  id: string;
  name: string;
  icon: string;
  archived: boolean;
};

export type Expense = {
  id: string;
  amountKopecks: number;
  categoryId: string;
  comment: string;
  spentAt: string;
  createdAt: string;
  updatedAt: string;
};

class SpendingDatabase extends Dexie {
  expenses!: EntityTable<Expense, 'id'>;
  categories!: EntityTable<Category, 'id'>;

  constructor() {
    super('spending-app');
    this.version(1).stores({
      expenses: 'id, spentAt, categoryId, updatedAt',
      categories: 'id, name, archived',
    });
  }
}

export const db = new SpendingDatabase();

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'groceries', name: 'Продукты', icon: '🛒', archived: false },
  { id: 'transport', name: 'Транспорт', icon: '🚗', archived: false },
  { id: 'cafe', name: 'Кафе', icon: '🍽️', archived: false },
  { id: 'home', name: 'Дом', icon: '🏠', archived: false },
  { id: 'health', name: 'Здоровье', icon: '💊', archived: false },
  { id: 'kids', name: 'Дети', icon: '🧸', archived: false },
  { id: 'clothes', name: 'Одежда', icon: '👕', archived: false },
  { id: 'fun', name: 'Развлечения', icon: '🎬', archived: false },
  { id: 'subscriptions', name: 'Подписки', icon: '📱', archived: false },
  { id: 'gifts', name: 'Подарки', icon: '🎁', archived: false },
  { id: 'other', name: 'Другое', icon: '📦', archived: false },
];

export async function seedCategories() {
  await db.transaction('rw', db.categories, async () => {
    if ((await db.categories.count()) === 0) {
      await db.categories.bulkAdd(DEFAULT_CATEGORIES);
    }
  });
}
