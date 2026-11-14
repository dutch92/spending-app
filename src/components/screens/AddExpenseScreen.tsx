import type { ChangeEvent, FormEvent } from 'react';
import type { Category } from '../../db';

type Props = {
  amount: string;
  categoryId: string;
  visibleCategories: Category[];
  activeCategoryCount: number;
  showAllCategories: boolean;
  showDetails: boolean;
  comment: string;
  spentAt: string;
  editing: boolean;
  busy: boolean;
  canSave: boolean;
  onAmountChange: (value: string) => void;
  onCategoryChange: (id: string) => void;
  onToggleCategories: () => void;
  onToggleDetails: () => void;
  onCommentChange: (value: string) => void;
  onSpentAtChange: (value: string) => void;
  onCancelEdit: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const dateLabel = (value: string): string => {
  const [date, time] = value.split('T');
  if (!date || !time) return 'Укажите дату и время';
  const dateValue = new Date(`${date}T12:00:00`);
  if (Number.isNaN(dateValue.getTime())) return 'Укажите дату и время';
  const formatted = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(dateValue);
  const today = new Date();
  const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  return `${date === todayKey ? 'Сегодня' : formatted}, ${time.slice(0, 5)}`;
};

export function AddExpenseScreen({
  amount, categoryId, visibleCategories, activeCategoryCount, showAllCategories,
  showDetails, comment, spentAt, editing, busy, canSave,
  onAmountChange, onCategoryChange, onToggleCategories, onToggleDetails,
  onCommentChange, onSpentAtChange, onCancelEdit, onSubmit,
}: Props) {
  const onDateChange = (event: ChangeEvent<HTMLInputElement>) =>
    onSpentAtChange(`${event.target.value}T${spentAt.slice(11, 16)}`);
  const onTimeChange = (event: ChangeEvent<HTMLInputElement>) =>
    onSpentAtChange(`${spentAt.slice(0, 10)}T${event.target.value}`);

  return (
    <section className="add-expense-screen">
      <div className="add-expense-heading">
        <div>
          <span className="add-expense-eyebrow">БЫСТРАЯ ЗАПИСЬ</span>
          <h1>{editing ? 'Изменить расход' : 'Новый расход'}</h1>
        </div>
        <span className="add-expense-heading-icon" aria-hidden="true">₽</span>
      </div>

      <form className="expense-form premium-expense-form" onSubmit={onSubmit}>
        <div className="amount-card">
          <label htmlFor="amount">Сумма расхода</label>
          <div className="amount-entry">
            <input
              id="amount"
              className="amount"
              style={{ width: `${Math.max(1, Math.min(12, amount.length || 1)) + 0.5}ch` }}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="0"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
            />
            <span className="amount-currency" aria-hidden="true">₽</span>
          </div>
          <span className="amount-date">◷ {dateLabel(spentAt)}</span>
        </div>

        <div className="category-heading">
          <label id="expense-category-heading">Категория</label>
          {activeCategoryCount > 8 && (
            <button className="text-button" type="button" onClick={onToggleCategories} aria-expanded={showAllCategories}>
              {showAllCategories ? 'Свернуть' : `Все (${activeCategoryCount})`}
            </button>
          )}
        </div>
        <div className="category-grid" role="group" aria-labelledby="expense-category-heading">
          {visibleCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`category${categoryId === category.id ? ' selected' : ''}`}
              aria-pressed={categoryId === category.id}
              onClick={() => onCategoryChange(category.id)}
            >
              <span className="emoji" aria-hidden="true">{category.icon}</span>
              <span>{category.name}</span>
            </button>
          ))}
        </div>

        <div className="expense-extras">
          <button
            className="details-toggle"
            type="button"
            aria-expanded={showDetails}
            aria-controls="expense-extra-fields"
            onClick={onToggleDetails}
          >
            <span aria-hidden="true">☷</span>
            <span>{showDetails ? 'Скрыть дополнительные поля' : 'Комментарий, дата и время'}</span>
            <span className="details-chevron" aria-hidden="true">{showDetails ? '⌃' : '⌄'}</span>
          </button>
          {showDetails && (
            <div className="expense-details" id="expense-extra-fields">
              <label htmlFor="comment">Комментарий (необязательно)</label>
              <textarea
                id="comment"
                rows={2}
                placeholder="На что потратили?"
                value={comment}
                onChange={(event) => onCommentChange(event.target.value)}
              />
              <div className="date-time-grid">
                <div className="date-time-field">
                  <label htmlFor="spent-date">Дата</label>
                  <div className="picker-surface">
                    <span className="picker-value" aria-hidden="true">
                      {spentAt.slice(0, 10)
                        ? new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(spentAt.slice(0, 10) + 'T12:00:00'))
                        : 'Выбрать дату'}
                    </span>
                    <input id="spent-date" aria-label="Дата расхода" type="date" value={spentAt.slice(0, 10)} onChange={onDateChange}/>
                  </div>
                </div>
                <div className="date-time-field">
                  <label htmlFor="spent-time">Время</label>
                  <div className="picker-surface">
                    <span className="picker-value" aria-hidden="true">{spentAt.slice(11, 16) || 'Выбрать время'}</span>
                    <input id="spent-time" aria-label="Время расхода" type="time" value={spentAt.slice(11, 16)} onChange={onTimeChange}/>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <button className="primary save-expense" type="submit" disabled={busy || !canSave}>
          <span aria-hidden="true">✓</span>
          <span>{busy ? 'Сохраняем…' : editing ? 'Сохранить изменения' : 'Сохранить расход'}</span>
        </button>
        {editing && <button className="secondary cancel-expense-edit" type="button" onClick={onCancelEdit}>Отменить редактирование</button>}
      </form>
    </section>
  );
}
