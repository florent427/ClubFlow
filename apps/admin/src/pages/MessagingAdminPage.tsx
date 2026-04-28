import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState, type FormEvent } from 'react';
import {
  ADMIN_ARCHIVE_CHAT_GROUP,
  ADMIN_CREATE_CHAT_GROUP,
  ADMIN_POST_CHAT_MESSAGE_AS_MEMBER,
  ADMIN_UPDATE_CHAT_GROUP,
  CLUB_CHAT_ROOMS_ADMIN,
  CLUB_DYNAMIC_GROUPS,
  CLUB_MEMBERS,
} from '../lib/documents';
import type {
  AdminChatRoomRow,
  ChatRoomChannelModeStr,
  ChatRoomPermissionTargetStr,
  ClubChatRoomsAdminQueryData,
  DynamicGroupsQueryData,
  MembersQueryData,
} from '../lib/types';

type ClubMembersQueryData = MembersQueryData;
import { useToast } from '../components/ToastProvider';

type Target = {
  targetKind: ChatRoomPermissionTargetStr;
  targetValue?: string | null;
  dynamicGroupId?: string | null;
};

type DrawerState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; room: AdminChatRoomRow }
  | { kind: 'post-as'; room: AdminChatRoomRow };

const SYSTEM_ROLES: { value: string; label: string }[] = [
  { value: 'CLUB_ADMIN', label: 'Administrateur' },
  { value: 'BOARD', label: 'Bureau' },
  { value: 'COACH', label: 'Coach' },
  { value: 'TREASURER', label: 'Trésorier' },
  { value: 'SECRETARY', label: 'Secrétaire' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'COMM_MANAGER', label: 'Responsable comm.' },
];

const MEMBER_ROLES: { value: string; label: string }[] = [
  { value: 'STUDENT', label: 'Élève' },
  { value: 'COACH', label: 'Coach (membre)' },
  { value: 'BOARD', label: 'Bureau (membre)' },
];

function modeLabel(mode: ChatRoomChannelModeStr): string {
  switch (mode) {
    case 'OPEN':
      return 'Ouvert (tous écrivent)';
    case 'RESTRICTED':
      return 'Restreint (rôles autorisés)';
    case 'READ_ONLY':
      return 'Diffusion seule';
  }
}

export function MessagingAdminPage() {
  const { showToast } = useToast();
  const [drawer, setDrawer] = useState<DrawerState>({ kind: 'closed' });

  const { data: roomsData, refetch } = useQuery<ClubChatRoomsAdminQueryData>(
    CLUB_CHAT_ROOMS_ADMIN,
    { fetchPolicy: 'cache-and-network' },
  );
  const { data: membersData } =
    useQuery<ClubMembersQueryData>(CLUB_MEMBERS);
  const { data: groupsData } = useQuery<DynamicGroupsQueryData>(
    CLUB_DYNAMIC_GROUPS,
  );

  const [createRoom] = useMutation(ADMIN_CREATE_CHAT_GROUP);
  const [updateRoom] = useMutation(ADMIN_UPDATE_CHAT_GROUP);
  const [archiveRoom] = useMutation(ADMIN_ARCHIVE_CHAT_GROUP);
  const [postAsMember] = useMutation(ADMIN_POST_CHAT_MESSAGE_AS_MEMBER);

  const rooms = roomsData?.clubChatRoomsAdmin ?? [];
  const members = membersData?.clubMembers ?? [];
  const groups = groupsData?.clubDynamicGroups ?? [];

  const memberLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of members) {
      m.set(x.id, `${x.firstName} ${x.lastName}`);
    }
    return m;
  }, [members]);

  async function onArchive(id: string, name: string) {
    if (
      !window.confirm(
        `Archiver le salon « ${name} » ? Il restera lisible mais figé.`,
      )
    ) {
      return;
    }
    try {
      await archiveRoom({ variables: { roomId: id } });
      showToast('Salon archivé.', 'success');
      await refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showToast(msg, 'error');
    }
  }

  return (
    <div className="members-loom">
      <header className="members-loom__hero">
        <p className="members-loom__eyebrow">Module Messagerie</p>
        <h1 className="members-loom__title">Messagerie · Administration</h1>
        <p className="members-loom__lede">
          Créez les salons du club, autorisez les rôles à écrire ou
          répondre, configurez les canaux de diffusion. Les salons marqués
          « diffusion » apparaissent dans le canal MESSAGING des campagnes.
        </p>
      </header>

      <div className="members-loom__grid">
        <section className="members-panel members-panel--table">
          <div className="cf-toolbar">
            <h2 className="members-panel__h">Salons</h2>
            <button
              type="button"
              className="members-btn members-btn--primary"
              onClick={() => setDrawer({ kind: 'create' })}
            >
              + Nouveau salon
            </button>
          </div>
          {rooms.length === 0 ? (
            <p className="muted">Aucun salon pour l’instant.</p>
          ) : (
            <div className="members-table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Mode</th>
                    <th>Diffusion</th>
                    <th>Membres</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name ?? '—'}</strong>
                        {r.description ? (
                          <div className="muted">{r.description}</div>
                        ) : null}
                      </td>
                      <td>{modeLabel(r.channelMode)}</td>
                      <td>{r.isBroadcastChannel ? 'Oui' : '—'}</td>
                      <td>{r.members.length}</td>
                      <td>{r.archivedAt ? 'Archivé' : 'Actif'}</td>
                      <td>
                        <div className="planning-slot-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight"
                            onClick={() =>
                              setDrawer({ kind: 'edit', room: r })
                            }
                          >
                            Modifier
                          </button>
                          {!r.archivedAt && r.kind === 'GROUP' ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-tight"
                              onClick={() =>
                                setDrawer({ kind: 'post-as', room: r })
                              }
                            >
                              Poster comme membre
                            </button>
                          ) : null}
                          {!r.archivedAt && r.kind === 'GROUP' ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-tight"
                              onClick={() =>
                                void onArchive(r.id, r.name ?? '')
                              }
                            >
                              Archiver
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {drawer.kind === 'create' ? (
        <RoomDrawer
          mode="create"
          rooms={rooms}
          members={members}
          groups={groups}
          memberLabel={memberLabel}
          onClose={() => setDrawer({ kind: 'closed' })}
          onSubmit={async (form) => {
            try {
              await createRoom({ variables: { input: form } });
              showToast('Salon créé.', 'success');
              setDrawer({ kind: 'closed' });
              await refetch();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Erreur inconnue';
              showToast(msg, 'error');
            }
          }}
        />
      ) : null}

      {drawer.kind === 'edit' ? (
        <RoomDrawer
          mode="edit"
          rooms={rooms}
          members={members}
          groups={groups}
          memberLabel={memberLabel}
          existing={drawer.room}
          onClose={() => setDrawer({ kind: 'closed' })}
          onSubmit={async (form) => {
            try {
              await updateRoom({
                variables: {
                  input: { roomId: drawer.room.id, ...form },
                },
              });
              showToast('Salon mis à jour.', 'success');
              setDrawer({ kind: 'closed' });
              await refetch();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Erreur inconnue';
              showToast(msg, 'error');
            }
          }}
        />
      ) : null}

      {drawer.kind === 'post-as' ? (
        <PostAsDrawer
          room={drawer.room}
          memberLabel={memberLabel}
          onClose={() => setDrawer({ kind: 'closed' })}
          onSubmit={async (asMemberId, body) => {
            try {
              await postAsMember({
                variables: {
                  input: {
                    roomId: drawer.room.id,
                    asMemberId,
                    body,
                  },
                },
              });
              showToast('Message posté.', 'success');
              setDrawer({ kind: 'closed' });
              await refetch();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Erreur inconnue';
              showToast(msg, 'error');
            }
          }}
        />
      ) : null}
    </div>
  );
}

type RoomDrawerProps = {
  mode: 'create' | 'edit';
  rooms: AdminChatRoomRow[];
  members: ClubMembersQueryData['clubMembers'];
  groups: DynamicGroupsQueryData['clubDynamicGroups'];
  memberLabel: Map<string, string>;
  existing?: AdminChatRoomRow;
  onClose: () => void;
  onSubmit: (form: {
    name?: string;
    description?: string | null;
    channelMode: ChatRoomChannelModeStr;
    isBroadcastChannel: boolean;
    memberIds: string[];
    membershipScopes: Target[];
    writePermissions: Target[];
    archived?: boolean;
  }) => Promise<void>;
};

function RoomDrawer({
  mode,
  members,
  groups,
  existing,
  onClose,
  onSubmit,
}: RoomDrawerProps) {
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [channelMode, setChannelMode] = useState<ChatRoomChannelModeStr>(
    existing?.channelMode ?? 'OPEN',
  );
  const [isBroadcast, setIsBroadcast] = useState<boolean>(
    existing?.isBroadcastChannel ?? false,
  );
  const [memberIds, setMemberIds] = useState<Set<string>>(
    new Set(existing?.members.map((m) => m.memberId) ?? []),
  );
  const [scopes, setScopes] = useState<Target[]>(
    existing?.membershipScopes.map((s) => ({
      targetKind: s.targetKind,
      targetValue: s.targetValue,
      dynamicGroupId: s.dynamicGroupId,
    })) ?? [],
  );
  const [permissions, setPermissions] = useState<Target[]>(
    existing?.writePermissions.map((p) => ({
      targetKind: p.targetKind,
      targetValue: p.targetValue,
    })) ?? [],
  );
  const [archived, setArchived] = useState<boolean>(
    Boolean(existing?.archivedAt),
  );

  function toggleMember(id: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addScope(t: Target) {
    setScopes((prev) => [...prev, t]);
  }

  function removeScope(idx: number) {
    setScopes((prev) => prev.filter((_, i) => i !== idx));
  }

  function addPermission(t: Target) {
    setPermissions((prev) => [...prev, t]);
  }

  function removePermission(idx: number) {
    setPermissions((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    await onSubmit({
      name: mode === 'create' ? name : name || undefined,
      description: description || null,
      channelMode,
      isBroadcastChannel: isBroadcast,
      memberIds: [...memberIds],
      membershipScopes: scopes,
      writePermissions: permissions,
      ...(mode === 'edit' ? { archived } : {}),
    });
  }

  return (
    <div className="cf-drawer-backdrop" role="dialog" aria-modal="true">
      <aside className="cf-drawer">
        <header className="cf-drawer__head">
          <h2>{mode === 'create' ? 'Nouveau salon' : `Modifier · ${name}`}</h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </header>
        <form className="members-form" onSubmit={(e) => void onSave(e)}>
          <label className="members-field">
            <span className="members-field__label">Nom</span>
            <input
              className="members-field__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required={mode === 'create'}
              minLength={2}
              maxLength={80}
            />
          </label>
          <label className="members-field">
            <span className="members-field__label">Description</span>
            <textarea
              className="members-field__input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </label>
          <label className="members-field">
            <span className="members-field__label">Mode d’écriture</span>
            <select
              className="members-field__input"
              value={channelMode}
              onChange={(e) =>
                setChannelMode(e.target.value as ChatRoomChannelModeStr)
              }
            >
              <option value="OPEN">Ouvert — tous les membres écrivent</option>
              <option value="RESTRICTED">
                Restreint — seuls les rôles autorisés écrivent
              </option>
              <option value="READ_ONLY">
                Diffusion — personne n’écrit (sauf admin)
              </option>
            </select>
          </label>
          <label className="members-checkbox">
            <input
              type="checkbox"
              checked={isBroadcast}
              onChange={(e) => setIsBroadcast(e.target.checked)}
            />
            <span>
              Utiliser ce salon comme canal de diffusion (campagnes
              MESSAGING)
            </span>
          </label>

          <fieldset className="members-fieldset">
            <legend>Permissions d’écriture</legend>
            <p className="muted">
              Vide = tous les membres du salon peuvent poster (mode RESTRICTED
              seulement). En OPEN, ce champ est ignoré.
            </p>
            {permissions.length > 0 ? (
              <ul className="members-pill-list">
                {permissions.map((p, idx) => (
                  <li key={`${p.targetKind}-${p.targetValue ?? idx}`}>
                    <span>
                      {p.targetKind} · {p.targetValue ?? '—'}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-tight"
                      onClick={() => removePermission(idx)}
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <TargetPicker
              groups={groups}
              onAdd={addPermission}
              allowDynamicGroup={false}
            />
          </fieldset>

          <fieldset className="members-fieldset">
            <legend>Audience (qui rejoint le salon)</legend>
            <p className="muted">
              Les scopes ajoutent automatiquement les membres correspondants.
              Vous pouvez aussi cocher des membres explicitement plus bas.
            </p>
            {scopes.length > 0 ? (
              <ul className="members-pill-list">
                {scopes.map((s, idx) => (
                  <li
                    key={`${s.targetKind}-${s.targetValue ?? s.dynamicGroupId ?? idx}`}
                  >
                    <span>
                      {s.dynamicGroupId
                        ? `Groupe dynamique : ${
                            groups.find((g) => g.id === s.dynamicGroupId)
                              ?.name ?? s.dynamicGroupId
                          }`
                        : `${s.targetKind} · ${s.targetValue ?? '—'}`}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-tight"
                      onClick={() => removeScope(idx)}
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <TargetPicker
              groups={groups}
              onAdd={addScope}
              allowDynamicGroup
            />
          </fieldset>

          <fieldset className="members-fieldset">
            <legend>Membres explicites</legend>
            <p className="muted">
              {memberIds.size} membre{memberIds.size > 1 ? 's' : ''}
              {' '}sélectionné{memberIds.size > 1 ? 's' : ''}.
            </p>
            <div className="members-checkbox-grid members-checkbox-grid--scroll">
              {members.map((m) => (
                <label key={m.id} className="members-checkbox">
                  <input
                    type="checkbox"
                    checked={memberIds.has(m.id)}
                    onChange={() => toggleMember(m.id)}
                  />
                  <span>
                    {m.firstName} {m.lastName}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {mode === 'edit' ? (
            <label className="members-checkbox">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              <span>Salon archivé (lecture seule, masqué côté membre)</span>
            </label>
          ) : null}

          <div className="members-actions">
            <button
              type="button"
              className="members-btn"
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="members-btn members-btn--primary"
            >
              {mode === 'create' ? 'Créer le salon' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function TargetPicker({
  groups,
  onAdd,
  allowDynamicGroup,
}: {
  groups: DynamicGroupsQueryData['clubDynamicGroups'];
  onAdd: (t: Target) => void;
  allowDynamicGroup: boolean;
}) {
  const [kind, setKind] = useState<ChatRoomPermissionTargetStr | 'DYN'>(
    'MEMBER_ROLE',
  );
  const [value, setValue] = useState('');

  function reset() {
    setValue('');
  }

  function submit() {
    if (kind === 'DYN') {
      if (!value) return;
      onAdd({ targetKind: 'MEMBER_ROLE', dynamicGroupId: value });
    } else if (kind === 'CONTACT') {
      onAdd({ targetKind: 'CONTACT', targetValue: null });
    } else {
      if (!value) return;
      onAdd({ targetKind: kind, targetValue: value });
    }
    reset();
  }

  return (
    <div className="cf-toolbar">
      <select
        className="members-field__input"
        value={kind}
        onChange={(e) =>
          setKind(e.target.value as ChatRoomPermissionTargetStr | 'DYN')
        }
      >
        <option value="MEMBER_ROLE">Rôle adhérent</option>
        <option value="SYSTEM_ROLE">Rôle système</option>
        <option value="CONTACT">Contact (parent payeur)</option>
        {allowDynamicGroup ? (
          <option value="DYN">Groupe dynamique</option>
        ) : null}
      </select>
      {kind === 'MEMBER_ROLE' ? (
        <select
          className="members-field__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          <option value="">— Choisir —</option>
          {MEMBER_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      ) : kind === 'SYSTEM_ROLE' ? (
        <select
          className="members-field__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          <option value="">— Choisir —</option>
          {SYSTEM_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      ) : kind === 'DYN' ? (
        <select
          className="members-field__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          <option value="">— Choisir —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost btn-tight"
        onClick={submit}
      >
        Ajouter
      </button>
    </div>
  );
}

function PostAsDrawer({
  room,
  memberLabel,
  onClose,
  onSubmit,
}: {
  room: AdminChatRoomRow;
  memberLabel: Map<string, string>;
  onClose: () => void;
  onSubmit: (asMemberId: string, body: string) => Promise<void>;
}) {
  const [asMemberId, setAsMemberId] = useState(
    room.members[0]?.memberId ?? '',
  );
  const [body, setBody] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!asMemberId || !body.trim()) return;
    await onSubmit(asMemberId, body.trim());
  }

  return (
    <div className="cf-drawer-backdrop" role="dialog" aria-modal="true">
      <aside className="cf-drawer">
        <header className="cf-drawer__head">
          <h2>Poster dans « {room.name} »</h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </header>
        <form className="members-form" onSubmit={(e) => void submit(e)}>
          <label className="members-field">
            <span className="members-field__label">Poster comme</span>
            <select
              className="members-field__input"
              value={asMemberId}
              onChange={(e) => setAsMemberId(e.target.value)}
              required
            >
              {room.members.map((m) => (
                <option key={m.memberId} value={m.memberId}>
                  {memberLabel.get(m.memberId) ??
                    `${m.member.firstName} ${m.member.lastName}`}
                </option>
              ))}
            </select>
          </label>
          <label className="members-field">
            <span className="members-field__label">Message</span>
            <textarea
              className="members-field__input"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </label>
          <p className="muted">
            Le message sera signé du membre choisi mais marqué comme posté
            par un administrateur dans l’audit.
          </p>
          <div className="members-actions">
            <button
              type="button"
              className="members-btn"
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="members-btn members-btn--primary"
            >
              Poster
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
