import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import {
  AGENT_CONVERSATIONS,
  AGENT_MESSAGES,
  AGENT_PENDING_ACTIONS,
  CONFIRM_AGENT_PENDING_ACTION,
  SEND_AGENT_MESSAGE,
  START_AGENT_CONVERSATION,
  type AgentConversation,
  type AgentMessage,
  type AgentPendingAction,
} from '../../lib/agent-documents';
import { useToast } from '../../components/ToastProvider';

/**
 * Chat conversationnel avec Aïko, l'agent IA de ClubFlow.
 *
 * Layout simple :
 *  - Sidebar : liste des conversations, bouton "Nouvelle conversation"
 *  - Main : flux de messages + pending actions (bouton rouge) + input bas
 */
export function AgentChatPage() {
  const { showToast } = useToast();
  const { data: convData, refetch: refetchConvs } = useQuery<{
    agentConversations: AgentConversation[];
  }>(AGENT_CONVERSATIONS, { fetchPolicy: 'cache-and-network' });
  const conversations = convData?.agentConversations ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeId && conversations[0]) setActiveId(conversations[0].id);
  }, [activeId, conversations]);

  const { data: msgsData, refetch: refetchMsgs } = useQuery<{
    agentMessages: AgentMessage[];
  }>(AGENT_MESSAGES, {
    variables: { conversationId: activeId ?? '' },
    skip: !activeId,
    fetchPolicy: 'cache-and-network',
    // Tant qu'un sendMessage est en cours côté serveur, on ne sait pas
    // combien de temps ça prendra (boucle agent jusqu'à 10 itérations × LLM).
    // On poll toutes les 2s pendant que `sending` est true pour afficher
    // progressivement les messages ASSISTANT au fur et à mesure.
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

  const [startConv] = useMutation(START_AGENT_CONVERSATION);
  const [sendMsg, { loading: sending }] = useMutation(SEND_AGENT_MESSAGE);
  const [confirmAction, { loading: confirming }] = useMutation(
    CONFIRM_AGENT_PENDING_ACTION,
  );

  // Poll messages + pending actions toutes les 2s quand l'agent bosse
  useEffect(() => {
    if (!sending || !activeId) return;
    const t = setInterval(() => {
      void refetchMsgs();
      void refetchPending();
    }, 2000);
    return () => clearInterval(t);
  }, [sending, activeId, refetchMsgs, refetchPending]);

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = msgsData?.agentMessages ?? [];
  const pending = pendingData?.agentPendingActions ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length]);

  async function handleNewConversation(): Promise<void> {
    try {
      const res = await startConv({ variables: { input: {} } });
      const newConv = (
        res.data as { startAgentConversation: AgentConversation } | null
      )?.startAgentConversation;
      if (newConv) {
        setActiveId(newConv.id);
        await refetchConvs();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  async function handleSend(): Promise<void> {
    if (!input.trim() || !activeId) return;
    const content = input.trim();
    setInput('');
    try {
      await sendMsg({
        variables: { input: { conversationId: activeId, content } },
      });
      await Promise.all([refetchMsgs(), refetchPending(), refetchConvs()]);
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

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div>
          <h1 className="members-loom__title">Aïko · Agent IA</h1>
          <p className="muted">
            Discute en langage naturel avec l'agent. Il connaît l'API ClubFlow
            et exécute les actions autorisées pour ton rôle. Les actions
            sensibles demandent confirmation.
          </p>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: 20,
          height: 'calc(100vh - 240px)',
          minHeight: 500,
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            border: '1px solid var(--border, #ddd)',
            borderRadius: 8,
            padding: 12,
            overflowY: 'auto',
          }}
        >
          <button
            type="button"
            className="btn btn-tight"
            onClick={() => void handleNewConversation()}
            style={{ width: '100%', marginBottom: 12 }}
          >
            + Nouvelle conversation
          </button>
          {conversations.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Aucune conversation. Clique « Nouvelle conversation ».
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {conversations.map((c) => (
                <li key={c.id} style={{ marginBottom: 4 }}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      background: activeId === c.id ? 'rgba(0,0,0,0.08)' : 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: activeId === c.id ? 600 : 400 }}>
                      {c.title ?? 'Conversation sans titre'}
                    </div>
                    <div style={{ color: 'var(--muted, #888)', fontSize: 11 }}>
                      {new Date(c.updatedAt).toLocaleString('fr-FR')}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Main */}
        <main
          style={{
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--border, #ddd)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {!activeId ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--muted, #888)',
              }}
            >
              Sélectionne ou crée une conversation pour commencer.
            </div>
          ) : (
            <>
              <div
                ref={scrollRef}
                style={{ flex: 1, overflowY: 'auto', padding: 20 }}
              >
                {messages.length === 0 ? (
                  <div style={{ color: 'var(--muted, #888)' }}>
                    Début de la conversation. Pose ta question.
                  </div>
                ) : (
                  messages.map((m) => <MessageBubble key={m.id} message={m} />)
                )}
                {sending ? (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: 'var(--bg-2, #f6f5f0)',
                        fontSize: 13,
                        color: 'var(--muted, #888)',
                        fontStyle: 'italic',
                      }}
                    >
                      Aïko réfléchit… <span style={{ animation: 'pulse 1.5s infinite' }}>⋯</span>
                    </div>
                  </div>
                ) : null}
                {pending.map((p) => (
                  <PendingActionCard
                    key={p.id}
                    action={p}
                    disabled={confirming}
                    onConfirm={(confirmed) => void handleConfirm(p.id, confirmed)}
                  />
                ))}
              </div>
              <div
                style={{
                  padding: 12,
                  borderTop: '1px solid var(--border, #ddd)',
                  background: 'var(--bg-2, #f6f5f0)',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        !e.shiftKey &&
                        !sending &&
                        input.trim()
                      ) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    rows={2}
                    placeholder="Ex. Liste-moi les membres dont la cotisation n'est pas payée pour la saison en cours."
                    disabled={sending}
                    style={{ flex: 1, resize: 'vertical', fontSize: 14, padding: 8 }}
                  />
                  <button
                    type="button"
                    className="btn btn-tight"
                    onClick={() => void handleSend()}
                    disabled={sending || !input.trim()}
                  >
                    {sending ? '⋯' : 'Envoyer'}
                  </button>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--muted, #888)',
                    marginTop: 4,
                  }}
                >
                  Entrée pour envoyer · Shift+Entrée pour retour à la ligne.
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}

function MessageBubble({ message }: { message: AgentMessage }) {
  if (message.role === 'TOOL') {
    return null; // non affiché dans le chat (résultats bruts tool)
  }
  const isUser = message.role === 'USER';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          maxWidth: '75%',
          padding: '10px 14px',
          borderRadius: 12,
          background: isUser
            ? 'var(--accent, #c9a96a)'
            : 'var(--bg-2, #f6f5f0)',
          color: isUser ? 'var(--ink, #0a0908)' : 'inherit',
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}
      >
        {message.content || '(réponse vide)'}
        {message.toolCalls.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            {message.toolCalls.map((tc) => (
              <ToolCallBadge key={tc.id} tc={tc} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolCallBadge({ tc }: { tc: AgentMessage['toolCalls'][number] }) {
  const colors: Record<string, string> = {
    SAFE: '#2a8c5f',
    GUARDED: '#c9a96a',
    DESTRUCTIVE: '#b2332a',
    FORBIDDEN: '#555',
  };
  const statusColors: Record<string, string> = {
    EXECUTED: '#2a8c5f',
    PENDING_CONFIRMATION: '#c9a96a',
    REFUSED: '#888',
    FAILED: '#b2332a',
    BLOCKED_BY_LIMITS: '#b2332a',
    BLOCKED_BY_SCOPE: '#b2332a',
  };
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 6,
        alignItems: 'center',
        padding: '3px 8px',
        marginRight: 6,
        marginTop: 4,
        borderRadius: 12,
        fontSize: 11,
        background: 'rgba(0,0,0,0.05)',
        border: `1px solid ${colors[tc.riskLevel] ?? '#888'}`,
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      🔧 {tc.toolName}
      <span
        style={{
          color: statusColors[tc.status] ?? '#555',
          fontWeight: 600,
        }}
      >
        · {tc.status}
      </span>
      {tc.errorMessage ? (
        <span style={{ color: '#b2332a' }} title={tc.errorMessage}>
          ⚠
        </span>
      ) : null}
    </div>
  );
}

function PendingActionCard({
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
        padding: 16,
        marginBottom: 12,
        background: `color-mix(in oklab, ${color} 8%, transparent)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color,
            fontWeight: 600,
          }}
        >
          ⚠ Confirmation requise · {action.riskLevel}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted, #888)' }}>
          expire {new Date(action.expiresAt).toLocaleTimeString('fr-FR')}
        </div>
      </div>
      <pre
        style={{
          fontSize: 12,
          fontFamily: 'ui-monospace, monospace',
          whiteSpace: 'pre-wrap',
          margin: '8px 0',
          background: 'rgba(0,0,0,0.05)',
          padding: 10,
          borderRadius: 6,
          maxHeight: 200,
          overflow: 'auto',
        }}
      >
        {action.previewText}
      </pre>
      <details style={{ fontSize: 11, marginBottom: 10 }}>
        <summary>Arguments techniques</summary>
        <pre style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', background: 'rgba(0,0,0,0.05)', padding: 8, borderRadius: 6 }}>
          {action.argsPreview}
        </pre>
      </details>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onConfirm(true)}
          style={{
            background: color,
            color: '#fff',
            border: 'none',
            padding: '10px 18px',
            borderRadius: 6,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Confirmer l'action
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onConfirm(false)}
          className="btn btn-tight btn-ghost"
        >
          Refuser
        </button>
      </div>
    </div>
  );
}
