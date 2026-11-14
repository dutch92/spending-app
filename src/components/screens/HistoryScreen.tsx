import type { Expense, Category } from '../../db';

type ExpenseDay = [string, Expense[]];

type Props = {
  selectedMonth: string;
  monthLabel: string;
  totalLabel: string;
  groups: ExpenseDay[];
  categoryMap: Map<string, Category>;
  onMonthChange: (month: string) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  formatMoney: (kopecks: number) => string;
};

const dayTitle = (day: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(day + 'T12:00:00'));

const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export function HistoryScreen({
  selectedMonth, monthLabel, totalLabel, groups, categoryMap, onMonthChange,
  onEdit, onDelete, formatMoney,
}: Props) {
  const recordCount = groups.reduce((count, [, rows]) => count + rows.length, 0);
  return (
    <section className="premium-history">
      <header className="history-heading">
        <div>
          <span className="history-eyebrow">МОИ ФИНАНСЫ</span>
          <h1>История расходов</h1>
        </div>
        <div className="history-month-select picker-surface">
          <span className="picker-value" aria-hidden="true">{monthLabel}</span>
          <span className="history-month-chevron" aria-hidden="true">⌄</span>
          <input
            id="history-month"
            type="month"
            aria-label="Выбрать месяц истории"
            value={selectedMonth}
            onChange={(event) => onMonthChange(event.target.value)}
          />
        </div>
      </header>
      <div className="history-summary">
        <span className="history-summary-label">Всего за месяц</span>
        <strong>{totalLabel}</strong>
        <span className="history-record-count">{recordCount} {recordCount === 1 ? 'операция' : 'операций'}</span>
      </div>
      {groups.length === 0 ? (
        <div className="history-empty">
          <span aria-hidden="true">◷</span>
          <strong>Пока нет расходов</strong>
          <p>Записи за выбранный месяц появятся здесь после сохранения.</p>
        </div>
      ) : groups.map(([day, rows]) => (
        <section className="history-day-group" key={day} aria-label={dayTitle(day)}>
          <div className="history-day-heading">
            <strong>{dayTitle(day)}</strong>
            <span>{formatMoney(rows.reduce((sum, expense) => sum + expense.amountKopecks, 0))}</span>
          </div>
          <div className="history-entries">
            {rows.map((expense) => {
              const category = categoryMap.get(expense.categoryId);
              const name = category?.name ?? 'Удалённая категория';
              return (
                <div className="history-entry" key={expense.id}>
                  <span className="history-entry-icon" aria-hidden="true">{category?.icon ?? '🏷️'}</span>
                  <button
                    className="history-entry-details"
                    type="button"
                    onClick={() => onEdit(expense)}
                    aria-label={`Редактировать: ${name}, ${formatMoney(expense.amountKopecks)}`}
                  >
                    <strong>{name}</strong>
                    <span>{expense.comment || timeLabel(expense.spentAt)}</span>
                  </button>
                  <strong className="history-entry-amount">{formatMoney(expense.amountKopecks)}</strong>
                  <button
                    className="history-entry-delete"
                    type="button"
                    aria-label={`Удалить расход ${name} на ${formatMoney(expense.amountKopecks)}`}
                    onClick={() => onDelete(expense.id)}
                  >×</button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
