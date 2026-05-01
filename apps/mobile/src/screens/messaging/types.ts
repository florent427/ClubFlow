/** Shapes partagés entre MessagingHomeScreen et MessagingThreadScreen. */

export type ReactionGroup = {
  emoji: string;
  count: number;
  reactedByViewer: boolean;
};

export type ChatAttachmentKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';

export type ChatMessageAttachment = {
  id: string;
  kind: ChatAttachmentKind;
  mediaAssetId: string;
  mediaUrl: string;
  thumbnailUrl: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
};

export type ChatMessageRow = {
  id: string;
  roomId: string;
  /** Désormais nullable : message peut être 100% pièces jointes. */
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  parentMessageId: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  postedByAdmin: boolean;
  sender: {
    id: string;
    pseudo: string | null;
    firstName: string;
    lastName: string;
    photoUrl?: string | null;
  };
  reactions: ReactionGroup[];
  attachments: ChatMessageAttachment[];
};

export type ChatRoomRow = {
  id: string;
  kind: 'DIRECT' | 'GROUP' | 'COMMUNITY';
  name: string | null;
  description: string | null;
  channelMode: 'OPEN' | 'RESTRICTED' | 'READ_ONLY';
  isBroadcastChannel: boolean;
  archivedAt: string | null;
  updatedAt: string;
  viewerCanPost: boolean;
  viewerCanReply: boolean;
  members: {
    memberId: string;
    role: string;
    member: {
      id: string;
      pseudo: string | null;
      firstName: string;
      lastName: string;
      /** URL de la photo de profil — affichée pour les chats DIRECT. */
      photoUrl: string | null;
    };
  }[];
};

export const QUICK_EMOJIS = [
  '👍',
  '❤️',
  '😂',
  '🎉',
  '🙏',
  '👏',
  '🔥',
  '😍',
  '🤔',
  '😢',
  '😮',
  '🥳',
  '✅',
  '💪',
  '🚀',
  '⭐',
  '🤝',
  '🥋',
  '🤣',
  '😊',
];

/**
 * Pour un chat DIRECT 1-on-1, retourne l'autre membre (le peer) en
 * filtrant le viewer. Si on ne sait pas qui est le viewer (ex. chargement
 * en cours), retombe sur le 1er membre. Pour un chat non-DIRECT,
 * retourne null.
 */
export function directPeer(
  r: ChatRoomRow,
  viewerMemberId: string | null,
): ChatRoomRow['members'][number]['member'] | null {
  if (r.kind !== 'DIRECT') return null;
  const others = viewerMemberId
    ? r.members.filter((m) => m.memberId !== viewerMemberId)
    : r.members;
  return others[0]?.member ?? r.members[0]?.member ?? null;
}

/**
 * Label affiché dans la liste des salons.
 *  - COMMUNITY → nom du salon ou "Communauté"
 *  - GROUP → nom du salon ou "Groupe"
 *  - DIRECT → pseudo du peer (si défini), sinon "Prénom Nom"
 *
 * Pour DIRECT, on a besoin du `viewerMemberId` pour identifier le
 * peer (on filtre soi-même de la liste des members). Si non fourni,
 * on retombe sur "Discussion" (legacy).
 */
export function roomLabel(
  r: ChatRoomRow,
  viewerMemberId: string | null = null,
): string {
  if (r.kind === 'COMMUNITY') return r.name ?? 'Communauté';
  if (r.kind === 'GROUP') return r.name ?? 'Groupe';
  const peer = directPeer(r, viewerMemberId);
  if (peer) {
    if (peer.pseudo && peer.pseudo.trim().length > 0) return peer.pseudo;
    return `${peer.firstName} ${peer.lastName}`.trim() || 'Discussion';
  }
  return 'Discussion';
}

export type MessagingStackParamList = {
  MessagingHome: undefined;
  MessagingThread: { roomId: string };
  /** Recherche d'adhérent pour démarrer un chat 1-on-1. */
  NewChat: undefined;
};

export type LastMessageInfo = {
  preview: string;
  createdAt: string;
  authorLabel: string | null;
};
