import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLOSE_CLUB_ACCOUNTING_FISCAL_YEAR,
  CLUB_ACCOUNTING_FISCAL_SETTINGS,
  CLUB_ACCOUNTING_FISCAL_YEAR_CLOSES,
  CLUB_ACCOUNTING_PERIOD_LOCKS,
  LOCK_CLUB_ACCOUNTING_MONTH,
  SET_CLUB_FINANCIAL_ACCOUNT_OPENING_BALANCE,
  UNLOCK_CLUB_ACCOUNTING_MONTH,
  UPDATE_CLUB_ACCOUNTING_FISCAL_SETTINGS,
} from '../../../lib/documents';
import type {
  AccountingFiscalSettingsData,
  AccountingFiscalYearClosesData,
  AccountingPeriodLocksData,
  ClubFinancialAccount,
} from '../../../lib/types';
import { useToast } from '../../../components/ToastProvider';
import { ConfirmModal } from '../../../components/ui';

const MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
// Février plafonné à 28, comme côté API : un exercice commence à date fixe.
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ONE_DAY_MS = 86_400_000;

/** « 2026-09-01 » → « 01/09/2026 ». */
function formatFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** « 2026-09 » → « septembre 2026 ». */
function formatMonth(code: string): string {
  const [y, m] = code.split('-');
  const name = MONTH_NAMES[Number(m) - 1] ?? m;
  return `${name} ${y}`;
}

function formatEuro(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

/** 123456 → « 1234,56 » ; null → « ». */
function centsToInput(cents: number | null): string {
  if (cents === null) return '';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** « 1 234,56 » → 123456 ; vide → null ; invalide → NaN. */
function inputToCents(value: string): number | null {
  const s = value.replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return Number.NaN;
  return Math.round(Number(s) * 100);
}

function isoUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type Props = {
  accounts: ClubFinancialAccount[];
  onAccountsChanged: () => Promise<unknown>;
};

/**
 * Onglet « Exercice » des paramètres comptables (ADR-0014 §1) :
 * début d'exercice, date de reprise dans ClubFlow, soldes d'ouverture par
 * compte financier, verrous mensuels et clôture annuelle.
 */
export function FiscalYearSettingsTab({ accounts, onAccountsChanged }: Props) {
  const { showToast } = useToast();

  const { data: settingsData, refetch: refetchSettings } =
    useQuery<AccountingFiscalSettingsData>(CLUB_ACCOUNTING_FISCAL_SETTINGS, {
      fetchPolicy: 'cache-and-network',
    });
  const { data: locksData, refetch: refetchLocks } =
    useQuery<AccountingPeriodLocksData>(CLUB_ACCOUNTING_PERIOD_LOCKS, {
      fetchPolicy: 'cache-and-network',
    });
  const { data: closesData, refetch: refetchCloses } =
    useQuery<AccountingFiscalYearClosesData>(
      CLUB_ACCOUNTING_FISCAL_YEAR_CLOSES,
      { fetchPolicy: 'cache-and-network' },
    );

  const settings = settingsData?.clubAccountingFiscalSettings ?? null;
  const locks = locksData?.clubAccountingPeriodLocks ?? [];
  const closes = closesData?.clubAccountingFiscalYearCloses ?? [];

  const [updateSettings, { loading: savingSettings }] = useMutation(
    UPDATE_CLUB_ACCOUNTING_FISCAL_SETTINGS,
  );
  const [setOpeningBalance] = useMutation(
    SET_CLUB_FINANCIAL_ACCOUNT_OPENING_BALANCE,
  );
  const [lockMonth] = useMutation(LOCK_CLUB_ACCOUNTING_MONTH);
  const [unlockMonth] = useMutation(UNLOCK_CLUB_ACCOUNTING_MONTH);
  const [closeFiscalYear, { loading: closing }] = useMutation(
    CLOSE_CLUB_ACCOUNTING_FISCAL_YEAR,
  );

  // ── Exercice ─────────────────────────────────────────────────────────
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState(1);
  const [startsOn, setStartsOn] = useState('');

  const settingsMonth = settings?.fiscalYearStartMonth;
  const settingsDay = settings?.fiscalYearStartDay;
  const settingsStartsOn = settings?.accountingStartsOn;
  useEffect(() => {
    if (settingsMonth === undefined || settingsDay === undefined) return;
    setMonth(settingsMonth);
    setDay(settingsDay);
    setStartsOn(settingsStartsOn ?? '');
  }, [settingsMonth, settingsDay, settingsStartsOn]);

  const maxDay = DAYS_IN_MONTH[month - 1] ?? 31;
  useEffect(() => {
    if (day > maxDay) setDay(maxDay);
  }, [day, maxDay]);

  const dirty =
    settings !== null &&
    (month !== settings.fiscalYearStartMonth ||
      day !== settings.fiscalYearStartDay ||
      (startsOn || null) !== settings.accountingStartsOn);

  async function onSaveSettings(e: FormEvent) {
    e.preventDefault();
    try {
      await updateSettings({
        variables: {
          input: {
            fiscalYearStartMonth: month,
            fiscalYearStartDay: day,
            accountingStartsOn: startsOn || null,
          },
        },
      });
      showToast('Exercice enregistré', 'success');
      await Promise.all([refetchSettings(), refetchCloses()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  // ── Soldes d'ouverture ───────────────────────────────────────────────
  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.isActive),
    [accounts],
  );
  const [balanceDrafts, setBalanceDrafts] = useState<
    Record<string, { amount: string; on: string }>
  >({});

  function draftFor(a: ClubFinancialAccount) {
    return (
      balanceDrafts[a.id] ?? {
        amount: centsToInput(a.openingBalanceCents),
        on: a.openingBalanceOn ?? settings?.accountingStartsOn ?? '',
      }
    );
  }

  function setDraft(a: ClubFinancialAccount, patch: Partial<{ amount: string; on: string }>) {
    setBalanceDrafts((prev) => ({
      ...prev,
      [a.id]: { ...draftFor(a), ...patch },
    }));
  }

  async function onSaveBalance(a: ClubFinancialAccount) {
    const draft = draftFor(a);
    const cents = inputToCents(draft.amount);
    if (cents === null || Number.isNaN(cents)) {
      showToast('Montant invalide (ex : 1234,56 ou -50)', 'error');
      return;
    }
    if (!draft.on) {
      showToast('Date du solde requise', 'error');
      return;
    }
    try {
      await setOpeningBalance({
        variables: {
          input: { financialAccountId: a.id, balanceCents: cents, on: draft.on },
        },
      });
      showToast(`Solde d’ouverture enregistré pour ${a.label}`, 'success');
      setBalanceDrafts((prev) => {
        const next = { ...prev };
        delete next[a.id];
        return next;
      });
      await onAccountsChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  // ── Verrous mensuels ─────────────────────────────────────────────────
  const [monthToLock, setMonthToLock] = useState('');
  const [confirmUnlock, setConfirmUnlock] = useState<string | null>(null);

  async function onLock(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}$/.test(monthToLock)) {
      showToast('Mois attendu au format AAAA-MM', 'error');
      return;
    }
    try {
      await lockMonth({ variables: { month: monthToLock } });
      showToast(`${formatMonth(monthToLock)} verrouillé`, 'success');
      setMonthToLock('');
      await refetchLocks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doUnlock(m: string) {
    try {
      await unlockMonth({ variables: { month: m } });
      showToast(`${formatMonth(m)} déverrouillé`, 'success');
      await refetchLocks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setConfirmUnlock(null);
    }
  }

  // ── Clôture annuelle ─────────────────────────────────────────────────
  function labelForYear(y: number): string {
    if (!settings) return String(y);
    return settings.fiscalYearStartMonth === 1 &&
      settings.fiscalYearStartDay === 1
      ? String(y)
      : `${y}-${y + 1}`;
  }

  function boundsForYear(y: number): { startsOn: string; endsOn: string } {
    const m = (settings?.fiscalYearStartMonth ?? 1) - 1;
    const d = settings?.fiscalYearStartDay ?? 1;
    const start = new Date(Date.UTC(y, m, d));
    const end = new Date(Date.UTC(y + 1, m, d) - ONE_DAY_MS);
    return { startsOn: isoUtc(start), endsOn: isoUtc(end) };
  }

  const closableYears = useMemo(() => {
    if (!settings) return [];
    const closed = new Set(closes.map((c) => c.year));
    const out: number[] = [];
    for (
      let y = settings.currentFiscalYear - 1;
      y >= settings.currentFiscalYear - 5;
      y -= 1
    ) {
      if (!closed.has(y)) out.push(y);
    }
    return out;
  }, [settings, closes]);

  const [yearToClose, setYearToClose] = useState<number | ''>('');
  const [confirmClose, setConfirmClose] = useState(false);

  async function doClose() {
    if (yearToClose === '') return;
    try {
      await closeFiscalYear({ variables: { year: yearToClose } });
      showToast(`Exercice ${labelForYear(yearToClose)} clôturé`, 'success');
      setYearToClose('');
      await Promise.all([refetchCloses(), refetchLocks()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setConfirmClose(false);
    }
  }

  return (
    <>
      <section className="members-panel">
        <h2 className="members-panel__h">Exercice comptable</h2>
        <p className="cf-muted" style={{ marginBottom: 12 }}>
          L’exercice est nommé par son année de début : au 1er septembre,
          l’exercice 2026 va du 01/09/2026 au 31/08/2027. La date de reprise
          est le jour à partir duquel ClubFlow tient la comptabilité ; rien
          d’antérieur ne sera rapproché avec la banque.
        </p>
        <form onSubmit={onSaveSettings} className="cf-form">
          <div className="cf-form-row">
            <label className="cf-field">
              <span>Début d’exercice — mois</span>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="cf-field">
              <span>Jour</span>
              <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
                {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="cf-field">
              <span>Date de reprise dans ClubFlow</span>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </label>
          </div>
          {settings ? (
            <p className="cf-muted">
              Exercice en cours : <strong>{settings.currentFiscalYearLabel}</strong>{' '}
              ({formatFr(settings.currentFiscalYearStartsOn)} →{' '}
              {formatFr(settings.currentFiscalYearEndsOn)})
              {settings.accountingStartsOn
                ? ` · reprise le ${formatFr(settings.accountingStartsOn)}`
                : ' · reprise non définie'}
            </p>
          ) : null}
          <div className="cf-form-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={savingSettings || !dirty}
            >
              Enregistrer
            </button>
          </div>
        </form>
      </section>

      <section className="members-panel">
        <h2 className="members-panel__h">Soldes d’ouverture</h2>
        <p className="cf-muted" style={{ marginBottom: 12 }}>
          Solde réel de chaque compte à la date de reprise, tel qu’il figure
          sur le relevé. Il sert de point de départ au rapprochement bancaire.
        </p>
        {activeAccounts.length === 0 ? (
          <p className="cf-muted">Aucun compte financier actif.</p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Compte</th>
                <th>PCG</th>
                <th>Solde enregistré</th>
                <th style={{ width: 160 }}>Solde (€)</th>
                <th style={{ width: 170 }}>Au</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {activeAccounts.map((a) => {
                const draft = draftFor(a);
                return (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.label}</strong>
                    </td>
                    <td>{a.accountingAccountCode}</td>
                    <td>
                      {a.openingBalanceCents === null ? (
                        <span className="cf-pill cf-pill--warn">
                          non renseigné
                        </span>
                      ) : (
                        <>
                          <strong>{formatEuro(a.openingBalanceCents)}</strong>
                          <br />
                          <small className="cf-muted">
                            au {formatFr(a.openingBalanceOn)}
                          </small>
                        </>
                      )}
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft.amount}
                        onChange={(e) => setDraft(a, { amount: e.target.value })}
                        placeholder="0,00"
                        style={{ width: '100%', textAlign: 'right' }}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={draft.on}
                        onChange={(e) => setDraft(a, { on: e.target.value })}
                        style={{ width: '100%' }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        onClick={() => void onSaveBalance(a)}
                      >
                        Enregistrer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="members-panel">
        <h2 className="members-panel__h">Verrous mensuels</h2>
        <p className="cf-muted" style={{ marginBottom: 12 }}>
          Un mois verrouillé n’accepte plus aucune écriture ni modification ;
          seule une contre-passation datée d’un mois ouvert peut corriger.
        </p>
        <form onSubmit={onLock} className="cf-form-row" style={{ alignItems: 'flex-end' }}>
          <label className="cf-field">
            <span>Mois à verrouiller</span>
            <input
              type="month"
              value={monthToLock}
              onChange={(e) => setMonthToLock(e.target.value)}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={!monthToLock}>
            Verrouiller
          </button>
        </form>
        {locks.length === 0 ? (
          <p className="cf-muted" style={{ marginTop: 12 }}>
            Aucun mois verrouillé.
          </p>
        ) : (
          <ul className="cf-list" style={{ marginTop: 12 }}>
            {locks.map((l) => (
              <li
                key={l.month}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '6px 0',
                }}
              >
                <span className="cf-pill cf-pill--muted">{l.month}</span>
                <span>{formatMonth(l.month)}</span>
                <small className="cf-muted">
                  verrouillé le {new Date(l.lockedAt).toLocaleDateString('fr-FR')}
                </small>
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => setConfirmUnlock(l.month)}
                >
                  Déverrouiller
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="members-panel">
        <h2 className="members-panel__h">Clôture annuelle</h2>
        <p className="cf-muted" style={{ marginBottom: 12 }}>
          La clôture verrouille les 12 mois de l’exercice et fige ses totaux.
          Elle n’est possible qu’une fois l’exercice terminé, et ne se
          défait pas.
        </p>
        <div className="cf-form-row" style={{ alignItems: 'flex-end' }}>
          <label className="cf-field">
            <span>Exercice à clôturer</span>
            <select
              value={yearToClose}
              onChange={(e) =>
                setYearToClose(e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={closableYears.length === 0}
            >
              <option value="">
                {closableYears.length === 0
                  ? 'Aucun exercice terminé à clôturer'
                  : '— Sélectionner —'}
              </option>
              {closableYears.map((y) => {
                const b = boundsForYear(y);
                return (
                  <option key={y} value={y}>
                    {labelForYear(y)} ({formatFr(b.startsOn)} → {formatFr(b.endsOn)})
                  </option>
                );
              })}
            </select>
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={yearToClose === '' || closing}
            onClick={() => setConfirmClose(true)}
          >
            Clôturer
          </button>
        </div>
        {closes.length > 0 ? (
          <table className="cf-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Exercice</th>
                <th>Période</th>
                <th>Clôturé le</th>
              </tr>
            </thead>
            <tbody>
              {closes.map((c) => (
                <tr key={c.year}>
                  <td>
                    <strong>{c.label}</strong>
                  </td>
                  <td>
                    {formatFr(c.startsOn)} → {formatFr(c.endsOn)}
                  </td>
                  <td>{new Date(c.closedAt).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <ConfirmModal
        open={confirmUnlock !== null}
        title="Déverrouiller ce mois ?"
        message={`Les écritures de ${
          confirmUnlock ? formatMonth(confirmUnlock) : ''
        } redeviendront modifiables.`}
        confirmLabel="Déverrouiller"
        cancelLabel="Annuler"
        danger
        onCancel={() => setConfirmUnlock(null)}
        onConfirm={() => confirmUnlock && void doUnlock(confirmUnlock)}
      />

      <ConfirmModal
        open={confirmClose}
        title={`Clôturer l’exercice ${
          yearToClose === '' ? '' : labelForYear(yearToClose)
        } ?`}
        message="Les 12 mois de l’exercice seront verrouillés et ses totaux figés. Cette action ne se défait pas."
        confirmLabel="Clôturer"
        cancelLabel="Annuler"
        danger
        loading={closing}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => void doClose()}
      />
    </>
  );
}
