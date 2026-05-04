import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_ACCOUNTING_ACCOUNTS,
  CLUB_ACCOUNTING_COHORTS,
  CLUB_FINANCIAL_ACCOUNTS,
  CONFIRM_ACCOUNTING_EXTRACTION,
} from '../../lib/documents';
import type {
  AccountingEntry,
  ClubAccountingAccountsData,
  ClubAccountingCohortsData,
  ClubFinancialAccount,
} from '../../lib/types';

const PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: '', label: '— Non défini —' },
  { value: 'CASH', label: 'Espèces' },
  { value: 'CHECK', label: 'Chèque' },
  { value: 'TRANSFER', label: 'Virement' },
  { value: 'CARD', label: 'Carte bancaire' },
  { value: 'DIRECT_DEBIT', label: 'Prélèvement' },
  { value: 'OTHER', label: 'Autre' },
];
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
  const { data: faData } = useQuery<{
    clubFinancialAccounts: ClubFinancialAccount[];
  }>(CLUB_FINANCIAL_ACCOUNTS, { fetchPolicy: 'cache-and-network' });
  const financialAccounts = (faData?.clubFinancialAccounts ?? []).filter(
    (f) => f.isActive,
  );

  // Champs alignés sur l'expérience mobile-admin :
  // - vendor + invoiceNumber séparés (le label est calculé)
  // - mode de paiement + référence
  // - compte financier de contrepartie (banque/caisse)
  const [vendor, setVendor] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [amountEuros, setAmountEuros] = useState('');
  const [occurredOn, setOccurredOn] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [cohortCode, setCohortCode] = useState('');
  const [disciplineCode, setDisciplineCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [financialAccountId, setFinancialAccountId] = useState('');

  /** Libellé calculé dynamiquement depuis vendor + n°. */
  const computedLabel = (() => {
    const v = vendor.trim();
    const n = invoiceNumber.trim();
    if (n && v) return `${n} — ${v}`;
    if (v) return v;
    if (n) return `Facture ${n}`;
    return 'Reçu à qualifier';
  })();

  // Pré-remplit les champs à l'ouverture (tente de splitter le label
  // existant si vendor/n° ne sont pas fournis directement par l'API)
  useEffect(() => {
    if (!entry) return;
    // Note : type AccountingEntry n'expose pas `extraction` (champ supprimé du
    // schema GraphQL public). Le vendor pré-rempli est laissé vide ; le user
    // pourra le saisir si l'OCR ne l'a pas détecté.
    setVendor('');
    setInvoiceNumber(entry.invoiceNumber ?? '');
    setAmountEuros(
      (entry.amountCents / 100).toFixed(2).replace('.', ','),
    );
    setOccurredOn(entry.occurredAt.slice(0, 10));
    const firstLine = entry.lines[0];
    setAccountCode(firstLine?.accountCode ?? '');
    const firstAlloc = firstLine?.allocations[0];
    setCohortCode(firstAlloc?.cohortCode ?? '');
    setDisciplineCode(firstAlloc?.disciplineCode ?? '');
    setPaymentMethod(entry.paymentMethod ?? '');
    setPaymentReference(entry.paymentReference ?? '');
    setFinancialAccountId(entry.financialAccountId ?? '');
  }, [entry]);

  /**
   * Soumet l'écriture avec mode='save' (Enregistrer brouillon, conserve
   * NEEDS_REVIEW) ou mode='validate' (Valider, passe POSTED). En mode
   * validate, on demande une confirmation explicite à l'utilisateur car
   * c'est irréversible (nécessite contre-passation pour annuler).
   */
  async function submitEntry(mode: 'save' | 'validate') {
    if (!entry) return;
    if (!computedLabel.trim() || computedLabel === 'Reçu à qualifier') {
      showToast(
        'Renseigne le fournisseur ou le n° de facture pour le libellé',
        'error',
      );
      return;
    }
    const amountCents = parseEuros(amountEuros);
    if (amountCents === null) {
      showToast('Montant invalide', 'error');
      return;
    }
    if (mode === 'validate') {
      const confirmed = window.confirm(
        "Valider définitivement cette écriture ?\n\n" +
          "Une fois validée, l'écriture est comptabilisée (POSTED) et " +
          "ne peut plus être modifiée. Pour la corriger, il faudra " +
          "créer une contre-passation.\n\n" +
          'Si tu veux juste sauvegarder ton avancement sans valider, ' +
          'utilise « Enregistrer ».',
      );
      if (!confirmed) return;
    }
    try {
      await confirmExtraction({
        variables: {
          input: {
            entryId: entry.id,
            label: computedLabel.trim(),
            invoiceNumber: invoiceNumber.trim() || null,
            amountCents,
            occurredAt: occurredOn
              ? new Date(occurredOn).toISOString()
              : undefined,
            accountCode: accountCode || undefined,
            cohortCode: cohortCode || undefined,
            disciplineCode: disciplineCode || undefined,
            paymentMethod: paymentMethod || null,
            paymentReference:
              paymentMethod === 'CHECK' ||
              paymentMethod === 'TRANSFER' ||
              paymentMethod === 'OTHER'
                ? paymentReference.trim() || null
                : null,
            ...(financialAccountId ? { financialAccountId } : {}),
            validate: mode === 'validate',
          },
        },
      });
      showToast(
        mode === 'validate'
          ? 'Écriture validée et comptabilisée'
          : 'Brouillon enregistré — tu peux continuer à éditer',
        'success',
      );
      onSaved();
      // Mode 'validate' : on ferme le drawer (l'écriture est POSTED,
      //   plus rien à éditer dans ce drawer). Mode 'save' : on RESTE
      //   ouvert pour permettre une saisie progressive (l'utilisateur
      //   peut continuer à corriger des champs et re-save).
      if (mode === 'validate') {
        onClose();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onSubmit(e: FormEvent) {
    // Submit du form = validation (cohérent avec le bouton primary)
    e.preventDefault();
    await submitEntry('validate');
  }

  const accounts = accountsData?.clubAccountingAccounts ?? [];
  const cohorts = cohortsData?.clubAccountingCohorts ?? [];
  const docs = entry?.documents ?? [];

  return (
    <Drawer
      open={entry !== null}
      onClose={onClose}
      title="Révision OCR"
      width={560}
      footer={
        <div
          className="cf-drawer-foot"
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          <button type="button" className="btn-ghost" onClick={onClose}>
            Fermer
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={confirming}
            onClick={() => void submitEntry('save')}
            title="Sauvegarde les modifications, l'écriture reste « À valider »"
          >
            {confirming ? '…' : 'Enregistrer brouillon'}
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={confirming}
            form="cf-review-form"
            title="Comptabilise l'écriture (irréversible)"
          >
            {confirming ? 'Validation…' : 'Valider définitivement'}
          </button>
        </div>
      }
    >
      {entry ? (
        <form id="cf-review-form" onSubmit={onSubmit} className="cf-form">
          {/* Pièce(s) justificative(s) — preview inline complète.
              Multi-pages : on affiche chaque doc à la suite. PDF →
              iframe avec viewer natif (zoom + scroll multi-pages).
              Image → <img> cliquable pour ouvrir en plein écran. */}
          {docs.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                marginBottom: 16,
              }}
            >
              {docs.map((d, idx) => {
                const isImage = d.mimeType.startsWith('image/');
                const isPdf = d.mimeType === 'application/pdf';
                return (
                  <div key={d.id} className="cf-ocr-preview-block">
                    <div className="cf-ocr-preview-head">
                      <strong>
                        {docs.length > 1 ? `Page ${idx + 1} · ` : ''}
                        {d.fileName}
                      </strong>
                      <a
                        href={d.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ouvrir en plein écran"
                      >
                        <span
                          className="material-symbols-outlined"
                          aria-hidden
                          style={{ fontSize: '1rem' }}
                        >
                          open_in_new
                        </span>
                      </a>
                    </div>
                    {isImage ? (
                      <a
                        href={d.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={d.publicUrl}
                          alt={d.fileName}
                          loading="lazy"
                          className="cf-ocr-preview-img"
                        />
                      </a>
                    ) : isPdf ? (
                      <iframe
                        src={d.publicUrl}
                        title={d.fileName}
                        className="cf-ocr-preview-pdf"
                      />
                    ) : (
                      <div className="cf-ocr-preview-fallback">
                        <span className="cf-muted">
                          Type {d.mimeType} non prévisualisable.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
          <style>{`
            .cf-ocr-preview-block {
              border: 1px solid var(--cf-border, #e5e5e5);
              border-radius: 8px;
              overflow: hidden;
              background: var(--cf-bg-alt, #fafafa);
            }
            .cf-ocr-preview-head {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 8px;
              padding: 6px 10px;
              background: var(--cf-bg, #f0f0f0);
              border-bottom: 1px solid var(--cf-border, #e5e5e5);
              font-size: 0.85rem;
            }
            .cf-ocr-preview-img {
              display: block;
              width: 100%;
              max-height: 480px;
              object-fit: contain;
              background: #000;
            }
            .cf-ocr-preview-pdf {
              display: block;
              width: 100%;
              height: 480px;
              border: 0;
              background: #fff;
            }
            .cf-ocr-preview-fallback {
              padding: 24px;
              text-align: center;
            }
          `}</style>

          {/* N° facture + Fournisseur séparés (le libellé est calculé) */}
          <div className="cf-form-row">
            <label className="cf-field">
              <span>N° de facture</span>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Ex. F-2026-001"
                maxLength={100}
              />
            </label>
            <label
              className={`cf-field cf-ocr-field ${confidenceClass(confidencePerField?.vendor)}`}
            >
              <span>
                Fournisseur *
                {confidencePerField?.vendor !== undefined ? (
                  <small className="cf-ocr-hint">
                    {confidenceLabel(confidencePerField.vendor)}
                  </small>
                ) : null}
              </span>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Ex. Decathlon"
                maxLength={150}
              />
            </label>
          </div>
          {/* Libellé calculé (lecture seule) — pour transparence */}
          <div
            style={{
              background: 'var(--cf-bg-alt, #f5f5f5)',
              borderLeft: '3px solid var(--cf-primary, #0056c5)',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: '0.85rem',
              marginBottom: 12,
            }}
          >
            <div style={{ color: 'var(--cf-muted, #666)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Libellé écriture (auto)
            </div>
            <strong>{computedLabel}</strong>
          </div>

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

          {/* Mode de paiement + référence (chèque/virement) */}
          <div className="cf-form-row">
            <label className="cf-field">
              <span>Mode de paiement</span>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            {paymentMethod === 'CHECK' ||
            paymentMethod === 'TRANSFER' ||
            paymentMethod === 'OTHER' ? (
              <label className="cf-field">
                <span>
                  {paymentMethod === 'CHECK'
                    ? 'N° de chèque'
                    : paymentMethod === 'TRANSFER'
                      ? 'Référence virement'
                      : 'Référence'}
                </span>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder={paymentMethod === 'CHECK' ? '0000123' : 'Réf...'}
                  maxLength={100}
                />
              </label>
            ) : null}
          </div>

          {/* Compte financier de contrepartie (banque/caisse) */}
          {financialAccounts.length > 0 ? (
            <label className="cf-field">
              <span>Encaissé / payé sur (contrepartie)</span>
              <select
                value={financialAccountId}
                onChange={(e) => setFinancialAccountId(e.target.value)}
              >
                <option value="">— Banque par défaut —</option>
                {financialAccounts.map((fa) => (
                  <option key={fa.id} value={fa.id}>
                    {fa.label} · PCG {fa.accountingAccountCode}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <button type="submit" style={{ display: 'none' }} />
        </form>
      ) : null}
    </Drawer>
  );
}
