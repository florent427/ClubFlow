import { useState } from 'react';
import { MileageEntryTab } from './MileageEntryTab';
import { MileageReviewTab } from './MileageReviewTab';
import { TaxReceiptsTab } from './TaxReceiptsTab';

type TabKey = 'review' | 'entry' | 'receipts';

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'review', label: 'Notes à valider', icon: 'fact_check' },
  { key: 'entry', label: 'Saisie pour un membre', icon: 'edit_note' },
  { key: 'receipts', label: 'Reçus fiscaux', icon: 'receipt_long' },
];

/**
 * Frais kilométriques des bénévoles, au barème fiscal URSSAF : revue des
 * notes, saisie pour le compte d'un bénévole, reçus fiscaux d'abandon de
 * frais (Cerfa 11580).
 */
export function MileagePage() {
  const [tab, setTab] = useState<TabKey>('review');
  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Comptabilité</p>
        <h1 className="members-loom__title">Frais kilométriques</h1>
        <p className="members-loom__lede">
          Les bénévoles déclarent leurs déplacements avec leur véhicule personnel,
          valorisés au barème kilométrique URSSAF. Une note validée est soit
          remboursée (elle rejoint « Frais bénévoles »), soit abandonnée en don,
          ce qui ouvre droit à un reçu fiscal.
        </p>
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

      {tab === 'review' ? <MileageReviewTab /> : null}
      {tab === 'entry' ? <MileageEntryTab /> : null}
      {tab === 'receipts' ? <TaxReceiptsTab /> : null}
    </>
  );
}
