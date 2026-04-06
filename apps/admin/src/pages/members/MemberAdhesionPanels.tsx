import { useLazyQuery, useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ACTIVE_CLUB_SEASON,
  CLUB_DYNAMIC_GROUPS,
  CLUB_INVOICES,
  CLUB_MEMBERS,
  CLUB_PRICING_RULES,
  CREATE_MEMBERSHIP_INVOICE_DRAFT,
  ELIGIBLE_MEMBERSHIP_PRODUCTS,
  FINALIZE_MEMBERSHIP_INVOICE,
  MEMBERSHIP_ONE_TIME_FEES,
  RECORD_CLUB_MANUAL_PAYMENT,
  SET_MEMBER_DYNAMIC_GROUPS,
  SUGGEST_MEMBER_DYNAMIC_GROUPS,
} from '../../lib/documents';
import {
  ALL_CLUB_PAYMENT_METHODS,
  CLUB_MANUAL_PAYMENT_METHODS,
  clubPaymentMethodLabel,
} from '../../lib/payment-labels';
import type {
  ActiveClubSeasonQueryData,
  ClubInvoicesQueryData,
  ClubPaymentMethodStr,
  ClubPricingRulesQueryData,
  CreateMembershipInvoiceDraftMutationData,
  DynamicGroupsQueryData,
  EligibleMembershipProductsQueryData,
  MembershipOneTimeFeesQueryData,
  MembersQueryData,
  RecordClubManualPaymentMutationData,
  SuggestMemberDynamicGroupsQueryData,
} from '../../lib/types';
import { useClubModules } from '../../lib/club-modules-context';

type MemberRow = MembersQueryData['clubMembers'][number];

function eurosDiscountToNegativeCents(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return -Math.round(n * 100);
}

export function MemberAdhesionPanels({ member }: { member: MemberRow }) {
  const assigned = member.assignedDynamicGroups ?? [];

  const { isEnabled } = useClubModules();
  const membersOn = isEnabled('MEMBERS');
  const paymentOn = isEnabled('PAYMENT');

  const { data: groupsData, loading: groupsLoading } =
    useQuery<DynamicGroupsQueryData>(CLUB_DYNAMIC_GROUPS, {
      skip: !membersOn,
    });

  const { data: activeSeasonData } = useQuery<ActiveClubSeasonQueryData>(
    ACTIVE_CLUB_SEASON,
    { skip: !paymentOn },
  );
  const [effectiveDate, setEffectiveDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const adhesionFormEnabled =
    Boolean(paymentOn && membersOn && activeSeasonData?.activeClubSeason);

  const { data: eligibleData, loading: eligibleLoading } =
    useQuery<EligibleMembershipProductsQueryData>(
      ELIGIBLE_MEMBERSHIP_PRODUCTS,
      {
        skip: !adhesionFormEnabled,
        variables: {
          memberId: member.id,
          referenceDate: `${effectiveDate}T12:00:00.000Z`,
        },
      },
    );

  const { data: oneTimeFeesData } = useQuery<MembershipOneTimeFeesQueryData>(
    MEMBERSHIP_ONE_TIME_FEES,
    { skip: !adhesionFormEnabled },
  );
  const { data: pricingData } = useQuery<ClubPricingRulesQueryData>(
    CLUB_PRICING_RULES,
    { skip: !paymentOn },
  );

  const { data: invoicesData } = useQuery<ClubInvoicesQueryData>(CLUB_INVOICES, {
    skip: !paymentOn,
  });

  const openFamilyInvoices = useMemo(() => {
    const fid = member.family?.id;
    const rows = invoicesData?.clubInvoices;
    if (!fid || !rows) return [];
    return rows.filter(
      (i) =>
        i.familyId === fid &&
        i.status === 'OPEN' &&
        i.balanceCents > 0,
    );
  }, [member.family?.id, invoicesData]);

  const [encInvoiceId, setEncInvoiceId] = useState('');
  const [encEuros, setEncEuros] = useState('');
  const [encMethod, setEncMethod] =
    useState<ClubPaymentMethodStr>('MANUAL_TRANSFER');
  const [encRef, setEncRef] = useState('');
  const [encMsg, setEncMsg] = useState<string | null>(null);

  const [recordPay, { loading: recordingPay }] =
    useMutation<RecordClubManualPaymentMutationData>(RECORD_CLUB_MANUAL_PAYMENT, {
      refetchQueries: [{ query: CLUB_INVOICES }, { query: CLUB_MEMBERS }],
      onCompleted: () => {
        setEncEuros('');
        setEncRef('');
        setEncMsg('Encaissement enregistré.');
      },
      onError: (e) => setEncMsg(e.message),
    });

  const encSelectValue = useMemo(() => {
    if (openFamilyInvoices.length === 0) return '';
    if (openFamilyInvoices.some((i) => i.id === encInvoiceId)) {
      return encInvoiceId;
    }
    return openFamilyInvoices[0].id;
  }, [openFamilyInvoices, encInvoiceId]);

  const encInvoice =
    openFamilyInvoices.find((i) => i.id === encSelectValue) ?? null;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(assigned.map((g) => g.id)),
  );

  const [groupMsg, setGroupMsg] = useState<string | null>(null);
  const [setGroups, { loading: savingGroups }] = useMutation(
    SET_MEMBER_DYNAMIC_GROUPS,
    {
      refetchQueries: [{ query: CLUB_MEMBERS }],
      onCompleted: () => setGroupMsg(null),
      onError: (e) => setGroupMsg(e.message),
    },
  );

  const [runSuggest, { loading: suggesting }] = useLazyQuery<
    SuggestMemberDynamicGroupsQueryData
  >(SUGGEST_MEMBER_DYNAMIC_GROUPS);

  async function onSuggestClick() {
    setGroupMsg(null);
    try {
      const { data, error } = await runSuggest({
        variables: { memberId: member.id },
      });
      if (error) {
        setGroupMsg(error.message);
        return;
      }
      if (data) {
        const ids = data.suggestMemberDynamicGroups.map((g) => g.id);
        setSelectedIds((prev) => new Set([...prev, ...ids]));
      }
    } catch (e) {
      setGroupMsg(e instanceof Error ? e.message : 'Erreur suggestion');
    }
  }

  const allGroups = groupsData?.clubDynamicGroups ?? [];

  function toggleGroup(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function saveGroupAssignments() {
    setGroupMsg(null);
    await setGroups({
      variables: {
        input: {
          memberId: member.id,
          dynamicGroupIds: [...selectedIds],
        },
      },
    });
  }

  const activeSeason = activeSeasonData?.activeClubSeason ?? null;
  const eligibleProducts =
    eligibleData?.eligibleMembershipProducts ?? [];
  const oneTimeFees = oneTimeFeesData?.membershipOneTimeFees ?? [];

  const [selectedProductId, setSelectedProductId] = useState('');
  const [billingRhythm, setBillingRhythm] = useState<'ANNUAL' | 'MONTHLY'>(
    'ANNUAL',
  );
  const [selectedFeeIds, setSelectedFeeIds] = useState<Set<string>>(
    () => new Set(),
  );

  function toggleOneTimeFee(id: string) {
    setSelectedFeeIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const [prorataBp, setProrataBp] = useState('');
  const [publicAidEuros, setPublicAidEuros] = useState('');
  const [publicAidOrg, setPublicAidOrg] = useState('');
  const [publicAidRef, setPublicAidRef] = useState('');
  const [publicAidUrl, setPublicAidUrl] = useState('');
  const [exEuros, setExEuros] = useState('');
  const [exReason, setExReason] = useState('');

  const [cotMsg, setCotMsg] = useState<string | null>(null);
  const [draftPreview, setDraftPreview] = useState<
    ClubInvoicesQueryData['clubInvoices'][number] | null
  >(null);

  const selectedProduct = eligibleProducts.find(
    (p) => p.id === selectedProductId,
  );

  const methodOptions = useMemo((): ClubPaymentMethodStr[] => {
    const fromRules = new Set(
      (pricingData?.clubPricingRules ?? []).map((r) => r.method),
    );
    const ordered: ClubPaymentMethodStr[] = [];
    for (const m of ALL_CLUB_PAYMENT_METHODS) {
      if (fromRules.has(m)) ordered.push(m);
    }
    for (const m of ALL_CLUB_PAYMENT_METHODS) {
      if (!ordered.includes(m)) ordered.push(m);
    }
    return ordered;
  }, [pricingData]);

  const [payMethod, setPayMethod] = useState<ClubPaymentMethodStr>(
    'MANUAL_TRANSFER',
  );

  const payMethodResolved: ClubPaymentMethodStr =
    methodOptions.length > 0 && methodOptions.includes(payMethod)
      ? payMethod
      : (methodOptions[0] ?? 'MANUAL_TRANSFER');

  const [createDraft, { loading: creatingDraft }] =
    useMutation<CreateMembershipInvoiceDraftMutationData>(
      CREATE_MEMBERSHIP_INVOICE_DRAFT,
      {
        refetchQueries: [{ query: CLUB_INVOICES }],
        onCompleted: (res) => {
          setDraftPreview(res.createMembershipInvoiceDraft);
          setCotMsg(null);
        },
        onError: (e) => setCotMsg(e.message),
      },
    );

  const [finalizeInv, { loading: finalizing }] = useMutation(
    FINALIZE_MEMBERSHIP_INVOICE,
    {
      refetchQueries: [{ query: CLUB_INVOICES }, { query: CLUB_MEMBERS }],
      onCompleted: () => {
        setCotMsg('Facture finalisée (statut OPEN).');
        setDraftPreview(null);
      },
      onError: (e) => setCotMsg(e.message),
    },
  );

  async function submitDraft() {
    setCotMsg(null);
    if (!selectedProductId || !effectiveDate) {
      setCotMsg('Formule et date d’effet obligatoires.');
      return;
    }
    const prod = eligibleProducts.find((p) => p.id === selectedProductId);
    if (!prod) {
      setCotMsg('Formule introuvable.');
      return;
    }
    let pr: number | undefined;
    if (prorataBp.trim() !== '') {
      pr = Number.parseInt(prorataBp, 10);
      if (!Number.isFinite(pr) || pr < 0 || pr > 10_000) {
        setCotMsg('Prorata (bp) : entier entre 0 et 10 000.');
        return;
      }
    }

    const aidCents = eurosDiscountToNegativeCents(publicAidEuros);
    const exCe = eurosDiscountToNegativeCents(exEuros);

    const input: Record<string, unknown> = {
      memberId: member.id,
      membershipProductId: selectedProductId,
      billingRhythm,
      effectiveDate: `${effectiveDate}T00:00:00.000Z`,
    };
    if (pr !== undefined) input.prorataPercentBp = pr;
    if (selectedFeeIds.size > 0) {
      input.oneTimeFeeIds = [...selectedFeeIds];
    }

    if (prod.allowPublicAid && aidCents != null) {
      input.publicAidAmountCents = aidCents;
      input.publicAidOrganisme = publicAidOrg.trim() || null;
      input.publicAidReference = publicAidRef.trim() || null;
      input.publicAidAttachmentUrl = publicAidUrl.trim() || null;
    }
    if (prod.allowExceptional && exCe != null) {
      input.exceptionalAmountCents = exCe;
      input.exceptionalReason = exReason.trim() || null;
    }

    await createDraft({ variables: { input } });
  }

  async function submitFinalize() {
    if (!draftPreview) return;
    setCotMsg(null);
    await finalizeInv({
      variables: {
        input: {
          invoiceId: draftPreview.id,
          lockedPaymentMethod: payMethodResolved,
        },
      },
    });
  }

  async function submitManualPayment() {
    if (!encInvoice) return;
    setEncMsg(null);
    const t = encEuros.trim().replace(',', '.');
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n) || n <= 0) {
      setEncMsg('Montant invalide.');
      return;
    }
    const cents = Math.round(n * 100);
    if (cents < 1 || cents > encInvoice.balanceCents) {
      setEncMsg(
        `Montant entre 0,01 € et ${(encInvoice.balanceCents / 100).toFixed(2)} €.`,
      );
      return;
    }
    await recordPay({
      variables: {
        input: {
          invoiceId: encInvoice.id,
          amountCents: cents,
          method: encMethod,
          externalRef: encRef.trim() ? encRef.trim() : null,
        },
      },
    });
  }

  return (
    <>
      {membersOn ? (
        <div className="family-drawer__section">
          <h3 className="family-drawer__h">Groupes dynamiques</h3>
          {groupMsg ? <p className="form-error">{groupMsg}</p> : null}
          <p className="muted members-form__hint">
            Cases cochées = affectation persistée. « Suggérer » ajoute des
            propositions sans enregistrer.
          </p>
          {groupsLoading ? (
            <p className="muted">Chargement…</p>
          ) : (
            <>
              <div className="members-checkbox-grid" style={{ marginBottom: '0.75rem' }}>
                {allGroups.map((g) => (
                  <label key={g.id} className="members-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(g.id)}
                      onChange={() => toggleGroup(g.id)}
                    />
                    <span>{g.name}</span>
                  </label>
                ))}
              </div>
              <div className="members-form__actions-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={suggesting}
                  onClick={() => void onSuggestClick()}
                >
                  {suggesting ? '…' : 'Suggérer selon âge / grade'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={savingGroups}
                  onClick={() => void saveGroupAssignments()}
                >
                  {savingGroups ? '…' : 'Enregistrer les groupes'}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {paymentOn ? (
        <div className="family-drawer__section">
          <h3 className="family-drawer__h">Cotisation (adhésion)</h3>
          {!activeSeason ? (
            <p className="form-error">
              Aucune saison active —{' '}
              <Link to="/settings/adhesion">Paramètres adhésion</Link>.
            </p>
          ) : (
            <p className="muted">
              Saison active : {activeSeason.label} (
              {activeSeason.startsOn.slice(0, 10)} →{' '}
              {activeSeason.endsOn.slice(0, 10)})
            </p>
          )}
          {membersOn ? null : (
            <p className="form-error">
              Activez le module Membres pour gérer les groupes avant une
              cotisation.
            </p>
          )}
          {cotMsg ? (
            <p
              className={
                cotMsg.startsWith('Facture finalisée') ? 'muted' : 'form-error'
              }
            >
              {cotMsg}
            </p>
          ) : null}

          {!activeSeason || !membersOn ? null : (
            <>
              <label className="field">
                <span>Date d’effet</span>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => {
                    setEffectiveDate(e.target.value);
                    setDraftPreview(null);
                  }}
                />
              </label>
              <div className="field">
                <span>Rythme de facturation</span>
                <div className="members-form__actions-row" style={{ marginTop: '0.35rem' }}>
                  <label className="members-checkbox">
                    <input
                      type="radio"
                      name="adh-billing-rhythm"
                      checked={billingRhythm === 'ANNUAL'}
                      onChange={() => {
                        setBillingRhythm('ANNUAL');
                        setDraftPreview(null);
                      }}
                    />
                    <span>Annuel</span>
                  </label>
                  <label className="members-checkbox">
                    <input
                      type="radio"
                      name="adh-billing-rhythm"
                      checked={billingRhythm === 'MONTHLY'}
                      onChange={() => {
                        setBillingRhythm('MONTHLY');
                        setDraftPreview(null);
                      }}
                    />
                    <span>Mensuel</span>
                  </label>
                </div>
                {billingRhythm === 'MONTHLY' ? (
                  <p className="members-form__hint">
                    Pas de prorata saison en mensuel ; le montant de base est le
                    tarif mensuel de la formule.
                  </p>
                ) : null}
              </div>
              <label className="field">
                <span>Formule</span>
                <select
                  value={selectedProductId}
                  disabled={eligibleLoading}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    setDraftPreview(null);
                  }}
                >
                  <option value="">
                    {eligibleLoading ? '…' : '— Choisir —'}
                  </option>
                  {eligibleProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} — {(p.annualAmountCents / 100).toFixed(2)} €
                      /an · {(p.monthlyAmountCents / 100).toFixed(2)} €/mois
                    </option>
                  ))}
                </select>
              </label>
              {eligibleLoading ? (
                <p className="muted">Formules éligibles…</p>
              ) : null}
              {!eligibleLoading && eligibleProducts.length === 0 ? (
                <p className="muted">
                  Aucune formule éligible pour ce profil (âge / grade / date
                  d’effet). Vérifiez les{' '}
                  <Link to="/settings/adhesion">formules</Link> ou le profil du
                  membre.
                </p>
              ) : null}

              {selectedProduct ? (
                <div className="members-form__fieldset">
                  <span className="members-form__legend">Brouillon</span>
                  {selectedProduct.allowProrata && billingRhythm === 'ANNUAL' ? (
                    <label className="field">
                      <span>Prorata manuel (bp, optionnel)</span>
                      <input
                        value={prorataBp}
                        onChange={(e) => setProrataBp(e.target.value)}
                        placeholder="10000 = 100 %"
                      />
                    </label>
                  ) : null}
                  {oneTimeFees.length > 0 ? (
                    <div className="field">
                      <span>Frais supplémentaires (optionnel)</span>
                      <div
                        className="members-checkbox-grid"
                        style={{ marginTop: '0.5rem' }}
                      >
                        {oneTimeFees.map((f) => (
                          <label key={f.id} className="members-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedFeeIds.has(f.id)}
                              onChange={() => {
                                toggleOneTimeFee(f.id);
                                setDraftPreview(null);
                              }}
                            />
                            <span>
                              {f.label} — {(f.amountCents / 100).toFixed(2)}{' '}
                              €
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selectedProduct.allowPublicAid ? (
                    <>
                      <label className="field">
                        <span>Aide publique — montant réduction (€)</span>
                        <input
                          value={publicAidEuros}
                          onChange={(e) => setPublicAidEuros(e.target.value)}
                          placeholder="ex. 50"
                        />
                      </label>
                      <label className="field">
                        <span>Organisme (optionnel)</span>
                        <input
                          value={publicAidOrg}
                          onChange={(e) => setPublicAidOrg(e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Réf. dossier (optionnel)</span>
                        <input
                          value={publicAidRef}
                          onChange={(e) => setPublicAidRef(e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>URL pièce jointe (optionnel)</span>
                        <input
                          value={publicAidUrl}
                          onChange={(e) => setPublicAidUrl(e.target.value)}
                        />
                      </label>
                    </>
                  ) : null}
                  {selectedProduct.allowExceptional ? (
                    <>
                      <label className="field">
                        <span>
                          Remise exceptionnelle (€) — trésorerie / bureau
                        </span>
                        <input
                          value={exEuros}
                          onChange={(e) => setExEuros(e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Motif (obligatoire si montant)</span>
                        <input
                          value={exReason}
                          onChange={(e) => setExReason(e.target.value)}
                        />
                      </label>
                    </>
                  ) : null}
                  <p className="members-form__hint">
                    Aucun encaissement tant que la facture est en brouillon (
                    DRAFT ).
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={creatingDraft || !selectedProductId}
                    onClick={() => void submitDraft()}
                  >
                    {creatingDraft ? '…' : 'Créer le brouillon'}
                  </button>
                </div>
              ) : null}

              {member.family?.id && openFamilyInvoices.length > 0 ? (
                <div className="members-form__fieldset">
                  <span className="members-form__legend">
                    Encaissement (espèces, chèque, virement)
                  </span>
                  {encMsg ? (
                    <p
                      className={
                        encMsg.startsWith('Encaissement')
                          ? 'muted'
                          : 'form-error'
                      }
                    >
                      {encMsg}
                    </p>
                  ) : null}
                  <ul
                    className="muted"
                    style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }}
                  >
                    {openFamilyInvoices.map((inv) => (
                      <li key={inv.id}>
                        {inv.label} — reste {(inv.balanceCents / 100).toFixed(2)}{' '}
                        € / {(inv.amountCents / 100).toFixed(2)} €
                      </li>
                    ))}
                  </ul>
                  {openFamilyInvoices.length > 1 ? (
                    <label className="field">
                      <span>Facture</span>
                      <select
                        value={encSelectValue}
                        onChange={(e) => setEncInvoiceId(e.target.value)}
                      >
                        {openFamilyInvoices.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.label} — reste{' '}
                            {(inv.balanceCents / 100).toFixed(2)} €
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {encInvoice ? (
                    <>
                      <label className="field">
                        <span>
                          Montant (€), max{' '}
                          {(encInvoice.balanceCents / 100).toFixed(2)} €
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={encEuros}
                          onChange={(e) => setEncEuros(e.target.value)}
                          placeholder={`ex. ${(encInvoice.balanceCents / 100).toFixed(2)}`}
                        />
                      </label>
                      <label className="field">
                        <span>Mode</span>
                        <select
                          value={encMethod}
                          onChange={(e) =>
                            setEncMethod(e.target.value as ClubPaymentMethodStr)
                          }
                        >
                          {CLUB_MANUAL_PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {clubPaymentMethodLabel(m)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Référence (n° chèque, libellé virement…)</span>
                        <input
                          value={encRef}
                          onChange={(e) => setEncRef(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={recordingPay}
                        onClick={() => void submitManualPayment()}
                      >
                        {recordingPay ? '…' : 'Enregistrer l’encaissement'}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}

              {draftPreview ? (
                <div className="members-form__fieldset">
                  <span className="members-form__legend">Finaliser</span>
                  <p className="muted">
                    Facture {draftPreview.id.slice(0, 8)}… —{' '}
                    <strong>{draftPreview.label}</strong> — total métier{' '}
                    {(draftPreview.baseAmountCents / 100).toFixed(2)} € —{' '}
                    statut {draftPreview.status}
                  </p>
                  <label className="field">
                    <span>Mode de paiement</span>
                    <select
                      value={payMethodResolved}
                      onChange={(e) =>
                        setPayMethod(e.target.value as ClubPaymentMethodStr)
                      }
                    >
                      {methodOptions.map((m) => (
                        <option key={m} value={m}>
                          {clubPaymentMethodLabel(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={finalizing}
                    onClick={() => void submitFinalize()}
                  >
                    {finalizing ? '…' : 'Finaliser (OPEN)'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
