import { useQuery } from '@apollo/client/react';
import { DASHBOARD_TRENDS } from '../lib/documents';
import type { DashboardTrendsData } from '../lib/types';

function formatEuros(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatPct(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${Math.round(n)}%`;
}

function trendColor(pct: number): string {
  if (pct > 5) return '#10b981';
  if (pct < -5) return '#ef4444';
  return '#9ca3af';
}

/**
 * Widget KPI tendance sur 30 jours glissants :
 *   - Revenus + variation % vs 30j précédents
 *   - Nouveaux adhérents + variation
 *   - Factures en retard + solde dû cumulé
 *   - Taux de paiement à l'heure (ponctualité)
 *   - Stats vitrine (pages/articles/contacts 30j)
 */
export function DashboardTrendsPanel() {
  const { data, loading, error } = useQuery<DashboardTrendsData>(
    DASHBOARD_TRENDS,
    { fetchPolicy: 'cache-and-network' },
  );
  if (loading && !data) {
    return <p className="muted">Chargement des tendances…</p>;
  }
  if (error) {
    return <p className="form-error">{error.message}</p>;
  }
  const t = data?.adminDashboardTrends;
  if (!t) return null;

  const tiles: Array<{
    label: string;
    value: string;
    sub?: { text: string; color: string };
    hint?: string;
  }> = [
    {
      label: 'Revenus (30j)',
      value: formatEuros(t.revenueLast30Cents),
      sub: {
        text: formatPct(t.revenueTrendPct),
        color: trendColor(t.revenueTrendPct),
      },
      hint: `vs ${formatEuros(t.revenuePrev30Cents)} les 30 jours précédents`,
    },
    {
      label: 'Nouveaux adhérents (30j)',
      value: String(t.newMembersLast30),
      sub: {
        text: formatPct(t.memberGrowthPct),
        color: trendColor(t.memberGrowthPct),
      },
      hint: `vs ${t.newMembersPrev30} sur la période précédente`,
    },
    {
      label: 'Factures en retard',
      value: String(t.overdueInvoicesCount),
      sub:
        t.overdueInvoicesCount > 0
          ? {
              text: formatEuros(t.overdueBalanceCents),
              color: '#ef4444',
            }
          : undefined,
      hint: 'Échéance dépassée + solde dû',
    },
    {
      label: 'Paiement à l’heure',
      value: `${Math.round(t.paidOnTimeRate * 100)}%`,
      hint: 'Sur les factures payées les 30 derniers jours',
    },
    {
      label: 'Pages vitrine publiées',
      value: String(t.vitrinePublishedPagesCount),
    },
    {
      label: 'Articles vitrine publiés',
      value: String(t.vitrinePublishedArticlesCount),
    },
    {
      label: 'Contacts vitrine (30j)',
      value: String(t.vitrineContactsLast30Count),
      hint: 'Formulaire public',
    },
  ];

  return (
    <section
      style={{
        border: '1px solid var(--border, #e4e4e7)',
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>Tendances (30j glissants)</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          Sur les 30 derniers jours
        </span>
      </header>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        {tiles.map((tile) => (
          <div
            key={tile.label}
            style={{
              padding: '14px 16px',
              background: 'var(--bg-soft, #fafafa)',
              borderRadius: 8,
              border: '1px solid var(--border, #eee)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-soft, #6b7280)',
                marginBottom: 6,
              }}
            >
              {tile.label}
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {tile.value}
            </div>
            {tile.sub ? (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: tile.sub.color,
                  marginTop: 4,
                }}
              >
                {tile.sub.text}
              </div>
            ) : null}
            {tile.hint ? (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-soft, #9ca3af)',
                  marginTop: 4,
                }}
              >
                {tile.hint}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
