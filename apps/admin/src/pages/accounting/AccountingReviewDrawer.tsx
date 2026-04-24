import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_ACCOUNTING_ACCOUNTS,
  CLUB_ACCOUNTING_COHORTS,
  CONFIRM_ACCOUNTING_EXTRACTION,
} from '../../lib/documents';
import type {
  AccountingEntry,
  ClubAccountingAccountsData,
  ClubAccountingCohortsData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { Drawer } from '../../components/ui';

function parseEuros(s: string): number | null {
  const cleaned = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Classe CSS correspondant au niveau de confiance d'un champ extrait par
 * l'IA. Utilisé pour surligner visuellement les champs incertains dans
 * le formulaire de review.
 */
function confidenceClass(score: number | undefined): string {
  if (score === undefined || score === null) return '';
  if (score >= 0.85) return 'cf-ocr-field--high';
  if (score >= 0.5) return 'cf-ocr-field--medium';
  return 'cf-ocr-field--low';
}

function confidenceLabel(score: number | undefined): string {
  if (score === undefined || score === null) return '';
  const pct = Math.round(score * 100);
  if (score >= 0.85) return `✓ IA ${pct}%`;
  if (score >= 0.5) return `⚠ IA ${pct}%`;
  return `⨯ IA ${pct}%`;
}

interface Props {
  entry: AccountingEntry | null;
  confidencePerField?: Record<string, number>;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Drawer de révision d'une écriture OCR (status=NEEDS_REVIEW). Permet de
 * valider telle quelle ou de corriger chaque champ avant validation.
 * Les champs sont surlignés selon le score de confiance IA :
 * - vert ≥ 85 % (l'IA est sûre)
 * - jaune 50-85 % (à vérifier)
 * - rouge < 50 % (fortement suspect, probablement à corriger)
 */
export function AccountingReviewDrawer({
  entry,
  confidencePerField,
  onClose,
  onSaved,
}: Props) {
  const { showToast } = useToast();
  const [confirmExtraction, { loading: confirming }] = useMutation(
    CONFIRM_ACCOUNTING_EXTRACTION,
  );
  const { data: accountsData } = useQuery<ClubAccountingAccountsData>(
    CLUB_ACCOUNTING_ACCOUNTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const { data: cohortsData } = useQuery<ClubAccountingCohortsData>(
    CLUB_ACCOUNTING_COHORTS,
    { fetchPolicy: 'cache-and-network' },
  );

  const [label, setLabel] = useState('');
  const [amountEuros, setAmountEuros] = useState('');
  const [occurredOn, setOccurredOn] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [cohortCode, setCohortCode] = useState('');
  const [disciplineCode, setDisciplineCode] = useState('');

  // Pré-remplit les champs à l'ouverture
  useEffect(() => {
    if (!entry) return;
    setLabel(entry.label);
    setAmountEuros(
      (entry.amountCents / 100).toFixed(2).replace('.', ','),
    );
    setOccurredOn(entry.occurredAt.slice(0, 10));
    const firstLine = entry.lines[0];
    setAccountCode(firstLine?.accountCode ?? '');
    const firstAlloc = firstLine?.allocations[0];
    setCohortCode(firstAlloc?.cohortCode ?? '');
    setDisciplineCode(firstAlloc?.disciplineCode ?? '');
  }, [entry]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!entry) return;
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      showToast('Libellé requis', 'error');
      return;
    }
    const amountCents = parseEuros(amountEuros);
    if (amountCents === null) {
      showToast('Montant invalide', 'error');
      return;
    }
    try {
      await confirmExtraction({
        variables: {
          input: {
            entryId: entry.id,
            label: trimmedLabel,
            amountCents,
            occurredAt: occurredOn
              ? new Date(occurredOn).toISOString()
              : undefined,
            accountCode: accountCode || undefined,
            cohortCode: cohortCode || undefined,
            disciplineCode: disciplineCode || undefined,
          },
        },
      });
      showToast('Écriture validée et comptabilisée', 'success');
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  const accounts = accountsData?.clubAccountingAccounts ?? [];
  const cohorts = cohortsData?.clubAccountingCohorts ?? [];
  const firstDoc = entry?.documents[0];

  return (
    <Drawer
      open={entry !== null}
      onClose={onClose}
      title="Révision OCR"
      width={560}
      footer={
        <div className="cf-drawer-foot">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={confirming}
            form="cf-review-form"
          >
            {confirming ? 'Validation…' : 'Valider l\u2019écriture'}
          </button>
        </div>
      }
    >
      {entry ? (
        <form id="cf-review-form" onSubmit={onSubmit} className="cf-form">
          {firstDoc ? (
            <div className="cf-ocr-preview">
              {firstDoc.mimeType.startsWith('image/') ? (
                <img
                  src={firstDoc.publicUrl}
                  alt={firstDoc.fileName}
                  loading="lazy"
                />
              ) : (
                <a
                  href={firstDoc.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cf-ocr-preview__pdf"
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    description
                  </span>
                  {firstDoc.fileName}
                </a>
              )}
            </div>
          ) : null}

          <label
            className={`cf-field cf-ocr-field ${confidenceClass(confidencePerField?.vendor)}`}
          >
            <span>
              Libellé *
              {confidencePerField?.vendor !== undefined ? (
                <small className="cf-ocr-hint">
                  {confidenceLabel(confidencePerField.vendor)}
                </small>
              ) : null}
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={200}
              required
            />
          </label>

          <div className="cf-form-row">
            <label
              className={`cf-field cf-ocr-field ${confidenceClass(confidencePerField?.totalTtcCents)}`}
            >
              <span>
                Montant (€) *
                {confidencePerField?.totalTtcCents !== undefined ? (
                  <small className="cf-ocr-hint">
                    {confidenceLabel(confidencePerField.totalTtcCents)}
                  </small>
                ) : null}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={amountEuros}
                onChange={(e) => setAmountEuros(e.target.value)}
                required
              />
            </label>

            <label
              className={`cf-field cf-ocr-field ${confidenceClass(confidencePerField?.date)}`}
            >
              <span>
                Date
                {confidencePerField?.date !== undefined ? (
                  <small className="cf-ocr-hint">
                    {confidenceLabel(confidencePerField.date)}
                  </small>
                ) : null}
              </span>
              <input
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </label>
          </div>

          <label
            className={`cf-field cf-ocr-field ${confidenceClass(confidencePerField?.pcgAccountCode)}`}
          >
            <span>
              Compte comptable
              {confidencePerField?.pcgAccountCode !== undefined ? (
                <small className="cf-ocr-hint">
                  {confidenceLabel(confidencePerField.pcgAccountCode)}
                </small>
              ) : null}
            </span>
            <select
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
            >
              <option value="">— Conserver le compte actuel —</option>
              {accounts
                .filter((a) => a.kind === 'EXPENSE' && a.isActive)
                .map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.code} — {a.label}
                  </option>
                ))}
            </select>
          </label>

          <fieldset className="cf-fieldset">
            <legend>Analytique (optionnel)</legend>
            <label className="cf-field">
              <span>Cohorte</span>
              <select
                value={cohortCode}
                onChange={(e) => setCohortCode(e.target.value)}
              >
                <option value="">— Aucune —</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cf-field">
              <span>Discipline</span>
              <input
                type="text"
                value={disciplineCode}
                onChange={(e) => setDisciplineCode(e.target.value)}
                placeholder="ex: karate, judo"
              />
            </label>
          </fieldset>

          <button type="submit" style={{ display: 'none' }} />
        </form>
      ) : null}
    </Drawer>
  );
}
