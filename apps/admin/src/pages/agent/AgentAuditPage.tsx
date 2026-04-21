import { useQuery } from '@apollo/client/react';
import { Link } from 'react-router-dom';
import {
  AGENT_AUDIT_LOG,
  type AgentAuditEntry,
} from '../../lib/agent-documents';

/**
 * Journal d'audit des actions de l'agent. Réservé aux admins du club.
 */
export function AgentAuditPage() {
  const { data, loading, error } = useQuery<{
    agentAuditLog: AgentAuditEntry[];
  }>(AGENT_AUDIT_LOG, {
    variables: { limit: 200 },
    fetchPolicy: 'cache-and-network',
  });

  const entries = data?.agentAuditLog ?? [];
  const statusColor: Record<string, string> = {
    EXECUTED: '#2a8c5f',
    PENDING_CONFIRMATION: '#c9a96a',
    REFUSED: '#888',
    FAILED: '#b2332a',
    BLOCKED_BY_LIMITS: '#b2332a',
    BLOCKED_BY_SCOPE: '#b2332a',
  };

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div>
          <p className="members-loom__eyebrow">
            <Link to="/agent">← Agent</Link>
          </p>
          <h1 className="members-loom__title">Audit agent IA</h1>
          <p className="muted">
            Liste des 200 dernières actions exécutées par l'agent (toutes
            conversations, tous utilisateurs du club).
          </p>
        </div>
      </header>

      {error ? <p className="form-error">{error.message}</p> : null}
      {loading && entries.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="muted">Aucune exécution pour le moment.</p>
      ) : (
        <table
          style={{
            width: '100%',
            fontSize: 13,
            borderCollapse: 'collapse',
            marginTop: 20,
          }}
        >
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
              <th style={{ padding: '8px 4px' }}>Date</th>
              <th style={{ padding: '8px 4px' }}>User</th>
              <th style={{ padding: '8px 4px' }}>Tool</th>
              <th style={{ padding: '8px 4px' }}>Risque</th>
              <th style={{ padding: '8px 4px' }}>Statut</th>
              <th style={{ padding: '8px 4px' }}>Erreur</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '6px 4px' }}>
                  {new Date(e.createdAt).toLocaleString('fr-FR')}
                </td>
                <td
                  style={{
                    padding: '6px 4px',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 11,
                  }}
                >
                  {e.userId.slice(0, 8)}…
                </td>
                <td
                  style={{
                    padding: '6px 4px',
                    fontFamily: 'ui-monospace, monospace',
                  }}
                >
                  {e.toolName}
                </td>
                <td style={{ padding: '6px 4px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 10,
                      background:
                        e.riskLevel === 'DESTRUCTIVE'
                          ? 'rgba(178,51,42,0.12)'
                          : e.riskLevel === 'GUARDED'
                            ? 'rgba(201,169,106,0.2)'
                            : 'rgba(42,140,95,0.12)',
                      fontSize: 11,
                    }}
                  >
                    {e.riskLevel}
                  </span>
                </td>
                <td
                  style={{
                    padding: '6px 4px',
                    color: statusColor[e.status] ?? '#333',
                    fontWeight: 600,
                  }}
                >
                  {e.status}
                </td>
                <td
                  style={{
                    padding: '6px 4px',
                    fontSize: 11,
                    color: '#b2332a',
                    maxWidth: 300,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={e.errorMessage ?? ''}
                >
                  {e.errorMessage ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
