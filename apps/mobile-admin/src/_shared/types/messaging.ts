export type ReactionGroup = {
  emoji: string;
  count: number;
  reactedByViewer: boolean;
};

export type ChatMessageRow = {
  id: string;
  roomId: string;
  body: string;
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
  };
  reactions: ReactionGroup[];
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
    };
  }[];
};

export const QUICK_EMOJIS = [
  '👍', '❤️', '😂', '🎉', '🙏',
  '👏', '🔥', '😍', '🤔', '😢',
  '😮', '🥳', '✅', '💪', '🚀',
  '⭐', '🤝', '🥋', '🤣', '😊',
];
