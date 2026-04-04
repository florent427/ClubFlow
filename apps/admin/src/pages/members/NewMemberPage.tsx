import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CLUB_GRADE_LEVELS,
  CLUB_MEMBER_EMAIL_DUPLICATE_INFO,
  CLUB_MEMBER_FIELD_LAYOUT,
  CLUB_ROLE_DEFINITIONS,
  CREATE_CLUB_MEMBER,
} from '../../lib/documents';
import { MEMBER_CATALOG_FIELD_LABELS } from '../../lib/member-field-labels';
import type {
  ClubMemberEmailDuplicateInfoQueryData,
  CreateMemberMutationData,
  GradeLevelsQueryData,
  MemberFieldLayoutQueryData,
  RoleDefinitionsQueryData,
} from '../../lib/types';
import { BUILTIN_ROLE_OPTIONS } from './members-constants';
import { MemberPhotoField } from './MemberPhotoField';
import { useMembersUi } from './members-ui-context';

export function NewMemberPage() {
  const navigate = useNavigate();
  const { setDrawerMemberId } = useMembersUi();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [civility, setCivility] = useState<string>('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [builtinRoles, setBuiltinRoles] = useState<string[]>(['STUDENT']);
  const [customRoleIds, setCustomRoleIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [debouncedEmail, setDebouncedEmail] = useState('');
  const [attachToFamilyId, setAttachToFamilyId] = useState<string | null>(null);

  const [photoUrl, setPhotoUrl] = useState('');
  const [catalogScalars, setCatalogScalars] = useState<Record<string, string>>(
    {},
  );
  const [customFieldDraft, setCustomFieldDraft] = useState<
    Record<string, string>
  >({});

  const { data: gradesData } = useQuery<GradeLevelsQueryData>(
    CLUB_GRADE_LEVELS,
  );
  const { data: roleDefsData } = useQuery<RoleDefinitionsQueryData>(
    CLUB_ROLE_DEFINITIONS,
  );
  const { data: layoutData } = useQuery<MemberFieldLayoutQueryData>(
    CLUB_MEMBER_FIELD_LAYOUT,
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedEmail(email.trim()), 450);
    return () => window.clearTimeout(t);
  }, [email]);

  const emailForDupLookup =
    debouncedEmail.includes('@') && debouncedEmail.length > 3
      ? debouncedEmail
      : '';

  const { data: dupData, loading: dupLoading } =
    useQuery<ClubMemberEmailDuplicateInfoQueryData>(
      CLUB_MEMBER_EMAIL_DUPLICATE_INFO,
      {
        variables: { email: emailForDupLookup },
        skip: !emailForDupLookup,
      },
    );

  const dup = dupData?.clubMemberEmailDuplicateInfo;

  useEffect(() => {
    if (
      attachToFamilyId &&
      dup &&
      !dup.isClear &&
      dup.suggestedFamilyId &&
      dup.suggestedFamilyId !== attachToFamilyId
    ) {
      setAttachToFamilyId(null);
    }
  }, [attachToFamilyId, dup]);

  const emailDupPreventsCreate = useMemo(() => {
    if (!dup || dup.isClear) return false;
    if (dup.blockedMessage) return true;
    if (dup.suggestedFamilyId && !attachToFamilyId) return true;
    return false;
  }, [dup, attachToFamilyId]);

  const [createMember, { loading: creating }] = useMutation<
    CreateMemberMutationData,
    { input: Record<string, unknown> }
  >(CREATE_CLUB_MEMBER, {
    onCompleted: (res) => {
      const id = res.createClubMember?.id;
      if (id) setDrawerMemberId(id);
      navigate('/members');
    },
    onError: (e) => setFormError(e.message),
  });

  const grades = gradesData?.clubGradeLevels ?? [];
  const roleDefs = roleDefsData?.clubRoleDefinitions ?? [];

  const visibleCatalog = useMemo(() => {
    const list =
      layoutData?.clubMemberFieldLayout?.catalogSettings?.filter(
        (s) => s.showOnForm,
      ) ?? [];
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [layoutData?.clubMemberFieldLayout?.catalogSettings]);

  const customDefsSorted = useMemo(() => {
    const d =
      layoutData?.clubMemberFieldLayout?.customFieldDefinitions ?? [];
    return [...d].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [layoutData?.clubMemberFieldLayout?.customFieldDefinitions]);

  const catalogFieldsWithoutPhoto = useMemo(
    () => visibleCatalog.filter((s) => s.fieldKey !== 'PHOTO_URL'),
    [visibleCatalog],
  );

  function toggleBuiltinRole(value: string) {
    setBuiltinRoles((prev) => {
      const has = prev.includes(value);
      if (has && prev.length <= 1) return prev;
      if (has) return prev.filter((r) => r !== value);
      return [...prev, value];
    });
  }

  function toggleCustomRole(id: string) {
    setCustomRoleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setFormError('Prénom et nom sont obligatoires.');
      return;
    }
    if (civility !== 'MR' && civility !== 'MME') {
      setFormError('La civilité est obligatoire.');
      return;
    }
    if (!email.trim()) {
      setFormError('L’e-mail est obligatoire.');
      return;
    }
    const input: Record<string, unknown> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      civility,
      roles: builtinRoles,
    };
    if (customRoleIds.length > 0) input.customRoleIds = customRoleIds;
    if (photoUrl.trim()) {
      input.photoUrl = photoUrl.trim();
    }

    const catalogKeysShown = new Set(
      catalogFieldsWithoutPhoto.map((s) => s.fieldKey),
    );
    if (catalogKeysShown.has('BIRTH_DATE') && birthDate) {
      input.birthDate = birthDate;
    }
    if (catalogKeysShown.has('GRADE_LEVEL') && gradeId) {
      input.gradeLevelId = gradeId;
    }
    if (catalogKeysShown.has('PHONE')) {
      input.phone = catalogScalars.PHONE?.trim() || undefined;
    }
    if (catalogKeysShown.has('ADDRESS_LINE')) {
      input.addressLine = catalogScalars.ADDRESS_LINE?.trim() || undefined;
    }
    if (catalogKeysShown.has('POSTAL_CODE')) {
      input.postalCode = catalogScalars.POSTAL_CODE?.trim() || undefined;
    }
    if (catalogKeysShown.has('CITY')) {
      input.city = catalogScalars.CITY?.trim() || undefined;
    }
    if (catalogKeysShown.has('MEDICAL_CERT_EXPIRES_AT')) {
      const v = catalogScalars.MEDICAL_CERT_EXPIRES_AT?.trim();
      if (v) input.medicalCertExpiresAt = v;
    }

    if (customDefsSorted.length > 0) {
      input.customFieldValues = customDefsSorted.map((d) => ({
        definitionId: d.id,
        value: customFieldDraft[d.id] ?? '',
      }));
    }

    if (attachToFamilyId) {
      input.familyId = attachToFamilyId;
    }

    await createMember({ variables: { input } });
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">Module Membres</p>
            <h1 className="members-loom__title">Nouvelle fiche</h1>
            <p className="members-loom__lede">
              Les champs affichés suivent{' '}
              <Link to="/settings/member-fields">Paramètres → Fiche adhérent</Link>.
            </p>
          </div>
          <Link
            to="/members"
            className="btn btn-ghost members-hero__back"
          >
            ← Retour à l’annuaire
          </Link>
        </div>
      </header>

      <div className="members-loom__grid members-loom__grid--single">
        <section className="members-panel">
          <form className="members-form" onSubmit={(e) => void onCreateSubmit(e)}>
            {formError ? <p className="form-error">{formError}</p> : null}
            {dupLoading && emailForDupLookup ? (
              <p className="members-form__dup-muted">Vérification de l’e-mail…</p>
            ) : null}
            {dup &&
            !dup.isClear &&
            dup.blockedMessage &&
            emailForDupLookup ? (
              <p className="form-error" role="alert">
                {dup.blockedMessage}
              </p>
            ) : null}
            {dup &&
            !dup.isClear &&
            dup.suggestedFamilyId &&
            !dup.blockedMessage &&
            emailForDupLookup ? (
              <div className="members-form__dup-info" role="status">
                <p style={{ margin: '0 0 0.35rem' }}>
                  <strong>Cette e-mail est déjà utilisée</strong> par{' '}
                  {dup.existingMemberLabels?.length
                    ? dup.existingMemberLabels.join(', ')
                    : 'un adhérent'}{' '}
                  dans le foyer{' '}
                  <strong>{dup.familyLabel?.trim() || 'Sans nom'}</strong>.
                </p>
                <p className="members-form__dup-muted" style={{ margin: 0 }}>
                  E-mail du foyer (compte / facturation) :{' '}
                  <strong>{dup.sharedEmail ?? debouncedEmail}</strong>
                </p>
                {attachToFamilyId === dup.suggestedFamilyId ? (
                  <p className="members-form__dup-muted">
                    La nouvelle fiche sera rattachée à ce foyer lors de la
                    création.
                  </p>
                ) : (
                  <div className="members-form__dup-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() =>
                        setAttachToFamilyId(dup.suggestedFamilyId!)
                      }
                    >
                      Rattacher à ce foyer et continuer
                    </button>
                    <span className="members-form__dup-muted">
                      Les doublons d’e-mail sont autorisés uniquement au sein du
                      même foyer.
                    </span>
                  </div>
                )}
                {dup.suggestedFamilyId &&
                !dup.blockedMessage &&
                !attachToFamilyId ? (
                  <p className="members-form__dup-muted">
                    Confirmez le rattachement pour activer le bouton « Créer le
                    membre ».
                  </p>
                ) : null}
              </div>
            ) : null}
            <MemberPhotoField
              idPrefix="new-member-photo"
              value={photoUrl}
              onChange={setPhotoUrl}
            />
            <label className="field">
              <span>Civilité *</span>
              <select
                value={civility}
                onChange={(e) => setCivility(e.target.value)}
                aria-label="Civilité"
                required
              >
                <option value="">— Choisir —</option>
                <option value="MR">Mr</option>
                <option value="MME">Mme</option>
              </select>
            </label>
            <label className="field">
              <span>Nom *</span>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
              />
            </label>
            <label className="field">
              <span>Prénom *</span>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
              />
            </label>
            <label className="field">
              <span>E-mail *</span>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setAttachToFamilyId(null);
                }}
                autoComplete="email"
                required
              />
            </label>

            {catalogFieldsWithoutPhoto.map((s) => {
              const label =
                MEMBER_CATALOG_FIELD_LABELS[s.fieldKey] ?? s.fieldKey;
              const req = s.required ? ' *' : '';
              if (s.fieldKey === 'BIRTH_DATE') {
                return (
                  <label key={s.fieldKey} className="field">
                    <span>
                      {label}
                      {req}
                    </span>
                    <input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                    />
                  </label>
                );
              }
              if (s.fieldKey === 'GRADE_LEVEL') {
                return (
                  <label key={s.fieldKey} className="field">
                    <span>
                      {label}
                      {req}
                    </span>
                    <select
                      value={gradeId}
                      onChange={(e) => setGradeId(e.target.value)}
                    >
                      <option value="">— Non renseigné —</option>
                      {grades.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              if (s.fieldKey === 'MEDICAL_CERT_EXPIRES_AT') {
                return (
                  <label key={s.fieldKey} className="field">
                    <span>
                      {label}
                      {req}
                    </span>
                    <input
                      type="date"
                      value={catalogScalars.MEDICAL_CERT_EXPIRES_AT ?? ''}
                      onChange={(e) =>
                        setCatalogScalars((prev) => ({
                          ...prev,
                          MEDICAL_CERT_EXPIRES_AT: e.target.value,
                        }))
                      }
                    />
                  </label>
                );
              }
              return (
                <label key={s.fieldKey} className="field">
                  <span>
                    {label}
                    {req}
                  </span>
                  <input
                    value={catalogScalars[s.fieldKey] ?? ''}
                    onChange={(e) =>
                      setCatalogScalars((prev) => ({
                        ...prev,
                        [s.fieldKey]: e.target.value,
                      }))
                    }
                  />
                </label>
              );
            })}

            {customDefsSorted.map((d) => {
              let options: string[] = [];
              if (d.type === 'SELECT' && d.optionsJson) {
                try {
                  const p = JSON.parse(d.optionsJson) as unknown;
                  if (Array.isArray(p)) options = p as string[];
                } catch {
                  options = [];
                }
              }
              const val = customFieldDraft[d.id] ?? '';
              const setVal = (v: string) =>
                setCustomFieldDraft((prev) => ({ ...prev, [d.id]: v }));

              return (
                <div key={d.id} className="field">
                  <span>
                    {d.label}
                    {d.required ? ' *' : ''}
                  </span>
                  {d.type === 'TEXT_LONG' ? (
                    <textarea
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                      rows={3}
                    />
                  ) : d.type === 'BOOLEAN' ? (
                    <select
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                    >
                      <option value="">—</option>
                      <option value="true">Oui</option>
                      <option value="false">Non</option>
                    </select>
                  ) : d.type === 'SELECT' ? (
                    <select value={val} onChange={(e) => setVal(e.target.value)}>
                      <option value="">— Choisir —</option>
                      {options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : d.type === 'DATE' ? (
                    <input
                      type="date"
                      value={val.slice(0, 10)}
                      onChange={(e) => setVal(e.target.value)}
                    />
                  ) : d.type === 'NUMBER' ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                    />
                  ) : (
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                    />
                  )}
                </div>
              );
            })}

            <div className="members-form__fieldset">
              <span className="members-form__legend">Rôles système</span>
              {BUILTIN_ROLE_OPTIONS.map((opt) => (
                <label key={opt.value} className="field field--checkbox">
                  <input
                    type="checkbox"
                    checked={builtinRoles.includes(opt.value)}
                    onChange={() => toggleBuiltinRole(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>

            {roleDefs.length > 0 ? (
              <div className="members-form__fieldset">
                <span className="members-form__legend">Rôles du club</span>
                <p className="muted members-form__hint">
                  Libellés définis dans Membres → Rôles.
                </p>
                {roleDefs.map((r) => (
                  <label key={r.id} className="field field--checkbox">
                    <input
                      type="checkbox"
                      checked={customRoleIds.includes(r.id)}
                      onChange={() => toggleCustomRole(r.id)}
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
            ) : null}

            <div className="members-form__actions-row">
              <button
                type="submit"
                className="btn btn-primary members-form__submit"
                disabled={creating || emailDupPreventsCreate}
              >
                {creating ? 'Enregistrement…' : 'Créer le membre'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
