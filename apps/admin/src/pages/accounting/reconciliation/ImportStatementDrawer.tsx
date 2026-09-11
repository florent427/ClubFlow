import { useMutation } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import {
  IMPORT_BANK_STATEMENT,
  PREVIEW_CSV_STATEMENT,
} from '../../../lib/documents';
import type {
  ClubFinancialAccount,
  CsvMapping,
  CsvPreview,
  PreviewCsvStatementData,
} from '../../../lib/types';
import { useToast } from '../../../components/ToastProvider';
import { Drawer } from '../../../components/ui';
import {
  centsToInput,
  cleanMapping,
  fileToBase64,
  formatEuro,
  formatFr,
  formatSigned,
  inputToCents,
} from './format';

type Format = 'OFX' | 'CSV' | 'PDF';

type Props = {
  open: boolean;
  onClose: () => void;
  accounts: ClubFinancialAccount[];
  defaultAccountId?: string | null;
  onImported: (statementId: string) => void;
};

const ROLES: Array<{ key: keyof CsvMapping; label: string; required?: boolean }> = [
  { key: 'dateCol', label: 'Date', required: true },
  { key: 'valueDateCol', label: 'Date de valeur' },
  { key: 'labelCol', label: 'Libellé', required: true },
  { key: 'amountCol', label: 'Montant (signé)' },
  { key: 'debitCol', label: 'Débit' },
  { key: 'creditCol', label: 'Crédit' },
  { key: 'balanceCol', label: 'Solde' },
  { key: 'referenceCol', label: 'Référence' },
];

function formatOf(name: string): Format | null {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'ofx' || ext === 'qfx') return 'OFX';
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return 'CSV';
  if (ext === 'pdf') return 'PDF';
  return null;
}

/**
 * Dépôt d'un relevé OFX, CSV ou PDF (ADR-0014 §3). Pour un CSV, le mapping
 * des colonnes est détecté, montré avec un aperçu, corrigeable, puis
 * mémorisé sur le compte ; les soldes sont demandés seulement si le
 * fichier ne les porte pas. Un PDF est lu en arrière-plan par deux modèles.
 */
export function ImportStatementDrawer({
  open,
  onClose,
  accounts,
  defaultAccountId,
  onImported,
}: Props) {
  const { showToast } = useToast();
  const [accountId, setAccountId] = useState('');
  const [fileName, setFileName] = useState('');
  const [format, setFormat] = useState<Format | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState('');
  const [reading, setReading] = useState(false);

  const [previewMut, { loading: previewing }] =
    useMutation<PreviewCsvStatementData>(PREVIEW_CSV_STATEMENT);
  const [importMut, { loading: importing }] = useMutation(IMPORT_BANK_STATEMENT);

  useEffect(() => {
    if (!open) return;
    setAccountId(defaultAccountId ?? accounts[0]?.id ?? '');
    setFileName('');
    setFormat(null);
    setContent(null);
    setPreview(null);
    setMapping(null);
    setOpening('');
    setClosing('');
  }, [open, defaultAccountId, accounts]);

  const account = accounts.find((a) => a.id === accountId) ?? null;

  async function runPreview(b64: string, m: CsvMapping | null) {
    try {
      const res = await previewMut({
        variables: { input: { contentBase64: b64, mapping: m } },
      });
      const p = res.data?.previewCsvStatement;
      if (!p) return;
      setPreview(p);
      setMapping(cleanMapping(p.mapping));
      setOpening(p.openingBalanceCents !== null ? centsToInput(p.openingBalanceCents) : '');
      setClosing(p.closingBalanceCents !== null ? centsToInput(p.closingBalanceCents) : '');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Aperçu impossible', 'error');
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const fmt = formatOf(file.name);
    if (!fmt) {
      showToast('Formats acceptés : OFX (.ofx, .qfx), CSV (.csv, .txt) ou PDF', 'error');
      return;
    }
    setReading(true);
    try {
      const b64 = await fileToBase64(file);
      setFileName(file.name);
      setFormat(fmt);
      setContent(b64);
      setPreview(null);
      setMapping(null);
      setOpening('');
      setClosing('');
      if (fmt === 'CSV') await runPreview(b64, cleanMapping(account?.csvMapping));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lecture impossible', 'error');
    } finally {
      setReading(false);
    }
  }

  function updateMapping(patch: Partial<CsvMapping>) {
    if (!mapping || !content) return;
    let next: CsvMapping = { ...mapping, ...patch };
    // Montant signé et débit/crédit s'excluent : le dernier choisi gagne.
    if (patch.amountCol !== undefined && patch.amountCol !== null) {
      next = { ...next, debitCol: null, creditCol: null };
    }
    if (
      (patch.debitCol !== undefined && patch.debitCol !== null) ||
      (patch.creditCol !== undefined && patch.creditCol !== null)
    ) {
      next = { ...next, amountCol: null };
    }
    setMapping(next);
    void runPreview(content, next);
  }

  const needsBalances =
    format === 'CSV' &&
    preview !== null &&
    (preview.openingBalanceCents === null || preview.closingBalanceCents === null);

  async function onSubmit() {
    if (!content || !format || !accountId) return;
    const openingCents = opening.trim() ? inputToCents(opening) : null;
    const closingCents = closing.trim() ? inputToCents(closing) : null;
    if (Number.isNaN(openingCents) || Number.isNaN(closingCents)) {
      showToast('Soldes invalides (ex : 1234,56)', 'error');
      return;
    }
    if (needsBalances && (openingCents === null || closingCents === null)) {
      showToast('Ce fichier ne porte pas les soldes : saisis le solde de début et de fin', 'error');
      return;
    }
    try {
      const res = await importMut({
        variables: {
          input: {
            financialAccountId: accountId,
            format,
            fileName,
            contentBase64: content,
            csvMapping: format === 'CSV' ? mapping : null,
            openingBalanceCents: format === 'CSV' ? openingCents : null,
            closingBalanceCents: format === 'CSV' ? closingCents : null,
          },
        },
      });
      const st = (res.data as { importBankStatement?: { id: string; status: string; matchedCount: number } } | undefined)
        ?.importBankStatement;
      if (!st) throw new Error('Réponse vide');
      if (st.status === 'PARSING') {
        showToast('Relevé déposé : lecture par deux modèles en cours, la page se mettra à jour', 'success');
      } else {
        showToast(
          st.status === 'NEEDS_CHECK'
            ? 'Relevé déposé : le contrôle d’intégrité signale un écart'
            : `Relevé déposé : ${st.matchedCount} ligne(s) rapprochée(s) automatiquement`,
          st.status === 'NEEDS_CHECK' ? 'error' : 'success',
        );
      }
      onImported(st.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import impossible', 'error');
    }
  }

  const columnOptions = preview?.headers.map((h, i) => ({ i, label: `${i + 1}. ${h || '(vide)'}` })) ?? [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Déposer un relevé bancaire"
      footer={
        <div className="cf-drawer-foot">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!content || !accountId || importing || previewing || reading || (format === 'CSV' && !!preview?.error)}
            onClick={() => void onSubmit()}
          >
            {importing ? 'Import…' : 'Déposer'}
          </button>
        </div>
      }
    >
      <div className="cf-form">
        <label className="cf-field">
          <span>Compte bancaire *</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.accountingAccountCode})
              </option>
            ))}
          </select>
        </label>
        {account && account.openingBalanceCents === null ? (
          <p className="cf-form-error">
            Ce compte n’a pas de solde d’ouverture : le chaînage du premier
            relevé ne pourra pas être vérifié. Renseigne-le dans Paramètres →
            Comptabilité → Exercice.
          </p>
        ) : null}
        <label className="cf-field">
          <span>Fichier (OFX, CSV ou PDF) *</span>
          <input
            type="file"
            accept=".ofx,.qfx,.csv,.txt,.tsv,.pdf,text/csv,application/x-ofx,application/pdf"
            disabled={reading}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <small className="cf-muted">
            {fileName
              ? `${fileName} — ${format}`
              : 'Export OFX ou CSV de votre espace bancaire (lecture exacte), ou le relevé PDF (lu par deux IA).'}
          </small>
        </label>

        {format === 'CSV' && preview && mapping ? (
          <>
            <section className="members-panel" style={{ padding: 12 }}>
              <h3 className="members-panel__h" style={{ fontSize: '0.95rem' }}>
                Colonnes du fichier
              </h3>
              <p className="cf-muted" style={{ marginBottom: 8 }}>
                Séparateur « {mapping.delimiter === '\t' ? 'tabulation' : mapping.delimiter} », encodage {preview.encoding},{' '}
                {preview.rowCount} ligne(s). Corrige si l’aperçu ne correspond pas ; le mapping sera mémorisé pour ce compte.
              </p>
              <div className="cf-form-row">
                {ROLES.map((r) => (
                  <label key={r.key} className="cf-field" style={{ minWidth: 160 }}>
                    <span>
                      {r.label}
                      {r.required ? ' *' : ''}
                    </span>
                    <select
                      value={(mapping[r.key] as number | null) ?? ''}
                      onChange={(e) =>
                        updateMapping({
                          [r.key]: e.target.value === '' ? null : Number(e.target.value),
                        } as Partial<CsvMapping>)
                      }
                    >
                      {!r.required ? <option value="">—</option> : null}
                      {columnOptions.map((o) => (
                        <option key={o.i} value={o.i}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="cf-form-row">
                <label className="cf-field">
                  <span>Format de date</span>
                  <select
                    value={mapping.dateFormat}
                    onChange={(e) => updateMapping({ dateFormat: e.target.value as CsvMapping['dateFormat'] })}
                  >
                    <option value="DMY">JJ/MM/AAAA</option>
                    <option value="YMD">AAAA-MM-JJ</option>
                    <option value="MDY">MM/JJ/AAAA</option>
                  </select>
                </label>
                <label className="cf-field">
                  <span>Décimale</span>
                  <select
                    value={mapping.decimalSeparator}
                    onChange={(e) => updateMapping({ decimalSeparator: e.target.value as CsvMapping['decimalSeparator'] })}
                  >
                    <option value=",">virgule (1 234,56)</option>
                    <option value=".">point (1,234.56)</option>
                  </select>
                </label>
                <label className="cf-checkbox" style={{ alignSelf: 'flex-end' }}>
                  <input
                    type="checkbox"
                    checked={mapping.hasHeader}
                    onChange={(e) => updateMapping({ hasHeader: e.target.checked })}
                  />
                  <span>Première ligne = en-tête</span>
                </label>
              </div>
              {preview.error ? (
                <p className="cf-form-error" role="alert">
                  {preview.error}
                </p>
              ) : (
                <>
                  <table className="cf-table" style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Libellé</th>
                        <th style={{ textAlign: 'right' }}>Montant</th>
                        <th style={{ textAlign: 'right' }}>Solde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewLines.map((l, i) => (
                        <tr key={i}>
                          <td>{formatFr(l.bookedOn)}</td>
                          <td>{l.label}</td>
                          <td style={{ textAlign: 'right', color: l.amountCents < 0 ? '#991b1b' : '#166534' }}>
                            {formatSigned(l.amountCents)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {l.balanceAfterCents !== null ? formatEuro(l.balanceAfterCents) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <small className="cf-muted">
                    {preview.parsedCount} ligne(s) lisible(s) sur {preview.rowCount}
                    {preview.periodStart ? ` · du ${formatFr(preview.periodStart)} au ${formatFr(preview.periodEnd)}` : ''}
                  </small>
                  {preview.warnings.length > 0 ? (
                    <ul className="cf-muted" style={{ marginTop: 6, fontSize: '0.85rem' }}>
                      {preview.warnings.slice(0, 5).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </section>

            <div className="cf-form-row">
              <label className="cf-field" style={{ flex: 1 }}>
                <span>Solde de début (€){needsBalances ? ' *' : ''}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  placeholder="1234,56"
                  disabled={!needsBalances}
                />
              </label>
              <label className="cf-field" style={{ flex: 1 }}>
                <span>Solde de fin (€){needsBalances ? ' *' : ''}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={closing}
                  onChange={(e) => setClosing(e.target.value)}
                  placeholder="1559,46"
                  disabled={!needsBalances}
                />
              </label>
            </div>
            <small className="cf-muted">
              {needsBalances
                ? 'Ce fichier ne porte pas les soldes : recopie-les depuis le relevé de la banque. Ils servent au contrôle d’intégrité.'
                : 'Soldes lus dans le fichier grâce à la colonne solde.'}
            </small>
          </>
        ) : null}

        {format === 'OFX' ? (
          <p className="cf-muted">
            Les soldes et la période sont lus dans le fichier. Le contrôle
            d’intégrité et le chaînage avec le relevé précédent sont faits au
            dépôt.
          </p>
        ) : null}

        {format === 'PDF' ? (
          <section className="members-panel" style={{ padding: 12 }}>
            <strong>Lecture par deux modèles IA</strong>
            <p className="cf-muted" style={{ marginTop: 6 }}>
              Deux modèles indépendants lisent le relevé ; les lignes où ils ne
              sont pas d’accord sont surlignées pour que tu tranches. Ensuite le
              contrôle arithmétique (solde de début + mouvements = solde de fin)
              décide si le relevé est exploitable. Compte quelques dizaines de
              secondes, et un coût IA de quelques centimes, imputé au budget du
              club. Un export OFX ou CSV, quand la banque le propose, est lu sans
              IA et sans erreur.
            </p>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}
