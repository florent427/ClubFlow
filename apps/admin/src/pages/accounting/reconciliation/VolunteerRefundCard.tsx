import { useLazyQuery } from '@apollo/client/react';
import { useState } from 'react';
import { BANK_LINE_VOLUNTEER_CANDIDATES, VOLUNTEER_OPEN_ITEMS } from '../../../lib/documents';
import type {
  BankLineVolunteerCandidatesData,
  BankStatementLine,
  BankVolunteerCandidate,
  VolunteerOpenItemsData,
} from '../../../lib/types';
import { formatEuro, formatFr } from './format';

type Props = {
  line: BankStatementLine;
  busy: boolean;
  onAccept: (memberId: string, entryIds: string[]) => void;
};

const MATCH_LABELS: Record<string, string> = {
  EXACT_ALL: 'le montant solde tout ce que le club lui doit',
  EXACT_SUBSET: 'le montant solde exactement ces reçus',
  NONE: 'aucun jeu de reçus ne fait ce montant',
};

function volunteerName(c: BankVolunteerCandidate): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

/**
 * Remboursement d'un bénévole reconnu sur une sortie d'argent (ADR-0016).
 *
 * Le miroir de la carte d'encaissement : plutôt que d'inventer une charge —
 * qui compterait la dépense une seconde fois, la première ayant été
 * comptabilisée le jour du reçu — on solde la dette du bénévole.
 */
export function VolunteerRefundCard({ line, busy, onAccept }: Props) {
  const proposal = line.volunteerProposal;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<BankVolunteerCandidate | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const [loadCandidates, { data: candidatesData, loading }] =
    useLazyQuery<BankLineVolunteerCandidatesData>(BANK_LINE_VOLUNTEER_CANDIDATES, {
      fetchPolicy: 'network-only',
    });
  const [loadItems, { data: itemsData }] = useLazyQuery<VolunteerOpenItemsData>(
    VOLUNTEER_OPEN_ITEMS,
    { fetchPolicy: 'network-only' },
  );
  const candidates = candidatesData?.bankLineVolunteerCandidates ?? [];
  const items = itemsData?.volunteerOpenItems ?? [];
  const pickedTotal = items
    .filter((i) => picked[i.entryId])
    .reduce((s, i) => s + i.amountCents, 0);
  const target = Math.abs(line.amountCents);

  function openSearch() {
    setOpen(true);
    void loadCandidates({ variables: { lineId: line.id } });
  }

  function choose(c: BankVolunteerCandidate) {
    setSelected(c);
    setPicked(Object.fromEntries(c.entryIds.map((id) => [id, true])));
    void loadItems({ variables: { memberId: c.memberId } });
  }

  return (
    <div className="cf-callout" style={{ marginTop: 8 }}>
      {proposal ? (
        <>
          <p style={{ margin: 0 }}>
            <strong>Remboursement de {volunteerName(proposal)} ?</strong>{' '}
            <small className="cf-muted">
              {MATCH_LABELS[proposal.amountMatch] ?? ''} · {proposal.confidence} %
            </small>
          </p>
          <p className="cf-muted" style={{ margin: '4px 0 8px' }}>
            Le club lui doit {formatEuro(proposal.openCents)} sur {proposal.openCount} reçu
            {proposal.openCount > 1 ? 's' : ''}. Cette sortie en solderait{' '}
            {proposal.entryIds.length}.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary btn-ghost--sm"
              disabled={busy || proposal.entryIds.length === 0}
              onClick={() => onAccept(proposal.memberId, proposal.entryIds)}
            >
              Rembourser {formatEuro(target)}
            </button>
            <button type="button" className="btn-ghost btn-ghost--sm" onClick={openSearch}>
              Choisir un autre bénévole…
            </button>
          </div>
          <p className="cf-muted" style={{ margin: '8px 0 0' }}>
            Aucune charge ne sera créée : elle l’a été le jour du reçu. Cette
            écriture éteint la dette et rapproche la ligne.
          </p>
        </>
      ) : (
        <p style={{ margin: 0 }}>
          <span className="cf-muted">Un remboursement de bénévole ? </span>
          <button type="button" className="btn-ghost btn-ghost--sm" onClick={openSearch}>
            Chercher le bénévole
          </button>
        </p>
      )}

      {open ? (
        <div style={{ marginTop: 10 }}>
          {loading ? <p className="cf-muted">Recherche…</p> : null}
          {!loading && candidates.length === 0 ? (
            <p className="cf-muted">
              Aucun bénévole reconnu dans ce libellé parmi ceux à qui le club doit
              de l’argent.
            </p>
          ) : null}
          {candidates.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {candidates.map((c) => (
                <button
                  key={c.memberId}
                  type="button"
                  className={
                    selected?.memberId === c.memberId
                      ? 'btn-primary btn-ghost--sm'
                      : 'btn-ghost btn-ghost--sm'
                  }
                  onClick={() => choose(c)}
                >
                  {volunteerName(c)} · {formatEuro(c.openCents)} dû
                </button>
              ))}
            </div>
          ) : null}

          {selected && items.length > 0 ? (
            <>
              <table className="cf-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }} />
                    <th>Date</th>
                    <th>Reçu</th>
                    <th style={{ textAlign: 'right' }}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.entryId}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!picked[i.entryId]}
                          aria-label={`Solder ${i.label}`}
                          onChange={(e) =>
                            setPicked((p) => ({ ...p, [i.entryId]: e.target.checked }))
                          }
                        />
                      </td>
                      <td>{formatFr(i.occurredAt)}</td>
                      <td>{i.label}</td>
                      <td style={{ textAlign: 'right' }}>{formatEuro(i.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                <span className={pickedTotal === target ? 'cf-pill cf-pill--ok' : 'cf-pill cf-pill--warn'}>
                  {formatEuro(pickedTotal)} sur {formatEuro(target)}
                </span>
                <button
                  type="button"
                  className="btn-primary btn-ghost--sm"
                  disabled={busy || pickedTotal !== target}
                  onClick={() =>
                    onAccept(
                      selected.memberId,
                      items.filter((i) => picked[i.entryId]).map((i) => i.entryId),
                    )
                  }
                >
                  Rembourser
                </button>
                {pickedTotal !== target ? (
                  <small className="cf-muted">
                    Les reçus cochés doivent faire exactement le montant sorti.
                  </small>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
