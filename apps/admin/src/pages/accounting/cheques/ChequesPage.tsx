import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ATTACH_CHEQUE_IMAGE,
  CANCEL_CHEQUE,
  CANCEL_CHEQUE_DEPOSIT,
  CLUB_ACCOUNTING_ACCOUNTS,
  CLUB_CHEQUES,
  CLUB_CHEQUE_DEPOSITS,
  CLUB_FINANCIAL_ACCOUNTS,
  CREATE_CHEQUE_DEPOSIT,
  CREATE_STANDALONE_CHEQUE,
  GENERATE_CHEQUE_DEPOSIT_SLIP,
  UPDATE_CHEQUE,
} from '../../../lib/documents';
import type {
  Cheque,
  ChequeDeposit,
  ClubAccountingAccountsData,
  ClubChequeDepositsData,
  ClubChequesData,
  ClubFinancialAccountsData,
} from '../../../lib/types';
import { getClubId, getToken } from '../../../lib/storage';
import { useToast } from '../../../components/ToastProvider';
import { ConfirmModal, Drawer } from '../../../components/ui';

const API_ROOT = (
  (import.meta.env.VITE_GRAPHQL_HTTP as string | undefined) ??
  'http://localhost:3000/graphql'
).replace(/\/graphql\/?$/, '');

type TabKey = 'PORTFOLIO' | 'DEPOSITS' | 'HISTORY';

const STATUS_LABELS: Record<Cheque['status'], string> = {
  PENDING: 'En portefeuille',
  DEPOSITED: 'Remis',
  BOUNCED: 'Impayé',
  CANCELLED: 'Annulé',
};

const DEPOSIT_STATUS_LABELS: Record<ChequeDeposit['status'], string> = {
  DEPOSITED: 'Déposée',
  RECONCILED: 'Rapprochée',
  CANCELLED: 'Annulée',
};

function formatEuro(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

/** « 2026-09-01 » → « 01/09/2026 ». */
function formatFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** « 1 234,56 » → 123456 ; vide → null ; invalide → NaN. */
function inputToCents(value: string): number | null {
  const s = value.replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN;
  return Math.round(Number(s) * 100);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function uploadChequeImage(file: File, chequeId?: string): Promise<string> {
  const token = getToken();
  const clubId = getClubId();
  if (!token || !clubId) throw new Error('Session invalide');
  const form = new FormData();
  form.append('file', file);
  const owner = chequeId ? `&ownerId=${encodeURIComponent(chequeId)}` : '';
  const res = await fetch(
    `${API_ROOT}/media/upload?kind=image&ownerKind=CHEQUE${owner}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-club-id': clubId },
      body: form,
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Upload impossible (HTTP ${res.status})${text ? ': ' + text.slice(0, 120) : ''}`,
    );
  }
  const json = (await res.json()) as { id: string };
  return json.id;
}

/**
 * Chèques et remises (ADR-0015) : le portefeuille (compte 511200), la
 * création d'une remise groupée avec son bordereau PDF, l'historique, et
 * la saisie d'un chèque hors facture (sponsor, subvention, autre).
 */
export function ChequesPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<TabKey>('PORTFOLIO');

  const { data: chequesData, refetch: refetchCheques } =
    useQuery<ClubChequesData>(CLUB_CHEQUES, {
      variables: { status: null },
      fetchPolicy: 'cache-and-network',
    });
  const { data: depositsData, refetch: refetchDeposits } =
    useQuery<ClubChequeDepositsData>(CLUB_CHEQUE_DEPOSITS, {
      fetchPolicy: 'cache-and-network',
    });
  const { data: finData } = useQuery<ClubFinancialAccountsData>(
    CLUB_FINANCIAL_ACCOUNTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const { data: pcgData } = useQuery<ClubAccountingAccountsData>(
    CLUB_ACCOUNTING_ACCOUNTS,
    { fetchPolicy: 'cache-and-network' },
  );

  const cheques = chequesData?.clubCheques ?? [];
  const pending = useMemo(
    () => cheques.filter((c) => c.status === 'PENDING'),
    [cheques],
  );
  const history = useMemo(
    () => cheques.filter((c) => c.status !== 'PENDING'),
    [cheques],
  );
  const deposits = depositsData?.clubChequeDeposits ?? [];
  const bankAccounts = useMemo(
    () =>
      (finData?.clubFinancialAccounts ?? []).filter(
        (a) => a.isActive && a.kind === 'BANK',
      ),
    [finData],
  );
  const incomeAccounts = useMemo(
    () =>
      (pcgData?.clubAccountingAccounts ?? []).filter(
        (a) => a.isActive && a.code.startsWith('7'),
      ),
    [pcgData],
  );

  const [createCheque, { loading: creatingCheque }] = useMutation(
    CREATE_STANDALONE_CHEQUE,
  );
  const [updateCheque] = useMutation(UPDATE_CHEQUE);
  const [attachImage] = useMutation(ATTACH_CHEQUE_IMAGE);
  const [cancelCheque] = useMutation(CANCEL_CHEQUE);
  const [createDeposit, { loading: creatingDeposit }] = useMutation(
    CREATE_CHEQUE_DEPOSIT,
  );
  const [cancelDeposit] = useMutation(CANCEL_CHEQUE_DEPOSIT);
  const [generateSlip] = useMutation(GENERATE_CHEQUE_DEPOSIT_SLIP);

  async function refreshAll() {
    await Promise.all([refetchCheques(), refetchDeposits()]);
  }

  // ── Sélection pour la remise ─────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedCheques = pending.filter((c) => selected.has(c.id));
  const selectedTotal = selectedCheques.reduce((s, c) => s + c.amountCents, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Drawer « Nouveau chèque » ────────────────────────────────────────
  const [newOpen, setNewOpen] = useState(false);
  const [nDrawer, setNDrawer] = useState('');
  const [nNumber, setNNumber] = useState('');
  const [nBank, setNBank] = useState('');
  const [nAmount, setNAmount] = useState('');
  const [nReceivedOn, setNReceivedOn] = useState(todayIso());
  const [nAccount, setNAccount] = useState('');
  const [nLabel, setNLabel] = useState('');
  const [nNotes, setNNotes] = useState('');
  const [nImageId, setNImageId] = useState<string | null>(null);
  const [nImageName, setNImageName] = useState<string | null>(null);
  const [nUploading, setNUploading] = useState(false);

  function openNew() {
    setNDrawer('');
    setNNumber('');
    setNBank('');
    setNAmount('');
    setNReceivedOn(todayIso());
    setNAccount(incomeAccounts.find((a) => a.code === '754000')?.code ?? '');
    setNLabel('');
    setNNotes('');
    setNImageId(null);
    setNImageName(null);
    setNewOpen(true);
  }

  async function onNewImage(file: File | undefined) {
    if (!file) return;
    setNUploading(true);
    try {
      setNImageId(await uploadChequeImage(file));
      setNImageName(file.name);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload impossible', 'error');
    } finally {
      setNUploading(false);
    }
  }

  async function onCreateCheque(e: FormEvent) {
    e.preventDefault();
    const cents = inputToCents(nAmount);
    if (cents === null || Number.isNaN(cents) || cents <= 0) {
      showToast('Montant invalide (ex : 250,00)', 'error');
      return;
    }
    if (!nDrawer.trim()) {
      showToast('Émetteur requis', 'error');
      return;
    }
    if (!nAccount) {
      showToast('Compte de produit requis', 'error');
      return;
    }
    try {
      await createCheque({
        variables: {
          input: {
            number: nNumber.trim() || null,
            drawerName: nDrawer.trim(),
            bankName: nBank.trim() || null,
            amountCents: cents,
            receivedOn: nReceivedOn,
            imageAssetId: nImageId,
            notes: nNotes.trim() || null,
            accountCode: nAccount,
            label: nLabel.trim() || null,
          },
        },
      });
      showToast('Chèque ajouté au portefeuille', 'success');
      setNewOpen(false);
      await refetchCheques();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  // ── Drawer « Modifier » ──────────────────────────────────────────────
  const [editing, setEditing] = useState<Cheque | null>(null);
  const [eNumber, setENumber] = useState('');
  const [eDrawer, setEDrawer] = useState('');
  const [eBank, setEBank] = useState('');
  const [eReceivedOn, setEReceivedOn] = useState('');
  const [eNotes, setENotes] = useState('');

  function openEdit(c: Cheque) {
    setEditing(c);
    setENumber(c.number ?? '');
    setEDrawer(c.drawerName);
    setEBank(c.bankName ?? '');
    setEReceivedOn(c.receivedOn);
    setENotes(c.notes ?? '');
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await updateCheque({
        variables: {
          input: {
            id: editing.id,
            number: eNumber.trim() || null,
            drawerName: eDrawer.trim(),
            bankName: eBank.trim() || null,
            receivedOn: eReceivedOn || null,
            notes: eNotes.trim() || null,
          },
        },
      });
      showToast('Chèque mis à jour', 'success');
      setEditing(null);
      await refetchCheques();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  // ── Photo sur un chèque existant ─────────────────────────────────────
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoTarget, setPhotoTarget] = useState<string | null>(null);

  function pickPhotoFor(chequeId: string) {
    setPhotoTarget(chequeId);
    photoInputRef.current?.click();
  }

  async function onPhotoPicked(file: File | undefined) {
    const target = photoTarget;
    setPhotoTarget(null);
    if (!file || !target) return;
    try {
      const mediaAssetId = await uploadChequeImage(file, target);
      await attachImage({ variables: { chequeId: target, mediaAssetId } });
      showToast('Photo jointe', 'success');
      await refetchCheques();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  // ── Annulations (motif obligatoire) ──────────────────────────────────
  const [cancelTarget, setCancelTarget] = useState<
    { kind: 'CHEQUE'; cheque: Cheque } | { kind: 'DEPOSIT'; deposit: ChequeDeposit } | null
  >(null);
  const [cancelReason, setCancelReason] = useState('');

  async function onConfirmCancel(e: FormEvent) {
    e.preventDefault();
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    if (!reason) {
      showToast('Motif requis', 'error');
      return;
    }
    try {
      if (cancelTarget.kind === 'CHEQUE') {
        await cancelCheque({ variables: { id: cancelTarget.cheque.id, reason } });
        showToast('Saisie annulée, recette contre-passée', 'success');
      } else {
        await cancelDeposit({ variables: { id: cancelTarget.deposit.id, reason } });
        showToast('Remise annulée, chèques de retour en portefeuille', 'success');
      }
      setCancelTarget(null);
      setCancelReason('');
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  // ── Drawer « Remise » ────────────────────────────────────────────────
  const [depositOpen, setDepositOpen] = useState(false);
  const [dBank, setDBank] = useState('');
  const [dDate, setDDate] = useState(todayIso());
  const [dNotes, setDNotes] = useState('');
  const [confirmDeposit, setConfirmDeposit] = useState(false);

  function openDeposit() {
    setDBank(bankAccounts.find((a) => a.isDefault)?.id ?? bankAccounts[0]?.id ?? '');
    setDDate(todayIso());
    setDNotes('');
    setDepositOpen(true);
  }

  async function doCreateDeposit() {
    if (!dBank || selectedCheques.length === 0) return;
    try {
      const res = await createDeposit({
        variables: {
          input: {
            financialAccountId: dBank,
            depositedOn: dDate,
            chequeIds: selectedCheques.map((c) => c.id),
            notes: dNotes.trim() || null,
          },
        },
      });
      const created = (res.data as { createChequeDeposit?: ChequeDeposit } | undefined)
        ?.createChequeDeposit;
      showToast(
        created ? `Remise ${created.number} enregistrée` : 'Remise enregistrée',
        'success',
      );
      setSelected(new Set());
      setDepositOpen(false);
      setTab('DEPOSITS');
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setConfirmDeposit(false);
    }
  }

  async function onGenerateSlip(d: ChequeDeposit) {
    try {
      await generateSlip({ variables: { id: d.id } });
      showToast('Bordereau généré', 'success');
      await refetchDeposits();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  const [openDepositId, setOpenDepositId] = useState<string | null>(null);

  // ── Rendu ────────────────────────────────────────────────────────────
  function chequeRow(c: Cheque, withSelect: boolean) {
    return (
      <tr key={c.id}>
        {withSelect ? (
          <td>
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              aria-label={`Sélectionner le chèque ${c.number ?? ''} de ${c.drawerName}`}
            />
          </td>
        ) : null}
        <td>{formatFr(c.receivedOn)}</td>
        <td>
          <strong>{c.drawerName}</strong>
          {c.bankName ? (
            <small className="cf-muted" style={{ display: 'block' }}>
              {c.bankName}
            </small>
          ) : null}
        </td>
        <td>
          <span style={{ fontFamily: 'monospace' }}>{c.number ?? '—'}</span>
        </td>
        <td>
          {c.invoiceLabel ? (
            <span>{c.invoiceLabel}</span>
          ) : (
            <span className="cf-pill cf-pill--muted">hors facture</span>
          )}
        </td>
        <td style={{ textAlign: 'right' }}>
          <strong>{formatEuro(c.amountCents)}</strong>
        </td>
        <td>
          {c.status === 'PENDING' ? (
            <span className="cf-pill cf-pill--warn">{STATUS_LABELS[c.status]}</span>
          ) : c.status === 'DEPOSITED' ? (
            <span className="cf-pill cf-pill--ok">
              {STATUS_LABELS[c.status]}
              {c.depositNumber ? ` · ${c.depositNumber}` : ''}
            </span>
          ) : (
            <span className="cf-pill cf-pill--muted">{STATUS_LABELS[c.status]}</span>
          )}
        </td>
        <td>
          {c.imageUrl ? (
            <a href={c.imageUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-ghost--sm">
              Photo
            </a>
          ) : (
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => pickPhotoFor(c.id)}>
              + Photo
            </button>
          )}
          {c.status === 'PENDING' ? (
            <>
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => openEdit(c)}>
                Modifier
              </button>
              {!c.paymentId ? (
                <button
                  type="button"
                  className="btn-ghost btn-ghost--danger btn-ghost--sm"
                  onClick={() => {
                    setCancelReason('');
                    setCancelTarget({ kind: 'CHEQUE', cheque: c });
                  }}
                >
                  Annuler
                </button>
              ) : null}
            </>
          ) : null}
        </td>
      </tr>
    );
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Comptabilité</p>
        <h1 className="members-loom__title">Chèques & remises</h1>
        <p className="members-loom__lede">
          Les chèques reçus attendent en portefeuille (compte 511200). Une
          remise les dépose en banque en une écriture, avec son bordereau.
        </p>
      </header>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void onPhotoPicked(e.target.files?.[0])}
      />

      <div className="cf-toolbar" style={{ marginBottom: 16 }}>
        <div className="cf-segmented" role="tablist">
          {(
            [
              ['PORTFOLIO', `Portefeuille (${pending.length})`],
              ['DEPOSITS', `Remises (${deposits.length})`],
              ['HISTORY', `Historique (${history.length})`],
            ] as Array<[TabKey, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={
                tab === key
                  ? 'cf-segmented__btn cf-segmented__btn--active'
                  : 'cf-segmented__btn'
              }
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={openNew}
          style={{ marginLeft: 'auto' }}
        >
          + Chèque hors facture
        </button>
        {tab === 'PORTFOLIO' ? (
          <button
            type="button"
            className="btn-primary"
            disabled={selectedCheques.length === 0 || bankAccounts.length === 0}
            onClick={openDeposit}
          >
            Créer la remise ({selectedCheques.length}) · {formatEuro(selectedTotal)}
          </button>
        ) : null}
      </div>

      {tab === 'PORTFOLIO' ? (
        <section className="members-panel">
          <h2 className="members-panel__h">En portefeuille</h2>
          <p className="cf-muted" style={{ marginBottom: 12 }}>
            Les chèques de facture arrivent ici automatiquement à
            l’enregistrement du paiement. Coche ceux à déposer, puis crée la
            remise.
          </p>
          {pending.length === 0 ? (
            <p className="cf-muted">Aucun chèque en attente de remise.</p>
          ) : (
            <table className="cf-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      aria-label="Tout sélectionner"
                      checked={selectedCheques.length === pending.length}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? new Set(pending.map((c) => c.id)) : new Set(),
                        )
                      }
                    />
                  </th>
                  <th>Reçu le</th>
                  <th>Émetteur</th>
                  <th>N°</th>
                  <th>Objet</th>
                  <th style={{ textAlign: 'right' }}>Montant</th>
                  <th>Statut</th>
                  <th style={{ width: 240 }}>Actions</th>
                </tr>
              </thead>
              <tbody>{pending.map((c) => chequeRow(c, true))}</tbody>
            </table>
          )}
        </section>
      ) : null}

      {tab === 'DEPOSITS' ? (
        <section className="members-panel">
          <h2 className="members-panel__h">Remises</h2>
          {deposits.length === 0 ? (
            <p className="cf-muted">Aucune remise pour l’instant.</p>
          ) : (
            <table className="cf-table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Déposée le</th>
                  <th>Banque</th>
                  <th>Chèques</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Statut</th>
                  <th style={{ width: 260 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <>
                    <tr key={d.id}>
                      <td>
                        <strong style={{ fontFamily: 'monospace' }}>{d.number}</strong>
                      </td>
                      <td>{formatFr(d.depositedOn)}</td>
                      <td>{d.financialAccountLabel}</td>
                      <td>{d.chequeCount}</td>
                      <td style={{ textAlign: 'right' }}>
                        <strong>{formatEuro(d.totalCents)}</strong>
                      </td>
                      <td>
                        <span
                          className={
                            d.status === 'CANCELLED'
                              ? 'cf-pill cf-pill--muted'
                              : 'cf-pill cf-pill--ok'
                          }
                        >
                          {DEPOSIT_STATUS_LABELS[d.status]}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => setOpenDepositId(openDepositId === d.id ? null : d.id)}
                        >
                          {openDepositId === d.id ? 'Replier' : 'Détail'}
                        </button>
                        {d.slipUrl ? (
                          <a href={d.slipUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-ghost--sm">
                            Bordereau PDF
                          </a>
                        ) : (
                          <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => void onGenerateSlip(d)}>
                            Générer le bordereau
                          </button>
                        )}
                        {d.status === 'DEPOSITED' ? (
                          <button
                            type="button"
                            className="btn-ghost btn-ghost--danger btn-ghost--sm"
                            onClick={() => {
                              setCancelReason('');
                              setCancelTarget({ kind: 'DEPOSIT', deposit: d });
                            }}
                          >
                            Annuler
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {openDepositId === d.id ? (
                      <tr key={`${d.id}-detail`}>
                        <td colSpan={7} style={{ background: 'var(--cf-bg-alt, #f8f8fa)' }}>
                          <table className="cf-table">
                            <thead>
                              <tr>
                                <th>Reçu le</th>
                                <th>Émetteur</th>
                                <th>N°</th>
                                <th>Objet</th>
                                <th style={{ textAlign: 'right' }}>Montant</th>
                                <th>Statut</th>
                                <th>Photo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.cheques.map((c) => (
                                <tr key={c.id}>
                                  <td>{formatFr(c.receivedOn)}</td>
                                  <td>{c.drawerName}</td>
                                  <td style={{ fontFamily: 'monospace' }}>{c.number ?? '—'}</td>
                                  <td>{c.invoiceLabel ?? 'hors facture'}</td>
                                  <td style={{ textAlign: 'right' }}>{formatEuro(c.amountCents)}</td>
                                  <td>{STATUS_LABELS[c.status]}</td>
                                  <td>
                                    {c.imageUrl ? (
                                      <a href={c.imageUrl} target="_blank" rel="noreferrer">
                                        Voir
                                      </a>
                                    ) : (
                                      <span className="cf-muted">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {tab === 'HISTORY' ? (
        <section className="members-panel">
          <h2 className="members-panel__h">Historique</h2>
          {history.length === 0 ? (
            <p className="cf-muted">Aucun chèque remis ou annulé.</p>
          ) : (
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Reçu le</th>
                  <th>Émetteur</th>
                  <th>N°</th>
                  <th>Objet</th>
                  <th style={{ textAlign: 'right' }}>Montant</th>
                  <th>Statut</th>
                  <th style={{ width: 120 }}>Photo</th>
                </tr>
              </thead>
              <tbody>{history.map((c) => chequeRow(c, false))}</tbody>
            </table>
          )}
        </section>
      ) : null}

      {/* Nouveau chèque hors facture */}
      <Drawer
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Chèque hors facture"
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setNewOpen(false)}>
              Annuler
            </button>
            <button type="submit" form="cf-new-cheque" className="btn-primary" disabled={creatingCheque || nUploading}>
              Ajouter au portefeuille
            </button>
          </div>
        }
      >
        <form id="cf-new-cheque" onSubmit={onCreateCheque} className="cf-form">
          <p className="cf-muted">
            Pour un chèque qui ne règle pas une facture d’adhérent : sponsor,
            subvention, remboursement d’un fournisseur… La recette est
            comptabilisée sur le compte choisi, avec 511200 en contrepartie.
          </p>
          <label className="cf-field">
            <span>Émetteur (nom sur le chèque) *</span>
            <input type="text" value={nDrawer} onChange={(e) => setNDrawer(e.target.value)} maxLength={120} />
          </label>
          <div className="cf-form-row">
            <label className="cf-field" style={{ flex: 1 }}>
              <span>N° de chèque</span>
              <input type="text" value={nNumber} onChange={(e) => setNNumber(e.target.value)} maxLength={30} style={{ fontFamily: 'monospace' }} />
            </label>
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Banque émettrice</span>
              <input type="text" value={nBank} onChange={(e) => setNBank(e.target.value)} maxLength={80} />
            </label>
          </div>
          <div className="cf-form-row">
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Montant (€) *</span>
              <input type="text" inputMode="decimal" value={nAmount} onChange={(e) => setNAmount(e.target.value)} placeholder="250,00" />
            </label>
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Reçu le *</span>
              <input type="date" value={nReceivedOn} onChange={(e) => setNReceivedOn(e.target.value)} />
            </label>
          </div>
          <label className="cf-field">
            <span>Compte de produit *</span>
            <select value={nAccount} onChange={(e) => setNAccount(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {incomeAccounts.map((a) => (
                <option key={a.id} value={a.code}>
                  {a.code} — {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="cf-field">
            <span>Libellé de l’écriture</span>
            <input type="text" value={nLabel} onChange={(e) => setNLabel(e.target.value)} maxLength={200} placeholder={nDrawer ? `Chèque ${nDrawer}` : 'Chèque …'} />
          </label>
          <label className="cf-field">
            <span>Photo du chèque</span>
            <input type="file" accept="image/*" capture="environment" disabled={nUploading} onChange={(e) => void onNewImage(e.target.files?.[0])} />
            <small className="cf-muted">
              {nUploading ? 'Envoi…' : nImageName ? `Jointe : ${nImageName}` : 'Facultative, archivée avec la remise.'}
            </small>
          </label>
          <label className="cf-field">
            <span>Notes</span>
            <textarea value={nNotes} onChange={(e) => setNNotes(e.target.value)} maxLength={500} rows={2} />
          </label>
        </form>
      </Drawer>

      {/* Modifier un chèque */}
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Modifier le chèque"
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
              Annuler
            </button>
            <button type="submit" form="cf-edit-cheque" className="btn-primary">
              Enregistrer
            </button>
          </div>
        }
      >
        <form id="cf-edit-cheque" onSubmit={onSaveEdit} className="cf-form">
          {editing ? (
            <p className="cf-muted">
              {formatEuro(editing.amountCents)} — le montant est porté par une
              écriture comptabilisée et ne se modifie pas ici.
            </p>
          ) : null}
          <label className="cf-field">
            <span>Émetteur *</span>
            <input type="text" value={eDrawer} onChange={(e) => setEDrawer(e.target.value)} maxLength={120} />
          </label>
          <div className="cf-form-row">
            <label className="cf-field" style={{ flex: 1 }}>
              <span>N° de chèque</span>
              <input type="text" value={eNumber} onChange={(e) => setENumber(e.target.value)} maxLength={30} style={{ fontFamily: 'monospace' }} />
            </label>
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Banque émettrice</span>
              <input type="text" value={eBank} onChange={(e) => setEBank(e.target.value)} maxLength={80} />
            </label>
          </div>
          <label className="cf-field">
            <span>Reçu le</span>
            <input type="date" value={eReceivedOn} onChange={(e) => setEReceivedOn(e.target.value)} />
          </label>
          <label className="cf-field">
            <span>Notes</span>
            <textarea value={eNotes} onChange={(e) => setENotes(e.target.value)} maxLength={500} rows={2} />
          </label>
        </form>
      </Drawer>

      {/* Remise */}
      <Drawer
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        title={`Remise de ${selectedCheques.length} chèque${selectedCheques.length > 1 ? 's' : ''}`}
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setDepositOpen(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!dBank || !dDate || selectedCheques.length === 0 || creatingDeposit}
              onClick={() => setConfirmDeposit(true)}
            >
              Déposer {formatEuro(selectedTotal)}
            </button>
          </div>
        }
      >
        <div className="cf-form">
          <label className="cf-field">
            <span>Compte bancaire crédité *</span>
            <select value={dBank} onChange={(e) => setDBank(e.target.value)}>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({a.accountingAccountCode})
                </option>
              ))}
            </select>
          </label>
          <label className="cf-field">
            <span>Date du dépôt *</span>
            <input type="date" value={dDate} onChange={(e) => setDDate(e.target.value)} />
          </label>
          <label className="cf-field">
            <span>Notes</span>
            <textarea value={dNotes} onChange={(e) => setDNotes(e.target.value)} maxLength={500} rows={2} />
          </label>
          <table className="cf-table">
            <thead>
              <tr>
                <th>Émetteur</th>
                <th>N°</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {selectedCheques.map((c) => (
                <tr key={c.id}>
                  <td>{c.drawerName}</td>
                  <td style={{ fontFamily: 'monospace' }}>{c.number ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{formatEuro(c.amountCents)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2}>
                  <strong>Total</strong>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <strong>{formatEuro(selectedTotal)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Drawer>

      {/* Annulation avec motif */}
      <Drawer
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title={cancelTarget?.kind === 'DEPOSIT' ? `Annuler la remise ${cancelTarget.deposit.number}` : 'Annuler la saisie du chèque'}
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setCancelTarget(null)}>
              Retour
            </button>
            <button type="submit" form="cf-cancel-form" className="btn-primary">
              Confirmer l’annulation
            </button>
          </div>
        }
      >
        <form id="cf-cancel-form" onSubmit={onConfirmCancel} className="cf-form">
          <p className="cf-muted">
            {cancelTarget?.kind === 'DEPOSIT'
              ? 'L’écriture de remise est contre-passée et les chèques reviennent en portefeuille.'
              : 'La recette de ce chèque est contre-passée. Le chèque passe en « annulé ».'}
          </p>
          <label className="cf-field">
            <span>Motif *</span>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={300} rows={3} />
          </label>
        </form>
      </Drawer>

      <ConfirmModal
        open={confirmDeposit}
        title="Confirmer la remise ?"
        message={`${selectedCheques.length} chèque${selectedCheques.length > 1 ? 's' : ''} pour ${formatEuro(selectedTotal)}, déposés le ${formatFr(dDate)}. Une écriture banque / 511200 sera comptabilisée et le bordereau généré.`}
        confirmLabel="Déposer"
        cancelLabel="Annuler"
        loading={creatingDeposit}
        onCancel={() => setConfirmDeposit(false)}
        onConfirm={() => void doCreateDeposit()}
      />
    </>
  );
}
