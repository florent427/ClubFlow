import { useQuery, useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import {
  DASHBOARD_SUMMARY,
  CLUB_MODULES,
  SET_MODULE,
} from '../lib/documents';
import { MODULE_CATALOG, type ModuleCodeStr } from '../lib/module-catalog';
import type { ClubModulesQueryData, DashboardQueryData } from '../lib/types';
import { apolloClient } from '../lib/apollo';
import { clearSession, getToken } from '../lib/storage';

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

export function DashboardPage() {
  const navigate = useNavigate();
  const [toggleError, setToggleError] = useState<string | null>(null);

  const token = getToken();
  const emailHint = token ? decodeJwtEmail(token) : null;

  const { data: dashData, loading: dashLoading } =
    useQuery<DashboardQueryData>(DASHBOARD_SUMMARY);
  const { data: modData, refetch: refetchModules } =
    useQuery<ClubModulesQueryData>(CLUB_MODULES);
  const [setModule, { loading: mutating }] = useMutation(SET_MODULE);

  const rows = useMemo(() => {
    const map = new Map<ModuleCodeStr, boolean>();
    for (const m of modData?.clubModules ?? []) {
      map.set(m.moduleCode as ModuleCodeStr, m.enabled);
    }
    return MODULE_CATALOG.map((def) => ({
      ...def,
      enabled: map.get(def.code) ?? false,
    }));
  }, [modData]);

  function logout() {
    clearSession();
    void apolloClient.clearStore();
    void navigate('/login', { replace: true });
  }

  const summary = dashData?.adminDashboardSummary;

  async function onToggle(code: ModuleCodeStr, enabled: boolean) {
    setToggleError(null);
    try {
      await setModule({ variables: { code, enabled } });
      await refetchModules();
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Action impossible (dépendances ou droits).';
      setToggleError(msg);
    }
  }

  return (
    <div className="dashboard">
      <header className="dash-topbar">
        <div className="dash-brand">
          <span className="dash-logo">ClubFlow</span>
          <span className="dash-tag">Administration</span>
        </div>
        <div className="dash-actions">
          {emailHint ? (
            <span className="dash-user" title={emailHint}>
              {emailHint}
            </span>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={() => logout()}>
            Déconnexion
          </button>
        </div>
      </header>

      <main className="dash-main">
        <section className="dash-section">
          <h2 className="dash-section-title">Tableau de bord</h2>
          <p className="dash-section-desc">
            Synthèse alignée sur le socle back-end (membres actifs, modules
            activés ; indicateurs planning / paiement en attente de modules
            métier).
          </p>
          {dashLoading ? (
            <p className="muted">Chargement…</p>
          ) : (
            <div className="stat-grid">
              <article className="stat-card stat-card--accent">
                <h3>Membres actifs</h3>
                <p className="stat-value">
                  {summary?.activeMembersCount ?? '—'}
                </p>
                <p className="stat-caption">Adhésions rattachées au club</p>
              </article>
              <article className="stat-card">
                <h3>Modules activés</h3>
                <p className="stat-value stat-value--blue">
                  {summary?.activeModulesCount ?? '—'}
                </p>
                <p className="stat-caption">Modules marqués comme actifs</p>
              </article>
              <article className="stat-card">
                <h3>Séances à venir</h3>
                <p className="stat-value">{summary?.upcomingSessionsCount ?? 0}</p>
                <p className="stat-caption">Planning (bientôt)</p>
              </article>
              <article className="stat-card">
                <h3>Paiements en attente</h3>
                <p className="stat-value">
                  {summary?.outstandingPaymentsCount ?? 0}
                </p>
                <p className="stat-caption">Module paiement (bientôt)</p>
              </article>
              <article className="stat-card">
                <h3>Revenus du mois</h3>
                <p className="stat-value">
                  {summary?.revenueCentsMonth != null
                    ? `${(summary.revenueCentsMonth / 100).toFixed(2)} €`
                    : '0 €'}
                </p>
                <p className="stat-caption">Centimes → euros (stub)</p>
              </article>
            </div>
          )}
        </section>

        <section className="dash-section">
          <h2 className="dash-section-title">Modules du club</h2>
          <p className="dash-section-desc">
            Activez ou désactivez les briques (respect des dépendances côté API).
            Le module <strong>Membres</strong> reste obligatoire.
          </p>
          {toggleError ? <p className="form-error">{toggleError}</p> : null}
          <ul className="module-list">
            {rows.map((row) => (
              <li key={row.code} className="module-row">
                <div className="module-info">
                  <span className="module-name">{row.label}</span>
                  <span className="module-code">{row.code}</span>
                  {row.required ? (
                    <span className="badge badge-required">Obligatoire</span>
                  ) : null}
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    disabled={mutating || (row.required && row.enabled)}
                    onChange={(e) => void onToggle(row.code, e.target.checked)}
                  />
                  <span className="toggle-ui" aria-hidden />
                </label>
              </li>
            ))}
          </ul>
          {rows.some((r) => r.required) ? (
            <p className="muted module-footnote">
              Le module Membres est toujours actif ; la case reste verrouillée
              (MVP API).
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
