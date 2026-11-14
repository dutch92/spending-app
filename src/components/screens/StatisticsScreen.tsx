import type { Category } from '../../db';

type CategoryTotal = [string, number];
type DailyTotal = { day: string; total: number };

type Props = {
  selectedMonth: string;
  monthLabel: string;
  total: number;
  previousTotal: number;
  categoryTotals: CategoryTotal[];
  dailyTotals: DailyTotal[];
  categoryMap: Map<string, Category>;
  onMonthChange: (month: string) => void;
  formatMoney: (kopecks: number) => string;
};

const CHART_COLORS = ['#B9F3DD', '#86A8FF', '#F6C979', '#C5A2F4', '#80C9D7', '#F19CA9', '#E2A966', '#91B09D'];
const RADIUS = 76;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const compactAmount = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const moneyShort = (kopecks: number) => {
  const rubles = kopecks / 100;
  if (rubles >= 1000000) return `${compactAmount.format(rubles / 1000000)} млн`;
  if (rubles >= 1000) return `${compactAmount.format(rubles / 1000)} тыс.`;
  return compactAmount.format(rubles);
};
const percentLabel = (portion: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(portion * 100) + '%';

function getCalendarDays(month: string, dailyTotals: DailyTotal[]) {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return [];
  const daysCount = new Date(year, monthNumber, 0).getDate();
  const totals = new Map(dailyTotals.map((record) => [record.day, record.total]));
  return Array.from({ length: daysCount }, (_, i) => {
    const day = i + 1;
    const key = `${month}-${String(day).padStart(2, '0')}`;
    return { day, key, amount: totals.get(key) ?? 0 };
  });
}

export function StatisticsScreen({
  selectedMonth, monthLabel, total, previousTotal, categoryTotals, dailyTotals,
  categoryMap, onMonthChange, formatMoney,
}: Props) {
  const days = getCalendarDays(selectedMonth, dailyTotals);
  const maxDay = Math.max(1, ...days.map(({ amount }) => amount));
  const comparison = previousTotal > 0 ? (total - previousTotal) / previousTotal : null;
  const chartData = categoryTotals.map(([id, sum], index) => ({
    id, sum, category: categoryMap.get(id),
    color: CHART_COLORS[index % CHART_COLORS.length],
    share: total > 0 ? sum / total : 0,
  }));
  let offset = 0;
  const arcs = chartData.map((item) => {
    const start = offset;
    const length = item.share * CIRCUMFERENCE;
    offset += length;
    return { ...item, start, length };
  });

  return (
    <section className="premium-stats">
      <header className="stats-header">
        <div>
          <span className="stats-eyebrow">ФИНАНСОВЫЙ ОБЗОР</span>
          <h1>Статистика</h1>
        </div>
        <div className="stats-month-select picker-surface">
          <span className="picker-value" aria-hidden="true">{monthLabel}</span>
          <span className="stats-month-chevron" aria-hidden="true">⌄</span>
          <input
            type="month"
            aria-label="Выбрать месяц статистики"
            value={selectedMonth}
            onChange={(event) => onMonthChange(event.target.value)}
          />
        </div>
      </header>

      <div className="stats-summary-card">
        <span className="stats-caption">Всего потрачено</span>
        <strong className="stats-total">{formatMoney(total)}</strong>
        <div className="stats-previous">
          <span>Предыдущий месяц: {formatMoney(previousTotal)}</span>
          {comparison !== null && (
            <span className={comparison <= 0 ? 'stats-change stats-change--less' : 'stats-change stats-change--more'}>
              {comparison > 0 ? '+' : ''}{percentLabel(comparison)}
            </span>
          )}
        </div>
      </div>

      <div className="stats-card">
        <h2>По категориям</h2>
        {total > 0 ? (
          <>
            <div className="stats-donut-frame">
              <svg className="stats-donut" viewBox="0 0 220 220" role="img" aria-label="Распределение расходов по категориям; точные значения приведены ниже">
                <circle cx="110" cy="110" r={RADIUS} fill="none" stroke="#344963" strokeWidth="24" />
                {arcs.map((item) => (
                  <circle
                    key={item.id}
                    cx="110" cy="110" r={RADIUS}
                    fill="none" stroke={item.color} strokeWidth="24"
                    strokeDasharray={`${item.length} ${CIRCUMFERENCE - item.length}`}
                    strokeDashoffset={-item.start}
                    transform="rotate(-90 110 110)"
                  />
                ))}
                <text x="110" y="105" textAnchor="middle" fill="#A9BDD6" fontSize="12">За месяц</text>
                <text x="110" y="127" textAnchor="middle" fill="#FFFFFF" fontSize="18" fontWeight="700">{moneyShort(total)} ₽</text>
              </svg>
            </div>
            <div className="stats-category-list">
              {chartData.map((item) => (
                <div className="stats-category-item" key={item.id}>
                  <span className="stats-legend-dot" style={{ backgroundColor: item.color }} aria-hidden="true" />
                  <span className="stats-category-icon" aria-hidden="true">{item.category?.icon ?? '🏷️'}</span>
                  <div className="stats-category-name">
                    <strong>{item.category?.name ?? 'Удалённая категория'}</strong>
                    <small>{percentLabel(item.share)}</small>
                  </div>
                  <strong className="stats-category-sum">{formatMoney(item.sum)}</strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="stats-empty">Нет расходов за выбранный месяц. После первой записи здесь появится распределение по категориям.</p>
        )}
      </div>

      <div className="stats-card">
        <div className="stats-chart-heading">
          <h2>Динамика по дням</h2>
          <span>{monthLabel}</span>
        </div>
        {total > 0 ? (
          <>
            <p className="stats-chart-help">Прокрутите график по горизонтали, чтобы увидеть весь месяц.</p>
            <div className="stats-daily-scroll" role="region" aria-label="График расходов по дням" tabIndex={0}>
              <div className="stats-daily-chart">
                {days.map(({ day, key, amount }) => (
                  <div className="stats-daily-column" key={key} title={`${day}: ${formatMoney(amount)}`} aria-label={`${day} число: ${formatMoney(amount)}`}>
                    <span className="stats-daily-bar-slot">
                      <span
                        className={amount > 0 ? 'stats-daily-bar' : 'stats-daily-bar stats-daily-bar--zero'}
                        style={{ height: amount > 0 ? `${Math.max(4, amount / maxDay * 100)}%` : '3px' }}
                      />
                    </span>
                    <span className="stats-daily-tick">{day}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="stats-empty">Когда появятся расходы, здесь будет график по дням.</p>
        )}
      </div>
    </section>
  );
}
