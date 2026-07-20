import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import {
  CLUB_MEMBERS,
  CLUB_MEMBER_ACCOUNT_CANDIDATES,
  CLUB_MEMBER_ACCOUNT_LINK,
  LINK_CLUB_MEMBER_ACCOUNT,
  UNLINK_CLUB_MEMBER_ACCOUNT,
} from '../../lib/documents';
import type {
  MemberAccountCandidate,
  MemberAccountCandidatesQueryData,
  MemberAccountLinkQueryData,
} from '../../lib/types';

function formatGqlMutationError(err: unknown): string {
  if (err && typeof err === 'object' && 'graphQLErrors' in err) {
    const gql = err as {
      graphQLErrors?: readonly { message?: string }[];
      message?: string;
    };
    const first = gql.graphQLErrors?.[0]?.message;
    if (first) return first;
    if (gql.message) return gql.message;
  }
  if (err instanceof Error) return err.message;
  return 'Une erreur est survenue.';
}

const encadre = {
  marginBottom: '1rem',
  padding: '0.75rem',
  border: '1px solid var(--border, #e0e0e0)',
  borderRadius: 8,
} as const;

/**
 * Rattachement de la fiche à un compte utilisateur.
 *
 * POURQUOI CET ÉCRAN EXISTE : en production, le propriétaire du club s'est
 * connecté au portail et est tombé sur une fiche de démonstration, parce que
 * son compte était rattaché à la mauvaise fiche. La correction a dû se faire
 * en SQL directement sur la prod, faute d'écran.
 *
 * LE CŒUR DE CET ÉCRAN est l'avertissement : quand le compte choisi est déjà
 * détenu par une AUTRE fiche, on le dit AVANT d'agir, on NOMME la fiche, et on
 * exige une case à cocher. L'admin doit comprendre qu'il DÉPLACE un lien —
 * l'autre fiche le perdra — et non qu'il en ajoute un.
 */
export function MemberAccountLinkPanel({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName: string;
}) {
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [confirmMove, setConfirmMove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refetchQueries = useMemo(
    () => [
      { query: CLUB_MEMBER_ACCOUNT_LINK, variables: { memberId } },
      { query: CLUB_MEMBER_ACCOUNT_CANDIDATES, variables: { memberId, search } },
      { query: CLUB_MEMBERS },
    ],
    [memberId, search],
  );

  const { data: linkData, loading: linkLoading } =
    useQuery<MemberAccountLinkQueryData>(CLUB_MEMBER_ACCOUNT_LINK, {
      variables: { memberId },
      skip: !memberId,
      fetchPolicy: 'network-only',
    });

  const { data: candData, loading: candLoading } =
    useQuery<MemberAccountCandidatesQueryData>(CLUB_MEMBER_ACCOUNT_CANDIDATES, {
      variables: { memberId, search: search.trim() || null },
      skip: !memberId,
      fetchPolicy: 'network-only',
    });

  const [linkAccount, { loading: linking }] = useMutation(
    LINK_CLUB_MEMBER_ACCOUNT,
    { refetchQueries, awaitRefetchQueries: true },
  );
  const [unlinkAccount, { loading: unlinking }] = useMutation(
    UNLINK_CLUB_MEMBER_ACCOUNT,
    { refetchQueries, awaitRefetchQueries: true },
  );

  const state = linkData?.clubMemberAccountLink;
  const candidates = candData?.clubMemberAccountCandidates ?? [];

  const selected: MemberAccountCandidate | undefined = candidates.find(
    (c) => c.userId === selectedUserId,
  );

  /**
   * Le conflit qui compte : le compte visé est détenu par une AUTRE fiche.
   * (Détenu par CETTE fiche = déjà rattaché, ce n'est pas un déplacement.)
   */
  const heldByOther =
    selected && selected.heldByMemberId && selected.heldByMemberId !== memberId
      ? selected
      : null;

  const resetChoix = () => {
    setSelectedUserId('');
    setConfirmMove(false);
  };

  const onLink = () => {
    if (!selectedUserId) return;
    setError(null);
    setNotice(null);
    void linkAccount({
      variables: {
        input: {
          memberId,
          userId: selectedUserId,
          // N'envoie `confirmMove` que lorsqu'il y a réellement quelque chose
          // à confirmer : l'API refuse le vol, c'est elle qui arbitre.
          ...(heldByOther ? { confirmMove: true } : {}),
        },
      },
    })
      .then(() => {
        setNotice(
          heldByOther
            ? `Lien déplacé depuis « ${heldByOther.heldByMemberName} ».`
            : 'Compte rattaché.',
        );
        resetChoix();
      })
      .catch((err: unknown) => setError(formatGqlMutationError(err)));
  };

  const onUnlink = () => {
    setError(null);
    setNotice(null);
    void unlinkAccount({ variables: { memberId } })
      .then(() => {
        setNotice('Compte détaché.');
        resetChoix();
      })
      .catch((err: unknown) => setError(formatGqlMutationError(err)));
  };

  const peutRattacher =
    !!selectedUserId && !linking && (!heldByOther || confirmMove);

  return (
    <div className="member-account-link-panel" style={encadre}>
      <h4 className="family-drawer__h" style={{ fontSize: '0.95rem' }}>
        <span className="material-symbols-outlined" aria-hidden>
          account_circle
        </span>{' '}
        Compte utilisateur
      </h4>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="muted" role="status" style={{ margin: '0.5rem 0' }}>
          {notice}
        </p>
      ) : null}

      {/* ── État actuel ─────────────────────────────────────────── */}
      {linkLoading ? (
        <p className="muted" style={{ margin: '0.5rem 0' }}>
          Chargement…
        </p>
      ) : state?.userId ? (
        <>
          <p style={{ margin: '0.5rem 0' }}>
            Rattachée au compte{' '}
            <strong>{state.userEmail ?? state.userId}</strong>
            {state.userDisplayName ? ` (${state.userDisplayName})` : ''}.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={unlinking}
            onClick={onUnlink}
          >
            Détacher
          </button>
        </>
      ) : (
        <p className="muted" style={{ margin: '0.5rem 0' }}>
          Aucun compte rattaché — le titulaire de cette fiche ne peut pas la
          voir au portail membre.
        </p>
      )}

      {/* ── Choix d'un compte ───────────────────────────────────── */}
      <div style={{ marginTop: '0.9rem' }}>
        <label className="field">
          <span>Rechercher un compte</span>
          <input
            type="search"
            value={search}
            placeholder="e-mail ou nom"
            onChange={(e) => {
              setSearch(e.target.value);
              resetChoix();
            }}
          />
        </label>

        <label className="field">
          <span>Compte à rattacher</span>
          <select
            value={selectedUserId}
            onChange={(e) => {
              setSelectedUserId(e.target.value);
              // Toute nouvelle sélection ré-arme la confirmation : on ne
              // reporte JAMAIS un consentement donné pour un autre compte.
              setConfirmMove(false);
              setError(null);
              setNotice(null);
            }}
          >
            <option value="">
              {candLoading ? 'Chargement…' : '— Choisir un compte —'}
            </option>
            {candidates.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.email}
                {c.emailMatchesMember ? ' ★ même e-mail que la fiche' : ''}
                {c.heldByMemberId && c.heldByMemberId !== memberId
                  ? ` — déjà pris par ${c.heldByMemberName}`
                  : ''}
              </option>
            ))}
          </select>
        </label>

        {!candLoading && candidates.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Aucun compte trouvé pour ce club.
          </p>
        ) : null}

        {/* ── L'AVERTISSEMENT — le cœur de l'écran ──────────────── */}
        {heldByOther ? (
          <div
            role="alert"
            style={{
              margin: '0.75rem 0',
              padding: '0.7rem 0.8rem',
              borderRadius: 8,
              background: 'rgba(217,119,6,0.08)',
              border: '1px solid rgba(217,119,6,0.35)',
            }}
          >
            <p style={{ margin: '0 0 0.5rem' }}>
              <span
                className="material-symbols-outlined"
                aria-hidden
                style={{
                  verticalAlign: 'middle',
                  marginRight: 6,
                  fontSize: '1.1rem',
                }}
              >
                warning
              </span>
              Ce compte est <strong>déjà rattaché</strong> à la fiche{' '}
              <strong>« {heldByOther.heldByMemberName} »</strong>.
            </p>
            <p style={{ margin: '0 0 0.5rem', lineHeight: 1.45 }}>
              Un compte ne peut être rattaché qu’à une seule fiche par club.
              Continuer <strong>déplacera</strong> le lien :{' '}
              <strong>« {heldByOther.heldByMemberName} »</strong> n’aura plus de
              compte, et <strong>« {memberName} »</strong> recevra celui-ci.
            </p>
            <label
              style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}
            >
              <input
                type="checkbox"
                checked={confirmMove}
                onChange={(e) => setConfirmMove(e.target.checked)}
              />
              <span>
                Je confirme le déplacement du lien depuis «{' '}
                {heldByOther.heldByMemberName} ».
              </span>
            </label>
          </div>
        ) : null}

        <button
          type="button"
          className="btn btn-outline"
          disabled={!peutRattacher}
          onClick={onLink}
        >
          {heldByOther ? 'Déplacer le lien vers cette fiche' : 'Rattacher'}
        </button>
      </div>
    </div>
  );
}
