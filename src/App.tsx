import { useEffect, useMemo, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import packageInfo from '../package.json';
import { BottomNav, type AppTab } from './components/ui/BottomNav';
import { AddExpenseScreen } from './components/screens/AddExpenseScreen';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Category, type Expense } from './db';
import { downloadBackup, readBackupFile, restoreBackup } from './backup';
import { connectGoogleDrive, disconnectGoogleDrive, isGoogleConnected, wasGoogleDriveAuthorized } from './googleDrive';
import { uploadDriveBackup, listDriveBackups, downloadDriveBackup, type DriveBackupFile } from './driveBackup';

const CATEGORY_ICONS = [
  '🛒', '🥦', '🍞', '🍕', '🍽️', '☕', '🍔', '🍺',
  '🚗', '⛽', '🚕', '🚌', '✈️', '🚲', '🔧', '🛞',
  '🏠', '🧹', '🛋️', '💡', '💧', '🧾', '🛍️', '📦',
  '💊', '🩺', '🏥', '🦷', '💇', '💪', '🏋️', '🧘',
  '🧸', '👶', '🎒', '📚', '🎓', '⚽', '🎨', '🎵',
  '👕', '👟', '🧥', '👗', '🎬', '🎮', '🎭', '🎟️',
  '📱', '💻', '🌐', '🤖', '🎁', '💐', '❤️', '🎉',
  '💳', '💰', '🏦', '🧰', '🛠️', '🐶', '🐱', '✨',
];

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

const TOAST_DURATION_MS = 5000;
const TOAST_EXIT_MS = 260;

function NoticeToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setExiting(true), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(onDismiss, TOAST_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [exiting, onDismiss]);

  return (
    <div className={`notice-toast${exiting ? ' notice-toast--exit' : ''}`} role="status" aria-live="polite">
      <span className="notice-toast__message">{message}</span>
      <button className="notice-toast__dismiss" type="button" onClick={onDismiss} aria-label="Закрыть уведомление">
        <svg className="notice-toast__timer" viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
          <circle className="notice-toast__track" cx="20" cy="20" r="16" />
          <circle className="notice-toast__progress" cx="20" cy="20" r="16" />
        </svg>
        <span className="notice-toast__close" aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export default function App() {
  const expenses = useLiveQuery(() => db.expenses.orderBy('spentAt').reverse().toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];
  const [tab, setTab] = useState<AppTab>('add');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [comment, setComment] = useState('');
  const [spentAt, setSpentAt] = useState(() => localDateTime(new Date()));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => localDateTime(new Date()).slice(0, 7));
  const [categoryName, setCategoryName] = useState('');
  const [editingCategoryIconId, setEditingCategoryIconId] = useState<string | null>(null);
  const [customCategoryIcon, setCustomCategoryIcon] = useState('');
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateNoticeHidden, setUpdateNoticeHidden] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setSwRegistration(registration);
    },
    onRegisterError(error) {
      console.error('PWA registration failed:', error);
    },
  });

  async function checkForUpdates() {
    if (!swRegistration) {
      setNotice('Проверка обновлений станет доступна после регистрации PWA.');
      return;
    }
    if (!navigator.onLine) {
      setNotice('Для проверки обновлений нужен интернет.');
      return;
    }
    setCheckingUpdates(true);
    try {
      await swRegistration.update();
      setUpdateNoticeHidden(false);
      setNotice('Проверка выполнена. Если новая версия найдена, появится предложение обновить приложение.');
    } catch {
      setNotice('Не удалось проверить обновления. Попробуйте позже.');
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function applyUpdate() {
    if (amount.trim() || comment.trim() || categoryId || editingId) {
      if (!window.confirm('Несохранённые данные формы будут потеряны при обновлении. Продолжить?')) return;
    }
    await updateServiceWorker(true);
  }

  const [backupBusy, setBackupBusy] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(isGoogleConnected);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [driveBackups, setDriveBackups] = useState<DriveBackupFile[]>([]);
  const [selectedDriveBackupId, setSelectedDriveBackupId] = useState('');
  const [driveBackupBusy, setDriveBackupBusy] = useState(false);


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
  async function changeCategoryIcon(categoryId: string, icon: string) {
    const normalized = icon.trim();
    if (!normalized || Array.from(normalized).length > 8) {
      setNotice('Выберите эмодзи для иконки (до 8 символов).');
      return;
    }
    try {
      await db.categories.update(categoryId, { icon: normalized });
      setEditingCategoryIconId(null);
      setCustomCategoryIcon('');
      setNotice('Иконка категории изменена.');
    } catch {
      setNotice('Не удалось сохранить иконку.');
    }
  }

  async function authorizeGoogle() {
    setGoogleBusy(true);
    try {
      await connectGoogleDrive();
      setGoogleConnected(true);
      setDriveBackups([]);
      setSelectedDriveBackupId('');
      setNotice('Доступ к Google Drive подтверждён.');
    } catch (error) {
      setGoogleConnected(false);
      setNotice(error instanceof Error ? error.message : 'Не удалось подключить Google Drive.');
    } finally {
      setGoogleBusy(false);
    }
  }

  function disconnectGoogle() {
    disconnectGoogleDrive();
    setGoogleConnected(false);
    setDriveBackups([]);
    setSelectedDriveBackupId('');
    setNotice('Google Drive отключён на этом устройстве.');
  }

  async function saveToDrive() {
    setDriveBackupBusy(true);
    try {
      const result = await uploadDriveBackup();
      setNotice(`Google Drive: сохранена копия с ${result.expenses} расходами.`);
      try {
        const files = await listDriveBackups();
        setDriveBackups(files);
        setSelectedDriveBackupId(result.id);
      } catch {
        // Upload succeeded even if refreshing the backup list failed.
        setNotice(`Копия сохранена в Google Drive (${result.expenses} расходов), но список копий не обновился.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось сохранить копию в Google Drive.');
    } finally {
      setDriveBackupBusy(false);
    }
  }

  async function refreshDriveBackups() {
    setDriveBackupBusy(true);
    try {
      const files = await listDriveBackups();
      setDriveBackups(files);
      setSelectedDriveBackupId((current) => files.some((file) => file.id === current) ? current : (files[0]?.id ?? ''));
      setNotice(files.length ? `Найдено резервных копий: ${files.length}.` : 'Резервных копий в Google Drive пока нет.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось прочитать резервные копии Google Drive.');
    } finally {
      setDriveBackupBusy(false);
    }
  }

  async function restoreFromDrive() {
    if (!selectedDriveBackupId) return;
    setDriveBackupBusy(true);
    try {
      const backup = await downloadDriveBackup(selectedDriveBackupId);
      const selected = driveBackups.find((file) => file.id === selectedDriveBackupId);
      const prompt = `Восстановить копию ${selected?.name ?? ''}?\n\n` +
        `В ней ${backup.expenses.length} расходов и ${backup.categories.length} категорий.\n\n` +
        'Все текущие расходы и категории на iPhone будут ЗАМЕНЕНЫ! Рекомендуется сначала создать свежую копию.';
      if (!window.confirm(prompt)) return;
      await restoreBackup(backup);
      resetForm();
      setNotice(`Восстановлено из Google Drive: ${backup.expenses.length} расходов.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось восстановить копию из Google Drive.');
    } finally {
      setDriveBackupBusy(false);
    }
  }

  async function exportBackup() {
    setBackupBusy(true);
    try {
      const result = await downloadBackup();
      setNotice(`Подготовлена копия: ${result.expenses} расходов, ${result.categories} категорий. Сохраните файл в «Файлы».`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось создать копию.');
    } finally {
      setBackupBusy(false);
    }
  }

  async function importBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setBackupBusy(true);
    try {
      const backup = await readBackupFile(file);
      const confirmMessage = `Восстановить копию от ${new Date(backup.exportedAt).toLocaleString('ru-RU')}?\n\n` +
        `В файле ${backup.expenses.length} расходов и ${backup.categories.length} категорий.\n\n` +
        'ВСЕ текущие расходы и категории на устройстве будут заменены! Перед этим рекомендуется сохранить текущую копию.';
      if (!window.confirm(confirmMessage)) return;
      await restoreBackup(backup);
      resetForm();
      setNotice(`Восстановлено расходов: ${backup.expenses.length}, категорий: ${backup.categories.length}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось восстановить данные.');
    } finally {
      setBackupBusy(false);
    }
  }

  const empty = <p className="muted empty">Пока нет расходов за выбранный месяц.</p>;
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">◈</div>
        <div className="brand-copy"><strong>Spending App</strong><span>Личный учёт расходов</span></div>
        <span className="topbar-right">FINTECH PREMIUM</span>
      </header>
      <main>
        {import.meta.env.VITE_PREVIEW_BUILD === 'true' && (
          <div className="preview-notice" role="status">
            <strong>Тестовая версия Fintech Premium Dark</strong>
            <span>Здесь отдельная база расходов. Данные основного приложения не изменяются.</span>
          </div>
        )}
        {tab === 'add' && (
          <AddExpenseScreen
            amount={amount}
            categoryId={categoryId}
            visibleCategories={visibleCategories}
            activeCategoryCount={activeCategories.length}
            showAllCategories={showAllCategories}
            showDetails={showDetails}
            comment={comment}
            spentAt={spentAt}
            editing={Boolean(editingId)}
            busy={busy}
            canSave={Boolean(parseKopecks(amount) && categoryId && spentAt)}
            onAmountChange={setAmount}
            onCategoryChange={setCategoryId}
            onToggleCategories={() => setShowAllCategories((value) => !value)}
            onToggleDetails={() => setShowDetails((value) => !value)}
            onCommentChange={setComment}
            onSpentAtChange={setSpentAt}
            onCancelEdit={resetForm}
            onSubmit={saveExpense}
          />
        )}
        {tab === 'history' && (
          <section>
            <h1>История расходов</h1>
            <label htmlFor="history-month">Месяц</label>
            <div className="picker-surface month-picker">
              <span className="picker-value" aria-hidden="true">{monthLabel(selectedMonth)}</span>
              <input id="history-month" aria-label="Выбрать месяц" type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            </div>
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
            <div className="picker-surface month-picker">
              <span className="picker-value" aria-hidden="true">{monthLabel(selectedMonth)}</span>
              <input id="stats-month" aria-label="Выбрать месяц" type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            </div>
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
            <h1>Настройки</h1>
            <h2>Резервное копирование</h2>
            <p className="muted">Сохраняйте JSON-копию в приложение «Файлы» на iPhone или в iCloud Drive. В копию входят все расходы и категории.</p>
            <div className="backup-actions">
              <button className="primary" type="button" disabled={backupBusy} onClick={() => void exportBackup()}>Скачать резервную копию JSON</button>
              <label className="backup-import" htmlFor="backup-file">Восстановить из JSON</label>
              <input id="backup-file" className="backup-file" type="file" accept=".json,application/json" disabled={backupBusy} onChange={(event) => void importBackup(event)} />
            </div>
            <p className="warning">Восстановление полностью заменяет текущие данные. Сначала создайте копию. Резервный файл содержит ваши финансовые записи без шифрования.</p>
            {import.meta.env.VITE_PREVIEW_BUILD !== 'true' && <>
            <h2>Google Drive</h2>
            <div className="google-drive-panel">
              <div className="google-drive-status">{googleConnected && isGoogleConnected() ? '● Google Drive подключён' : wasGoogleDriveAuthorized() ? '○ Google Drive: требуется возобновить сеанс' : '○ Google Drive не подключён'}</div>
              {googleConnected && isGoogleConnected() ? (
                <button type="button" className="update-check" onClick={disconnectGoogle}>Отключить Google Drive</button>
              ) : (
                <button type="button" className="primary google-connect" disabled={googleBusy} onClick={() => void authorizeGoogle()}>{googleBusy ? 'Подключение…' : wasGoogleDriveAuthorized() ? 'Возобновить доступ Google Drive' : 'Подключить Google Drive'}</button>
              )}
              <p className="muted">Для безопасности токен хранится только в памяти. После закрытия приложения нужно возобновить сеанс одним нажатием. Если Google помнит выданное разрешение, повторное согласие не требуется.</p>
              {googleConnected && isGoogleConnected() && <div className="drive-backup-actions">
                <button type="button" className="primary google-connect" disabled={driveBackupBusy} onClick={() => void saveToDrive()}>{driveBackupBusy ? 'Выполняется операция…' : 'Создать копию в Google Drive'}</button>
                <button type="button" className="update-check" disabled={driveBackupBusy} onClick={() => void refreshDriveBackups()}>Показать резервные копии</button>
                {driveBackups.length > 0 && <>
                  <label htmlFor="drive-backup-select">Копия для восстановления</label>
                  <select id="drive-backup-select" value={selectedDriveBackupId} onChange={(event) => setSelectedDriveBackupId(event.target.value)}>
                    {driveBackups.map((file) => <option key={file.id} value={file.id}>{new Date(file.createdTime).toLocaleString('ru-RU')} — {file.name}</option>)}
                  </select>
                  <button type="button" className="update-check" disabled={!selectedDriveBackupId || driveBackupBusy} onClick={() => void restoreFromDrive()}>Восстановить выбранную копию</button>
                </>}
              </div>}
              <p className="muted">Резервные копии создаются только вручную и сохраняются отдельными JSON-файлами в папке Spending App. Google Sheets подключим следующим этапом.</p>
            </div>
            </>}
            <details className="settings-categories">
              <summary className="settings-categories-toggle">
                <span>Категории <small>({categories.length})</small></span>
                <span className="settings-categories-chevron" aria-hidden="true">⌄</span>
              </summary>
              <div className="settings-categories-body">
                <form className="add-category" onSubmit={addCategory}><input aria-label="Новая категория" placeholder="Название категории" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} /><button type="submit">Добавить</button></form>
                {categories.map((c) => (
                  <div key={c.id} className="category-settings-item">
                    <div className="setting-row">
                      <button type="button" className="category-icon-button" aria-label={`Изменить иконку категории ${c.name}`} aria-expanded={editingCategoryIconId === c.id} onClick={() => { setEditingCategoryIconId(editingCategoryIconId === c.id ? null : c.id); setCustomCategoryIcon(''); }}>{c.icon}</button>
                      <span className="category-setting-name">{c.name}{c.archived ? ' (архив)' : ''}</span>
                      <button type="button" onClick={() => void renameCategory(c)}>Название</button>
                      <button type="button" onClick={() => void db.categories.update(c.id, { archived: !c.archived })}>{c.archived ? 'Вернуть' : 'Скрыть'}</button>
                    </div>
                    {editingCategoryIconId === c.id && <div className="category-icon-picker">
                      <p className="muted">Выберите иконку для «{c.name}»</p>
                      <div className="category-icon-grid">
                        {CATEGORY_ICONS.map((icon) => <button type="button" className={c.icon === icon ? 'selected' : ''} key={icon} aria-label={`Выбрать иконку ${icon}`} aria-pressed={c.icon === icon} onClick={() => void changeCategoryIcon(c.id, icon)}>{icon}</button>)}
                      </div>
                      <form className="custom-category-icon" onSubmit={(event) => { event.preventDefault(); void changeCategoryIcon(c.id, customCategoryIcon); }}>
                        <input aria-label="Свой эмодзи" placeholder="Или вставьте свой эмодзи" value={customCategoryIcon} onChange={(event) => setCustomCategoryIcon(event.target.value)} maxLength={16} />
                        <button type="submit" disabled={!customCategoryIcon.trim()}>Сохранить</button>
                      </form>
                      <button type="button" className="category-icon-cancel" onClick={() => setEditingCategoryIconId(null)}>Отмена</button>
                    </div>}
                  </div>
                ))}
              </div>
            </details>
            <h2>О приложении</h2>
            <div className="app-version-row"><span>Версия</span><strong>{packageInfo.version}{import.meta.env.VITE_BUILD_NUMBER ? `+${import.meta.env.VITE_BUILD_NUMBER}` : '-dev'}</strong></div>
            <button className="update-check" type="button" disabled={checkingUpdates} onClick={() => void checkForUpdates()}>
              {checkingUpdates ? 'Проверяем…' : 'Проверить обновления'}
            </button>
            {needRefresh && <button className="primary update-check" type="button" onClick={() => void applyUpdate()}>Установить новую версию</button>}
            <p className="muted">Новая версия загружается через GitHub Pages. Обновление применяется только после вашего подтверждения.</p>
          </section>
        )}
        {needRefresh && !updateNoticeHidden && <div className="pwa-update-banner" role="status">
          <div className="pwa-update-title">Доступна новая версия Spending App</div>
          <div className="pwa-update-actions">
            <button type="button" onClick={() => void applyUpdate()}>Обновить</button>
            <button type="button" onClick={() => setUpdateNoticeHidden(true)}>Позже</button>
          </div>
        </div>}
        {notice && <NoticeToast key={notice} message={notice} onDismiss={() => setNotice('')} />}
      </main>
      <BottomNav active={tab} onChange={(next) => { setTab(next); setNotice(''); }} />
    </div>
  );
}
