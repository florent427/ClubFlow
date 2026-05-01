import { Drawer } from '../../components/ui';
import type { AccountingEntry } from '../../lib/types';

interface Props {
  entry: AccountingEntry | null;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon',
  NEEDS_REVIEW: 'À valider',
  POSTED: 'Validée',
  LOCKED: 'Verrouillée',
  CANCELLED: 'Annulée',
};

const KIND_LABEL: Record<string, string> = {
  INCOME: 'Recette',
  EXPENSE: 'Dépense',
  IN_KIND: 'Don nature',
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Espèces',
  CHECK: 'Chèque',
  TRANSFER: 'Virement',
  CARD: 'Carte bancaire',
  DIRECT_DEBIT: 'Prélèvement',
  OTHER: 'Autre',
};

function fmtEur(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

/**
 * Drawer LECTURE SEULE qui affiche tous les détails d'une écriture
 * (peu importe son statut). Utilisé pour les POSTED / LOCKED / CANCELLED
 * où l'utilisateur veut voir la ventilation comptable complète, la
 * contrepartie banque + son code PCG, les allocations analytiques, le
 * reasoning IA, et les documents attachés.
 *
 * Ne propose PAS de bouton de modification — c'est purement de la
 * consultation. Pour modifier une écriture POSTED, il faut passer par
 * l'annulation + recréation (workflow comptable propre).
 */
export function EntryDetailsDrawer({ entry, onClose }: Props) {
  if (!entry) return null;

  // Lignes article (= hors banque/caisse contrepartie)
  const articleLines = entry.lines.filter(
    (l) => !/^51\d{4}$/.test(l.accountCode) && !/^53\d{4}$/.test(l.accountCode),
  );
  const counterpartyLines = entry.lines.filter(
    (l) => /^51\d{4}$/.test(l.accountCode) || /^53\d{4}$/.test(l.accountCode),
  );

  return (
    <Drawer
      open={entry !== null}
      onClose={onClose}
      title={`Écriture · ${STATUS_LABEL[entry.status] ?? entry.status}`}
      width={620}
      footer={
        <div className="cf-drawer-foot">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Identification */}
        <section>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>{entry.label}</h3>
          <div className="cf-muted" style={{ fontSize: '0.9rem' }}>
            {KIND_LABEL[entry.kind]} · {fmtEur(entry.amountCents)} ·{' '}
            {fmtDate(entry.occurredAt)}
          </div>
          <div className="cf-muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
            Source : {entry.source} · Créée le {fmtDate(entry.createdAt)}
          </div>
        </section>

        {/* Métadonnées (n° facture, paiement, contrepartie) */}
        <section>
          <h4 style={{ marginTop: 0, marginBottom: 8 }}>Informations</h4>
          <table className="cf-meta-table">
            <tbody>
              {entry.invoiceNumber ? (
                <tr>
                  <td className="cf-muted">N° de facture</td>
                  <td>
                    <strong>{entry.invoiceNumber}</strong>
                  </td>
                </tr>
              ) : null}
              {entry.paymentMethod ? (
                <tr>
                  <td className="cf-muted">Mode de paiement</td>
                  <td>
                    {PAYMENT_LABEL[entry.paymentMethod] ?? entry.paymentMethod}
                    {entry.paymentReference ? ` · ${entry.paymentReference}` : ''}
                  </td>
                </tr>
              ) : null}
              {entry.financialAccountLabel ? (
                <tr>
                  <td className="cf-muted">Compte de contrepartie</td>
                  <td>
                    <strong>{entry.financialAccountLabel}</strong>
                    {entry.financialAccountCode ? (
                      <span className="cf-muted" style={{ marginLeft: 6 }}>
                        · PCG {entry.financialAccountCode}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ) : null}
              {entry.vatTotalCents != null ? (
                <tr>
                  <td className="cf-muted">TVA totale</td>
                  <td>{fmtEur(entry.vatTotalCents)}</td>
                </tr>
              ) : null}
              {entry.duplicateOfEntryId ? (
                <tr>
                  <td className="cf-muted">Doublon de</td>
                  <td>
                    <span style={{ color: 'var(--cf-warning)' }}>
                      ⚠️ Entry {entry.duplicateOfEntryId.slice(0, 8)}…
                    </span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        {/* Lignes débit (article) */}
        {articleLines.length > 0 ? (
          <section>
            <h4 style={{ marginTop: 0, marginBottom: 8 }}>
              Ventilation ({articleLines.length} ligne{articleLines.length > 1 ? 's' : ''})
            </h4>
            <table className="cf-lines-table">
              <thead>
                <tr>
                  <th>Compte PCG</th>
                  <th>Libellé</th>
                  <th style={{ textAlign: 'right' }}>Débit</th>
                  <th style={{ textAlign: 'right' }}>Crédit</th>
                </tr>
              </thead>
              <tbody>
                {articleLines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.accountCode}</strong>
                      <br />
                      <small className="cf-muted">{l.accountLabel}</small>
                    </td>
                    <td>
                      {l.label ?? '—'}
                      {l.iaReasoning ? (
                        <small
                          className="cf-muted"
                          style={{
                            display: 'block',
                            marginTop: 4,
                            fontStyle: 'italic',
                          }}
                          title={l.iaReasoning}
                        >
                          💭 {l.iaReasoning.slice(0, 120)}
                          {l.iaReasoning.length > 120 ? '…' : ''}
                        </small>
                      ) : null}
                      {l.iaConfidencePct != null ? (
                        <small className="cf-muted" style={{ marginLeft: 4 }}>
                          IA {l.iaConfidencePct}%
                        </small>
                      ) : null}
                      {l.mergedFromArticleLabels.length > 0 ? (
                        <small
                          className="cf-muted"
                          style={{ display: 'block', marginTop: 2 }}
                          title={l.mergedFromArticleLabels.join(' · ')}
                        >
                          {l.mergedFromArticleLabels.length} articles regroupés
                        </small>
                      ) : null}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {l.debitCents > 0 ? fmtEur(l.debitCents) : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {l.creditCents > 0 ? fmtEur(l.creditCents) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {/* Ligne contrepartie (banque/caisse) */}
        {counterpartyLines.length > 0 ? (
          <section>
            <h4 style={{ marginTop: 0, marginBottom: 8 }}>
              Contrepartie ({counterpartyLines.length} ligne
              {counterpartyLines.length > 1 ? 's' : ''})
            </h4>
            <table className="cf-lines-table">
              <thead>
                <tr>
                  <th>Compte PCG</th>
                  <th>Libellé</th>
                  <th style={{ textAlign: 'right' }}>Débit</th>
                  <th style={{ textAlign: 'right' }}>Crédit</th>
                </tr>
              </thead>
              <tbody>
                {counterpartyLines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.accountCode}</strong>
                      <br />
                      <small className="cf-muted">{l.accountLabel}</small>
                    </td>
                    <td>{l.label ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {l.debitCents > 0 ? fmtEur(l.debitCents) : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {l.creditCents > 0 ? fmtEur(l.creditCents) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {/* Documents attachés */}
        {entry.documents.length > 0 ? (
          <section>
            <h4 style={{ marginTop: 0, marginBottom: 8 }}>
              Documents ({entry.documents.length})
            </h4>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              {entry.documents.map((d) => (
                <li key={d.id} style={{ marginBottom: 4 }}>
                  <a
                    href={d.publicUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {d.fileName}
                  </a>{' '}
                  <small className="cf-muted">({d.mimeType})</small>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <style>{`
        .cf-meta-table { width: 100%; border-collapse: collapse; }
        .cf-meta-table td { padding: 4px 8px; vertical-align: top; }
        .cf-meta-table td:first-child { width: 180px; }

        .cf-lines-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .cf-lines-table th, .cf-lines-table td {
          padding: 6px 8px;
          border-bottom: 1px solid var(--cf-border, #eee);
          vertical-align: top;
        }
        .cf-lines-table th {
          text-align: left;
          font-weight: 600;
          color: var(--cf-muted, #666);
        }
      `}</style>
    </Drawer>
  );
}
