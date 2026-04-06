import { useMutation } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { CLUB_MODULES, SET_MODULE } from '../lib/documents';
import { useClubModules } from '../lib/club-modules-context';
import { MODULE_CATALOG, type ModuleCodeStr } from '../lib/module-catalog';

export function ClubModulesPage() {
  const [toggleError, setToggleError] = useState<string | null>(null);
  const { clubModules } = useClubModules();
  const [setModule, { loading: mutating }] = useMutation(SET_MODULE, {
    refetchQueries: [{ query: CLUB_MODULES }],
    awaitRefetchQueries: true,
  });

  const rows = useMemo(() => {
    const map = new Map<ModuleCodeStr, boolean>();
    for (const m of clubModules ?? []) {
      map.set(m.moduleCode as ModuleCodeStr, m.enabled);
    }
    return MODULE_CATALOG.map((def) => ({
      ...def,
      enabled: map.get(def.code) ?? false,
    }));
  }, [clubModules]);

  async function onToggle(code: ModuleCodeStr, enabled: boolean) {
    setToggleError(null);
    try {
      await setModule({ variables: { code, enabled } });
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Action impossible (dépendances ou droits).';
      setToggleError(msg);
    }
  }

  return (
    <div className="cf-dash">
      <section className="cf-dash-modules cf-dash-modules--page">
        <h1 className="cf-dash-modules__title">Modules du club</h1>
        <p className="cf-dash-modules__desc">
          Activez ou désactivez les briques (dépendances côté API).{' '}
          <strong>Membres</strong> et <strong>Familles &amp; payeurs</strong>{' '}
          sont obligatoires et liés (sous-menu dans Gestion des membres).
        </p>
        {toggleError ? <p className="form-error">{toggleError}</p> : null}
        <ul className="cf-module-grid">
          {rows.map((row) => (
            <li key={row.code} className="cf-module-tile">
              <div className="cf-module-tile__info">
                <span className="cf-module-tile__name">{row.label}</span>
                <span className="cf-module-tile__code">{row.code}</span>
                {row.required ? (
                  <span className="cf-module-tile__badge">Obligatoire</span>
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
      </section>
    </div>
  );
}
