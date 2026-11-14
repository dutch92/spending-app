import type { ReactNode } from 'react';

export type AppTab = 'add' | 'history' | 'stats' | 'settings';

const navItems: { id: AppTab; label: string; icon: ReactNode }[] = [
  { id: 'add', label: 'Добавить', icon: <><path d="M12 5v14M5 12h14" /><circle cx="12" cy="12" r="9" /></> },
  { id: 'history', label: 'История', icon: <><path d="M4 7h16M4 12h16M4 17h16" /></> },
  { id: 'stats', label: 'Статистика', icon: <><path d="M5 19v-7M12 19V5M19 19v-10" /></> },
  { id: 'settings', label: 'Настройки', icon: <><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /><circle cx="12" cy="12" r="4" /></> },
];

export function BottomNav({ active, onChange }: { active: AppTab; onChange: (next: AppTab) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {navItems.map(({ id, label, icon }) => (
        <button
          key={id}
          type="button"
          className={active === id ? 'active' : ''}
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
          <small>{label}</small>
        </button>
      ))}
    </nav>
  );
}
