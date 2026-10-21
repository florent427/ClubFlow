import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import {
  APPROVE_CLUB_MILEAGE_CLAIM,
  CANCEL_CLUB_MILEAGE_CLAIM_APPROVAL,
  CLUB_MILEAGE_CLAIM,
  CLUB_MILEAGE_CLAIMS,
  MILEAGE_MEMBERS,
  REJECT_CLUB_MILEAGE_CLAIM,
  RETURN_CLUB_MILEAGE_CLAIM,
} from '../../../lib/mileage-documents';
import type {
  ClubMileageClaimData,
  ClubMileageClaimsData,
  MileageClaimStatus,
  MileageMembersData,
} from '../../../lib/mileage-documents';
import { useToast } from '../../../components/ToastProvider';
import { ConfirmModal, Drawer } from '../../../components/ui';
import { formatEuro, formatFr } from '../reconciliation/format';
import { MileageClaimDetail, SettlementState } from './MileageClaimDetail';
import { ReasonModal } from './ReasonModal';
import {
  SETTLEMENT_LABEL,
  STATUS_LABEL,
  STATUS_PILL,
  errorMessage,
  formatDateTimeFr,
  formatKm,
} from './mileage-format';

type Action = 'approve' | 'return' | 'reject' | 'cancel';

/** Revue des notes de frais kilométriques soumises par les bénévoles. */
export function MileageReviewTab() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<MileageClaimStatus | ''>('SUBMITTED');
  const [memberId, setMemberId] = useState('');
  const { data, loading, refetch } = useQuery<ClubMileageClaimsData>(CLUB_MILEAGE_CLAIMS, {
    variables: { status: status || null, memberId: memberId || null },
    fetchPolicy: 'cache-and-network',
  });
  const { data: membersData } = useQuery<MileageMembersData>(MILEAGE_MEMBERS);
  const members = useMemo(
    () =>
      [...(membersData?.clubMembers ?? [])].sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr'),
      ),
    [membersData],
  );

  const [openId, setOpenId] = useState<string | null>(null);
  const { data: detailData } = useQuery<ClubMileageClaimData>(CLUB_MILEAGE_CLAIM, {
    variables: { id: openId ?? '' },
    skip: !openId,
    fetchPolicy: 'network-only',
  });
  const claim = openId ? detailData?.clubMileageClaim ?? null : null;

  const [approve, { loading: approving }] = useMutation(APPROVE_CLUB_MILEAGE_CLAIM);
  const [returnClaim, { loading: returning }] = useMutation(RETURN_CLUB_MILEAGE_CLAIM);
  const [reject, { loading: rejecting }] = useMutation(REJECT_CLUB_MILEAGE_CLAIM);
  const [cancelApproval, { loading: cancelling }] = useMutation(
    CANCEL_CLUB_MILEAGE_CLAIM_APPROVAL,
  );
  const [action, setAction] = useState<Action | null>(null);

  const claims = data?.clubMileageClaims ?? [];
  const total = claims.reduce((s, c) => s + c.amountCents, 0);

  async function run(fn: () => Promise<unknown>, success: string) {
    try {
      await fn();
      showToast(success, 'success');
      setAction(null);
      await refetch();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  return (
    <>
      <section className="members-panel">
        <div className="cf-form-row" style={{ alignItems: 'flex-end' }}>
          <label className="cf-field" style={{ flex: 1 }}>
            <span>Statut</span>
            <select className="cf-field__input"
              value={status}
              onChange={(e) => setStatus(e.target.value as MileageClaimStatus | '')}
            >
              <option value="SUBMITTED">À valider</option>
              <option value="APPROVED">Validées</option>
              <option value="DRAFT">Brouillons</option>
              <option value="REJECTED">Refusées</option>
              <option value="">Toutes</option>
            </select>
          </label>
          <label className="cf-field" style={{ flex: 2 }}>
            <span>Bénévole</span>
            <select className="cf-field__input" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">Tous les bénévoles</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.lastName} {m.firstName}
                </option>
              ))}
            </select>
          </label>
          {claims.length > 0 ? (
            <span className="cf-pill cf-pill--info" style={{ marginBottom: 10 }}>
              {claims.length} note{claims.length > 1 ? 's' : ''} · {formatEuro(total)}
            </span>
          ) : null}
        </div>

        {claims.length === 0 ? (
          <p className="cf-muted">
            {loading
              ? 'Chargement…'
              : status === 'SUBMITTED'
                ? 'Aucune note en attente de validation.'
                : 'Aucune note pour ces critères.'}
          </p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Soumise le</th>
                <th>Bénévole</th>
                <th>Note</th>
                <th>Règlement</th>
                <th style={{ textAlign: 'right' }}>Km</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th>Statut</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id}>
                  <td>{formatDateTimeFr(c.submittedAt ?? c.createdAt)}</td>
                  <td>
                    <strong>{c.memberName}</strong>
                  </td>
                  <td>
                    {c.title}
                    <small className="cf-muted" style={{ display: 'block' }}>
                      {c.tripCount} déplacement{c.tripCount > 1 ? 's' : ''}
                      {c.firstTripDate
                        ? ` · ${formatFr(c.firstTripDate)} → ${formatFr(c.lastTripDate)}`
                        : ''}
                    </small>
                  </td>
                  <td>{SETTLEMENT_LABEL[c.settlement]}</td>
                  <td style={{ textAlign: 'right' }}>{formatKm(c.totalMeters)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatEuro(c.amountCents)}
                    {c.provisional ? (
                      <small
                        className="cf-muted"
                        style={{ display: 'block', fontWeight: 400 }}
                        title="Barème de l’année pas encore publié"
                      >
                        provisoire
                      </small>
                    ) : null}
                  </td>
                  <td>
                    <span className={STATUS_PILL[c.status]}>{STATUS_LABEL[c.status]}</span>{' '}
                    <SettlementState claim={c} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--sm"
                      onClick={() => setOpenId(c.id)}
                    >
                      Ouvrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Drawer
        open={openId !== null}
        onClose={() => setOpenId(null)}
        width={720}
        title={claim ? `${claim.title} — ${claim.memberName}` : 'Note de frais kilométriques'}
        footer={
          claim ? (
            <div className="cf-drawer-foot">
              <span className="cf-muted" style={{ marginRight: 'auto' }}>
                {formatEuro(claim.amountCents)}
                {claim.estimated ? ' (estimation)' : ''}
              </span>
              {claim.status === 'SUBMITTED' ? (
                <>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setAction('reject')}
                  >
                    Refuser…
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setAction('return')}
                  >
                    Renvoyer pour correction…
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setAction('approve')}
                  >
                    Valider
                  </button>
                </>
              ) : null}
              {claim.status === 'APPROVED' ? (
                <button type="button" className="btn-ghost" onClick={() => setAction('cancel')}>
                  Annuler la validation…
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {claim ? <MileageClaimDetail claim={claim} /> : <p className="cf-muted">Chargement…</p>}
      </Drawer>

      <ConfirmModal
        open={action === 'approve' && claim !== null}
        title="Valider la note ?"
        message={
          claim ? (
            <>
              Le montant de {formatEuro(claim.amountCents)} sera figé et l’écriture passée
              {claim.settlement === 'DONATION'
                ? ' en don (625100 / 756100) ; un reçu fiscal pourra être émis.'
                : ' (625100 / 467100) ; le remboursement se fera depuis « Frais bénévoles ».'}
            </>
          ) : null
        }
        confirmLabel="Valider"
        loading={approving}
        onCancel={() => setAction(null)}
        onConfirm={() =>
          claim &&
          void run(() => approve({ variables: { id: claim.id } }), 'Note validée')
        }
      />
      <ConfirmModal
        open={action === 'cancel' && claim !== null}
        title="Annuler la validation ?"
        message="L’écriture de la note est annulée et la note repasse « à valider »."
        confirmLabel="Annuler la validation"
        danger
        loading={cancelling}
        onCancel={() => setAction(null)}
        onConfirm={() =>
          claim &&
          void run(
            () => cancelApproval({ variables: { id: claim.id } }),
            'Validation annulée',
          )
        }
      />
      <ReasonModal
        open={action === 'return'}
        title="Renvoyer pour correction"
        lede="La note repasse en brouillon : le bénévole la corrige puis la soumet à nouveau."
        label="Ce qu’il faut corriger"
        confirmLabel="Renvoyer"
        loading={returning}
        onCancel={() => setAction(null)}
        onConfirm={(comment) =>
          claim &&
          void run(
            () => returnClaim({ variables: { id: claim.id, comment } }),
            'Note renvoyée au bénévole',
          )
        }
      />
      <ReasonModal
        open={action === 'reject'}
        title="Refuser la note"
        lede="Un refus est définitif : la note ne pourra plus être soumise."
        label="Motif du refus"
        confirmLabel="Refuser"
        danger
        loading={rejecting}
        onCancel={() => setAction(null)}
        onConfirm={(comment) =>
          claim &&
          void run(() => reject({ variables: { id: claim.id, comment } }), 'Note refusée')
        }
      />
    </>
  );
}
