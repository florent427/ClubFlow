import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ARCHIVE_CLUB_FINANCIAL_ACCOUNT,
  CLUB_ACCOUNTING_ACCOUNTS,
  CLUB_FINANCIAL_ACCOUNTS,
  CLUB_PAYMENT_ROUTES,
  CREATE_CLUB_FINANCIAL_ACCOUNT,
  UPDATE_CLUB_FINANCIAL_ACCOUNT,
  UPSERT_CLUB_PAYMENT_ROUTE,
} from '../../lib/documents';
import type {
  ClubAccountingAccountsData,
  ClubFinancialAccount,
  ClubFinancialAccountKindGql,
  ClubFinancialAccountsData,
  ClubPaymentMethodGql,
  ClubPaymentRoutesData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer } from '../../components/ui';

type TabKey = 'ACCOUNTS' | 'ROUTES';

const KIND_LABELS: Record<ClubFinancialAccountKindGql, string> = {
  BANK: 'Banque',
  CASH: 'Caisse',
  STRIPE_TRANSIT: 'Transit Stripe',
  OTHER_TRANSIT: 'Transit autre',
};

const METHOD_LABELS: Record<ClubPaymentMethodGql, string> = {
  STRIPE_CARD: 'Carte (Stripe)',
  MANUAL_CASH: 'Espèces',
  MANUAL_CHECK: 'Chèque',
  MANUAL_TRANSFER: 'Virement bancaire',
};

const METHODS: ClubPaymentMethodGql[] = [
  'STRIPE_CARD',
  'MANUAL_CASH',
  'MANUAL_CHECK',
  'MANUAL_TRANSFER',
];

/**
 * Page de paramétrage des comptes financiers (banques, caisses, transit
 * Stripe) et du routage des paiements vers ces comptes. Accessible via
 * `/settings/accounting`, gated par le module ACCOUNTING.
 */
export default function AccountingSettingsPage() {
  const [tab, setTab] = useState<TabKey>('ACCOUNTS');
  const { showToast } = useToast();

  const { data: accountsData, refetch: refetchAccounts } =
    useQuery<ClubFinancialAccountsData>(CLUB_FINANCIAL_ACCOUNTS, {
      fetchPolicy: 'cache-and-network',
    });
  const { data: routesData, refetch: refetchRoutes } =
    useQuery<ClubPaymentRoutesData>(CLUB_PAYMENT_ROUTES, {
      fetchPolicy: 'cache-and-network',
    });
  const { data: pcgData } = useQuery<ClubAccountingAccountsData>(
    CLUB_ACCOUNTING_ACCOUNTS,
    { fetchPolicy: 'cache-and-network' },
  );

  const accounts = accountsData?.clubFinancialAccounts ?? [];
  const routes = routesData?.clubPaymentRoutes ?? [];
  const pcgAccounts = pcgData?.clubAccountingAccounts ?? [];

  const [createMut, { loading: creating }] = useMutation(
    CREATE_CLUB_FINANCIAL_ACCOUNT,
  );
  const [updateMut] = useMutation(UPDATE_CLUB_FINANCIAL_ACCOUNT);
  const [archiveMut] = useMutation(ARCHIVE_CLUB_FINANCIAL_ACCOUNT);
  const [upsertRoute] = useMutation(UPSERT_CLUB_PAYMENT_ROUTE);

  // Drawer "Ajouter un compte"
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ClubFinancialAccount | null>(null);
  const [confirmArchive, setConfirmArchive] =
    useState<ClubFinancialAccount | null>(null);

  // Form state
  const [kind, setKind] = useState<ClubFinancialAccountKindGql>('BANK');
  const [label, setLabel] = useState('');
  const [accountingAccountId, setAccountingAccountId] = useState('');
  const [iban, setIban] = useState('');
  const [bic, setBic] = useState('');
  const [stripeAccountId, setStripeAccountId] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [notes, setNotes] = useState('');

  // Comptes PCG filtrés :
  //  - selon le kind sélectionné (BANK/STRIPE/OTHER → 51x ; CASH → 53x)
  //  - en EXCLUANT les codes déjà liés à un autre ClubFinancialAccount actif
  //    (contrainte unique `(clubId, accountingAccountId)` côté DB sinon
  //    l'utilisateur se prend une erreur après submit)
  const compatiblePcg = useMemo(() => {
    const usedAccountIds = new Set(
      accounts
        .filter((a) => a.isActive && (!editing || a.id !== editing.id))
        .map((a) => a.accountingAccountId),
    );
    return pcgAccounts.filter((p) => {
      if (!p.isActive) return false;
      if (usedAccountIds.has(p.id)) return false;
      if (kind === 'CASH') return p.code.startsWith('53');
      return p.code.startsWith('51');
    });
  }, [pcgAccounts, kind, accounts, editing]);

  function resetForm() {
    setKind('BANK');
    setLabel('');
    setAccountingAccountId('');
    setIban('');
    setBic('');
    setStripeAccountId('');
    setIsDefault(false);
    setNotes('');
    setEditing(null);
  }

  function openCreate() {
    resetForm();
    setDrawerOpen(true);
  }

  function openEdit(acc: ClubFinancialAccount) {
    setEditing(acc);
    setKind(acc.kind);
    setLabel(acc.label);
    setAccountingAccountId(acc.accountingAccountId);
    setIban(acc.iban ?? '');
    setBic(acc.bic ?? '');
    setStripeAccountId(acc.stripeAccountId ?? '');
    setIsDefault(acc.isDefault);
    setNotes(acc.notes ?? '');
    setDrawerOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const lbl = label.trim();
    if (!lbl) {
      showToast('Libellé requis', 'error');
      return;
    }
    if (!accountingAccountId) {
      showToast('Compte PCG requis', 'error');
      return;
    }
    try {
      if (editing) {
        await updateMut({
          variables: {
            input: {
              id: editing.id,
              label: lbl,
              iban: iban.trim() || null,
              bic: bic.trim() || null,
              stripeAccountId: stripeAccountId.trim() || null,
              isDefault,
              notes: notes.trim() || null,
            },
          },
        });
        showToast('Compte mis à jour', 'success');
      } else {
        await createMut({
          variables: {
            input: {
              kind,
              label: lbl,
              accountingAccountId,
              iban: iban.trim() || null,
              bic: bic.trim() || null,
              stripeAccountId: stripeAccountId.trim() || null,
              isDefault,
              notes: notes.trim() || null,
            },
          },
        });
        showToast('Compte créé', 'success');
      }
      setDrawerOpen(false);
      resetForm();
      await refetchAccounts();
      await refetchRoutes();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doArchive(acc: ClubFinancialAccount) {
    try {
      await archiveMut({ variables: { id: acc.id } });
      showToast('Compte archivé', 'success');
      await refetchAccounts();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setConfirmArchive(null);
    }
  }

  async function setRoute(method: ClubPaymentMethodGql, finId: string) {
    try {
      await upsertRoute({
        variables: { input: { method, financialAccountId: finId } },
      });
      showToast('Route mise à jour', 'success');
      await refetchRoutes();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Paramètres</p>
        <h1 className="members-loom__title">Comptabilité</h1>
        <p className="members-loom__lede">
          Déclare ici les comptes bancaires et caisses du club, et configure
          comment les paiements sont routés vers chacun.
        </p>
      </header>

      <div className="cf-toolbar" style={{ marginBottom: 16 }}>
        <div className="cf-segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ACCOUNTS'}
            className={
              tab === 'ACCOUNTS'
                ? 'cf-segmented__btn cf-segmented__btn--active'
                : 'cf-segmented__btn'
            }
            onClick={() => setTab('ACCOUNTS')}
          >
            Comptes ({accounts.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ROUTES'}
            className={
              tab === 'ROUTES'
                ? 'cf-segmented__btn cf-segmented__btn--active'
                : 'cf-segmented__btn'
            }
            onClick={() => setTab('ROUTES')}
          >
            Routage paiements
          </button>
        </div>
        {tab === 'ACCOUNTS' ? (
          <button
            type="button"
            className="btn-primary"
            onClick={openCreate}
            style={{ marginLeft: 'auto' }}
          >
            + Ajouter un compte
          </button>
        ) : null}
      </div>

      {tab === 'ACCOUNTS' ? (
        <section className="members-panel">
          <h2 className="members-panel__h">Comptes bancaires & caisses</h2>
          {accounts.length === 0 ? (
            <p className="cf-muted">Aucun compte. Crée-en un.</p>
          ) : (
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Libellé</th>
                  <th>Compte PCG</th>
                  <th>IBAN</th>
                  <th>Statut</th>
                  <th style={{ width: 220 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr
                    key={a.id}
                    style={a.isActive ? {} : { opacity: 0.5 }}
                  >
                    <td>
                      <span className="cf-pill cf-pill--muted">
                        {KIND_LABELS[a.kind]}
                      </span>
                    </td>
                    <td>
                      <strong>{a.label}</strong>
                      {a.isDefault ? (
                        <span
                          className="cf-pill cf-pill--ok"
                          style={{
                            marginLeft: 6,
                            fontSize: '0.7rem',
                          }}
                        >
                          défaut
                        </span>
                      ) : null}
                      {a.notes ? (
                        <small
                          className="cf-muted"
                          style={{ display: 'block', fontStyle: 'italic' }}
                        >
                          {a.notes}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      <strong>{a.accountingAccountCode}</strong>
                      <br />
                      <small className="cf-muted">
                        {a.accountingAccountLabel}
                      </small>
                    </td>
                    <td>
                      {a.iban ? (
                        <small style={{ fontFamily: 'monospace' }}>
                          {a.iban.slice(0, 4)}…{a.iban.slice(-4)}
                        </small>
                      ) : (
                        <small className="cf-muted">—</small>
                      )}
                    </td>
                    <td>
                      {a.isActive ? (
                        <span className="cf-pill cf-pill--ok">Actif</span>
                      ) : (
                        <span className="cf-pill cf-pill--muted">Archivé</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        onClick={() => openEdit(a)}
                      >
                        Modifier
                      </button>
                      {a.isActive ? (
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--danger btn-ghost--sm"
                          onClick={() => setConfirmArchive(a)}
                        >
                          Archiver
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {tab === 'ROUTES' ? (
        <section className="members-panel">
          <h2 className="members-panel__h">Routage des paiements</h2>
          <p className="cf-muted" style={{ marginBottom: 12 }}>
            Pour chaque méthode de paiement, choisis le compte financier sur
            lequel l'argent sera comptabilisé. Les écritures futures
            utiliseront ce routage automatiquement.
          </p>
          <table className="cf-table">
            <thead>
              <tr>
                <th>Méthode</th>
                <th>Compte de destination</th>
              </tr>
            </thead>
            <tbody>
              {METHODS.map((m) => {
                const route = routes.find((r) => r.method === m);
                const eligibleAccounts = accounts.filter((a) => {
                  if (!a.isActive) return false;
                  if (m === 'MANUAL_CASH') return a.kind === 'CASH';
                  if (m === 'STRIPE_CARD')
                    return (
                      a.kind === 'STRIPE_TRANSIT' ||
                      a.kind === 'BANK' ||
                      a.kind === 'OTHER_TRANSIT'
                    );
                  return a.kind === 'BANK';
                });
                return (
                  <tr key={m}>
                    <td>
                      <strong>{METHOD_LABELS[m]}</strong>
                    </td>
                    <td>
                      <select
                        value={route?.financialAccountId ?? ''}
                        onChange={(e) => void setRoute(m, e.target.value)}
                        disabled={eligibleAccounts.length === 0}
                      >
                        <option value="" disabled>
                          {eligibleAccounts.length === 0
                            ? 'Crée d’abord un compte compatible'
                            : '— Sélectionner —'}
                        </option>
                        {eligibleAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label} ({a.accountingAccountCode})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      <Drawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          resetForm();
        }}
        title={editing ? 'Modifier le compte' : 'Ajouter un compte financier'}
        footer={
          <div className="cf-drawer-foot">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setDrawerOpen(false);
                resetForm();
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              form="cf-fa-form"
              className="btn-primary"
              disabled={creating}
            >
              {editing ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        }
      >
        <form id="cf-fa-form" onSubmit={onSubmit} className="cf-form">
          {!editing ? (
            <label className="cf-field">
              <span>Type *</span>
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as ClubFinancialAccountKindGql);
                  setAccountingAccountId(''); // reset compte PCG
                }}
              >
                <option value="BANK">Banque</option>
                <option value="CASH">Caisse espèces</option>
                <option value="STRIPE_TRANSIT">Transit Stripe</option>
                <option value="OTHER_TRANSIT">
                  Transit autre (HelloAsso, Lydia…)
                </option>
              </select>
            </label>
          ) : null}
          <label className="cf-field">
            <span>Libellé *</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex : Crédit Agricole pro, Caisse buvette"
              maxLength={100}
            />
          </label>
          {!editing ? (
            <label className="cf-field">
              <span>Compte PCG *</span>
              <select
                value={accountingAccountId}
                onChange={(e) => setAccountingAccountId(e.target.value)}
              >
                <option value="">— Sélectionner —</option>
                {compatiblePcg.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.label}
                  </option>
                ))}
              </select>
              {compatiblePcg.length === 0 ? (
                <small className="cf-muted">
                  Tous les comptes PCG {kind === 'CASH' ? '53xxxx' : '51xxxx'}{' '}
                  sont déjà liés à un compte financier. Pour en ajouter,
                  archive un compte existant ou crée un nouveau code dans le
                  plan comptable.
                </small>
              ) : null}
            </label>
          ) : null}
          {kind === 'BANK' ? (
            <>
              <label className="cf-field">
                <span>IBAN (optionnel)</span>
                <input
                  type="text"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="FR76…"
                  maxLength={34}
                  style={{ fontFamily: 'monospace' }}
                />
              </label>
              <label className="cf-field">
                <span>BIC (optionnel)</span>
                <input
                  type="text"
                  value={bic}
                  onChange={(e) => setBic(e.target.value)}
                  placeholder="AGRIFRPP"
                  maxLength={11}
                  style={{ fontFamily: 'monospace' }}
                />
              </label>
            </>
          ) : null}
          {kind === 'STRIPE_TRANSIT' ? (
            <label className="cf-field">
              <span>ID compte Stripe (optionnel)</span>
              <input
                type="text"
                value={stripeAccountId}
                onChange={(e) => setStripeAccountId(e.target.value)}
                placeholder="acct_xxxxx"
                maxLength={50}
                style={{ fontFamily: 'monospace' }}
              />
            </label>
          ) : null}
          <label className="cf-field cf-field--inline">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <span>
              Compte par défaut pour ce type
              {isDefault ? (
                <small className="cf-muted" style={{ display: 'block' }}>
                  Les autres comptes par défaut du même type seront
                  désactivés.
                </small>
              ) : null}
            </span>
          </label>
          <label className="cf-field">
            <span>Notes (optionnel)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex : Caisse événementielle Coupe SKSR 2026"
              maxLength={500}
              rows={2}
            />
          </label>
        </form>
      </Drawer>

      <ConfirmModal
        open={confirmArchive !== null}
        title="Archiver ce compte ?"
        message={`Le compte « ${
          confirmArchive?.label ?? ''
        } » sera marqué inactif. Il restera visible sur les écritures historiques mais ne pourra plus être utilisé. Si une route de paiement le cible, modifie-la d'abord.`}
        confirmLabel="Archiver"
        cancelLabel="Annuler"
        danger
        onCancel={() => setConfirmArchive(null)}
        onConfirm={() => confirmArchive && void doArchive(confirmArchive)}
      />
    </>
  );
}
