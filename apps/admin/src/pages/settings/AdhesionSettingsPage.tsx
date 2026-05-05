import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ACTIVE_CLUB_SEASON,
  CLUB_GRADE_LEVELS,
  CLUB_SEASONS,
  CREATE_CLUB_SEASON,
  ARCHIVE_MEMBERSHIP_ONE_TIME_FEE,
  CREATE_MEMBERSHIP_ONE_TIME_FEE,
  CREATE_MEMBERSHIP_PRODUCT,
  DELETE_MEMBERSHIP_ONE_TIME_FEE,
  DELETE_MEMBERSHIP_PRODUCT,
  MEMBERSHIP_ONE_TIME_FEES,
  MEMBERSHIP_PRODUCTS,
  UPDATE_CLUB_SEASON,
  UPDATE_MEMBERSHIP_ONE_TIME_FEE,
  UPDATE_MEMBERSHIP_PRODUCT,
} from '../../lib/documents';
import type {
  ActiveClubSeasonQueryData,
  ClubSeasonsQueryData,
  GradeLevelsQueryData,
  MembershipOneTimeFeesQueryData,
  MembershipProductsQueryData,
} from '../../lib/types';
import { useClubModules } from '../../lib/club-modules-context';

export function AdhesionSettingsPage() {
  const { isEnabled } = useClubModules();
  const paymentOn = isEnabled('PAYMENT');
  const membersOn = isEnabled('MEMBERS');

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
  const { data: feesData, refetch: refetchFees } =
    useQuery<MembershipOneTimeFeesQueryData>(MEMBERSHIP_ONE_TIME_FEES, {
      skip: !paymentOn,
    });
  const { data: gradesData } = useQuery<GradeLevelsQueryData>(CLUB_GRADE_LEVELS, {
    skip: !paymentOn || !membersOn,
  });

  const [seasonMsg, setSeasonMsg] = useState<string | null>(null);
  const [productMsg, setProductMsg] = useState<string | null>(null);
  const [feeMsg, setFeeMsg] = useState<string | null>(null);

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
  const [pAnnualEuros, setPAnnualEuros] = useState('');
  const [pMonthlyEuros, setPMonthlyEuros] = useState('');
  const [pMinAge, setPMinAge] = useState('');
  const [pMaxAge, setPMaxAge] = useState('');
  const [pGradeIds, setPGradeIds] = useState<string[]>([]);
  const [pProrata, setPProrata] = useState(true);
  const [pFamily, setPFamily] = useState(true);
  const [pAid, setPAid] = useState(true);
  const [pEx, setPEx] = useState(true);
  const [pCap, setPCap] = useState('');

  const [fLabel, setFLabel] = useState('');
  const [fEuros, setFEuros] = useState('');
  // Création fee : kind par défaut OPTIONAL (le cas le plus courant et
  // le moins surprenant ; admin doit cocher LICENSE/MANDATORY pour
  // changer). Si LICENSE : pattern + hint deviennent disponibles.
  const [fKind, setFKind] = useState<'LICENSE' | 'MANDATORY' | 'OPTIONAL'>(
    'OPTIONAL',
  );
  const [fAutoApply, setFAutoApply] = useState(false);
  const [fLicensePattern, setFLicensePattern] = useState('');
  const [fLicenseHint, setFLicenseHint] = useState('');

  const [editFeeId, setEditFeeId] = useState<string | null>(null);
  const [efLabel, setEfLabel] = useState('');
  const [efEuros, setEfEuros] = useState('');
  const [efKind, setEfKind] = useState<'LICENSE' | 'MANDATORY' | 'OPTIONAL'>(
    'OPTIONAL',
  );
  const [efAutoApply, setEfAutoApply] = useState(false);
  const [efLicensePattern, setEfLicensePattern] = useState('');
  const [efLicenseHint, setEfLicenseHint] = useState('');

  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [epLabel, setEpLabel] = useState('');
  const [epAnnualEuros, setEpAnnualEuros] = useState('');
  const [epMonthlyEuros, setEpMonthlyEuros] = useState('');
  const [epMinAge, setEpMinAge] = useState('');
  const [epMaxAge, setEpMaxAge] = useState('');
  const [epGradeIds, setEpGradeIds] = useState<string[]>([]);
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
        setPAnnualEuros('');
        setPMonthlyEuros('');
        setPMinAge('');
        setPMaxAge('');
        setPGradeIds([]);
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

  const [createFee, { loading: creatingFee }] = useMutation(
    CREATE_MEMBERSHIP_ONE_TIME_FEE,
    {
      onCompleted: () => {
        setFLabel('');
        setFEuros('');
        setFKind('OPTIONAL');
        setFAutoApply(false);
        setFLicensePattern('');
        setFLicenseHint('');
        setFeeMsg(null);
        void refetchFees();
      },
      onError: (e) => setFeeMsg(e.message),
    },
  );

  const [updateFee, { loading: updatingFee }] = useMutation(
    UPDATE_MEMBERSHIP_ONE_TIME_FEE,
    {
      onCompleted: () => {
        setEditFeeId(null);
        setFeeMsg(null);
        void refetchFees();
      },
      onError: (e) => setFeeMsg(e.message),
    },
  );

  const [archiveFee] = useMutation(ARCHIVE_MEMBERSHIP_ONE_TIME_FEE, {
    onCompleted: () => {
      setFeeMsg(null);
      void refetchFees();
    },
    onError: (e) => setFeeMsg(e.message),
  });

  const [deleteFee] = useMutation(DELETE_MEMBERSHIP_ONE_TIME_FEE, {
    onCompleted: () => {
      setFeeMsg(null);
      void refetchFees();
    },
    onError: (e) => setFeeMsg(e.message),
  });

  const seasons = seasonData?.clubSeasons ?? [];
  const products = productsData?.membershipProducts ?? [];
  const oneTimeFees = feesData?.membershipOneTimeFees ?? [];
  const gradeLevels = gradesData?.clubGradeLevels ?? [];
  const activeSeason = activeSeasonData?.activeClubSeason ?? null;

  function toggleGradeSelection(
    id: string,
    current: string[],
    setIds: (v: string[]) => void,
  ) {
    setIds(
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  function parseOptionalAge(raw: string): number | null {
    const t = raw.trim();
    if (!t) return null;
    const n = Number.parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  }

  function productCriteriaLabel(
    p: MembershipProductsQueryData['membershipProducts'][number],
  ): string {
    const parts: string[] = [];
    if (p.minAge != null || p.maxAge != null) {
      parts.push(`âge ${p.minAge ?? '—'}–${p.maxAge ?? '—'}`);
    }
    if (p.gradeLevelIds.length > 0) {
      parts.push(`${p.gradeLevelIds.length} grade(s)`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'Tous';
  }

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
    if (!pLabel.trim()) {
      setProductMsg('Libellé obligatoire.');
      return;
    }
    const annual = eurosToCents(pAnnualEuros);
    const monthly = eurosToCents(pMonthlyEuros);
    if (annual == null || monthly == null) {
      setProductMsg('Tarif annuel et mensuel invalides (ex. 120 ou 120,50).');
      return;
    }
    const capRaw = pCap.trim();
    const cap =
      capRaw === '' ? null : Number.parseInt(capRaw, 10);
    const minA = parseOptionalAge(pMinAge);
    const maxA = parseOptionalAge(pMaxAge);
    await createProduct({
      variables: {
        input: {
          label: pLabel.trim(),
          annualAmountCents: annual,
          monthlyAmountCents: monthly,
          minAge: minA,
          maxAge: maxA,
          gradeLevelIds: pGradeIds.length > 0 ? pGradeIds : undefined,
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
    setEpAnnualEuros(centsToEuros(row.annualAmountCents));
    setEpMonthlyEuros(centsToEuros(row.monthlyAmountCents));
    setEpMinAge(
      row.minAge != null && Number.isFinite(row.minAge)
        ? String(row.minAge)
        : '',
    );
    setEpMaxAge(
      row.maxAge != null && Number.isFinite(row.maxAge)
        ? String(row.maxAge)
        : '',
    );
    setEpGradeIds([...row.gradeLevelIds]);
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
    const annual = eurosToCents(epAnnualEuros);
    const monthly = eurosToCents(epMonthlyEuros);
    if (annual == null || monthly == null) {
      setProductMsg('Tarifs invalides.');
      return;
    }
    const capRaw = epCap.trim();
    const cap =
      capRaw === '' ? null : Number.parseInt(capRaw, 10);
    const minA = parseOptionalAge(epMinAge);
    const maxA = parseOptionalAge(epMaxAge);
    await updateProduct({
      variables: {
        input: {
          id: editProductId,
          label: epLabel.trim(),
          annualAmountCents: annual,
          monthlyAmountCents: monthly,
          minAge: minA,
          maxAge: maxA,
          gradeLevelIds: epGradeIds,
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

  async function onCreateFee(e: React.FormEvent) {
    e.preventDefault();
    setFeeMsg(null);
    if (!fLabel.trim()) {
      setFeeMsg('Libellé obligatoire.');
      return;
    }
    const cents = eurosToCents(fEuros);
    if (cents == null) {
      setFeeMsg('Montant invalide.');
      return;
    }
    if (fKind === 'LICENSE' && fLicensePattern.trim()) {
      try {
        // Validation côté client = feedback immédiat ; serveur revérifie.
        new RegExp(fLicensePattern.trim());
      } catch (err) {
        setFeeMsg(
          `Regex invalide : ${err instanceof Error ? err.message : 'erreur'}.`,
        );
        return;
      }
    }
    await createFee({
      variables: {
        input: {
          label: fLabel.trim(),
          amountCents: cents,
          kind: fKind,
          autoApply: fKind === 'OPTIONAL' ? fAutoApply : true,
          licenseNumberPattern:
            fKind === 'LICENSE' ? fLicensePattern.trim() || null : null,
          licenseNumberFormatHint:
            fKind === 'LICENSE' ? fLicenseHint.trim() || null : null,
        },
      },
    });
  }

  function startEditFee(row: MembershipOneTimeFeesQueryData['membershipOneTimeFees'][number]) {
    setEditFeeId(row.id);
    setEfLabel(row.label);
    setEfEuros(centsToEuros(row.amountCents));
    setEfKind(row.kind);
    setEfAutoApply(row.autoApply);
    setEfLicensePattern(row.licenseNumberPattern ?? '');
    setEfLicenseHint(row.licenseNumberFormatHint ?? '');
    setFeeMsg(null);
  }

  async function onUpdateFee(e: React.FormEvent) {
    e.preventDefault();
    if (!editFeeId) return;
    setFeeMsg(null);
    const cents = eurosToCents(efEuros);
    if (cents == null) {
      setFeeMsg('Montant invalide.');
      return;
    }
    if (efKind === 'LICENSE' && efLicensePattern.trim()) {
      try {
        new RegExp(efLicensePattern.trim());
      } catch (err) {
        setFeeMsg(
          `Regex invalide : ${err instanceof Error ? err.message : 'erreur'}.`,
        );
        return;
      }
    }
    await updateFee({
      variables: {
        input: {
          id: editFeeId,
          label: efLabel.trim(),
          amountCents: cents,
          kind: efKind,
          autoApply: efKind === 'OPTIONAL' ? efAutoApply : true,
          licenseNumberPattern:
            efKind === 'LICENSE' ? efLicensePattern.trim() || null : null,
          licenseNumberFormatHint:
            efKind === 'LICENSE' ? efLicenseHint.trim() || null : null,
        },
      },
    });
  }

  async function onArchiveFee(id: string, label: string) {
    setFeeMsg(null);
    if (
      !window.confirm(
        `Archiver le frais « ${label} » ? Il ne sera plus proposé sur les nouvelles cotisations.`,
      )
    ) {
      return;
    }
    if (editFeeId === id) {
      setEditFeeId(null);
    }
    try {
      await archiveFee({ variables: { id } });
    } catch {
      /* onError */
    }
  }

  async function onDeleteFee(id: string, label: string) {
    setFeeMsg(null);
    if (
      !window.confirm(
        `Supprimer définitivement « ${label} » ? Possible seulement si aucune facture ouverte ou payée ne l’utilise.`,
      )
    ) {
      return;
    }
    if (editFeeId === id) {
      setEditFeeId(null);
    }
    try {
      await deleteFee({ variables: { id } });
    } catch {
      /* onError */
    }
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
          <Link to="/club-modules">Activer dans Modules du club</Link>
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
          Une saison active est requise pour émettre des cotisations. Chaque
          formule définit des tarifs annuel et mensuel et, optionnellement, des
          critères d’éligibilité (âge, grades). Les{' '}
          <Link to="/members/dynamic-groups">groupes dynamiques</Link> servent à
          l’affectation membre (planning, communication), pas au tarif.
        </p>
      </header>

      {!membersOn ? (
        <div className="cf-alert cf-alert--warning" role="status">
          <span className="material-symbols-outlined" aria-hidden>
            info
          </span>
          <div className="cf-alert__content">
            <strong>Module Membres désactivé</strong>
            <span>
              Activez-le pour utiliser les grades sur les formules d’adhésion.
            </span>
          </div>
        </div>
      ) : null}

      {!activeSeason ? (
        <div className="cf-alert cf-alert--danger" role="status">
          <span className="material-symbols-outlined" aria-hidden>
            warning
          </span>
          <div className="cf-alert__content">
            <strong>Aucune saison active</strong>
            <span>
              Créez une saison ou activez-en une dans la liste pour émettre
              des cotisations.
            </span>
          </div>
        </div>
      ) : (
        <div className="cf-alert cf-alert--info" role="status">
          <span className="material-symbols-outlined" aria-hidden>
            event_available
          </span>
          <div className="cf-alert__content">
            <strong>Saison active : {activeSeason.label}</strong>
            <span>
              Du {activeSeason.startsOn.slice(0, 10)} au{' '}
              {activeSeason.endsOn.slice(0, 10)}
            </span>
          </div>
        </div>
      )}

      <div className="members-manage">
        <section className="members-panel">
          <h2 className="members-panel__h">
            <span className="material-symbols-outlined" aria-hidden>
              calendar_month
            </span>
            Saisons
          </h2>
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
          <h2 className="members-panel__h">
            <span className="material-symbols-outlined" aria-hidden>
              card_membership
            </span>
            Formules d’adhésion
          </h2>
          {!membersOn ? (
            <p className="form-error">
              Activez le module « Membres » pour gérer les grades utilisés comme
              critères optionnels.
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
                <span>Tarif annuel (€)</span>
                <input
                  value={pAnnualEuros}
                  onChange={(e) => setPAnnualEuros(e.target.value)}
                  placeholder="150"
                />
              </label>
              <label className="field">
                <span>Tarif mensuel (€)</span>
                <input
                  value={pMonthlyEuros}
                  onChange={(e) => setPMonthlyEuros(e.target.value)}
                  placeholder="15"
                />
              </label>
            </div>
            <div className="members-form--inline">
              <label className="field">
                <span>Âge min (optionnel)</span>
                <input
                  value={pMinAge}
                  onChange={(e) => setPMinAge(e.target.value)}
                  placeholder="ex. 6"
                />
              </label>
              <label className="field">
                <span>Âge max (optionnel)</span>
                <input
                  value={pMaxAge}
                  onChange={(e) => setPMaxAge(e.target.value)}
                  placeholder="ex. 17"
                />
              </label>
            </div>
            {gradeLevels.length > 0 ? (
              <div className="members-form__fieldset">
                <span className="members-form__legend">
                  Grades éligibles (optionnel, vide = tous)
                </span>
                <div className="members-checkbox-grid">
                  {gradeLevels.map((gl) => (
                    <label key={gl.id} className="members-checkbox">
                      <input
                        type="checkbox"
                        checked={pGradeIds.includes(gl.id)}
                        onChange={() =>
                          toggleGradeSelection(gl.id, pGradeIds, setPGradeIds)
                        }
                      />
                      <span>{gl.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
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
              disabled={creatingProduct}
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
                    <th>Annuel</th>
                    <th>Mensuel</th>
                    <th>Critères</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) =>
                    editProductId === p.id ? (
                      <tr key={p.id}>
                        <td colSpan={5}>
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
                                <span>Tarif annuel (€)</span>
                                <input
                                  value={epAnnualEuros}
                                  onChange={(e) =>
                                    setEpAnnualEuros(e.target.value)
                                  }
                                />
                              </label>
                              <label className="field">
                                <span>Tarif mensuel (€)</span>
                                <input
                                  value={epMonthlyEuros}
                                  onChange={(e) =>
                                    setEpMonthlyEuros(e.target.value)
                                  }
                                />
                              </label>
                            </div>
                            <div className="members-form--inline">
                              <label className="field">
                                <span>Âge min</span>
                                <input
                                  value={epMinAge}
                                  onChange={(e) => setEpMinAge(e.target.value)}
                                />
                              </label>
                              <label className="field">
                                <span>Âge max</span>
                                <input
                                  value={epMaxAge}
                                  onChange={(e) => setEpMaxAge(e.target.value)}
                                />
                              </label>
                            </div>
                            {gradeLevels.length > 0 ? (
                              <div className="members-checkbox-grid">
                                {gradeLevels.map((gl) => (
                                  <label key={gl.id} className="members-checkbox">
                                    <input
                                      type="checkbox"
                                      checked={epGradeIds.includes(gl.id)}
                                      onChange={() =>
                                        toggleGradeSelection(
                                          gl.id,
                                          epGradeIds,
                                          setEpGradeIds,
                                        )
                                      }
                                    />
                                    <span>{gl.label}</span>
                                  </label>
                                ))}
                              </div>
                            ) : null}
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
                        <td>{centsToEuros(p.annualAmountCents)} €</td>
                        <td>{centsToEuros(p.monthlyAmountCents)} €</td>
                        <td>{productCriteriaLabel(p)}</td>
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

        <section className="members-panel">
          <h2 className="members-panel__h">Frais uniques (catalogue)</h2>
          <p className="muted">
            Ajoutez des montants forfaitaires (licence fédérale, équipement…)
            sélectionnables sur la fiche membre avec la cotisation.
          </p>
          {feeMsg ? <p className="form-error">{feeMsg}</p> : null}
          <form className="members-form" onSubmit={(e) => void onCreateFee(e)}>
            <div className="members-form--inline">
              <label className="field">
                <span>Libellé</span>
                <input
                  value={fLabel}
                  onChange={(e) => setFLabel(e.target.value)}
                  placeholder="Licence FFKDA"
                />
              </label>
              <label className="field">
                <span>Montant (€)</span>
                <input
                  value={fEuros}
                  onChange={(e) => setFEuros(e.target.value)}
                  placeholder="25"
                />
              </label>
              <label className="field">
                <span>Type</span>
                <select
                  value={fKind}
                  onChange={(e) =>
                    setFKind(
                      e.target.value as 'LICENSE' | 'MANDATORY' | 'OPTIONAL',
                    )
                  }
                >
                  <option value="OPTIONAL">Optionnel (à cocher)</option>
                  <option value="MANDATORY">Obligatoire</option>
                  <option value="LICENSE">Licence fédérale</option>
                </select>
              </label>
            </div>
            {fKind === 'OPTIONAL' ? (
              <label className="field" style={{ marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={fAutoApply}
                  onChange={(e) => setFAutoApply(e.target.checked)}
                  style={{ marginRight: 6 }}
                />
                <span>
                  Pré-cocher dans le panier (le payeur peut décocher)
                </span>
              </label>
            ) : (
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                Auto-ajouté à chaque inscription (
                {fKind === 'LICENSE'
                  ? 'sauf si l’adhérent déclare déjà avoir une licence valide pour la saison'
                  : 'non décochable par le payeur'}
                ).
              </p>
            )}
            {fKind === 'LICENSE' ? (
              <div className="members-form--inline" style={{ marginTop: '0.5rem' }}>
                <label className="field">
                  <span>Format attendu (regex)</span>
                  <input
                    value={fLicensePattern}
                    onChange={(e) => setFLicensePattern(e.target.value)}
                    placeholder="^\d{8}[A-Z]$"
                    style={{ fontFamily: 'monospace' }}
                  />
                </label>
                <label className="field">
                  <span>Hint affiché à l'adhérent</span>
                  <input
                    value={fLicenseHint}
                    onChange={(e) => setFLicenseHint(e.target.value)}
                    placeholder="8 chiffres + 1 lettre majuscule (12345678A)"
                  />
                </label>
              </div>
            ) : null}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={creatingFee}
            >
              {creatingFee ? '…' : 'Ajouter le frais'}
            </button>
          </form>

          {oneTimeFees.length === 0 ? (
            <p className="muted">Aucun frais catalogué.</p>
          ) : (
            <div className="members-table-wrap" style={{ marginTop: '1rem' }}>
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Libellé</th>
                    <th>Montant</th>
                    <th>Type</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {oneTimeFees.map((f) =>
                    editFeeId === f.id ? (
                      <tr key={f.id}>
                        <td colSpan={4}>
                          <form
                            className="members-form"
                            onSubmit={(e) => void onUpdateFee(e)}
                          >
                            <div className="members-form--inline">
                              <label className="field">
                                <span>Libellé</span>
                                <input
                                  value={efLabel}
                                  onChange={(e) => setEfLabel(e.target.value)}
                                />
                              </label>
                              <label className="field">
                                <span>Montant (€)</span>
                                <input
                                  value={efEuros}
                                  onChange={(e) => setEfEuros(e.target.value)}
                                />
                              </label>
                              <label className="field">
                                <span>Type</span>
                                <select
                                  value={efKind}
                                  onChange={(e) =>
                                    setEfKind(
                                      e.target.value as
                                        | 'LICENSE'
                                        | 'MANDATORY'
                                        | 'OPTIONAL',
                                    )
                                  }
                                >
                                  <option value="OPTIONAL">
                                    Optionnel (à cocher)
                                  </option>
                                  <option value="MANDATORY">Obligatoire</option>
                                  <option value="LICENSE">
                                    Licence fédérale
                                  </option>
                                </select>
                              </label>
                            </div>
                            {efKind === 'OPTIONAL' ? (
                              <label
                                className="field"
                                style={{ marginTop: '0.5rem' }}
                              >
                                <input
                                  type="checkbox"
                                  checked={efAutoApply}
                                  onChange={(e) =>
                                    setEfAutoApply(e.target.checked)
                                  }
                                  style={{ marginRight: 6 }}
                                />
                                <span>
                                  Pré-cocher dans le panier (le payeur peut
                                  décocher)
                                </span>
                              </label>
                            ) : null}
                            {efKind === 'LICENSE' ? (
                              <div
                                className="members-form--inline"
                                style={{ marginTop: '0.5rem' }}
                              >
                                <label className="field">
                                  <span>Format attendu (regex)</span>
                                  <input
                                    value={efLicensePattern}
                                    onChange={(e) =>
                                      setEfLicensePattern(e.target.value)
                                    }
                                    placeholder="^\d{8}[A-Z]$"
                                    style={{ fontFamily: 'monospace' }}
                                  />
                                </label>
                                <label className="field">
                                  <span>Hint affiché à l'adhérent</span>
                                  <input
                                    value={efLicenseHint}
                                    onChange={(e) =>
                                      setEfLicenseHint(e.target.value)
                                    }
                                    placeholder="8 chiffres + 1 lettre majuscule (12345678A)"
                                  />
                                </label>
                              </div>
                            ) : null}
                            <button
                              type="submit"
                              className="btn btn-primary"
                              disabled={updatingFee}
                            >
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => setEditFeeId(null)}
                            >
                              Fermer
                            </button>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr key={f.id}>
                        <td>{f.label}</td>
                        <td>{centsToEuros(f.amountCents)} €</td>
                        <td>
                          {f.kind === 'LICENSE' ? (
                            <span title={f.licenseNumberFormatHint ?? ''}>
                              🎫 Licence
                              {f.licenseNumberPattern ? ' (format défini)' : ''}
                            </span>
                          ) : f.kind === 'MANDATORY' ? (
                            <span>📌 Obligatoire</span>
                          ) : (
                            <span>
                              ⭐ Optionnel{f.autoApply ? ' (pré-coché)' : ''}
                            </span>
                          )}
                        </td>
                        <td className="members-table__actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight"
                            onClick={() => startEditFee(f)}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight"
                            onClick={() => void onArchiveFee(f.id, f.label)}
                          >
                            Archiver
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight members-table__danger"
                            onClick={() => void onDeleteFee(f.id, f.label)}
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
        </section>
      </div>
    </>
  );
}
