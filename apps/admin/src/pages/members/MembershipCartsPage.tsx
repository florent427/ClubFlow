import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import {
  CLUB_MEMBERSHIP_CARTS,
  type AdminCart,
  type ClubMembershipCartsData,
  type MembershipCartStatus,
} from '../../lib/cart-documents';
import { ACTIVE_CLUB_SEASON, CLUB_SEASONS } from '../../lib/documents';
import { MembershipCartDetailDrawer } from './MembershipCartDetailDrawer';

interface ActiveSeasonData {
  activeClubSeason: {
    id: string;
    label: string;
  } | null;
}

interface SeasonsData {
  clubSeasons: {
    id: string;
    label: string;
    isActive: boolean;
  }[];
}

function formatEuros(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

function statusLabel(s: MembershipCartStatus): string {
  switch (s) {
    case 'OPEN':
      return 'En cours';
    case 'VALIDATED':
      return 'Validé';
    case 'CANCELLED':
      return 'Annulé';
  }
}

export function MembershipCartsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    MembershipCartStatus | 'ALL'
  >('ALL');
  const [seasonFilter, setSeasonFilter] = useState<string>('');
  const [onlyWithAlerts, setOnlyWithAlerts] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');

  const { data: activeSeasonData } = useQuery<ActiveSeasonData>(
    ACTIVE_CLUB_SEASON,
  );
  const { data: seasonsData } = useQuery<SeasonsData>(CLUB_SEASONS);

  // Défaut : saison active si connue
  const effectiveSeasonId =
    seasonFilter || activeSeasonData?.activeClubSeason?.id || null;

  const { data, loading, error } = useQuery<ClubMembershipCartsData>(
    CLUB_MEMBERSHIP_CARTS,
    {
      variables: {
        filter: {
          seasonId: effectiveSeasonId,
          status: statusFilter === 'ALL' ? null : statusFilter,
          onlyWithAlerts: onlyWithAlerts ? true : null,
        },
      },
      fetchPolicy: 'cache-and-network',
    },
  );

  const carts: AdminCart[] = data?.clubMembershipCarts ?? [];

  const filteredCarts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return carts;
    return carts.filter((c) => {
      const hay =
        `${c.payerFullName ?? ''} ${c.clubSeasonLabel} ${c.items
          .map((i) => i.memberFullName)
          .join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [carts, search]);

  const selectedCart = useMemo(
    () => carts.find((c) => c.id === selectedId) ?? null,
    [carts, selectedId],
  );

  const totalAlerts = carts.reduce(
    (sum, c) => sum + c.requiresManualAssignmentCount,
    0,
  );

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              Membres · Projets d&rsquo;adhésion
            </p>
            <h1 className="members-loom__title">
              Projets d&rsquo;adhésion ({carts.length})
            </h1>
            {totalAlerts > 0 ? (
              <p className="families-needs-payer-badge">
                {totalAlerts} ligne(s) nécessitent une assignation manuelle
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <section
        className="members-loom__toolbar"
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <label className="field">
          <span>Saison</span>
          <select
            value={seasonFilter}
            onChange={(e) => setSeasonFilter(e.target.value)}
          >
            <option value="">
              {activeSeasonData?.activeClubSeason
                ? `Saison active (${activeSeasonData.activeClubSeason.label})`
                : 'Saison active'}
            </option>
            {seasonsData?.clubSeasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.isActive ? ' · active' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Statut</span>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as MembershipCartStatus | 'ALL')
            }
          >
            <option value="ALL">Tous</option>
            <option value="OPEN">En cours</option>
            <option value="VALIDATED">Validé</option>
            <option value="CANCELLED">Annulé</option>
          </select>
        </label>

        <label className="field">
          <span>Recherche (payeur ou membre)</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom…"
          />
        </label>

        <label
          className="field"
          style={{ alignSelf: 'flex-end', marginBottom: 6 }}
        >
          <span>
            <input
              type="checkbox"
              checked={onlyWithAlerts}
              onChange={(e) => setOnlyWithAlerts(e.target.checked)}
            />{' '}
            Alertes uniquement
          </span>
        </label>
      </section>

      {error ? (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      ) : loading && carts.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : filteredCarts.length === 0 ? (
        <p className="muted">Aucun projet correspondant.</p>
      ) : (
        <div className="members-table-wrap">
          <table className="members-table">
            <thead>
              <tr>
                <th>Payeur</th>
                <th>Saison</th>
                <th>Statut</th>
                <th>#Lignes</th>
                <th>Alertes</th>
                <th className="num">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredCarts.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{c.payerFullName ?? '—'}</td>
                  <td>{c.clubSeasonLabel}</td>
                  <td>{statusLabel(c.status)}</td>
                  <td>{c.items.length}</td>
                  <td>
                    {c.requiresManualAssignmentCount > 0 ? (
                      <span className="families-needs-payer-badge">
                        {c.requiresManualAssignmentCount}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num">{formatEuros(c.totalCents)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-tight"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(c.id);
                      }}
                    >
                      Ouvrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCart ? (
        <MembershipCartDetailDrawer
          cart={selectedCart}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
  );
}
