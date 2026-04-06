import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DASHBOARD_SUMMARY,
  CLUB_DYNAMIC_GROUPS,
  CLUB_COURSE_SLOTS,
} from '../lib/documents';
import { MODULE_CATALOG } from '../lib/module-catalog';
import type {
  CourseSlotsQueryData,
  DashboardQueryData,
  DynamicGroupsQueryData,
} from '../lib/types';
import { getToken } from '../lib/storage';

function decodeJwtEmail(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = JSON.parse(atob(part)) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

function greetName(email: string | null): string {
  if (!email) return 'cher administrateur';
  const local = email.split('@')[0] ?? '';
  if (!local) return 'cher administrateur';
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const PIE_COLORS = ['#000666', '#0056c5', '#bdc2ff', '#1a237e', '#c2410c'];

export function DashboardPage() {
  const navigate = useNavigate();
  /**
   * Recommandation UX #11 — Onboarding admin
   * Bannière d'accueil pour les nouveaux administrateurs, masquable.
   */
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return localStorage.getItem('cf_onboarding_dismissed') !== '1';
  });
  function dismissOnboarding() {
    setShowOnboarding(false);
    localStorage.setItem('cf_onboarding_dismissed', '1');
  }
  const token = getToken();
  const email = token ? decodeJwtEmail(token) : null;

  const { data: dashData, loading: dashLoading } =
    useQuery<DashboardQueryData>(DASHBOARD_SUMMARY);
  const { data: groupsData } = useQuery<DynamicGroupsQueryData>(
    CLUB_DYNAMIC_GROUPS,
  );
  const { data: slotsData } = useQuery<CourseSlotsQueryData>(
    CLUB_COURSE_SLOTS,
    { errorPolicy: 'ignore' },
  );

  const summary = dashData?.adminDashboardSummary;

  const todaySlots = useMemo(() => {
    const slots = slotsData?.clubCourseSlots ?? [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return slots
      .filter((s) => {
        const t = new Date(s.startsAt);
        return t >= start && t < end;
      })
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      )
      .slice(0, 6);
  }, [slotsData]);

  const pieSlices = useMemo(() => {
    const groups = groupsData?.clubDynamicGroups ?? [];
    const total = groups.reduce(
      (s, g) => s + (g.matchingActiveMembersCount ?? 0),
      0,
    );
    if (total <= 0) return { total: 0, slices: [] as { name: string; pct: number }[] };
    return {
      total,
      slices: groups.map((g) => ({
        name: g.name,
        pct: Math.round(((g.matchingActiveMembersCount ?? 0) / total) * 100),
      })),
    };
  }, [groupsData]);

  const pieGradient = useMemo(() => {
    if (pieSlices.slices.length === 0) return 'conic-gradient(#e2e8f0 0% 100%)';
    let start = 0;
    const parts: string[] = [];
    pieSlices.slices.forEach((s, i) => {
      const end = start + s.pct;
      parts.push(`${PIE_COLORS[i % PIE_COLORS.length]} ${start}% ${end}%`);
      start = end;
    });
    return `conic-gradient(${parts.join(', ')})`;
  }, [pieSlices.slices]);

  const moduleCoveragePct = useMemo(() => {
    const n = MODULE_CATALOG.length;
    if (!n || summary?.activeModulesCount == null) return 0;
    return Math.min(
      100,
      Math.round((summary.activeModulesCount / n) * 100),
    );
  }, [summary]);

  /**
   * Recommandation UX #4 — Alerte certificats médicaux
   * Calcule le nombre de membres dont le certificat médical est expiré
   * ou expire dans les 30 prochains jours.
   */
  const medicalAlerts = useMemo(() => {
    const count = summary?.medicalCertExpiringSoonCount ?? 0;
    const expired = summary?.medicalCertExpiredCount ?? 0;
    return { expiring: count, expired };
  }, [summary]);

  const revenueEuro =
    summary?.revenueCentsMonth != null
      ? (summary.revenueCentsMonth / 100).toFixed(2)
      : '0,00';
  const openInvoices = summary?.outstandingPaymentsCount ?? 0;

  return (
    <div className="cf-dash">
      {showOnboarding ? (
        <div className="cf-onboarding-banner">
          <span className="material-symbols-outlined cf-onboarding-banner__ico">rocket_launch</span>
          <div className="cf-onboarding-banner__content">
            <strong>Bienvenue sur ClubFlow !</strong>
            <p>
              Commencez par activer les modules dont vous avez besoin (
              <Link to="/club-modules">page Modules du club</Link>
              ), puis créez vos premiers membres dans l'annuaire. Le planning et la
              facturation se débloqueront automatiquement.
            </p>
          </div>
          <button
            type="button"
            className="cf-onboarding-banner__dismiss"
            onClick={dismissOnboarding}
            aria-label="Masquer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      ) : null}

      {(medicalAlerts.expired > 0 || medicalAlerts.expiring > 0) ? (
        <div className="members-medical-alert">
          <span className="material-symbols-outlined">warning</span>
          {medicalAlerts.expired > 0 ? (
            <span>{medicalAlerts.expired} certificat(s) médical(aux) expiré(s)</span>
          ) : null}
          {medicalAlerts.expired > 0 && medicalAlerts.expiring > 0 ? ' — ' : null}
          {medicalAlerts.expiring > 0 ? (
            <span>{medicalAlerts.expiring} expire(nt) sous 30 jours</span>
          ) : null}
        </div>
      ) : null}

      <section className="cf-dash__welcome">
        <div className="cf-dash__welcome-row">
          <div>
            <h1 className="cf-dash__h1">
              Bonjour {greetName(email)},
            </h1>
            <p className="cf-dash__lede">
              Voici l’état de votre espace{' '}
              <span className="cf-dash__lede-strong">ClubFlow</span> aujourd’hui.
            </p>
          </div>
          <div className="cf-dash__quick-btns">
            <button
              type="button"
              className="cf-btn cf-btn--gradient"
              onClick={() => navigate('/members')}
            >
              <span className="material-symbols-outlined" aria-hidden>
                person_add
              </span>
              Inscrire un nouveau membre
            </button>
            <button
              type="button"
              className="cf-btn cf-btn--secondary"
              onClick={() => navigate('/planning')}
            >
              <span className="material-symbols-outlined" aria-hidden>
                add_circle
              </span>
              Créer un cours
            </button>
          </div>
        </div>
        <div className="cf-dash__shortcut-grid">
          <button
            type="button"
            className="cf-shortcut"
            disabled
            title="Bientôt"
          >
            <span className="material-symbols-outlined" aria-hidden>
              send
            </span>
            <span>Envoyer une communication</span>
          </button>
          <button
            type="button"
            className="cf-shortcut"
            disabled
            title="Bientôt"
          >
            <span className="material-symbols-outlined" aria-hidden>
              payments
            </span>
            <span>Enregistrer un paiement manuel</span>
          </button>
        </div>
      </section>

      <section className="cf-dash__kpi">
        <div className="cf-kpi-card">
          <div className="cf-kpi-card__head">
            <span className="cf-kpi-icon cf-kpi-icon--primary material-symbols-outlined" aria-hidden>
              group
            </span>
            <span className="cf-kpi-label">Membres</span>
          </div>
          {dashLoading ? (
            <p className="muted">Chargement…</p>
          ) : (
            <>
              <p className="cf-kpi-value">
                {summary?.activeMembersCount ?? '—'}
              </p>
              <p className="cf-kpi-caption">Total membres actifs</p>
              <div className="cf-kpi-hint">
                <span className="material-symbols-outlined" aria-hidden>
                  info
                </span>
                <p>
                  Certificats médicaux : suivi détaillé à brancher sur le
                  référentiel.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="cf-kpi-card">
          <div className="cf-kpi-card__head">
            <span className="cf-kpi-icon cf-kpi-icon--wallet material-symbols-outlined" aria-hidden>
              account_balance_wallet
            </span>
            <span className="cf-kpi-label">Finances</span>
          </div>
          <div className="cf-kpi-finance">
            <div className="cf-kpi-finance-row">
              <p className="cf-kpi-value cf-kpi-value--md">{revenueEuro} €</p>
              <span className="cf-kpi-tag">CA du mois</span>
            </div>
            <div className="cf-kpi-finance-row cf-kpi-finance-row--threat">
              <p className="cf-kpi-value--unpaid">{openInvoices}</p>
              <div className="cf-kpi-finance-meta">
                <span className="cf-kpi-tag">Factures ouvertes</span>
                <Link to="/members/families" className="cf-kpi-link">
                  Relancer
                </Link>
              </div>
            </div>
          </div>
          <div className="cf-kpi-divider">
            <span className="cf-kpi-caption">Séances à venir (planning)</span>
            <span className="cf-kpi-value--sm">
              {summary?.upcomingSessionsCount ?? 0}
            </span>
          </div>
        </div>

        <div className="cf-kpi-spotlight">
          <p className="cf-kpi-spotlight__eyebrow">Couverture modules</p>
          <p className="cf-kpi-spotlight__value">{moduleCoveragePct}%</p>
          <p className="cf-kpi-spotlight__sub">
            {summary?.activeModulesCount ?? 0} / {MODULE_CATALOG.length}{' '}
            briques actives
          </p>
          <div className="cf-kpi-spotlight__bars" aria-hidden>
            {[40, 60, 35, 80, 55, 100].map((h, i) => (
              <span
                key={i}
                className="cf-kpi-spotlight__bar"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="cf-dash__bento">
        <div className="cf-bento-card cf-bento-card--pie">
          <div className="cf-bento-head">
            <h3 className="cf-bento-title">Répartition des groupes</h3>
            <span className="material-symbols-outlined cf-bento-icon" aria-hidden>
              pie_chart
            </span>
          </div>
          <div className="cf-pie-wrap">
            <div
              className="cf-pie-ring"
              style={{ background: pieGradient }}
              aria-hidden
            />
            <div className="cf-pie-center">
              <span className="cf-pie-total">{pieSlices.total || '—'}</span>
              <span className="cf-pie-caption">Membres classés</span>
            </div>
          </div>
          {pieSlices.slices.length === 0 ? (
            <p className="muted cf-bento-empty">
              Aucun groupe dynamique ou effectifs vides — configurez-les dans
              Membres.
            </p>
          ) : (
            <ul className="cf-pie-legend">
              {pieSlices.slices.map((s, i) => (
                <li key={s.name} className="cf-pie-legend-row">
                  <span className="cf-pie-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span>{s.name}</span>
                  <span className="cf-pie-pct">{s.pct}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="cf-bento-card cf-bento-card--wide">
          <div className="cf-bento-head">
            <div>
              <h3 className="cf-bento-title">Encaissements récents</h3>
              <p className="cf-bento-sub">Agrégation multi-mois — MVP</p>
            </div>
            <div className="cf-bento-legend">
              <span>
                <span className="cf-legend-dot" style={{ background: '#000666' }} />
                CB
              </span>
              <span>
                <span className="cf-legend-dot" style={{ background: '#0056c5' }} />
                Virement
              </span>
              <span>
                <span className="cf-legend-dot" style={{ background: '#fb6b00' }} />
                Autres
              </span>
            </div>
          </div>
          <div className="cf-chart-placeholder">
            <div className="cf-chart-grid" aria-hidden />
            <div className="cf-chart-bars">
              {['OCT', 'NOV', 'DEC', 'JAN', 'FEV', 'MAR'].map((m, i) => (
                <div key={m} className="cf-chart-col">
                  <div className="cf-chart-stack">
                    <span className="cf-chart-seg cf-chart-seg--a" style={{ height: `${45 + i * 5}%` }} />
                    <span className="cf-chart-seg cf-chart-seg--b" style={{ height: `${20 - i}%` }} />
                    <span className="cf-chart-seg cf-chart-seg--c" style={{ height: `${10 + (i % 3) * 2}%` }} />
                  </div>
                  <span className="cf-chart-x">{m}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="cf-chart-footnote muted">
            Le détail par moyen de paiement sera relié aux rapports comptables.
          </p>
        </div>
      </section>

      <section className="cf-dash__lists">
        <div className="cf-list-block">
          <div className="cf-list-block__head">
            <h3 className="cf-list-block__title">Planning du jour</h3>
            <Link to="/planning" className="cf-list-block__link">
              Voir tout
            </Link>
          </div>
          {todaySlots.length === 0 ? (
            <p className="muted cf-list-empty">
              Aucun créneau aujourd’hui — ajoutez-en dans le planning.
            </p>
          ) : (
            <ul className="cf-agenda">
              {todaySlots.map((s) => (
                <li key={s.id}>
                  <Link to="/planning" className="cf-agenda-row">
                    <div className="cf-agenda-time">
                      {formatTime(s.startsAt)}
                    </div>
                    <div className="cf-agenda-body">
                      <p className="cf-agenda-title">{s.title}</p>
                      <p className="cf-agenda-meta">Créneau club</p>
                    </div>
                    <span className="material-symbols-outlined" aria-hidden>
                      chevron_right
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="cf-list-block">
          <h3 className="cf-list-block__title cf-list-block__title--plain">
            Événements à venir
          </h3>
          <div className="cf-event-card">
            <div className="cf-event-card__visual">
              <span className="cf-event-card__badge">À venir</span>
            </div>
            <div className="cf-event-card__body">
              <h4 className="cf-event-card__h">Stages &amp; compétitions</h4>
              <p className="muted cf-event-card__p">
                Module contenu public / événements — prochaine livraison
                (Phase H).
              </p>
              <button type="button" className="cf-event-card__btn" disabled>
                Gérer les inscriptions
              </button>
            </div>
          </div>
        </div>

        <div className="cf-list-block">
          <h3 className="cf-list-block__title cf-list-block__title--plain">
            Flux d’activité
          </h3>
          <div className="cf-activity">
            <div className="cf-activity-row">
              <span className="cf-activity-dot cf-activity-dot--blue" />
              <div>
                <p className="cf-activity-title">
                  Données temps réel à connecter
                </p>
                <p className="cf-activity-meta">
                  Inscriptions, paiements Stripe et campagnes apparaîtront ici.
                </p>
              </div>
            </div>
            <div className="cf-activity-row">
              <span className="cf-activity-dot cf-activity-dot--muted" />
              <div>
                <p className="cf-activity-title">
                  Webhooks &amp; journaux admin
                </p>
                <p className="cf-activity-meta">
                  Côté API : module communication et règles métier à étendre.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
