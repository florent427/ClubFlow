import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CANCEL_CLUB_TAX_RECEIPT,
  CLUB_TAX_RECEIPTS,
  CLUB_TAX_RECEIPT_PDF,
  CLUB_TAX_RECEIPT_SETTINGS,
  ISSUE_CLUB_TAX_RECEIPTS,
  UPDATE_CLUB_TAX_RECEIPT_SETTINGS,
} from '../../../lib/mileage-documents';
import type {
  ClubTaxReceiptPdfData,
  ClubTaxReceiptSettingsData,
  ClubTaxReceiptsData,
  IssueClubTaxReceiptsData,
  TaxReceipt,
  TaxReceiptOrganismType,
  TaxReceiptSettings,
} from '../../../lib/mileage-documents';
import { useToast } from '../../../components/ToastProvider';
import { ConfirmModal } from '../../../components/ui';
import { formatEuro, formatFr } from '../reconciliation/format';
import { ReasonModal } from './ReasonModal';
import { ORGANISM_TYPE_LABEL, downloadBase64Pdf, errorMessage } from './mileage-format';

type SettingsForm = {
  enabled: boolean;
  organismType: TaxReceiptOrganismType | '';
  purpose: string;
  rna: string;
  signatoryName: string;
  signatoryTitle: string;
};

function toForm(s: TaxReceiptSettings | undefined): SettingsForm {
  return {
    enabled: s?.taxReceiptEnabled ?? false,
    organismType: s?.taxReceiptOrganismType ?? '',
    purpose: s?.taxReceiptPurpose ?? '',
    rna: s?.rnaNumber ?? '',
    signatoryName: s?.taxReceiptSignatoryName ?? '',
    signatoryTitle: s?.taxReceiptSignatoryTitle ?? '',
  };
}

/**
 * Reçus fiscaux (Cerfa 11580) des bénévoles qui ont abandonné le
 * remboursement de leurs frais kilométriques : réglages, émission par année,
 * téléchargement et annulation.
 */
export function TaxReceiptsTab() {
  const { showToast } = useToast();
  const client = useApolloClient();
  const thisYear = new Date().getFullYear();

  // ── Réglages ──
  const { data: settingsData } = useQuery<ClubTaxReceiptSettingsData>(
    CLUB_TAX_RECEIPT_SETTINGS,
    { fetchPolicy: 'cache-and-network' },
  );
  const settings = settingsData?.clubTaxReceiptSettings;
  const [form, setForm] = useState<SettingsForm>(() => toForm(undefined));
  useEffect(() => {
    setForm(toForm(settings));
  }, [settings]);
  // Les réglages n'ont pas d'id : Apollo ne peut pas fusionner la réponse
  // de la mutation dans le cache, il faut relire la requête.
  const [saveSettings, { loading: savingSettings }] = useMutation(
    UPDATE_CLUB_TAX_RECEIPT_SETTINGS,
    { refetchQueries: [CLUB_TAX_RECEIPT_SETTINGS], awaitRefetchQueries: true },
  );

  // ── Reçus de l'année ──
  const [year, setYear] = useState(thisYear);
  const { data, loading, refetch } = useQuery<ClubTaxReceiptsData>(CLUB_TAX_RECEIPTS, {
    variables: { year },
    fetchPolicy: 'cache-and-network',
  });
  const pending = data?.clubTaxReceiptPendingDonors ?? [];
  const receipts = data?.clubTaxReceipts ?? [];
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setPicked({});
  }, [year]);
  const pickedIds = pending.filter((p) => picked[p.memberId]).map((p) => p.memberId);
  const pickedTotal = pending
    .filter((p) => picked[p.memberId])
    .reduce((s, p) => s + p.totalCents, 0);

  const [issue, { loading: issuing }] =
    useMutation<IssueClubTaxReceiptsData>(ISSUE_CLUB_TAX_RECEIPTS);
  const [cancelReceipt, { loading: cancelling }] = useMutation(CANCEL_CLUB_TAX_RECEIPT);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [toCancel, setToCancel] = useState<TaxReceipt | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function onSaveSettings(e: FormEvent) {
    e.preventDefault();
    try {
      await saveSettings({
        variables: {
          input: {
            taxReceiptEnabled: form.enabled,
            taxReceiptOrganismType: form.organismType || null,
            taxReceiptPurpose: form.purpose.trim() || null,
            rnaNumber: form.rna.trim() || null,
            taxReceiptSignatoryName: form.signatoryName.trim() || null,
            taxReceiptSignatoryTitle: form.signatoryTitle.trim() || null,
          },
        },
      });
      showToast('Réglages des reçus fiscaux enregistrés', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onIssue() {
    try {
      const res = await issue({ variables: { year, memberIds: pickedIds } });
      const n = res.data?.issueClubTaxReceipts.length ?? 0;
      showToast(`${n} reçu${n > 1 ? 's' : ''} émis`, 'success');
      setConfirmIssue(false);
      setPicked({});
      await refetch();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onCancelReceipt(reason: string) {
    if (!toCancel) return;
    try {
      await cancelReceipt({ variables: { id: toCancel.id, reason } });
      showToast(`Reçu ${toCancel.number} annulé`, 'success');
      setToCancel(null);
      await refetch();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onDownload(r: TaxReceipt) {
    setDownloading(r.id);
    try {
      const res = await client.query<ClubTaxReceiptPdfData>({
        query: CLUB_TAX_RECEIPT_PDF,
        variables: { id: r.id },
        fetchPolicy: 'network-only',
      });
      const b64 = res.data?.clubTaxReceiptPdf;
      if (!b64) throw new Error('PDF indisponible');
      downloadBase64Pdf(b64, `Recu_fiscal_${r.number.replace(/[^\w-]+/g, '_')}.pdf`);
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setDownloading(null);
    }
  }

  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);

  return (
    <>
      <section className="members-panel">
        <h2 className="members-panel__h">Réglages</h2>
        <form onSubmit={onSaveSettings} className="cf-form">
          <label className="cf-checkbox">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Le club délivre des reçus fiscaux pour les frais abandonnés
          </label>
          <p className="cf-muted" style={{ margin: 0 }}>
            Seuls les organismes d’intérêt général ou reconnus d’utilité publique
            peuvent en délivrer (article 200 du CGI). L’adresse du club et celle de
            chaque bénévole figurent sur le reçu.
          </p>
          <div className="cf-form-row">
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Qualité de l’organisme{form.enabled ? ' *' : ''}</span>
              <select className="cf-field__input"
                value={form.organismType}
                onChange={(e) =>
                  setForm({ ...form, organismType: e.target.value as TaxReceiptOrganismType | '' })
                }
              >
                <option value="">—</option>
                {(Object.keys(ORGANISM_TYPE_LABEL) as TaxReceiptOrganismType[]).map((k) => (
                  <option key={k} value={k}>
                    {ORGANISM_TYPE_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="cf-field" style={{ flex: 1 }}>
              <span>N° RNA</span>
              <input className="cf-field__input"
                value={form.rna}
                placeholder="W123456789"
                maxLength={40}
                onChange={(e) => setForm({ ...form, rna: e.target.value })}
              />
            </label>
          </div>
          <label className="cf-field">
            <span>Objet du club{form.enabled ? ' *' : ''}</span>
            <textarea className="cf-field__input"
              rows={2}
              maxLength={500}
              value={form.purpose}
              placeholder="Ex. Pratique et enseignement du karaté"
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            />
          </label>
          <div className="cf-form-row">
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Signataire{form.enabled ? ' *' : ''}</span>
              <input className="cf-field__input"
                value={form.signatoryName}
                maxLength={120}
                placeholder="Prénom Nom"
                onChange={(e) => setForm({ ...form, signatoryName: e.target.value })}
              />
            </label>
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Qualité du signataire</span>
              <input className="cf-field__input"
                value={form.signatoryTitle}
                maxLength={120}
                placeholder="Ex. Trésorier"
                onChange={(e) => setForm({ ...form, signatoryTitle: e.target.value })}
              />
            </label>
          </div>
          <div>
            <button type="submit" className="btn-primary" disabled={savingSettings}>
              Enregistrer les réglages
            </button>
          </div>
        </form>
      </section>

      <section className="members-panel">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2 className="members-panel__h" style={{ margin: 0 }}>
            Dons à couvrir
          </h2>
          <label className="cf-field" style={{ margin: 0 }}>
            <span>Année</span>
            <select className="cf-field__input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
        {settings && !settings.taxReceiptEnabled ? (
          <p className="cf-muted">
            Les reçus fiscaux ne sont pas activés : active-les dans les réglages
            ci-dessus pour pouvoir les émettre.
          </p>
        ) : null}
        {pending.length === 0 ? (
          <p className="cf-muted">
            {loading
              ? 'Chargement…'
              : `Aucun don sans reçu en ${year}. Une note validée en « don » apparaît ici.`}
          </p>
        ) : (
          <>
            <table className="cf-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      aria-label="Tout cocher"
                      checked={pending.length > 0 && pickedIds.length === pending.length}
                      onChange={(e) =>
                        setPicked(
                          e.target.checked
                            ? Object.fromEntries(pending.map((p) => [p.memberId, true]))
                            : {},
                        )
                      }
                    />
                  </th>
                  <th>Bénévole</th>
                  <th>Notes</th>
                  <th style={{ textAlign: 'right' }}>Montant du don</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.memberId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!picked[p.memberId]}
                        aria-label={`Émettre le reçu de ${p.memberName}`}
                        onChange={(e) =>
                          setPicked((cur) => ({ ...cur, [p.memberId]: e.target.checked }))
                        }
                      />
                    </td>
                    <td>
                      <strong>{p.memberName}</strong>
                      {p.missingAddress ? (
                        <span className="cf-pill cf-pill--warn" style={{ marginLeft: 6 }}>
                          Adresse incomplète
                        </span>
                      ) : null}
                    </td>
                    <td>{p.claimCount}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatEuro(p.totalCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <span className="cf-muted">
                {pickedIds.length} sélectionné{pickedIds.length > 1 ? 's' : ''} ·{' '}
                {formatEuro(pickedTotal)}
              </span>
              <button
                type="button"
                className="btn-primary"
                style={{ marginLeft: 'auto' }}
                disabled={pickedIds.length === 0 || !settings?.taxReceiptEnabled}
                onClick={() => setConfirmIssue(true)}
              >
                Émettre les reçus
              </button>
            </div>
          </>
        )}
      </section>

      <section className="members-panel">
        <h2 className="members-panel__h">Reçus émis en {year}</h2>
        {receipts.length === 0 ? (
          <p className="cf-muted">
            {loading ? 'Chargement…' : 'Aucun reçu pour cette année.'}
          </p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Émis le</th>
                <th>Bénévole</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th>Statut</th>
                <th style={{ width: 220 }} />
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} style={r.status === 'CANCELLED' ? { opacity: 0.6 } : undefined}>
                  <td>
                    <strong>{r.number}</strong>
                  </td>
                  <td>{formatFr(r.issuedOn)}</td>
                  <td>{r.memberName}</td>
                  <td style={{ textAlign: 'right' }}>{formatEuro(r.amountCents)}</td>
                  <td>
                    {r.status === 'ISSUED' ? (
                      <span className="cf-pill cf-pill--ok">Émis</span>
                    ) : (
                      <span className="cf-pill cf-pill--muted" title={r.cancelReason ?? undefined}>
                        Annulé
                      </span>
                    )}
                    {r.status === 'CANCELLED' && r.cancelReason ? (
                      <small className="cf-muted" style={{ display: 'block' }}>
                        {r.cancelReason}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        disabled={downloading === r.id}
                        onClick={() => void onDownload(r)}
                      >
                        {downloading === r.id ? '…' : 'PDF'}
                      </button>
                      {r.status === 'ISSUED' ? (
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => setToCancel(r)}
                        >
                          Annuler…
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ConfirmModal
        open={confirmIssue}
        title={`Émettre ${pickedIds.length} reçu${pickedIds.length > 1 ? 's' : ''} ?`}
        message={`Un reçu par bénévole, numéroté, pour un total de ${formatEuro(pickedTotal)}. Un reçu émis ne se modifie plus : il s’annule.`}
        confirmLabel="Émettre"
        loading={issuing}
        onCancel={() => setConfirmIssue(false)}
        onConfirm={() => void onIssue()}
      />
      <ReasonModal
        open={toCancel !== null}
        title={toCancel ? `Annuler le reçu ${toCancel.number}` : 'Annuler le reçu'}
        lede="Les notes couvertes redeviennent disponibles pour un nouveau reçu."
        label="Motif de l’annulation"
        confirmLabel="Annuler le reçu"
        danger
        loading={cancelling}
        onCancel={() => setToCancel(null)}
        onConfirm={(reason) => void onCancelReceipt(reason)}
      />
    </>
  );
}
