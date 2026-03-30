import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isClubModuleEnabled } from '../../lib/club-modules';
import {
  ACTIVE_CLUB_SEASON,
  CLUB_DYNAMIC_GROUPS,
  CLUB_MODULES,
  CLUB_SEASONS,
  CREATE_CLUB_SEASON,
  CREATE_MEMBERSHIP_PRODUCT,
  DELETE_MEMBERSHIP_PRODUCT,
  MEMBERSHIP_PRODUCTS,
  UPDATE_CLUB_SEASON,
  UPDATE_MEMBERSHIP_PRODUCT,
} from '../../lib/documents';
import type {
  ActiveClubSeasonQueryData,
  ClubModulesQueryData,
  ClubSeasonsQueryData,
  DynamicGroupsQueryData,
  MembershipProductsQueryData,
} from '../../lib/types';

export function AdhesionSettingsPage() {
  const { data: modData } = useQuery<ClubModulesQueryData>(CLUB_MODULES);
  const paymentOn = isClubModuleEnabled(modData?.clubModules, 'PAYMENT');
  const membersOn = isClubModuleEnabled(modData?.clubModules, 'MEMBERS');

  const { data: seasonData, refetch: refetchSeasons } =
    useQuery<ClubSeasonsQueryData>(CLUB_SEASONS, { skip: !paymentOn });
  const { data: activeSeasonData, refetch: refetchActive } =
    useQuery<ActiveClubSeasonQueryData>(ACTIVE_CLUB_SEASON, {
      skip: !paymentOn,
    });
  const { data: productsData, refetch: refetchProducts } =
    useQuery<MembershipProductsQueryData>(MEMBERSHIP_PRODUCTS, {
      skip: !paymentOn,
    });
  const { data: groupsData } = useQuery<DynamicGroupsQueryData>(
    CLUB_DYNAMIC_GROUPS,
    { skip: !paymentOn || !membersOn },
  );

  const [seasonMsg, setSeasonMsg] = useState<string | null>(null);
  const [productMsg, setProductMsg] = useState<string | null>(null);

  const [sLabel, setSLabel] = useState('');
  const [sStart, setSStart] = useState('');
  const [sEnd, setSEnd] = useState('');
  const [sSetActive, setSSetActive] = useState(true);

  const [editSeasonId, setEditSeasonId] = useState<string | null>(null);
  const [esLabel, setEsLabel] = useState('');
  const [esStart, setEsStart] = useState('');
  const [esEnd, setEsEnd] = useState('');
  const [esActive, setEsActive] = useState(false);

  const [pLabel, setPLabel] = useState('');
  const [pEuros, setPEuros] = useState('');
  const [pGroupId, setPGroupId] = useState('');
  const [pProrata, setPProrata] = useState(true);
  const [pFamily, setPFamily] = useState(true);
  const [pAid, setPAid] = useState(true);
  const [pEx, setPEx] = useState(true);
  const [pCap, setPCap] = useState('');

  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [epLabel, setEpLabel] = useState('');
  const [epEuros, setEpEuros] = useState('');
  const [epGroupId, setEpGroupId] = useState('');
  const [epProrata, setEpProrata] = useState(true);
  const [epFamily, setEpFamily] = useState(true);
  const [epAid, setEpAid] = useState(true);
  const [epEx, setEpEx] = useState(true);
  const [epCap, setEpCap] = useState('');

  const [createSeason, { loading: creatingSeason }] = useMutation(
    CREATE_CLUB_SEASON,
    {
      onCompleted: () => {
        setSLabel('');
        setSStart('');
        setSEnd('');
        setSSetActive(true);
        setSeasonMsg(null);
        void refetchSeasons();
        void refetchActive();
      },
      onError: (e) => setSeasonMsg(e.message),
    },
  );

  const [updateSeason, { loading: updatingSeason }] = useMutation(
    UPDATE_CLUB_SEASON,
    {
      onCompleted: () => {
        setEditSeasonId(null);
        setSeasonMsg(null);
        void refetchSeasons();
        void refetchActive();
      },
      onError: (e) => setSeasonMsg(e.message),
    },
  );

  const [createProduct, { loading: creatingProduct }] = useMutation(
    CREATE_MEMBERSHIP_PRODUCT,
    {
      onCompleted: () => {
        setPLabel('');
        setPEuros('');
        setPGroupId('');
        setProductMsg(null);
        void refetchProducts();
      },
      onError: (e) => setProductMsg(e.message),
    },
  );

  const [updateProduct, { loading: updatingProduct }] = useMutation(
    UPDATE_MEMBERSHIP_PRODUCT,
    {
      onCompleted: () => {
        setEditProductId(null);
        setProductMsg(null);
        void refetchProducts();
      },
      onError: (e) => setProductMsg(e.message),
    },
  );

  const [deleteProduct] = useMutation(DELETE_MEMBERSHIP_PRODUCT, {
    onCompleted: () => {
      setProductMsg(null);
      void refetchProducts();
    },
    onError: (e) => setProductMsg(e.message),
  });

  const seasons = seasonData?.clubSeasons ?? [];
  const products = productsData?.membershipProducts ?? [];
  const groups = groupsData?.clubDynamicGroups ?? [];
  const activeSeason = activeSeasonData?.activeClubSeason ?? null;

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  function eurosToCents(raw: string): number | null {
    const t = raw.trim().replace(',', '.');
    if (!t) return null;
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  function centsToEuros(c: number): string {
    return (c / 100).toFixed(2);
  }

  async function onCreateSeason(e: React.FormEvent) {
    e.preventDefault();
    setSeasonMsg(null);
    if (!sLabel.trim() || !sStart || !sEnd) {
      setSeasonMsg('Libellé et dates obligatoires.');
      return;
    }
    await createSeason({
      variables: {
        input: {
          label: sLabel.trim(),
          startsOn: sStart,
          endsOn: sEnd,
          setActive: sSetActive,
        },
      },
    });
  }

  function startEditSeason(row: ClubSeasonsQueryData['clubSeasons'][number]) {
    setEditSeasonId(row.id);
    setEsLabel(row.label);
    setEsStart(row.startsOn.slice(0, 10));
    setEsEnd(row.endsOn.slice(0, 10));
    setEsActive(row.isActive);
    setSeasonMsg(null);
  }

  async function onUpdateSeason(e: React.FormEvent) {
    e.preventDefault();
    if (!editSeasonId) return;
    setSeasonMsg(null);
    if (!esLabel.trim() || !esStart || !esEnd) {
      setSeasonMsg('Libellé et dates obligatoires.');
      return;
    }
    await updateSeason({
      variables: {
        input: {
          id: editSeasonId,
          label: esLabel.trim(),
          startsOn: esStart,
          endsOn: esEnd,
          isActive: esActive,
        },
      },
    });
  }

  async function onCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    setProductMsg(null);
    if (!pLabel.trim() || !pGroupId) {
      setProductMsg('Libellé et groupe obligatoires.');
      return;
    }
    const cents = eurosToCents(pEuros);
    if (cents == null) {
      setProductMsg('Montant invalide (ex. 120 ou 120,50).');
      return;
    }
    const capRaw = pCap.trim();
    const cap =
      capRaw === '' ? null : Number.parseInt(capRaw, 10);
    await createProduct({
      variables: {
        input: {
          label: pLabel.trim(),
          baseAmountCents: cents,
          dynamicGroupId: pGroupId,
          allowProrata: pProrata,
          allowFamily: pFamily,
          allowPublicAid: pAid,
          allowExceptional: pEx,
          exceptionalCapPercentBp:
            cap != null && Number.isFinite(cap) ? cap : null,
        },
      },
    });
  }

  function startEditProduct(
    row: MembershipProductsQueryData['membershipProducts'][number],
  ) {
    setEditProductId(row.id);
    setEpLabel(row.label);
    setEpEuros(centsToEuros(row.baseAmountCents));
    setEpGroupId(row.dynamicGroupId);
    setEpProrata(row.allowProrata);
    setEpFamily(row.allowFamily);
    setEpAid(row.allowPublicAid);
    setEpEx(row.allowExceptional);
    setEpCap(
      row.exceptionalCapPercentBp != null
        ? String(row.exceptionalCapPercentBp)
        : '',
    );
    setProductMsg(null);
  }

  async function onUpdateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!editProductId) return;
    setProductMsg(null);
    const cents = eurosToCents(epEuros);
    if (cents == null) {
      setProductMsg('Montant invalide.');
      return;
    }
    const capRaw = epCap.trim();
    const cap =
      capRaw === '' ? null : Number.parseInt(capRaw, 10);
    await updateProduct({
      variables: {
        input: {
          id: editProductId,
          label: epLabel.trim(),
          baseAmountCents: cents,
          dynamicGroupId: epGroupId,
          allowProrata: epProrata,
          allowFamily: epFamily,
          allowPublicAid: epAid,
          allowExceptional: epEx,
          exceptionalCapPercentBp:
            cap != null && Number.isFinite(cap) ? cap : null,
        },
      },
    });
  }

  async function onDeleteProduct(id: string, label: string) {
    setProductMsg(null);
    if (
      !window.confirm(
        `Supprimer définitivement la formule « ${label} » ? Les lignes de facture passées conserveront l’historique sans lien vers cette formule.`,
      )
    ) {
      return;
    }
    if (editProductId === id) {
      setEditProductId(null);
    }
    try {
      await deleteProduct({ variables: { id } });
    } catch {
      /* message via onError */
    }
  }

  if (!paymentOn) {
    return (
      <>
        <header className="members-loom__hero members-loom__hero--nested">
          <p className="members-loom__eyebrow">Paramètres · Adhésion</p>
          <h1 className="members-loom__title">Module paiement désactivé</h1>
          <p className="members-loom__lede">
            Les saisons et formules d’adhésion nécessitent le module « Paiement
            ».
          </p>
        </header>
        <p>
          <Link to="/#club-modules">Activer dans Modules du club</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Paramètres · Adhésion</p>
        <h1 className="members-loom__title">Saisons et formules</h1>
        <p className="members-loom__lede">
          Une saison active est requise pour émettre des cotisations. Les
          formules sont rattachées à un{' '}
          <Link to="/members/dynamic-groups">groupe dynamique</Link>.
        </p>
      </header>

      {!membersOn ? (
        <p className="form-error" role="status">
          Activez aussi le module « Membres » pour lier les formules aux groupes
          dynamiques.
        </p>
      ) : null}

      {!activeSeason ? (
        <p className="form-error" role="status">
          Aucune saison active : créez une saison ou activez-en une dans la
          liste.
        </p>
      ) : (
        <p className="muted">
          Saison active : <strong>{activeSeason.label}</strong> (
          {activeSeason.startsOn.slice(0, 10)} →{' '}
          {activeSeason.endsOn.slice(0, 10)})
        </p>
      )}

      <div className="members-manage">
        <section className="members-panel">
          <h2 className="members-panel__h">Saisons</h2>
          {seasonMsg ? <p className="form-error">{seasonMsg}</p> : null}
          <form className="members-form" onSubmit={(e) => void onCreateSeason(e)}>
            <div className="members-form--inline">
              <label className="field">
                <span>Libellé</span>
                <input
                  value={sLabel}
                  onChange={(e) => setSLabel(e.target.value)}
                  placeholder="2025-2026"
                />
              </label>
              <label className="field">
                <span>Début</span>
                <input
                  type="date"
                  value={sStart}
                  onChange={(e) => setSStart(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Fin</span>
                <input
                  type="date"
                  value={sEnd}
                  onChange={(e) => setSEnd(e.target.value)}
                />
              </label>
              <label className="members-checkbox">
                <input
                  type="checkbox"
                  checked={sSetActive}
                  onChange={(e) => setSSetActive(e.target.checked)}
                />
                <span>Définir comme saison active</span>
              </label>
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={creatingSeason}
            >
              {creatingSeason ? '…' : 'Créer la saison'}
            </button>
          </form>

          {seasons.length === 0 ? (
            <p className="muted">Aucune saison enregistrée.</p>
          ) : (
            <div className="members-table-wrap" style={{ marginTop: '1rem' }}>
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Libellé</th>
                    <th>Dates</th>
                    <th>Active</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((s) =>
                    editSeasonId === s.id ? (
                      <tr key={s.id}>
                        <td colSpan={4}>
                          <form
                            className="members-form"
                            onSubmit={(e) => void onUpdateSeason(e)}
                          >
                            <div className="members-form--inline">
                              <label className="field">
                                <span>Libellé</span>
                                <input
                                  value={esLabel}
                                  onChange={(e) => setEsLabel(e.target.value)}
                                />
                              </label>
                              <label className="field">
                                <span>Début</span>
                                <input
                                  type="date"
                                  value={esStart}
                                  onChange={(e) => setEsStart(e.target.value)}
                                />
                              </label>
                              <label className="field">
                                <span>Fin</span>
                                <input
                                  type="date"
                                  value={esEnd}
                                  onChange={(e) => setEsEnd(e.target.value)}
                                />
                              </label>
                              <label className="members-checkbox">
                                <input
                                  type="checkbox"
                                  checked={esActive}
                                  onChange={(e) => setEsActive(e.target.checked)}
                                />
                                <span>Active</span>
                              </label>
                            </div>
                            <button
                              type="submit"
                              className="btn btn-primary"
                              disabled={updatingSeason}
                            >
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => setEditSeasonId(null)}
                            >
                              Fermer
                            </button>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr key={s.id}>
                        <td>{s.label}</td>
                        <td>
                          {s.startsOn.slice(0, 10)} → {s.endsOn.slice(0, 10)}
                        </td>
                        <td>{s.isActive ? 'Oui' : 'Non'}</td>
                        <td className="members-table__actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight"
                            onClick={() => startEditSeason(s)}
                          >
                            Modifier
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="members-panel">
          <h2 className="members-panel__h">Formules d’adhésion</h2>
          {groups.length === 0 ? (
            <p className="form-error">
              Créez au moins un{' '}
              <Link to="/members/dynamic-groups">groupe dynamique</Link> avant
              une formule.
            </p>
          ) : null}
          {productMsg ? <p className="form-error">{productMsg}</p> : null}
          <form className="members-form" onSubmit={(e) => void onCreateProduct(e)}>
            <div className="members-form--inline">
              <label className="field">
                <span>Libellé</span>
                <input
                  value={pLabel}
                  onChange={(e) => setPLabel(e.target.value)}
                  placeholder="Cotisation enfant"
                />
              </label>
              <label className="field">
                <span>Montant (€)</span>
                <input
                  value={pEuros}
                  onChange={(e) => setPEuros(e.target.value)}
                  placeholder="120"
                />
              </label>
              <label className="field">
                <span>Groupe tarifaire</span>
                <select
                  value={pGroupId}
                  onChange={(e) => setPGroupId(e.target.value)}
                >
                  <option value="">—</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="members-form__fieldset">
              <span className="members-form__legend">Options</span>
              <div className="members-checkbox-grid">
                <label className="members-checkbox">
                  <input
                    type="checkbox"
                    checked={pProrata}
                    onChange={(e) => setPProrata(e.target.checked)}
                  />
                  <span>Prorata</span>
                </label>
                <label className="members-checkbox">
                  <input
                    type="checkbox"
                    checked={pFamily}
                    onChange={(e) => setPFamily(e.target.checked)}
                  />
                  <span>Remise famille</span>
                </label>
                <label className="members-checkbox">
                  <input
                    type="checkbox"
                    checked={pAid}
                    onChange={(e) => setPAid(e.target.checked)}
                  />
                  <span>Aide publique</span>
                </label>
                <label className="members-checkbox">
                  <input
                    type="checkbox"
                    checked={pEx}
                    onChange={(e) => setPEx(e.target.checked)}
                  />
                  <span>Remise exceptionnelle</span>
                </label>
              </div>
              <label className="field">
                <span>Plafond remise exceptionnelle (bp, optionnel)</span>
                <input
                  value={pCap}
                  onChange={(e) => setPCap(e.target.value)}
                  placeholder="ex. 3000 pour 30%"
                />
              </label>
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={creatingProduct || groups.length === 0}
            >
              {creatingProduct ? '…' : 'Créer la formule'}
            </button>
          </form>

          {products.length === 0 ? (
            <p className="muted">Aucune formule.</p>
          ) : (
            <div className="members-table-wrap" style={{ marginTop: '1rem' }}>
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Libellé</th>
                    <th>Montant</th>
                    <th>Groupe</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) =>
                    editProductId === p.id ? (
                      <tr key={p.id}>
                        <td colSpan={4}>
                          <form
                            className="members-form"
                            onSubmit={(e) => void onUpdateProduct(e)}
                          >
                            <div className="members-form--inline">
                              <label className="field">
                                <span>Libellé</span>
                                <input
                                  value={epLabel}
                                  onChange={(e) => setEpLabel(e.target.value)}
                                />
                              </label>
                              <label className="field">
                                <span>Montant (€)</span>
                                <input
                                  value={epEuros}
                                  onChange={(e) => setEpEuros(e.target.value)}
                                />
                              </label>
                              <label className="field">
                                <span>Groupe</span>
                                <select
                                  value={epGroupId}
                                  onChange={(e) => setEpGroupId(e.target.value)}
                                >
                                  {groups.map((g) => (
                                    <option key={g.id} value={g.id}>
                                      {g.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <div className="members-checkbox-grid">
                              <label className="members-checkbox">
                                <input
                                  type="checkbox"
                                  checked={epProrata}
                                  onChange={(e) =>
                                    setEpProrata(e.target.checked)
                                  }
                                />
                                <span>Prorata</span>
                              </label>
                              <label className="members-checkbox">
                                <input
                                  type="checkbox"
                                  checked={epFamily}
                                  onChange={(e) =>
                                    setEpFamily(e.target.checked)
                                  }
                                />
                                <span>Famille</span>
                              </label>
                              <label className="members-checkbox">
                                <input
                                  type="checkbox"
                                  checked={epAid}
                                  onChange={(e) => setEpAid(e.target.checked)}
                                />
                                <span>Aide publique</span>
                              </label>
                              <label className="members-checkbox">
                                <input
                                  type="checkbox"
                                  checked={epEx}
                                  onChange={(e) => setEpEx(e.target.checked)}
                                />
                                <span>Exceptionnelle</span>
                              </label>
                            </div>
                            <label className="field">
                              <span>Plafond exceptionnelle (bp)</span>
                              <input
                                value={epCap}
                                onChange={(e) => setEpCap(e.target.value)}
                              />
                            </label>
                            <button
                              type="submit"
                              className="btn btn-primary"
                              disabled={updatingProduct}
                            >
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => setEditProductId(null)}
                            >
                              Fermer
                            </button>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.id}>
                        <td>{p.label}</td>
                        <td>{centsToEuros(p.baseAmountCents)} €</td>
                        <td>
                          {groupById.get(p.dynamicGroupId)?.name ??
                            p.dynamicGroupId}
                        </td>
                        <td className="members-table__actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight"
                            onClick={() => startEditProduct(p)}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight members-table__danger"
                            onClick={() => void onDeleteProduct(p.id, p.label)}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="members-form__hint muted" style={{ marginTop: '0.75rem' }}>
            La suppression retire la formule des choix pour les nouvelles
            cotisations. Elle ne supprime pas les factures déjà créées.
          </p>
        </section>
      </div>
    </>
  );
}
