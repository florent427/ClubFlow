import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AGENT_CONVERSATIONS,
  AGENT_MESSAGES,
  AGENT_PENDING_ACTIONS,
  CONFIRM_AGENT_PENDING_ACTION,
  SEND_AGENT_MESSAGE,
  START_AGENT_CONVERSATION,
  type AgentAttachment,
  type AgentConversation,
  type AgentMessage,
  type AgentPendingAction,
} from '../../lib/agent-documents';
import { useToast } from '../ToastProvider';
import { getClubId, getToken } from '../../lib/storage';

function apiBase(): string {
  return (
    (import.meta.env as Record<string, string | undefined>)
      .VITE_GRAPHQL_HTTP?.replace(/\/graphql.*$/, '') ?? 'http://localhost:3000'
  );
}

/** Uploade un fichier via /media/upload et retourne l'ID MediaAsset. */
async function uploadAttachment(file: File): Promise<AgentAttachment> {
  const token = getToken();
  const clubId = getClubId();
  if (!token || !clubId) throw new Error('Session invalide');
  const form = new FormData();
  form.append('file', file);
  const isImage = file.type.startsWith('image/');
  form.append('kind', isImage ? 'IMAGE' : 'DOCUMENT');
  const res = await fetch(`${apiBase()}/media/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Club-Id': clubId,
    },
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upload échoué (${res.status}) : ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    id: string;
    kind: string;
    mimeType: string;
    fileName: string;
    publicUrl: string;
  };
  return {
    mediaAssetId: data.id,
    kind: isImage ? 'IMAGE' : 'DOCUMENT',
    mimeType: data.mimeType,
    fileName: data.fileName,
    publicUrl: data.publicUrl,
  };
}

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPT_MIMES =
  'image/png,image/jpeg,image/webp,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv';

/**
 * Widget flottant Aïko — bulle bottom-right qui ouvre un panneau de chat
 * style Intercom/Crisp. Présent sur toutes les pages admin (sauf /agent qui
 * a sa propre UI pleine page).
 *
 * Persiste l'ID de conversation active dans localStorage pour que le chat
 * reprenne là où il en était entre les navigations.
 */

const LS_CONV_KEY = 'clubflow_aiko_conversation_id';
const LS_OPEN_KEY = 'clubflow_aiko_open';

export function AikoChatWidget() {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // N'affiche pas le widget sur la page /agent pleine page (ni en audit).
  const hideOnRoute = location.pathname.startsWith('/agent');

  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_OPEN_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_CONV_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_OPEN_KEY, open ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [open]);
  useEffect(() => {
    try {
      if (activeId) localStorage.setItem(LS_CONV_KEY, activeId);
      else localStorage.removeItem(LS_CONV_KEY);
    } catch {
      /* ignore */
    }
  }, [activeId]);

  // On skip complètement le widget sur /agent (UX : évite doublon)
  if (hideOnRoute) return null;

  return (
    <>
      {open ? (
        <AikoPanel
          activeId={activeId}
          setActiveId={setActiveId}
          onClose={() => setOpen(false)}
          onOpenFullPage={() => {
            setOpen(false);
            navigate('/agent');
          }}
          showToast={showToast}
        />
      ) : null}
      <button
        type="button"
        className="cf-aiko-bubble"
        aria-label={open ? 'Fermer Aïko' : 'Ouvrir Aïko'}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #c9a96a, #b8913f)',
          border: 'none',
          boxShadow:
            '0 8px 24px rgba(0,0,0,0.25), 0 0 0 4px rgba(201,169,106,0.15)',
          cursor: 'pointer',
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {open ? (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 28, color: '#fff' }}
          >
            close
          </span>
        ) : (
          <AikoAvatar size={36} />
        )}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Avatar Aïko — composite SVG : cercle or + initiale "A" stylée (serif)
// ---------------------------------------------------------------------------

function AikoAvatar({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="aiko-glow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="18" cy="18" r="17" fill="url(#aiko-glow)" />
      <text
        x="18"
        y="25"
        textAnchor="middle"
        fontFamily="'Cormorant Garamond', Georgia, serif"
        fontSize="22"
        fontWeight="600"
        fontStyle="italic"
        fill="#fff"
      >
        A
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Panneau chat
// ---------------------------------------------------------------------------

interface PanelProps {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  onClose: () => void;
  onOpenFullPage: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

function AikoPanel({
  activeId,
  setActiveId,
  onClose,
  onOpenFullPage,
  showToast,
}: PanelProps) {
  const { data: convsData } = useQuery<{ agentConversations: AgentConversation[] }>(
    AGENT_CONVERSATIONS,
    { fetchPolicy: 'cache-and-network' },
  );

  // Auto-associate last conversation si activeId absent
  useEffect(() => {
    if (!activeId && convsData?.agentConversations?.[0]) {
      setActiveId(convsData.agentConversations[0].id);
    }
  }, [activeId, convsData, setActiveId]);

  const { data: msgsData, refetch: refetchMsgs } = useQuery<{
    agentMessages: AgentMessage[];
  }>(AGENT_MESSAGES, {
    variables: { conversationId: activeId ?? '' },
    skip: !activeId,
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  });
  const { data: pendingData, refetch: refetchPending } = useQuery<{
    agentPendingActions: AgentPendingAction[];
  }>(AGENT_PENDING_ACTIONS, {
    variables: { conversationId: activeId ?? '' },
    skip: !activeId,
    fetchPolicy: 'cache-and-network',
    pollInterval: 5000,
  });

  const [startConv, { loading: starting }] = useMutation(START_AGENT_CONVERSATION);
  const [sendMsg, { loading: sending }] = useMutation(SEND_AGENT_MESSAGE);
  const [confirmAction, { loading: confirming }] = useMutation(
    CONFIRM_AGENT_PENDING_ACTION,
  );

  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<AgentAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function handleFilesSelected(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    const slots = MAX_ATTACHMENTS - pendingAttachments.length;
    if (slots <= 0) {
      showToast(`Max ${MAX_ATTACHMENTS} pièces jointes par message.`, 'error');
      return;
    }
    const toUpload = Array.from(files).slice(0, slots);
    setUploading(true);
    try {
      for (const f of toUpload) {
        if (f.size > MAX_FILE_SIZE) {
          showToast(`${f.name} > 10 MB (refusé).`, 'error');
          continue;
        }
        const att = await uploadAttachment(f);
        setPendingAttachments((prev) => [...prev, att]);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload échoué', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removePendingAttachment(id: string): void {
    setPendingAttachments((prev) => prev.filter((a) => a.mediaAssetId !== id));
  }

  const messages = useMemo(
    () => (msgsData?.agentMessages ?? []).filter((m) => m.role !== 'TOOL'),
    [msgsData],
  );
  const pending = pendingData?.agentPendingActions ?? [];

  // Poll tant que l'agent bosse
  useEffect(() => {
    if (!sending || !activeId) return;
    const t = setInterval(() => {
      void refetchMsgs();
      void refetchPending();
    }, 2000);
    return () => clearInterval(t);
  }, [sending, activeId, refetchMsgs, refetchPending]);

  // Auto-scroll bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length, pending.length, sending]);

  async function ensureConversation(): Promise<string | null> {
    if (activeId) return activeId;
    try {
      const res = await startConv({ variables: { input: {} } });
      const newId = (
        res.data as { startAgentConversation: AgentConversation } | null
      )?.startAgentConversation?.id;
      if (newId) {
        setActiveId(newId);
        return newId;
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
    return null;
  }

  async function handleSend(): Promise<void> {
    const content = input.trim();
    if (!content && pendingAttachments.length === 0) return;
    const convId = await ensureConversation();
    if (!convId) return;
    const attachmentIds = pendingAttachments.map((a) => a.mediaAssetId);
    setInput('');
    setPendingAttachments([]);
    try {
      await sendMsg({
        variables: {
          input: {
            conversationId: convId,
            content: content || '(pièces jointes sans texte)',
            attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
          },
        },
      });
      await Promise.all([refetchMsgs(), refetchPending()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  async function handleConfirm(id: string, confirmed: boolean): Promise<void> {
    try {
      await confirmAction({
        variables: { input: { pendingActionId: id, confirmed } },
      });
      showToast(
        confirmed ? 'Action exécutée.' : 'Action refusée.',
        confirmed ? 'success' : 'info',
      );
      await Promise.all([refetchMsgs(), refetchPending()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  function handleNewConv(): void {
    setActiveId(null);
    void startConv({ variables: { input: {} } }).then((res) => {
      const newId = (
        res.data as { startAgentConversation: AgentConversation } | null
      )?.startAgentConversation?.id;
      if (newId) setActiveId(newId);
    });
  }

  return (
    <div
      role="dialog"
      aria-label="Chat Aïko"
      className="cf-aiko-panel"
      style={{
        position: 'fixed',
        bottom: 100,
        right: 24,
        width: 400,
        maxWidth: 'calc(100vw - 32px)',
        height: 600,
        maxHeight: 'calc(100vh - 140px)',
        background: '#fff',
        borderRadius: 16,
        boxShadow:
          '0 20px 50px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)',
        zIndex: 9997,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'aiko-slide-in 0.25s ease-out',
      }}
    >
      <style>{`
        @keyframes aiko-slide-in {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes aiko-pulse {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <header
        style={{
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #0a0908, #1c1915)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid rgba(201,169,106,0.3)',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #c9a96a, #b8913f)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <AikoAvatar size={26} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aïko</div>
          <div
            style={{
              fontSize: 11,
              opacity: 0.75,
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: sending ? '#c9a96a' : '#2a8c5f',
                animation: sending ? 'aiko-pulse 1.2s infinite' : 'none',
              }}
            />
            {sending ? 'Réfléchit…' : "Agent IA · en ligne"}
          </div>
        </div>
        <button
          type="button"
          onClick={handleNewConv}
          title="Nouvelle conversation"
          disabled={starting}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 11,
          }}
        >
          + Nouvelle
        </button>
        <button
          type="button"
          onClick={onOpenFullPage}
          title="Ouvrir en plein écran"
          style={iconBtn}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, color: '#fff' }}
          >
            open_in_full
          </span>
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Fermer"
          style={iconBtn}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: '#fff' }}
          >
            close
          </span>
        </button>
      </header>

      {/* Body */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          background: '#f8f7f3',
        }}
      >
        {!activeId && !starting ? (
          <EmptyState onStart={handleNewConv} />
        ) : messages.length === 0 && !sending ? (
          <EmptyState onStart={() => setInput("Liste-moi les membres du club")} />
        ) : (
          <>
            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
            {pending.map((p) => (
              <PendingCard
                key={p.id}
                action={p}
                disabled={confirming}
                onConfirm={(c) => void handleConfirm(p.id, c)}
              />
            ))}
            {sending ? (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 14,
                    background: '#fff',
                    fontSize: 13,
                    color: '#888',
                    fontStyle: 'italic',
                    border: '1px solid #eee',
                  }}
                >
                  Aïko réfléchit
                  <span style={{ animation: 'aiko-pulse 1.2s infinite' }}> ⋯</span>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Footer input */}
      <footer
        style={{
          padding: 12,
          borderTop: '1px solid #e5e3dc',
          background: '#fff',
        }}
      >
        {pendingAttachments.length > 0 ? (
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            {pendingAttachments.map((a) => (
              <AttachmentPreviewChip
                key={a.mediaAssetId}
                att={a}
                onRemove={() => removePendingAttachment(a.mediaAssetId)}
              />
            ))}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_MIMES}
            style={{ display: 'none' }}
            onChange={(e) => void handleFilesSelected(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending || pendingAttachments.length >= MAX_ATTACHMENTS}
            title={
              pendingAttachments.length >= MAX_ATTACHMENTS
                ? `Max ${MAX_ATTACHMENTS} pièces jointes`
                : 'Joindre image ou document (max 10 MB)'
            }
            style={{
              background: 'transparent',
              border: '1px solid #ddd',
              padding: '8px 10px',
              borderRadius: 8,
              cursor:
                uploading || sending || pendingAttachments.length >= MAX_ATTACHMENTS
                  ? 'not-allowed'
                  : 'pointer',
              color: '#666',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {uploading ? 'hourglass' : 'attach_file'}
            </span>
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !sending &&
                (input.trim() || pendingAttachments.length > 0)
              ) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder="Demande quelque chose à Aïko…"
            disabled={sending}
            style={{
              flex: 1,
              resize: 'none',
              fontSize: 13,
              padding: '8px 10px',
              border: '1px solid #ddd',
              borderRadius: 8,
              fontFamily: 'inherit',
              maxHeight: 120,
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={
              sending || (!input.trim() && pendingAttachments.length === 0)
            }
            style={{
              background:
                sending || (!input.trim() && pendingAttachments.length === 0)
                  ? '#ccc'
                  : 'linear-gradient(135deg, #c9a96a, #b8913f)',
              color: '#fff',
              border: 'none',
              padding: '10px 14px',
              borderRadius: 8,
              cursor:
                sending || (!input.trim() && pendingAttachments.length === 0)
                  ? 'not-allowed'
                  : 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18 }}
            >
              send
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: '40px 20px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #c9a96a, #b8913f)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(201,169,106,0.3)',
        }}
      >
        <AikoAvatar size={40} />
      </div>
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Bonjour !</h3>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
          Je suis Aïko, ton assistante ClubFlow.
          <br />
          Demande-moi d'afficher des données, de créer des événements, de
          gérer les membres…
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
        <SuggestionButton
          label="Liste tous les membres du club"
          onClick={onStart}
        />
        <SuggestionButton
          label="Combien de factures impayées ?"
          onClick={onStart}
        />
        <SuggestionButton
          label="Montre-moi le tableau de bord"
          onClick={onStart}
        />
      </div>
    </div>
  );
}

function SuggestionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 12px',
        border: '1px solid #e5e3dc',
        background: '#fff',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 12,
        textAlign: 'left',
        color: '#333',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#c9a96a';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e5e3dc';
      }}
    >
      {label}
    </button>
  );
}

function Bubble({ message }: { message: AgentMessage }) {
  const isUser = message.role === 'USER';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 10,
      }}
    >
      <div style={{ maxWidth: '85%' }}>
        {message.attachments.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              marginBottom: 4,
              justifyContent: isUser ? 'flex-end' : 'flex-start',
            }}
          >
            {message.attachments.map((a) => (
              <MessageAttachment key={a.mediaAssetId} att={a} />
            ))}
          </div>
        ) : null}
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 14,
            background: isUser ? 'linear-gradient(135deg, #c9a96a, #b8913f)' : '#fff',
            color: isUser ? '#0a0908' : 'inherit',
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            border: isUser ? 'none' : '1px solid #eee',
            boxShadow: isUser ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          {message.content || '…'}
        </div>
        {message.toolCalls.length > 0 ? (
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {message.toolCalls.map((tc) => (
              <ToolBadge key={tc.id} tc={tc} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AttachmentPreviewChip({
  att,
  onRemove,
}: {
  att: AgentAttachment;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        border: '1px solid #ddd',
        borderRadius: 8,
        background: '#fafafa',
        fontSize: 11,
        maxWidth: 200,
      }}
    >
      {att.kind === 'IMAGE' ? (
        <img
          src={`${apiBase()}${att.publicUrl}`}
          alt=""
          style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }}
        />
      ) : (
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#666' }}>
          description
        </span>
      )}
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 130,
        }}
        title={att.fileName}
      >
        {att.fileName}
      </span>
      <button
        type="button"
        onClick={onRemove}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          color: '#888',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
          close
        </span>
      </button>
    </div>
  );
}

function MessageAttachment({ att }: { att: AgentAttachment }) {
  const url = `${apiBase()}${att.publicUrl}`;
  if (att.kind === 'IMAGE') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img
          src={url}
          alt={att.fileName}
          style={{
            maxWidth: 200,
            maxHeight: 200,
            borderRadius: 8,
            border: '1px solid #ddd',
          }}
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        border: '1px solid #ddd',
        borderRadius: 8,
        background: '#fafafa',
        fontSize: 12,
        color: '#333',
        textDecoration: 'none',
        maxWidth: 260,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#666' }}>
        description
      </span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={att.fileName}
      >
        {att.fileName}
      </span>
    </a>
  );
}

function ToolBadge({ tc }: { tc: AgentMessage['toolCalls'][number] }) {
  const risk: Record<string, string> = {
    SAFE: '#2a8c5f',
    GUARDED: '#c9a96a',
    DESTRUCTIVE: '#b2332a',
    FORBIDDEN: '#555',
  };
  const statusColors: Record<string, string> = {
    EXECUTED: '#2a8c5f',
    PENDING_CONFIRMATION: '#c9a96a',
    FAILED: '#b2332a',
    BLOCKED_BY_LIMITS: '#b2332a',
    BLOCKED_BY_SCOPE: '#b2332a',
    REFUSED: '#888',
  };
  return (
    <span
      title={tc.errorMessage ?? ''}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        borderRadius: 10,
        fontSize: 10,
        fontFamily: 'ui-monospace, monospace',
        background: 'rgba(0,0,0,0.04)',
        border: `1px solid ${risk[tc.riskLevel] ?? '#888'}30`,
      }}
    >
      🔧 {tc.toolName}
      <span style={{ color: statusColors[tc.status] ?? '#333', fontWeight: 600 }}>
        · {tc.status}
      </span>
    </span>
  );
}

function PendingCard({
  action,
  disabled,
  onConfirm,
}: {
  action: AgentPendingAction;
  disabled: boolean;
  onConfirm: (confirmed: boolean) => void;
}) {
  const color = action.riskLevel === 'DESTRUCTIVE' ? '#b2332a' : '#c9a96a';
  return (
    <div
      style={{
        border: `2px solid ${color}`,
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        background: `color-mix(in oklab, ${color} 8%, #fff)`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color,
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        ⚠ Confirmation · {action.riskLevel}
      </div>
      <div
        style={{
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          fontFamily: 'ui-monospace, monospace',
          background: 'rgba(0,0,0,0.04)',
          padding: 8,
          borderRadius: 6,
          maxHeight: 140,
          overflow: 'auto',
          marginBottom: 8,
        }}
      >
        {action.previewText}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onConfirm(true)}
          style={{
            background: color,
            color: '#fff',
            border: 'none',
            padding: '8px 14px',
            borderRadius: 6,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            flex: 1,
          }}
        >
          Confirmer
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onConfirm(false)}
          style={{
            background: 'transparent',
            color: '#666',
            border: '1px solid #ddd',
            padding: '8px 14px',
            borderRadius: 6,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          Refuser
        </button>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid rgba(255,255,255,0.15)',
  padding: 4,
  borderRadius: 6,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
};
