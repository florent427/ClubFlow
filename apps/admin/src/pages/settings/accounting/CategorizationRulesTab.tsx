import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_ACCOUNTING_ACCOUNTS,
  CLUB_CATEGORIZATION_RULES,
  DELETE_CATEGORIZATION_RULE,
  UPSERT_CATEGORIZATION_RULE,
} from '../../../lib/documents';
import type {
  CategorizationDirectionGql,
  CategorizationMatchKindGql,
  CategorizationRule,
  ClubAccountingAccountsData,
  ClubCategorizationRulesData,
} from '../../../lib/types';
import { useToast } from '../../../components/ToastProvider';
import { ConfirmModal, Drawer } from '../../../components/ui';

const MATCH_LABELS: Record<CategorizationMatchKindGql, string> = {
  CONTAINS: 'contient',
  STARTS_WITH: 'commence par',
  REGEX: 'expression régulière',
};

const DIRECTION_LABELS: Record<CategorizationDirectionGql, string> = {
  DEBIT: 'Dépenses',
  CREDIT: 'Recettes',
  ANY: 'Les deux',
};

type Draft = {
  id: string | null;
  pattern: string;
  matchKind: CategorizationMatchKindGql;
  direction: CategorizationDirectionGql;
  accountCode: string;
  label: string;
  isActive: boolean;
};

const EMPTY: Draft = {
  id: null,
  pattern: '',
  matchKind: 'CONTAINS',
  direction: 'DEBIT',
  accountCode: '',
  label: '',
  isActive: true,
};

/**
 * Règles de catégorisation (ADR-0014 §5) : ce que le club a appris en
 * validant des propositions, et ce qu'un trésorier peut écrire lui-même.
 * Une règle qui tombe évite un appel IA et donne toujours le même compte.
 */
export function CategorizationRulesTab() {
  const { showToast } = useToast();
  const { data, refetch } = useQuery<ClubCategorizationRulesData>(CLUB_CATEGORIZATION_RULES, {
    fetchPolicy: 'cache-and-network',
  });
  const { data: accountsData } = useQuery<ClubAccountingAccountsData>(CLUB_ACCOUNTING_ACCOUNTS, {
    fetchPolicy: 'cache-first',
  });
  const [upsert, { loading: saving }] = useMutation(UPSERT_CATEGORIZATION_RULE);
  const [remove, { loading: removing }] = useMutation(DELETE_CATEGORIZATION_RULE);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CategorizationRule | null>(null);

  const rules = data?.clubCategorizationRules ?? [];
  const accounts = (accountsData?.clubAccountingAccounts ?? []).filter((a) => a.isActive);

  function openCreate() {
    setDraft({ ...EMPTY, accountCode: accounts[0]?.code ?? '' });
  }

  function openEdit(r: CategorizationRule) {
    setDraft({
      id: r.id,
      pattern: r.pattern,
      matchKind: r.matchKind,
      direction: r.direction,
      accountCode: r.accountCode,
      label: r.label ?? '',
      isActive: r.isActive,
    });
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      showToast(ok, 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (draft.pattern.trim().length < 2 || !draft.accountCode) {
      showToast('Motif et compte requis', 'error');
      return;
    }
    await run(
      () =>
        upsert({
          variables: {
            input: {
              id: draft.id,
              pattern: draft.pattern.trim(),
              matchKind: draft.matchKind,
              direction: draft.direction,
              accountCode: draft.accountCode,
              label: draft.label.trim() || null,
              isActive: draft.isActive,
            },
          },
        }),
      draft.id ? 'Règle modifiée' : 'Règle créée',
    );
    setDraft(null);
  }

  return (
    <>
      <section className="members-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 className="members-panel__h" style={{ margin: 0 }}>
            Règles de catégorisation
          </h2>
          <button type="button" className="btn-primary" disabled={accounts.length === 0} onClick={openCreate}>
            + Ajouter une règle
          </button>
        </div>
        <p className="cf-muted">
          Une règle reconnaît un mouvement à son libellé et lui donne toujours
          le même compte, sans passer par l’IA. Chaque validation d’une
          proposition en crée une automatiquement ; tu peux les corriger ici.
          Le motif est confronté au libellé nettoyé de la ligne, sans les
          dates ni les références.
        </p>
        {rules.length === 0 ? (
          <p className="cf-muted">
            Aucune règle pour l’instant. Valide une proposition dans
            Rapprochement bancaire : la règle naîtra toute seule.
          </p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Motif</th>
                <th>Sens</th>
                <th>Compte</th>
                <th>Libellé imposé</th>
                <th>Origine</th>
                <th>Utilisée</th>
                <th style={{ width: 190 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} style={r.isActive ? undefined : { opacity: 0.55 }}>
                  <td>
                    <strong>{r.pattern}</strong>
                    <small className="cf-muted" style={{ display: 'block' }}>
                      {MATCH_LABELS[r.matchKind]}
                    </small>
                  </td>
                  <td>{DIRECTION_LABELS[r.direction]}</td>
                  <td>
                    {r.accountCode}
                    {r.accountLabel ? (
                      <small className="cf-muted" style={{ display: 'block' }}>
                        {r.accountLabel}
                      </small>
                    ) : (
                      <small style={{ display: 'block', color: '#b45309' }}>compte inconnu</small>
                    )}
                  </td>
                  <td>{r.label ?? <span className="cf-muted">celui de la ligne</span>}</td>
                  <td>
                    <span className="cf-pill cf-pill--muted">
                      {r.source === 'LEARNED' ? 'apprise' : 'écrite à la main'}
                    </span>
                  </td>
                  <td>
                    {r.hitCount} fois
                    {r.lastHitAt ? (
                      <small className="cf-muted" style={{ display: 'block' }}>
                        dernière {new Date(r.lastHitAt).toLocaleDateString('fr-FR')}
                      </small>
                    ) : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => openEdit(r)}>
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--sm"
                      disabled={saving}
                      onClick={() =>
                        void run(
                          () =>
                            upsert({
                              variables: {
                                input: {
                                  id: r.id,
                                  pattern: r.pattern,
                                  matchKind: r.matchKind,
                                  direction: r.direction,
                                  accountCode: r.accountCode,
                                  label: r.label,
                                  isActive: !r.isActive,
                                },
                              },
                            }),
                          r.isActive ? 'Règle désactivée' : 'Règle réactivée',
                        )
                      }
                    >
                      {r.isActive ? 'Désactiver' : 'Réactiver'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--sm"
                      style={{ color: '#b91c1c' }}
                      onClick={() => setConfirmDelete(r)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Modifier la règle' : 'Ajouter une règle'}
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>
              Annuler
            </button>
            <button type="submit" form="cf-rule-form" className="btn-primary" disabled={saving}>
              Enregistrer
            </button>
          </div>
        }
      >
        {draft ? (
          <form id="cf-rule-form" onSubmit={onSubmit} className="cf-form">
            <label className="cf-field">
              <span>Motif *</span>
              <input
                type="text"
                value={draft.pattern}
                onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
                placeholder="EDF"
                maxLength={120}
              />
              <small className="cf-muted">
                Confronté au libellé en majuscules, sans accents, sans dates ni
                numéros. « EDF » attrape « PRLV SEPA EDF 12/08 REF 123 ».
              </small>
            </label>
            <div className="cf-form-row">
              <label className="cf-field">
                <span>Comparaison</span>
                <select
                  value={draft.matchKind}
                  onChange={(e) =>
                    setDraft({ ...draft, matchKind: e.target.value as CategorizationMatchKindGql })
                  }
                >
                  {(Object.keys(MATCH_LABELS) as CategorizationMatchKindGql[]).map((k) => (
                    <option key={k} value={k}>
                      {MATCH_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cf-field">
                <span>S’applique aux</span>
                <select
                  value={draft.direction}
                  onChange={(e) =>
                    setDraft({ ...draft, direction: e.target.value as CategorizationDirectionGql })
                  }
                >
                  {(Object.keys(DIRECTION_LABELS) as CategorizationDirectionGql[]).map((k) => (
                    <option key={k} value={k}>
                      {DIRECTION_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="cf-field">
              <span>Compte *</span>
              <select
                value={draft.accountCode}
                onChange={(e) => setDraft({ ...draft, accountCode: e.target.value })}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.code} — {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cf-field">
              <span>Libellé d’écriture</span>
              <input
                type="text"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Laisser vide pour garder le libellé de la ligne"
                maxLength={200}
              />
            </label>
            <label className="cf-checkbox">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
              />
              <span>Règle active</span>
            </label>
          </form>
        ) : null}
      </Drawer>

      <ConfirmModal
        open={confirmDelete !== null}
        title="Supprimer cette règle ?"
        message={`« ${confirmDelete?.pattern ?? ''} » ne sera plus appliquée. Les écritures déjà passées ne bougent pas.`}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        danger
        loading={removing}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (target) void run(() => remove({ variables: { id: target.id } }), 'Règle supprimée');
        }}
      />
    </>
  );
}
