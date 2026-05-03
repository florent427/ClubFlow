import { useState } from 'react';
import { AnnouncementsTab } from './AnnouncementsTab';
import { SurveysTab } from './SurveysTab';

type TabKey = 'announcements' | 'surveys';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'announcements', label: 'Annonces', icon: 'campaign' },
  { key: 'surveys', label: 'Sondages', icon: 'ballot' },
];

export function ClubLifePage() {
  const [tab, setTab] = useState<TabKey>('announcements');

  return (
    <section className="cf-page">
      <header className="cf-page__header">
        <div>
          <h1 className="cf-page__title">Vie du club</h1>
          <p className="cf-page__subtitle">
            Publiez des annonces et recueillez l’avis des membres via des sondages.
          </p>
        </div>
      </header>

      <div className="cf-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`cf-tab${tab === t.key ? ' cf-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span className="material-symbols-outlined" aria-hidden>
              {t.icon}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'announcements' ? <AnnouncementsTab /> : <SurveysTab />}
    </section>
  );
}
