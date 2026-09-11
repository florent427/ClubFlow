import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ADD_BANK_STATEMENT_LINE,
  AUTO_MATCH_BANK_STATEMENT,
  CLUB_BANK_STATEMENT,
  DELETE_BANK_STATEMENT,
  IGNORE_BANK_LINE,
  REMOVE_BANK_STATEMENT_LINE,
  UNIGNORE_BANK_LINE,
  UNMATCH_BANK_LINE,
  UPDATE_BANK_STATEMENT_LINE,
} from '../../../lib/documents';
import type {
  BankStatementLine,
  BankStatementLineIgnoreReasonGql,
  ClubBankStatementData,
} from '../../../lib/types';
import { useToast } from '../../../components/ToastProvider';
import { ConfirmModal, Drawer } from '../../../components/ui';
import {
  LINE_STATUS_LABELS,
  STATEMENT_STATUS_LABELS,
  centsToInput,
  formatEuro,
  formatFr,
  formatSigned,
  inputToCents,
  lineStatusPill,
  statementStatusPill,
  todayIso,
} from './format';
import { MatchDrawer } from './MatchDrawer';

type Filter = 'TODO' | 'ALL' | 'MATCHED' | 'IGNORED';

const IGNORE_LABELS: Record<BankStatementLineIgnoreReasonGql, string> = {
  BEFORE_TAKEOVER: 'Antérieure à la reprise',
  DUPLICATE: 'Doublon',
  NOT_CLUB: 'Ne concerne pas le club',
  OTHER: 'Autre',
};

export function StatementDetailPage() {
  const { statementId } = useParams<{ statementId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data, refetch, loading } = useQuery<ClubBankStatementData>(CLUB_BANK_STATEMENT, {
    variables: { id: statementId ?? '' },
    skip: !statementId,
    fetchPolicy: 'cache-and-network',
  });
  const st = data?.clubBankStatement ?? null;

  const [autoMatch, { loading: autoMatching }] = useMutation(AUTO_MATCH_BANK_STATEMENT);
  const [unmatch] = useMutation(UNMATCH_BANK_LINE);
  const [ignore] = useMutation(IGNORE_BANK_LINE);
  const [unignore] = useMutation(UNIGNORE_BANK_LINE);
  const [updateLine] = useMutation(UPDATE_BANK_STATEMENT_LINE);
  const [addLine] = useMutation(ADD_BANK_STATEMENT_LINE);
  const [removeLine] = useMutation(REMOVE_BANK_STATEMENT_LINE);
  const [deleteStatement, { loading: deleting }] = useMutation(DELETE_BANK_STATEMENT);

  const [filter, setFilter] = useState<Filter>('TODO');
  const [matchLine, setMatchLine] = useState<BankStatementLine | null>(null);
  const [ignoreTarget, setIgnoreTarget] = useState<BankStatementLine | null>(null);
  const [ignoreReason, setIgnoreReason] = useState<BankStatementLineIgnoreReasonGql>('OTHER');
  const [ignoreNote, setIgnoreNote] = useState('');
  const [editTarget, setEditTarget] = useState<BankStatementLine | null>(null);
  const [eDate, setEDate] = useState('');
  const [eLabel, setELabel] = useState('');
  const [eAmount, setEAmount] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [aDate, setADate] = useState(todayIso());
  const [aLabel, setALabel] = useState('');
  const [aAmount, setAAmount] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<BankStatementLine | null>(null);

  const lines = useMemo(() => {
    const all = st?.lines ?? [];
    switch (filter) {
      case 'TODO':
        return all.filter((l) => l.status === 'UNMATCHED' || l.status === 'SUGGESTED');
      case 'MATCHED':
        return all.filter((l) => l.status === 'MATCHED');
      case 'IGNORED':
        return all.filter((l) => l.status === 'IGNORED');
      default:
        return all;
    }
  }, [st, filter]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      showToast(ok, 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  function openEdit(l: BankStatementLine) {
    setEditTarget(l);
    setEDate(l.bookedOn);
    setELabel(l.label);
    setEAmount(centsToInput(l.amountCents));
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const cents = inputToCents(eAmount);
    if (cents === null || Number.isNaN(cents) || cents === 0) {
      showToast('Montant invalide (signé : −45,10 pour un débit)', 'error');
      return;
    }
    await run(
      () =>
        updateLine({
          variables: { input: { lineId: editTarget.id, bookedOn: eDate || null, label: eLabel, amountCents: cents } },
        }),
      'Ligne corrigée, contrôle relancé',
    );
    setEditTarget(null);
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!st) return;
    const cents = inputToCents(aAmount);
    if (cents === null || Number.isNaN(cents) || cents === 0 || !aLabel.trim()) {
      showToast('Date, libellé et montant signé requis', 'error');
      return;
    }
    await run(
      () => addLine({ variables: { input: { statementId: st.id, bookedOn: aDate, label: aLabel.trim(), amountCents: cents } } }),
      'Ligne ajoutée, contrôle relancé',
    );
    setAddOpen(false);
    setALabel('');
    setAAmount('');
  }

  async function onIgnore(e: FormEvent) {
    e.preventDefault();
    if (!ignoreTarget) return;
    await run(
      () => ignore({ variables: { input: { lineId: ignoreTarget.id, reason: ignoreReason, note: ignoreNote.trim() || null } } }),
      'Ligne ignorée',
    );
    setIgnoreTarget(null);
    setIgnoreNote('');
  }

  async function onDelete() {
    if (!st) return;
    try {
      await deleteStatement({ variables: { id: st.id } });
      showToast('Relevé supprimé', 'success');
      navigate('/comptabilite/rapprochement');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Suppression impossible', 'error');
    } finally {
      setConfirmDelete(false);
    }
  }

  if (!st) {
    return (
      <>
        <header className="members-loom__hero members-loom__hero--nested">
          <p className="members-loom__eyebrow">
            <Link to="/comptabilite/rapprochement">Rapprochement bancaire</Link>
          </p>
          <h1 className="members-loom__title">Relevé</h1>
        </header>
        <p className="cf-muted">{loading ? 'Chargement…' : 'Relevé introuvable.'}</p>
      </>
    );
  }

  const problems: string[] = [];
  if (st.integrityDeltaCents !== null && st.integrityDeltaCents !== 0) {
    problems.push(
      `Écart arithmétique de ${formatSigned(st.integrityDeltaCents)} : solde de début + mouvements − solde de fin devrait faire zéro. Une ligne manque, est en trop, ou un montant est faux.`,
    );
  }
  if (st.chainOk === false) {
    problems.push(
      `Solde de début ${formatEuro(st.openingBalanceCents)} ≠ solde attendu ${formatEuro(st.chainExpectedCents ?? 0)} (fin du relevé précédent, ou solde d’ouverture du compte).`,
    );
  }
  if (st.chainOk === null) {
    problems.push(
      'Solde d’ouverture du compte non renseigné : le chaînage ne peut pas être vérifié. Renseigne-le dans Paramètres → Comptabilité → Exercice, puis corrige une ligne (ou relance) pour recalculer.',
    );
  }
  const todo = st.unmatchedCount + st.suggestedCount;

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">
          <Link to="/comptabilite/rapprochement">← Rapprochement bancaire</Link>
        </p>
        <h1 className="members-loom__title">
          {st.financialAccountLabel} · du {formatFr(st.periodStart)} au {formatFr(st.periodEnd)}
        </h1>
        <p className="members-loom__lede">
          {st.format} · {st.lineCount} ligne{st.lineCount > 1 ? 's' : ''} · solde de début{' '}
          <strong>{formatEuro(st.openingBalanceCents)}</strong>, solde de fin{' '}
          <strong>{formatEuro(st.closingBalanceCents)}</strong>
          {st.fileUrl ? (
            <>
              {' · '}
              <a href={st.fileUrl} target="_blank" rel="noreferrer">
                fichier d’origine
              </a>
            </>
          ) : null}
        </p>
      </header>

      <section
        className="members-panel"
        style={{
          borderLeft: `4px solid ${st.status === 'NEEDS_CHECK' ? '#b45309' : st.status === 'RECONCILED' ? '#166534' : '#2563eb'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className={statementStatusPill(st.status)}>{STATEMENT_STATUS_LABELS[st.status]}</span>
          {st.status === 'NEEDS_CHECK' ? (
            <strong>Le contrôle d’intégrité ne passe pas : ce relevé n’est pas exploitable tant qu’il n’est pas corrigé.</strong>
          ) : st.status === 'RECONCILED' ? (
            <strong>Contrôle OK · toutes les lignes sont rapprochées ou ignorées.</strong>
          ) : (
            <strong>
              Contrôle OK · {todo} ligne{todo > 1 ? 's' : ''} à traiter, {st.matchedCount} rapprochée{st.matchedCount > 1 ? 's' : ''}, {st.ignoredCount} ignorée{st.ignoredCount > 1 ? 's' : ''}.
            </strong>
          )}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {st.status !== 'NEEDS_CHECK' ? (
              <button
                type="button"
                className="btn-ghost"
                disabled={autoMatching}
                onClick={() => void run(() => autoMatch({ variables: { id: st.id } }), 'Rapprochement automatique relancé')}
              >
                Relancer l’automatique
              </button>
            ) : null}
            <button type="button" className="btn-ghost" onClick={() => setAddOpen(true)}>
              + Ligne manquante
            </button>
            {st.matchedCount === 0 ? (
              <button type="button" className="btn-ghost" style={{ color: '#b91c1c' }} onClick={() => setConfirmDelete(true)}>
                Supprimer le relevé
              </button>
            ) : null}
          </span>
        </div>
        {problems.length > 0 ? (
          <ul style={{ marginTop: 10, paddingLeft: 18 }}>
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        ) : null}
        {st.warnings ? (
          <details style={{ marginTop: 8 }}>
            <summary className="cf-muted">Avertissements de lecture</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>{st.warnings}</pre>
          </details>
        ) : null}
      </section>

      <div className="cf-toolbar" style={{ margin: '16px 0' }}>
        <div className="cf-segmented" role="tablist">
          {(
            [
              ['TODO', `À traiter (${todo})`],
              ['MATCHED', `Rapprochées (${st.matchedCount})`],
              ['IGNORED', `Ignorées (${st.ignoredCount})`],
              ['ALL', `Toutes (${st.lineCount})`],
            ] as Array<[Filter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? 'cf-segmented__btn cf-segmented__btn--active' : 'cf-segmented__btn'}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <section className="members-panel">
        {lines.length === 0 ? (
          <p className="cf-muted">Aucune ligne dans cette vue.</p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Libellé</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th>Statut</th>
                <th>Écriture(s)</th>
                <th style={{ width: 260 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} style={l.status === 'IGNORED' ? { opacity: 0.6 } : undefined}>
                  <td>{formatFr(l.bookedOn)}</td>
                  <td>
                    {l.label}
                    {l.reference ? (
                      <small className="cf-muted" style={{ display: 'block' }}>
                        réf. {l.reference}
                      </small>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'right', color: l.amountCents < 0 ? '#991b1b' : '#166534', whiteSpace: 'nowrap' }}>
                    <strong>{formatSigned(l.amountCents)}</strong>
                  </td>
                  <td>
                    <span className={lineStatusPill(l.status)}>
                      {LINE_STATUS_LABELS[l.status]}
                      {l.status === 'SUGGESTED' ? ` (${l.candidateEntryIds.length})` : ''}
                    </span>
                    {l.status === 'IGNORED' && l.ignoreReason ? (
                      <small className="cf-muted" style={{ display: 'block' }}>
                        {IGNORE_LABELS[l.ignoreReason]}
                        {l.ignoreNote ? ` · ${l.ignoreNote}` : ''}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    {l.matches.map((m) => (
                      <div key={m.entryId} style={{ fontSize: '0.85rem' }}>
                        {m.entryLabel}
                        <small className="cf-muted">
                          {' '}
                          · {new Date(m.entryOccurredAt).toLocaleDateString('fr-FR')}
                          {m.amountCents !== m.entryAmountCents ? ` · part ${formatEuro(m.amountCents)}` : ''}
                          {m.origin === 'AUTO' ? ' · auto' : ''}
                        </small>
                      </div>
                    ))}
                  </td>
                  <td>
                    {l.status === 'UNMATCHED' || l.status === 'SUGGESTED' ? (
                      <>
                        <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setMatchLine(l)} disabled={st.status === 'NEEDS_CHECK'}>
                          Rapprocher…
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => {
                            setIgnoreTarget(l);
                            setIgnoreReason('OTHER');
                            setIgnoreNote('');
                          }}
                        >
                          Ignorer
                        </button>
                        <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => openEdit(l)}>
                          Corriger
                        </button>
                        <button type="button" className="btn-ghost btn-ghost--sm" style={{ color: '#b91c1c' }} onClick={() => setConfirmRemove(l)}>
                          Retirer
                        </button>
                      </>
                    ) : l.status === 'MATCHED' ? (
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        onClick={() => void run(() => unmatch({ variables: { lineId: l.id } }), 'Ligne détachée')}
                      >
                        Détacher
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        onClick={() => void run(() => unignore({ variables: { lineId: l.id } }), 'Ligne rétablie')}
                      >
                        Rétablir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <MatchDrawer line={matchLine} onClose={() => setMatchLine(null)} onMatched={() => refetch()} />

      <Drawer
        open={ignoreTarget !== null}
        onClose={() => setIgnoreTarget(null)}
        title="Ignorer cette ligne"
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setIgnoreTarget(null)}>
              Annuler
            </button>
            <button type="submit" form="cf-ignore-form" className="btn-primary">
              Ignorer
            </button>
          </div>
        }
      >
        <form id="cf-ignore-form" onSubmit={onIgnore} className="cf-form">
          <p className="cf-muted">
            Une ligne ignorée compte dans le contrôle d’intégrité mais n’attend
            aucune écriture. À réserver aux doublons et aux mouvements qui ne
            concernent pas le club.
          </p>
          <label className="cf-field">
            <span>Motif</span>
            <select value={ignoreReason} onChange={(e) => setIgnoreReason(e.target.value as BankStatementLineIgnoreReasonGql)}>
              {(Object.keys(IGNORE_LABELS) as BankStatementLineIgnoreReasonGql[]).map((k) => (
                <option key={k} value={k}>
                  {IGNORE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="cf-field">
            <span>Note</span>
            <input type="text" value={ignoreNote} onChange={(e) => setIgnoreNote(e.target.value)} maxLength={300} />
          </label>
        </form>
      </Drawer>

      <Drawer
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title="Corriger la ligne"
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setEditTarget(null)}>
              Annuler
            </button>
            <button type="submit" form="cf-edit-line" className="btn-primary">
              Enregistrer
            </button>
          </div>
        }
      >
        <form id="cf-edit-line" onSubmit={onSaveEdit} className="cf-form">
          <p className="cf-muted">
            Pour corriger une lecture fautive. Le contrôle d’intégrité est relancé après.
          </p>
          <label className="cf-field">
            <span>Date</span>
            <input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} />
          </label>
          <label className="cf-field">
            <span>Libellé</span>
            <input type="text" value={eLabel} onChange={(e) => setELabel(e.target.value)} maxLength={500} />
          </label>
          <label className="cf-field">
            <span>Montant signé (€)</span>
            <input type="text" inputMode="decimal" value={eAmount} onChange={(e) => setEAmount(e.target.value)} placeholder="-45,10" />
          </label>
        </form>
      </Drawer>

      <Drawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Ajouter une ligne manquante"
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>
              Annuler
            </button>
            <button type="submit" form="cf-add-line" className="btn-primary">
              Ajouter
            </button>
          </div>
        }
      >
        <form id="cf-add-line" onSubmit={onAdd} className="cf-form">
          <label className="cf-field">
            <span>Date</span>
            <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} />
          </label>
          <label className="cf-field">
            <span>Libellé</span>
            <input type="text" value={aLabel} onChange={(e) => setALabel(e.target.value)} maxLength={500} />
          </label>
          <label className="cf-field">
            <span>Montant signé (€)</span>
            <input type="text" inputMode="decimal" value={aAmount} onChange={(e) => setAAmount(e.target.value)} placeholder="250,00 ou -45,10" />
          </label>
        </form>
      </Drawer>

      <ConfirmModal
        open={confirmRemove !== null}
        title="Retirer cette ligne du relevé ?"
        message={`« ${confirmRemove?.label ?? ''} » (${confirmRemove ? formatSigned(confirmRemove.amountCents) : ''}). Le contrôle d’intégrité est relancé après.`}
        confirmLabel="Retirer"
        cancelLabel="Annuler"
        danger
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          const target = confirmRemove;
          setConfirmRemove(null);
          if (target) void run(() => removeLine({ variables: { lineId: target.id } }), 'Ligne retirée');
        }}
      />

      <ConfirmModal
        open={confirmDelete}
        title="Supprimer ce relevé ?"
        message="Ses lignes et son fichier sont supprimés. Le relevé suivant, s’il existe, sera rechaîné sur le précédent. Impossible si une ligne est rapprochée."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        danger
        loading={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void onDelete()}
      />
    </>
  );
}
