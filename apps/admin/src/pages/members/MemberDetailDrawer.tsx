import { useMutation, useQuery } from '@apollo/client/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuickMessageModal } from '../../components/QuickMessageModal';
import { useClubCommunicationEnabled } from '../../lib/useClubCommunicationEnabled';
import {
  CLUB_FAMILIES,
  CLUB_GRADE_LEVELS,
  CLUB_MEMBER_FIELD_LAYOUT,
  CLUB_MEMBERS,
  CLUB_MEMBER_TELEGRAM,
  CLUB_ROLE_DEFINITIONS,
  DISCONNECT_MEMBER_TELEGRAM,
  ISSUE_TELEGRAM_MEMBER_LINK,
  CREATE_CLUB_FAMILY,
  DELETE_CLUB_MEMBER,
  REMOVE_CLUB_MEMBER_FROM_FAMILY,
  SET_CLUB_FAMILY_PAYER,
  TRANSFER_CLUB_MEMBER_TO_FAMILY,
  UPDATE_CLUB_MEMBER,
} from '../../lib/documents';
import { MEMBER_CATALOG_FIELD_LABELS } from '../../lib/member-field-labels';
import type {
  DeleteMemberMutationData,
  FamiliesQueryData,
  GradeLevelsQueryData,
  MemberFieldLayoutQueryData,
  MembersQueryData,
  ClubMemberTelegramQueryData,
  RoleDefinitionsQueryData,
  SetClubFamilyPayerMutationData,
  TransferMemberFamilyMutationData,
  UpdateMemberMutationData,
} from '../../lib/types';
import { BUILTIN_ROLE_OPTIONS } from './members-constants';
import { MemberAdhesionPanels } from './MemberAdhesionPanels';
import { MemberPhotoField } from './MemberPhotoField';

function formatGqlMutationError(err: unknown): string {
  if (err && typeof err === 'object' && 'graphQLErrors' in err) {
    const gql = err as {
      graphQLErrors?: readonly { message?: string }[];
      message?: string;
    };
    const first = gql.graphQLErrors?.[0]?.message;
    if (first) return first;
    if (gql.message) return gql.message;
  }
  if (err instanceof Error) return err.message;
  return 'Une erreur est survenue.';
}

/* eslint-disable react-hooks/set-state-in-effect -- hydratation / reset formulaire tiroir membre */
type MemberRow = MembersQueryData['clubMembers'][number];

type CatalogFieldRow = { fieldKey: string };

function buildMemberFormPristineSnapshot(
  m: MemberRow,
  catalogWithoutPhoto: CatalogFieldRow[],
  customDefs: { id: string }[],
): string {
  const keys = new Set(catalogWithoutPhoto.map((s) => s.fieldKey));
  const sortedCatalogKeys = [...keys].sort();
  const fromMember: Record<string, string> = {
    PHONE: m.phone ?? '',
    ADDRESS_LINE: m.addressLine ?? '',
    POSTAL_CODE: m.postalCode ?? '',
    CITY: m.city ?? '',
    MEDICAL_CERT_EXPIRES_AT: m.medicalCertExpiresAt
      ? m.medicalCertExpiresAt.slice(0, 10)
      : '',
  };
  const catalogScalars: Record<string, string> = {};
  for (const k of sortedCatalogKeys) {
    catalogScalars[k] = (fromMember[k] ?? '').trim();
  }
  const cf: Record<string, string> = {};
  for (const id of [...customDefs.map((d) => d.id)].sort()) {
    const cv = m.customFieldValues?.find((c) => c.definitionId === id);
    cf[id] = (cv?.valueText ?? '').trim();
  }
  return JSON.stringify({
    firstName: m.firstName.trim(),
    lastName: m.lastName.trim(),
    email: m.email.trim(),
    civility: m.civility,
    photoUrl: (m.photoUrl ?? '').trim(),
    birthDate: m.birthDate ? m.birthDate.slice(0, 10) : '',
    gradeId: m.gradeLevelId ?? m.gradeLevel?.id ?? '',
    roles: [...m.roles].sort(),
    customRoleIds: m.customRoles.map((c) => c.id).sort(),
    catalogScalars,
    customFields: cf,
    joinFamilyId: '',
    joinLinkRole: 'MEMBER',
    createFamilyLabel: '',
    createExtraIds: [] as string[],
  });
}

function buildMemberFormDraftSnapshot(
  catalogWithoutPhoto: CatalogFieldRow[],
  customDefs: { id: string }[],
  draft: {
    firstName: string;
    lastName: string;
    email: string;
    civility: string;
    photoUrl: string;
    birthDate: string;
    gradeId: string;
    builtinRoles: string[];
    customRoleIds: string[];
    catalogScalars: Record<string, string>;
    customFieldDraft: Record<string, string>;
    joinFamilyId: string;
    joinLinkRole: 'PAYER' | 'MEMBER';
    createFamilyLabel: string;
    createExtraIds: Set<string>;
  },
): string {
  const keys = new Set(catalogWithoutPhoto.map((s) => s.fieldKey));
  const sortedCatalogKeys = [...keys].sort();
  const catalogScalars: Record<string, string> = {};
  for (const k of sortedCatalogKeys) {
    catalogScalars[k] = (draft.catalogScalars[k] ?? '').trim();
  }
  const cf: Record<string, string> = {};
  for (const id of [...customDefs.map((d) => d.id)].sort()) {
    cf[id] = (draft.customFieldDraft[id] ?? '').trim();
  }
  return JSON.stringify({
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    email: draft.email.trim(),
    civility: draft.civility,
    photoUrl: (draft.photoUrl ?? '').trim(),
    birthDate: draft.birthDate,
    gradeId: draft.gradeId,
    roles: [...draft.builtinRoles].sort(),
    customRoleIds: [...draft.customRoleIds].sort(),
    catalogScalars,
    customFields: cf,
    joinFamilyId: draft.joinFamilyId,
    joinLinkRole: draft.joinLinkRole,
    createFamilyLabel: draft.createFamilyLabel.trim(),
    createExtraIds: [...draft.createExtraIds].sort(),
  });
}

export function MemberDetailDrawer({
  memberId,
  onClose,
}: {
  memberId: string;
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [civility, setCivility] = useState<string>('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [builtinRoles, setBuiltinRoles] = useState<string[]>(['STUDENT']);
  const [customRoleIds, setCustomRoleIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [memberFormHydrated, setMemberFormHydrated] = useState(false);

  /**
   * Recommandation UX #2 — Navigation par onglets dans le tiroir membre
   * Sépare le contenu en 3 onglets : Identité, Adhésion, Foyer
   */
  type DrawerTab = 'identity' | 'adhesion' | 'family';
  const [activeTab, setActiveTab] = useState<DrawerTab>('identity');
  const commEnabled = useClubCommunicationEnabled();
  const [quickMsgOpen, setQuickMsgOpen] = useState(false);

  useEffect(() => {
    if (!commEnabled) setQuickMsgOpen(false);
  }, [commEnabled]);

  const [joinFamilyId, setJoinFamilyId] = useState('');
  const [joinLinkRole, setJoinLinkRole] = useState<'PAYER' | 'MEMBER'>(
    'MEMBER',
  );
  const [createFamilyLabel, setCreateFamilyLabel] = useState('');
  const [createExtraIds, setCreateExtraIds] = useState<Set<string>>(new Set());
  const [familyFilter, setFamilyFilter] = useState('');
  const [familyFormError, setFamilyFormError] = useState<string | null>(null);

  const [photoUrl, setPhotoUrl] = useState('');
  const [catalogScalars, setCatalogScalars] = useState<Record<string, string>>(
    {},
  );
  const [customFieldDraft, setCustomFieldDraft] = useState<
    Record<string, string>
  >({});

  const { data, loading, refetch } = useQuery<MembersQueryData>(CLUB_MEMBERS, {
    fetchPolicy: 'network-only',
  });
  const { data: memberTgData } = useQuery<ClubMemberTelegramQueryData>(
    CLUB_MEMBER_TELEGRAM,
    {
      variables: { id: memberId },
      skip: !memberId || !commEnabled,
      fetchPolicy: 'network-only',
    },
  );
  const [issueTelegramLink, { loading: issueTgLoading }] = useMutation<
    {
      issueTelegramMemberLink: {
        url: string;
        expiresAt: string;
        emailSent: boolean;
      };
    },
    { memberId: string }
  >(ISSUE_TELEGRAM_MEMBER_LINK, {
    refetchQueries: [
      { query: CLUB_MEMBERS },
      { query: CLUB_MEMBER_TELEGRAM, variables: { id: memberId } },
    ],
  });
  const [disconnectTelegram, { loading: disconnectTgLoading }] = useMutation<
    { disconnectMemberTelegram: boolean },
    { memberId: string }
  >(DISCONNECT_MEMBER_TELEGRAM, {
    refetchQueries: [
      { query: CLUB_MEMBERS },
      { query: CLUB_MEMBER_TELEGRAM, variables: { id: memberId } },
    ],
  });
  const [telegramInviteEmailSent, setTelegramInviteEmailSent] =
    useState(false);
  const [telegramPanelError, setTelegramPanelError] = useState<string | null>(
    null,
  );
  const { data: layoutData } = useQuery<MemberFieldLayoutQueryData>(
    CLUB_MEMBER_FIELD_LAYOUT,
  );
  const { data: famData, refetch: refetchFamilies } =
    useQuery<FamiliesQueryData>(CLUB_FAMILIES);
  const { data: gradesData } = useQuery<GradeLevelsQueryData>(
    CLUB_GRADE_LEVELS,
  );
  const { data: roleDefsData } = useQuery<RoleDefinitionsQueryData>(
    CLUB_ROLE_DEFINITIONS,
  );

  const members = data?.clubMembers ?? [];
  const families = famData?.clubFamilies ?? [];
  const grades = gradesData?.clubGradeLevels ?? [];
  const roleDefs = roleDefsData?.clubRoleDefinitions ?? [];

  const member = useMemo(
    () => members.find((m) => m.id === memberId),
    [members, memberId],
  );

  /** Source fiable : requête `clubMember(id)` (la liste clubMembers peut rester obsolète dans le cache Apollo). */
  const telegramLinkedUi = useMemo(() => {
    const cm = memberTgData?.clubMember;
    if (cm != null) {
      return cm.telegramLinked === true;
    }
    return member?.telegramLinked === true;
  }, [memberTgData?.clubMember, member?.telegramLinked]);

  useEffect(() => {
    setTelegramInviteEmailSent(false);
    setTelegramPanelError(null);
  }, [memberId, telegramLinkedUi]);

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

  /** Photo en tête de fiche : exclus de la liste catalogue pour éviter le doublon. */
  const catalogFieldsWithoutPhoto = useMemo(
    () => visibleCatalog.filter((s) => s.fieldKey !== 'PHOTO_URL'),
    [visibleCatalog],
  );

  const pristineFormSnapshot = useMemo(() => {
    if (!member) {
      return '';
    }
    return buildMemberFormPristineSnapshot(
      member,
      catalogFieldsWithoutPhoto,
      customDefsSorted,
    );
  }, [member, catalogFieldsWithoutPhoto, customDefsSorted]);

  const draftFormSnapshot = useMemo(() => {
    if (!member) {
      return '';
    }
    return buildMemberFormDraftSnapshot(
      catalogFieldsWithoutPhoto,
      customDefsSorted,
      {
        firstName,
        lastName,
        email,
        civility,
        photoUrl,
        birthDate,
        gradeId,
        builtinRoles,
        customRoleIds,
        catalogScalars,
        customFieldDraft,
        joinFamilyId,
        joinLinkRole,
        createFamilyLabel,
        createExtraIds,
      },
    );
  }, [
    member,
    catalogFieldsWithoutPhoto,
    customDefsSorted,
    firstName,
    lastName,
    email,
    civility,
    photoUrl,
    birthDate,
    gradeId,
    builtinRoles,
    customRoleIds,
    catalogScalars,
    customFieldDraft,
    joinFamilyId,
    joinLinkRole,
    createFamilyLabel,
    createExtraIds,
  ]);

  const isMemberFormDirty =
    memberFormHydrated &&
    Boolean(member) &&
    !loading &&
    Boolean(pristineFormSnapshot) &&
    pristineFormSnapshot !== draftFormSnapshot;

  /** Évite un premier rendu avec photoUrl vide (sinis le champ photo vide le cache d’édition). */
  useLayoutEffect(() => {
    if (!member) {
      return;
    }
    setPhotoUrl(member.photoUrl ?? '');
  }, [memberId, member?.photoUrl, member]);

  const identitySyncKey = member
    ? [
        member.id,
        member.firstName,
        member.lastName,
        member.civility,
        member.email,
        member.phone ?? '',
        member.addressLine ?? '',
        member.postalCode ?? '',
        member.city ?? '',
        member.photoUrl ?? '',
        member.birthDate ?? '',
        member.medicalCertExpiresAt ?? '',
        member.gradeLevelId ?? '',
        [...member.roles].sort().join(','),
        member.customRoles
          .map((c) => c.id)
          .sort()
          .join(','),
        (member.customFieldValues ?? [])
          .map((c) => `${c.definitionId}:${c.valueText ?? ''}`)
          .sort()
          .join('|'),
      ].join('|')
    : '';

  useEffect(() => {
    if (!member) return;
    setFirstName(member.firstName);
    setLastName(member.lastName);
    setCivility(member.civility);
    setEmail(member.email);
    setPhotoUrl(member.photoUrl ?? '');
    setBirthDate(member.birthDate ? member.birthDate.slice(0, 10) : '');
    setGradeId(member.gradeLevelId ?? member.gradeLevel?.id ?? '');
    setBuiltinRoles(
      member.roles.length > 0 ? [...member.roles] : ['STUDENT'],
    );
    setCustomRoleIds(member.customRoles.map((c) => c.id));
    setCatalogScalars({
      PHONE: member.phone ?? '',
      ADDRESS_LINE: member.addressLine ?? '',
      POSTAL_CODE: member.postalCode ?? '',
      CITY: member.city ?? '',
      MEDICAL_CERT_EXPIRES_AT: member.medicalCertExpiresAt
        ? member.medicalCertExpiresAt.slice(0, 10)
        : '',
    });
    const cf: Record<string, string> = {};
    for (const cv of member.customFieldValues ?? []) {
      cf[cv.definitionId] = cv.valueText ?? '';
    }
    setCustomFieldDraft(cf);
    setFormError(null);
    setMemberFormHydrated(true);
  }, [identitySyncKey, member]);

  useEffect(() => {
    setCloseConfirmOpen(false);
    setMemberFormHydrated(false);
    setActiveTab('identity');
  }, [memberId]);

  useEffect(() => {
    setJoinFamilyId('');
    setJoinLinkRole('MEMBER');
    setCreateFamilyLabel('');
    setCreateExtraIds(new Set());
    setFamilyFilter('');
    setFamilyFormError(null);
  }, [
    memberId,
    member?.family?.id ?? '',
    member?.familyLink?.linkRole ?? '',
  ]);

  const refetchAll = () => {
    void refetch();
    void refetchFamilies();
  };

  const [updateMember, { loading: updating }] = useMutation<
    UpdateMemberMutationData,
    { input: Record<string, unknown> }
  >(UPDATE_CLUB_MEMBER, {
    onCompleted: () => {
      void refetch();
      setFormError(null);
    },
    onError: (e) => setFormError(e.message),
  });

  const [deleteMember, { loading: deleting }] = useMutation<
    DeleteMemberMutationData
  >(DELETE_CLUB_MEMBER, {
    onCompleted: () => {
      refetchAll();
      onClose();
    },
    onError: (e) => setFormError(e.message),
  });

  const [removeFromFamily, { loading: removingFamily }] = useMutation(
    REMOVE_CLUB_MEMBER_FROM_FAMILY,
    {
      onCompleted: () => refetchAll(),
      onError: (e) => setFamilyFormError(e.message),
    },
  );

  const [transferToFamily, { loading: transferring }] = useMutation<
    TransferMemberFamilyMutationData,
    {
      memberId: string;
      familyId: string;
      linkRole: string;
    }
  >(TRANSFER_CLUB_MEMBER_TO_FAMILY, {
    onCompleted: () => refetchAll(),
    onError: (e) => setFamilyFormError(e.message),
  });

  const [setFamilyPayer, { loading: settingPayer }] = useMutation<
    SetClubFamilyPayerMutationData,
    { memberId: string }
  >(SET_CLUB_FAMILY_PAYER, {
    onCompleted: () => refetchAll(),
    onError: (e) => setFamilyFormError(e.message),
  });

  const [createFamilyFromMember, { loading: creatingFamily }] = useMutation(
    CREATE_CLUB_FAMILY,
    {
      onCompleted: () => {
        refetchAll();
        setCreateFamilyLabel('');
        setCreateExtraIds(new Set());
        setFamilyFormError(null);
      },
      onError: (e) => setFamilyFormError(e.message),
    },
  );

  const requestClose = useCallback(() => {
    if (closeConfirmOpen) {
      setCloseConfirmOpen(false);
      return;
    }
    if (!isMemberFormDirty) {
      onClose();
      return;
    }
    setCloseConfirmOpen(true);
  }, [closeConfirmOpen, isMemberFormDirty, onClose]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return;
      }
      if (closeConfirmOpen) {
        setCloseConfirmOpen(false);
        return;
      }
      requestClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [closeConfirmOpen, requestClose]);

  useEffect(() => {
    void refetch();
    void refetchFamilies();
  }, [memberId, refetch, refetchFamilies]);

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

  function toggleCreateExtra(id: string, selfId: string) {
    if (id === selfId) return;
    setCreateExtraIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildMemberUpdateInput(): Record<string, unknown> | null {
    if (!member) {
      return null;
    }
    setFormError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setFormError('Prénom et nom sont obligatoires.');
      return null;
    }
    if (civility !== 'MR' && civility !== 'MME') {
      setFormError('La civilité est obligatoire.');
      return null;
    }
    if (!email.trim()) {
      setFormError('L’e-mail est obligatoire.');
      return null;
    }
    if (builtinRoles.length === 0) {
      setFormError('Au moins un rôle système (adhérent, coach ou bureau).');
      return null;
    }
    const input: Record<string, unknown> = {
      id: member.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      civility,
      photoUrl: photoUrl.trim() || null,
      roles: builtinRoles,
      customRoleIds,
    };

    const catalogKeysShown = new Set(
      catalogFieldsWithoutPhoto.map((s) => s.fieldKey),
    );
    if (catalogKeysShown.has('BIRTH_DATE')) {
      if (birthDate) input.birthDate = birthDate;
      else input.birthDate = null;
    }
    if (catalogKeysShown.has('GRADE_LEVEL')) {
      input.gradeLevelId = gradeId || null;
    }
    if (catalogKeysShown.has('PHONE')) {
      input.phone = catalogScalars.PHONE?.trim() || null;
    }
    if (catalogKeysShown.has('ADDRESS_LINE')) {
      input.addressLine = catalogScalars.ADDRESS_LINE?.trim() || null;
    }
    if (catalogKeysShown.has('POSTAL_CODE')) {
      input.postalCode = catalogScalars.POSTAL_CODE?.trim() || null;
    }
    if (catalogKeysShown.has('CITY')) {
      input.city = catalogScalars.CITY?.trim() || null;
    }
    if (catalogKeysShown.has('MEDICAL_CERT_EXPIRES_AT')) {
      const v = catalogScalars.MEDICAL_CERT_EXPIRES_AT?.trim();
      input.medicalCertExpiresAt = v || null;
    }

    if (customDefsSorted.length > 0) {
      input.customFieldValues = customDefsSorted.map((d) => ({
        definitionId: d.id,
        value: customFieldDraft[d.id] ?? '',
      }));
    }

    return input;
  }

  async function performMemberSave(): Promise<boolean> {
    const input = buildMemberUpdateInput();
    if (!input) {
      return false;
    }
    try {
      const result = await updateMember({ variables: { input } });
      if (result.error) {
        setFormError(result.error.message);
        return false;
      }
      if (!result.data?.updateClubMember) {
        return false;
      }
      return true;
    } catch (e: unknown) {
      setFormError(
        e instanceof Error ? e.message : 'Enregistrement impossible.',
      );
      return false;
    }
  }

  async function onEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    await performMemberSave();
  }

  async function saveAndClose() {
    const ok = await performMemberSave();
    if (ok) {
      setCloseConfirmOpen(false);
      onClose();
    }
  }

  function discardAndClose() {
    setCloseConfirmOpen(false);
    onClose();
  }

  async function onDelete() {
    if (!member) return;
    if (
      !window.confirm(
        `Supprimer la fiche de « ${member.firstName} ${member.lastName} » ? Cette action est définitive.`,
      )
    ) {
      return;
    }
    await deleteMember({ variables: { id: member.id } });
  }

  async function onDetachFamily() {
    if (!member) return;
    setFamilyFormError(null);
    const isPayer = member.familyLink?.linkRole === 'PAYER';
    let msg = `Détacher « ${member.firstName} ${member.lastName} » du foyer ?`;
    if (isPayer) {
      msg +=
        ' Cette personne est payeur : le foyer pourra être sans payeur si d’autres membres y restent.';
    }
    if (!window.confirm(msg)) return;
    await removeFromFamily({ variables: { memberId: member.id } });
  }

  function confirmJoinFamily() {
    if (!member || !joinFamilyId) {
      setFamilyFormError('Choisissez un foyer cible.');
      return;
    }
    setFamilyFormError(null);
    const m = member;
    let msg =
      m.family && m.family.id !== joinFamilyId
        ? 'Vous quitterez le foyer actuel pour rejoindre celui-ci.'
        : 'Confirmer le rattachement à ce foyer ?';
    if (
      m.family &&
      m.familyLink?.linkRole === 'PAYER' &&
      m.family.id !== joinFamilyId
    ) {
      const fam = families.find((f) => f.id === m.family!.id);
      const others =
        fam?.links.filter((l) => l.memberId !== m.id).length ?? 0;
      if (others > 0) {
        msg +=
          ' L’ancien foyer pourra être sans payeur jusqu’à désignation d’un nouveau payeur.';
      }
    }
    if (!window.confirm(msg)) return;
    void transferToFamily({
      variables: {
        memberId: m.id,
        familyId: joinFamilyId,
        linkRole: joinLinkRole,
      },
    });
  }

  async function onSetAsPayer() {
    if (!member) return;
    setFamilyFormError(null);
    if (
      !window.confirm(
        `Désigner « ${member.firstName} ${member.lastName} » comme payeur du foyer ? L’ancien payeur deviendra simple membre.`,
      )
    ) {
      return;
    }
    await setFamilyPayer({ variables: { memberId: member.id } });
  }

  async function onCreateFamilySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setFamilyFormError(null);
    const ids = new Set(createExtraIds);
    ids.add(member.id);
    const memberIds = [...ids];
    await createFamilyFromMember({
      variables: {
        input: {
          label: createFamilyLabel.trim() || undefined,
          payerMemberId: member.id,
          memberIds,
        },
      },
    });
  }

  const modalFamiliesPick = useMemo(() => {
    const q = familyFilter.trim().toLowerCase();
    return families.filter((f) => {
      const label = (f.label ?? '').toLowerCase();
      const display = label || 'foyer sans nom';
      if (!q) return true;
      return display.includes(q);
    });
  }, [families, familyFilter]);

  const body =
    loading && !member ? (
      <p className="muted">Chargement…</p>
    ) : !member ? (
      <>
        <p className="form-error">Membre introuvable.</p>
        <button type="button" className="btn btn-ghost" onClick={requestClose}>
          Fermer
        </button>
      </>
    ) : (
      <>
        <header className="family-drawer__head">
          <div>
            <p className="members-loom__eyebrow">Fiche membre</p>
            <h2 className="family-drawer__title" id="member-drawer-title">
              {member.firstName} {member.lastName}
            </h2>
          </div>
          <div className="family-drawer__head-actions">
            {commEnabled ? (
              <button
                type="button"
                className="btn btn-ghost btn-tight"
                title="Envoyer un message"
                onClick={() => setQuickMsgOpen(true)}
                aria-label="Envoyer un message"
              >
                <span className="material-symbols-outlined" aria-hidden>
                  mail
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-tight"
              onClick={requestClose}
            >
              Fermer
            </button>
          </div>
        </header>

        {formError ? <p className="form-error">{formError}</p> : null}

        <p className="muted family-drawer__hint">
          <Link to="/settings/member-fields">Paramètres fiche</Link>
          {' · '}
          <Link to="/members/families">Familles &amp; payeurs</Link>
        </p>

        {/* Recommandation UX #2 — Onglets tiroir membre */}
        <nav className="member-drawer-tabs" role="tablist" aria-label="Sections de la fiche membre">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'identity'}
            className={`member-drawer-tab${activeTab === 'identity' ? ' member-drawer-tab--active' : ''}`}
            onClick={() => setActiveTab('identity')}
          >
            <span className="material-symbols-outlined member-drawer-tab__ico">person</span>
            Identité
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'adhesion'}
            className={`member-drawer-tab${activeTab === 'adhesion' ? ' member-drawer-tab--active' : ''}`}
            onClick={() => setActiveTab('adhesion')}
          >
            <span className="material-symbols-outlined member-drawer-tab__ico">assignment</span>
            Adhésion
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'family'}
            className={`member-drawer-tab${activeTab === 'family' ? ' member-drawer-tab--active' : ''}`}
            onClick={() => setActiveTab('family')}
          >
            <span className="material-symbols-outlined member-drawer-tab__ico">groups</span>
            Foyer
          </button>
        </nav>

        {activeTab === 'identity' ? (
        <form
          className="family-drawer__section members-form"
          onSubmit={(e) => void onEditSubmit(e)}
        >
          <h3 className="family-drawer__h">Identité & rôles métier</h3>
          <MemberPhotoField
            key={memberId}
            idPrefix="drawer-member-photo"
            persistenceKey={memberId}
            value={photoUrl}
            onChange={setPhotoUrl}
          />
          {commEnabled ? (
            <div
              className="member-telegram-panel"
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                border: '1px solid var(--border, #e0e0e0)',
                borderRadius: 8,
              }}
            >
              <h4 className="family-drawer__h" style={{ fontSize: '0.95rem' }}>
                Telegram
              </h4>
              {telegramPanelError ? (
                <p className="form-error" role="alert">
                  {telegramPanelError}
                </p>
              ) : null}
              {telegramLinkedUi ? (
                <>
                  <p className="muted" style={{ margin: '0.5rem 0' }}>
                    Compte Telegram relié.
                  </p>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={disconnectTgLoading}
                    onClick={() => {
                      if (!member) return;
                      setTelegramPanelError(null);
                      void disconnectTelegram({
                        variables: { memberId: member.id },
                      })
                        .then(() => setTelegramInviteEmailSent(false))
                        .catch((err: unknown) => {
                          setTelegramPanelError(formatGqlMutationError(err));
                        });
                    }}
                  >
                    Déconnecter
                  </button>
                </>
              ) : (
                <>
                  <p className="muted" style={{ margin: '0.5rem 0' }}>
                    Un e-mail avec un bouton pour ouvrir Telegram est envoyé
                    directement à l’adresse du membre (aucune étape
                    supplémentaire).
                  </p>
                  <p
                    className="muted"
                    style={{
                      fontSize: '0.85rem',
                      margin: '0 0 0.75rem',
                      lineHeight: 1.45,
                    }}
                  >
                    Le statut « Compte Telegram relié » n’apparaît qu’après que
                    Telegram a appelé votre API (webhook) suite au{' '}
                    <code>/start</code> avec le jeton. Si vous êtes en local sans
                    URL HTTPS publique, Telegram n’atteint pas{' '}
                    <code>localhost</code> : la liaison ne peut pas être
                    enregistrée tant que le webhook n’est pas configuré (ex.
                    tunnel ngrok vers <code>POST /webhooks/telegram</code>).
                  </p>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={issueTgLoading}
                    onClick={() => {
                      if (!member) return;
                      setTelegramPanelError(null);
                      void issueTelegramLink({
                        variables: { memberId: member.id },
                      })
                        .then((res) => {
                          const pl = res.data?.issueTelegramMemberLink;
                          if (pl?.emailSent) {
                            setTelegramInviteEmailSent(true);
                          }
                        })
                        .catch((err: unknown) => {
                          setTelegramPanelError(formatGqlMutationError(err));
                        });
                    }}
                  >
                    Envoyer l’invitation par e-mail
                  </button>
                  {telegramInviteEmailSent ? (
                    <p
                      className="muted"
                      style={{
                        marginTop: '0.75rem',
                        padding: '0.6rem 0.75rem',
                        background: 'rgba(13,148,136,0.08)',
                        borderRadius: 8,
                        border: '1px solid rgba(13,148,136,0.25)',
                      }}
                    >
                      <span className="material-symbols-outlined" aria-hidden style={{ verticalAlign: 'middle', marginRight: 6, fontSize: '1.1rem' }}>
                        mark_email_read
                      </span>
                      Invitation envoyée à{' '}
                      <strong>{member.email}</strong> — le membre peut utiliser
                      le bouton dans le message.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
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
              onChange={(e) => setEmail(e.target.value)}
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
                {d.visibleToMember ? (
                  <p className="muted members-form__hint">Visible adhérent</p>
                ) : null}
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
              disabled={updating}
            >
              {updating ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              className="btn btn-ghost members-table__danger"
              disabled={deleting}
              onClick={() => void onDelete()}
            >
              {deleting ? 'Suppression…' : 'Supprimer la fiche'}
            </button>
          </div>
        </form>
        ) : null}

        {activeTab === 'adhesion' ? (
        <MemberAdhesionPanels
          key={`${member.id}-${(member.assignedDynamicGroups ?? [])
            .map((g) => g.id)
            .sort()
            .join(',')}`}
          member={member}
        />
        ) : null}

        {activeTab === 'family' ? (
        <div className="family-drawer__section">
          <h3 className="family-drawer__h">Foyer</h3>
          {familyFormError ? (
            <p className="form-error">{familyFormError}</p>
          ) : null}
          <p className="muted members-family-modal__hint">
            Payeur et rattachement — règles ClubFlow (un payeur par foyer).
          </p>
          <div className="members-family-modal__current">
            <strong>Foyer actuel : </strong>
            {member.family ? (
              <>
                {member.family.label ?? 'Sans nom'}
                {member.familyLink?.linkRole === 'PAYER'
                  ? ' · payeur'
                  : ' · membre'}
              </>
            ) : (
              <span className="muted">
                aucun — <strong>adhérent seul</strong>, payeur de fait pour
                ses facturations
              </span>
            )}
          </div>
          {member.family ? (
            <div className="members-family-modal__actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={removingFamily}
                onClick={() => void onDetachFamily()}
              >
                {removingFamily ? 'Détachement…' : 'Détacher du foyer'}
              </button>
              {member.familyLink?.linkRole === 'MEMBER' ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={settingPayer}
                  onClick={() => void onSetAsPayer()}
                >
                  {settingPayer ? '…' : 'Définir comme payeur'}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="members-family-modal__section">
            <h4 className="members-family-modal__h">Rejoindre un foyer</h4>
            <label className="field">
              <span>Filtrer les foyers (libellé)</span>
              <input
                value={familyFilter}
                onChange={(e) => setFamilyFilter(e.target.value)}
                placeholder="Ex. Martin"
              />
            </label>
            <label className="field">
              <span>Foyer cible</span>
              <select
                value={joinFamilyId}
                onChange={(e) => setJoinFamilyId(e.target.value)}
              >
                <option value="">— Choisir —</option>
                {modalFamiliesPick.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label ?? 'Foyer sans nom'}
                    {f.needsPayer ? ' (payeur manquant)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="members-family-modal__roles">
              <legend className="sr-only">Rôle dans le foyer</legend>
              <label className="field field--checkbox">
                <input
                  type="radio"
                  name="joinLinkRole"
                  checked={joinLinkRole === 'MEMBER'}
                  onChange={() => setJoinLinkRole('MEMBER')}
                />
                <span>Membre</span>
              </label>
              <label className="field field--checkbox">
                <input
                  type="radio"
                  name="joinLinkRole"
                  checked={joinLinkRole === 'PAYER'}
                  onChange={() => setJoinLinkRole('PAYER')}
                />
                <span>Payeur</span>
              </label>
            </fieldset>
            <button
              type="button"
              className="btn btn-primary"
              disabled={transferring || !joinFamilyId}
              onClick={() => confirmJoinFamily()}
            >
              {transferring ? 'En cours…' : 'Rattacher à ce foyer'}
            </button>
          </div>

          <div className="members-family-modal__section">
            <h4 className="members-family-modal__h">Créer un nouveau foyer</h4>
            <p className="muted members-form__hint">
              Ce membre sera payeur. Cochez d’autres adhérents sans foyer pour
              les inclure (sinon détachez-les d’abord de leur foyer actuel).
            </p>
            <form onSubmit={(e) => void onCreateFamilySubmit(e)}>
              <label className="field">
                <span>Libellé (optionnel)</span>
                <input
                  value={createFamilyLabel}
                  onChange={(e) => setCreateFamilyLabel(e.target.value)}
                />
              </label>
              <div className="field">
                <span>Autres membres du foyer</span>
                <ul className="families-member-checks">
                  {members
                    .filter(
                      (x) =>
                        x.id !== member.id &&
                        !x.family &&
                        x.status === 'ACTIVE',
                    )
                    .map((x) => (
                      <li key={x.id}>
                        <label className="families-check-row">
                          <input
                            type="checkbox"
                            checked={createExtraIds.has(x.id)}
                            onChange={() =>
                              toggleCreateExtra(x.id, member.id)
                            }
                          />
                          <span>
                            {x.firstName} {x.lastName}
                          </span>
                        </label>
                      </li>
                    ))}
                </ul>
              </div>
              <button
                type="submit"
                className="btn btn-primary members-form__submit"
                disabled={creatingFamily || Boolean(member.family)}
              >
                {creatingFamily
                  ? 'Création…'
                  : 'Créer le foyer (payeur = fiche courante)'}
              </button>
              {member.family ? (
                <p className="muted members-form__hint">
                  Détachez d’abord ce membre de son foyer actuel pour en créer
                  un autre.
                </p>
              ) : null}
            </form>
          </div>
        </div>
        ) : null}
      </>
    );

  return (
    <div
      className="family-drawer-backdrop"
      role="presentation"
      onClick={requestClose}
    >
      <aside
        className="family-drawer family-drawer--wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-drawer-title"
      >
        {body}
        {closeConfirmOpen ? (
          <div
            className="member-drawer-close-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="member-drawer-close-confirm-title"
          >
            <div className="member-drawer-close-confirm__panel">
              <h3 id="member-drawer-close-confirm-title">
                Enregistrer les modifications ?
              </h3>
              <p className="muted member-drawer-close-confirm__lede">
                La fiche a été modifiée. Souhaitez-vous enregistrer avant de
                fermer ?
              </p>
              <div className="member-drawer-close-confirm__actions">
                <button
                  type="button"
                  className="btn btn-primary btn-tight"
                  disabled={updating}
                  onClick={() => void saveAndClose()}
                >
                  {updating ? 'Enregistrement…' : 'Enregistrer et fermer'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-tight"
                  disabled={updating}
                  onClick={discardAndClose}
                >
                  Quitter sans enregistrer
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-tight"
                  disabled={updating}
                  onClick={() => setCloseConfirmOpen(false)}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
      {member ? (
        <QuickMessageModal
          open={quickMsgOpen}
          onClose={() => setQuickMsgOpen(false)}
          recipientType="MEMBER"
          recipientId={memberId}
          recipientLabel={`${member.firstName} ${member.lastName}`}
        />
      ) : null}
    </div>
  );
}
/* eslint-enable react-hooks/set-state-in-effect */
