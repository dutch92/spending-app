import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Category, type Expense } from './db';

type Tab = 'add' | 'history' | 'stats' | 'settings';
const money = (kopecks: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(kopecks / 100);
const localDateTime = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const dayKey = (iso: string) => localDateTime(new Date(iso)).slice(0, 10);
const monthKey = (iso: string) => localDateTime(new Date(iso)).slice(0, 7);
const monthLabel = (key: string) => new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(key + '-01T12:00:00'));
const parseKopecks = (value: string) => {
  const cleaned = value.trim().replace(',', '.');
  if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const result = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
};

export default function App() {
  const expenses = useLiveQuery(() => db.expenses.orderBy('spentAt').reverse().toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];
  const [tab, setTab] = useState<Tab>('add');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [comment, setComment] = useState('');
  const [spentAt, setSpentAt] = useState(() => localDateTime(new Date()));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => localDateTime(new Date()).slice(0, 7));
  const [categoryName, setCategoryName] = useState('');
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    expenses.forEach((expense) => { result[expense.categoryId] = (result[expense.categoryId] ?? 0) + 1; });
    return result;
  }, [expenses]);
  const activeCategories = [...categories].filter((c) => !c.archived || c.id === categoryId)
    .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || a.name.localeCompare(b.name, 'ru'));
  const compactCategories = activeCategories.slice(0, 8);
  const selectedCategory = activeCategories.find((c) => c.id === categoryId);
  if (selectedCategory && !compactCategories.some((c) => c.id === categoryId)) {
    compactCategories[compactCategories.length - 1] = selectedCategory;
  }
  const visibleCategories = showAllCategories ? activeCategories : compactCategories;
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const filtered = expenses.filter((e) => monthKey(e.spentAt) === selectedMonth);
  const total = filtered.reduce((sum, e) => sum + e.amountKopecks, 0);
  const previousDate = new Date(selectedMonth + '-01T12:00:00');
  previousDate.setMonth(previousDate.getMonth() - 1);
  const previousMonth = localDateTime(previousDate).slice(0, 7);
  const previousTotal = expenses.filter((e) => monthKey(e.spentAt) === previousMonth)
    .reduce((sum, e) => sum + e.amountKopecks, 0);
  const groups = Object.entries(filtered.reduce<Record<string, Expense[]>>((acc, e) => {
    const key = dayKey(e.spentAt);
    (acc[key] ??= []).push(e);
    return acc;
  }, {})).sort(([a], [b]) => b.localeCompare(a));
  const categoryTotals = Object.entries(filtered.reduce<Record<string, number>>((acc, e) => {
    acc[e.categoryId] = (acc[e.categoryId] ?? 0) + e.amountKopecks;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const dailyTotals = groups.map(([day, rows]) => ({
    day, total: rows.reduce((sum, e) => sum + e.amountKopecks, 0),
  })).reverse();
  const maxDay = Math.max(1, ...dailyTotals.map((day) => day.total));

  function resetForm() {
    setAmount(''); setCategoryId(''); setComment(''); setSpentAt(localDateTime(new Date())); setEditingId(null); setShowDetails(false); setShowAllCategories(false);
  }
  function startEdit(expense: Expense) {
    setEditingId(expense.id); setAmount((expense.amountKopecks / 100).toFixed(2).replace(/\.00$/, ''));
    setCategoryId(expense.categoryId); setComment(expense.comment);
    setSpentAt(localDateTime(new Date(expense.spentAt))); setTab('add'); setNotice(''); setShowDetails(true);
  }
  async function saveExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountKopecks = parseKopecks(amount);
    if (!amountKopecks || !categoryId || !spentAt) { setNotice('Введите сумму, категорию и дату.'); return; }
    const timestamp = new Date(spentAt);
    if (Number.isNaN(timestamp.getTime())) { setNotice('Проверьте дату и время.'); return; }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const prior = editingId ? await db.expenses.get(editingId) : undefined;
      await db.expenses.put({
        id: prior?.id ?? crypto.randomUUID(),
        amountKopecks, categoryId, comment: comment.trim(), spentAt: timestamp.toISOString(),
        createdAt: prior?.createdAt ?? now, updatedAt: now,
      });
      resetForm(); setNotice(prior ? 'Расход обновлён' : 'Расход сохранён');
    } catch {
      setNotice('Не удалось сохранить расход.');
    } finally { setBusy(false); }
  }
  async function removeExpense(id: string) {
    if (!window.confirm('Удалить расход?')) return;
    await db.expenses.delete(id);
    setNotice('Расход удалён');
  }
  async function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name || categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    await db.categories.add({ id: crypto.randomUUID(), name, icon: '🏷️', archived: false });
    setCategoryName('');
  }
  async function renameCategory(c: Category) {
    const name = window.prompt('Название категории', c.name)?.trim();
    if (!name || name === c.name || categories.some((v) => v.id !== c.id && v.name.toLowerCase() === name.toLowerCase())) return;
    await db.categories.update(c.id, { name });
  }
  const empty = <p className="muted empty">Пока нет расходов за выбранный месяц.</p>;
  return (
    <div className="app">
      <header className="topbar"><span className="logo">◉</span><strong>Spending App</strong><span className="topbar-right">Локально на iPhone</span></header>
      <main>
        {tab === 'add' && (
          <section className="panel expense-panel">
            <h1>{editingId ? 'Изменить расход' : 'Новый расход'}</h1>
            <form className="expense-form" onSubmit={saveExpense}>
              <label htmlFor="amount">Сумма, ₽</label>
              <input id="amount" className="amount" type="text" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <div className="category-heading"><label>Категория</label>{activeCategories.length > 8 && <button className="text-button" type="button" onClick={() => setShowAllCategories((v) => !v)}>{showAllCategories ? 'Свернуть' : `Все (${activeCategories.length})`}</button>}</div>
              <div className="category-grid">
                {visibleCategories.map((c) => (
                  <button key={c.id} type="button" className={'category ' + (categoryId === c.id ? 'selected' : '')} onClick={() => setCategoryId(c.id)}>
                    <span className="emoji">{c.icon}</span><span>{c.name}</span>
                  </button>
                ))}
              </div>
              <button className="primary save-expense" type="submit" disabled={busy || !parseKopecks(amount) || !categoryId || !spentAt}>{busy ? 'Сохраняем…' : editingId ? 'Сохранить изменения' : 'Сохранить расход'}</button>
              <button className="details-toggle" type="button" aria-expanded={showDetails} onClick={() => setShowDetails((v) => !v)}>
                <span>{showDetails ? 'Скрыть дополнительные поля' : 'Комментарий, дата и время'}</span>
                <span aria-hidden="true">{showDetails ? '⌃' : '⌄'}</span>
              </button>
              {showDetails && <div className="expense-details">
                <label htmlFor="comment">Комментарий (необязательно)</label>
                <textarea id="comment" rows={2} placeholder="На что потратили?" value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="date-time-grid">
                  <div className="date-time-field">
                    <label htmlFor="spent-date">Дата</label>
                    <input id="spent-date" type="date" value={spentAt.slice(0, 10)} onChange={(e) => setSpentAt(`${e.target.value}T${spentAt.slice(11, 16)}`)} />
                  </div>
                  <div className="date-time-field">
                    <label htmlFor="spent-time">Время</label>
                    <input id="spent-time" type="time" value={spentAt.slice(11, 16)} onChange={(e) => setSpentAt(`${spentAt.slice(0, 10)}T${e.target.value}`)} />
                  </div>
                </div>
              </div>}
              {editingId && <button className="secondary" type="button" onClick={resetForm}>Отменить редактирование</button>}
            </form>
          </section>
        )}
        {tab === 'history' && (
          <section>
            <h1>История расходов</h1>
            <label htmlFor="history-month">Месяц</label>
            <input id="history-month" type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            <div className="summary"><span>За {monthLabel(selectedMonth)}</span><strong>{money(total)}</strong></div>
            {groups.length === 0 ? empty : groups.map(([day, rows]) => (
              <div key={day} className="day-group">
                <div className="day-header"><strong>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(day + 'T12:00:00'))}</strong><strong>{money(rows.reduce((sum, e) => sum + e.amountKopecks, 0))}</strong></div>
                {rows.map((e) => (
                  <div className="expense" key={e.id}>
                    <span className="expense-icon">{categoryMap.get(e.categoryId)?.icon ?? '🏷️'}</span>
                    <button className="expense-info" onClick={() => startEdit(e)}><strong>{categoryMap.get(e.categoryId)?.name ?? 'Удалённая категория'}</strong><span>{e.comment || new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(e.spentAt))}</span></button>
                    <strong>{money(e.amountKopecks)}</strong>
                    <button className="delete" aria-label="Удалить расход" onClick={() => void removeExpense(e.id)}>×</button>
                  </div>
                ))}
              </div>
            ))}
          </section>
        )}
        {tab === 'stats' && (
          <section>
            <h1>Статистика</h1>
            <label htmlFor="stats-month">Месяц</label>
            <input id="stats-month" type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            <div className="summary"><span>Всего за месяц</span><strong>{money(total)}</strong><small>Предыдущий месяц: {money(previousTotal)}{previousTotal > 0 ? ' · ' + ((total - previousTotal) / previousTotal * 100).toFixed(1) + '%' : ''}</small></div>
            <h2>По категориям</h2>
            {categoryTotals.length ? categoryTotals.map(([id, sum]) => (
              <div key={id} className="stat-row"><div><span>{categoryMap.get(id)?.icon} {categoryMap.get(id)?.name ?? 'Категория'}</span><strong>{money(sum)}</strong></div><div className="track"><span style={{ width: total ? (sum / total * 100) + '%' : '0%' }} /></div></div>
            )) : empty}
            <h2>Динамика по дням</h2>
            {dailyTotals.length ? (
              <div className="day-chart">{dailyTotals.map(({day, total: value}) => <div className="day-col" key={day} title={day + ': ' + money(value)}><div className="day-bar" style={{ height: Math.max(3, value / maxDay * 110) + 'px' }} /><small>{Number(day.slice(-2))}</small></div>)}</div>
            ) : empty}
          </section>
        )}
        {tab === 'settings' && (
          <section>
            <h1>Категории</h1>
            <form className="add-category" onSubmit={addCategory}><input aria-label="Новая категория" placeholder="Название категории" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} /><button type="submit">Добавить</button></form>
            {categories.map((c) => (
              <div key={c.id} className="setting-row"><span>{c.icon} {c.name}{c.archived ? ' (архив)' : ''}</span><button onClick={() => void renameCategory(c)}>Название</button><button onClick={() => void db.categories.update(c.id, { archived: !c.archived })}>{c.archived ? 'Вернуть' : 'Скрыть'}</button></div>
            ))}
            <h2>Облако</h2>
            <p className="muted">Google Drive и Google Sheets подключим в следующем этапе. Резервные копии и экспорт будут запускаться только вручную.</p>
            <p className="warning">Данные хранятся только на этом устройстве. Не очищайте данные сайта до реализации резервного копирования.</p>
          </section>
        )}
        {notice && <div className="notice" role="status" onClick={() => setNotice('')}>{notice} <span>×</span></div>}
      </main>
      <nav className="bottom-nav" aria-label="Навигация">
        {([{id:'add',icon:'＋',name:'Добавить'},{id:'history',icon:'☷',name:'История'},{id:'stats',icon:'▥',name:'Статистика'},{id:'settings',icon:'⚙',name:'Настройки'}] as const).map((item) =>
          <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => { setTab(item.id); setNotice(''); }}><span>{item.icon}</span><small>{item.name}</small></button>
        )}
      </nav>
    </div>
  );
}
