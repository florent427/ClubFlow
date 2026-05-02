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
  const validated = carts.filter((c) => c.status === 'VALIDATED').length;
  // Total à facturer = sum des montants des FACTURES liées aux paniers
  // validés. C'est le montant qui sera réellement payé par les payeurs
  // (cohérent avec la page Facturation). On retombe sur `totalCents` du
  // panier en fallback si la facture n'est pas encore matérialisée
  // (cas dégradé peu probable pour un cart VALIDATED).
  const totalRevenue = carts
    .filter((c) => c.status === 'VALIDATED')
    .reduce((sum, c) => sum + (c.invoiceAmountCents ?? c.totalCents), 0);

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              Membres · Projets d&rsquo;adhésion
            </p>
            <h1 className="members-loom__title">
              Projets d&rsquo;adhésion
            </h1>
            <p className="members-loom__lede">
              Paniers d’adhésion ouverts, validés ou annulés. Ouvrez un projet
              pour assigner manuellement les lignes ou le valider.
            </p>
          </div>
        </div>
      </header>

      {totalAlerts > 0 ? (
        <div className="cf-alert cf-alert--warning" role="alert">
          <span className="material-symbols-outlined" aria-hidden>
            warning
          </span>
          <div className="cf-alert__content">
            <strong>Assignation manuelle requise</strong>
            <span>
              {totalAlerts} ligne{totalAlerts > 1 ? 's' : ''} nécessite
              {totalAlerts > 1 ? 'nt' : ''} une action sur les projets
              ouverts.
            </span>
          </div>
        </div>
      ) : null}

      {carts.length > 0 ? (
        <div className="members-kpis">
          <div className="members-kpi">
            <span className="members-kpi__label">Projets</span>
            <span className="members-kpi__value">{carts.length}</span>
            <span className="members-kpi__hint">sur la saison sélectionnée</span>
          </div>
          <div className="members-kpi">
            <span className="members-kpi__label">Validés</span>
            <span className="members-kpi__value">{validated}</span>
            <span className="members-kpi__hint">
              {carts.length > 0
                ? `${Math.round((validated / carts.length) * 100)} % du total`
                : ''}
            </span>
          </div>
          <div className="members-kpi">
            <span className="members-kpi__label">Alertes</span>
            <span
              className={`members-kpi__value${totalAlerts > 0 ? ' members-kpi__value--alert' : ''}`}
            >
              {totalAlerts}
            </span>
            <span className="members-kpi__hint">
              {totalAlerts > 0 ? 'à traiter' : 'aucune en attente'}
            </span>
          </div>
          <div className="members-kpi">
            <span className="members-kpi__label">À facturer</span>
            <span className="members-kpi__value">
              {formatEuros(totalRevenue)}
            </span>
            <span
              className="members-kpi__hint"
              title="Total des montants de FACTURES émises pour les paniers validés (TTC après remises famille/groupe). Ce montant correspond à ce qui apparaît sur la page Facturation. L'encaissement réel (factures payées) est suivi sur la page Facturation."
            >
              factures émises (≠ encaissement)
            </span>
          </div>
        </div>
      ) : null}

      <section className="cf-toolbar">
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

        <label className="field cf-toolbar__checkbox">
          <input
            type="checkbox"
            checked={onlyWithAlerts}
            onChange={(e) => setOnlyWithAlerts(e.target.checked)}
          />
          <span>Alertes uniquement</span>
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
                  <td>
                    <span
                      className={`cf-badge cf-badge--${c.status === 'VALIDATED' ? 'success' : c.status === 'CANCELLED' ? 'neutral' : 'info'}`}
                    >
                      {statusLabel(c.status)}
                    </span>
                  </td>
                  <td>{c.items.length}</td>
                  <td>
                    {c.requiresManualAssignmentCount > 0 ? (
                      <span className="cf-badge cf-badge--warning">
                        <span
                          className="material-symbols-outlined"
                          aria-hidden
                        >
                          warning
                        </span>
                        {c.requiresManualAssignmentCount}
                      </span>
                    ) : (
                      <span className="cf-text-muted">—</span>
                    )}
                  </td>
                  <td className="num">
                    {/* Si la facture est émise on affiche le montant
                        facturé (= ce qui sera vraiment payé). Sinon on
                        retombe sur le total panier (estimation). */}
                    {c.invoiceAmountCents != null ? (
                      <span title="Montant facture (TTC après remises)">
                        {formatEuros(c.invoiceAmountCents)}
                      </span>
                    ) : (
                      <span
                        className="cf-text-muted"
                        title="Estimation panier (la facture finale peut différer après remises famille/groupe)"
                      >
                        {formatEuros(c.totalCents)}
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="cf-btn cf-btn--sm cf-btn--ghost"
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
