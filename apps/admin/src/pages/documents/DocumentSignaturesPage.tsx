import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CLUB_DOCUMENT,
  CLUB_DOCUMENT_SIGNATURE_STATS,
  CLUB_DOCUMENT_SIGNATURES,
} from '../../lib/documents-signature';
import { CLUB_MEMBERS } from '../../lib/documents';
import type {
  ClubDocumentQueryData,
  ClubDocumentSignatureStatsQueryData,
  ClubDocumentSignaturesQueryData,
  MembersQueryData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

/**
 * Suivi des signatures pour un document donné.
 *
 *  - Header : nom du document + version + retour vers /documents.
 *  - KPIs : totalRequired / totalSigned / % signés (barre de progression).
 *  - Tabs :
 *      - "Signataires" — liste des `clubDocumentSignatures` avec téléchargement
 *        du PDF signé.
 *      - "À relancer" — `unsignedMemberIds` croisés avec `clubMembers` pour
 *        afficher les noms. Bouton "Envoyer une relance" placeholder (liv 5).
 */
export function DocumentSignaturesPage() {
  const { id: documentId } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const { data: docData, loading: docLoading } = useQuery<ClubDocumentQueryData>(
    CLUB_DOCUMENT,
    { variables: { id: documentId }, skip: !documentId },
  );
  const { data: sigData, loading: sigLoading } =
    useQuery<ClubDocumentSignaturesQueryData>(CLUB_DOCUMENT_SIGNATURES, {
      variables: { documentId },
      skip: !documentId,
      fetchPolicy: 'cache-and-network',
    });
  const { data: statsData } = useQuery<ClubDocumentSignatureStatsQueryData>(
    CLUB_DOCUMENT_SIGNATURE_STATS,
    {
      variables: { documentId },
      skip: !documentId,
      fetchPolicy: 'cache-and-network',
    },
  );
  const { data: membersData } = useQuery<MembersQueryData>(CLUB_MEMBERS, {
    fetchPolicy: 'cache-and-network',
  });

  const [tab, setTab] = useState<'SIGNED' | 'UNSIGNED'>('SIGNED');

  const doc = docData?.clubDocument ?? null;
  const signatures = sigData?.clubDocumentSignatures ?? [];
  const stats = statsData?.clubDocumentSignatureStats ?? {
    totalRequired: 0,
    totalSigned: 0,
    percentSigned: 0,
    unsignedMemberIds: [],
  };

  const memberById = useMemo(() => {
    const map = new Map<string, { firstName: string; lastName: string }>();
    for (const m of membersData?.clubMembers ?? []) {
      map.set(m.id, { firstName: m.firstName, lastName: m.lastName });
    }
    return map;
  }, [membersData]);

  function placeholderRemind(memberId: string) {
    const name = memberById.get(memberId);
    showToast(
      `Relance pour ${name?.firstName ?? memberId} ${name?.lastName ?? ''} — fonction prévue en livraison 5.`,
      'info',
    );
  }

  if (!documentId) return <p>Document introuvable.</p>;

  if (docLoading && !doc) return <p className="cf-muted">Chargement…</p>;

  if (!doc) return <p className="form-error">Document introuvable.</p>;

  const pct = Math.round(stats.percentSigned);

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              <Link to="/documents">← Documents à signer</Link>
            </p>
            <h1 className="members-loom__title">{doc.name}</h1>
            <p className="members-loom__subtitle">
              Version v{doc.version} · {doc.fields.length} champ
              {doc.fields.length > 1 ? 's' : ''} ·{' '}
              {doc.isActive ? 'Actif' : 'Archivé'}
            </p>
          </div>
        </div>
      </header>

      {/* KPI row */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <article
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 16,
            background: '#fff',
          }}
        >
          <p
            className="cf-muted"
            style={{ margin: 0, fontSize: 12, textTransform: 'uppercase' }}
          >
            Membres concernés
          </p>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 28,
              fontWeight: 700,
              color: '#0f172a',
            }}
          >
            {stats.totalRequired}
          </p>
        </article>
        <article
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 16,
            background: '#fff',
          }}
        >
          <p
            className="cf-muted"
            style={{ margin: 0, fontSize: 12, textTransform: 'uppercase' }}
          >
            Signataires
          </p>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 28,
              fontWeight: 700,
              color: '#16a34a',
            }}
          >
            {stats.totalSigned}
          </p>
        </article>
        <article
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 16,
            background: '#fff',
          }}
        >
          <p
            className="cf-muted"
            style={{ margin: 0, fontSize: 12, textTransform: 'uppercase' }}
          >
            Couverture
          </p>
          <p
            style={{
              margin: '6px 0 4px',
              fontSize: 28,
              fontWeight: 700,
              color: pct >= 80 ? '#16a34a' : pct >= 50 ? '#ca8a04' : '#dc2626',
            }}
          >
            {pct}%
          </p>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: '#e2e8f0',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background:
                  pct >= 80 ? '#16a34a' : pct >= 50 ? '#ca8a04' : '#dc2626',
                transition: 'width 0.3s',
              }}
            />
          </div>
        </article>
      </section>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <button
          type="button"
          className={`btn-ghost btn-tight${tab === 'SIGNED' ? ' btn-ghost--active' : ''}`}
          onClick={() => setTab('SIGNED')}
          style={{
            borderRadius: 0,
            borderBottom:
              tab === 'SIGNED' ? '2px solid #2563eb' : '2px solid transparent',
            background: 'transparent',
            paddingBottom: 8,
          }}
        >
          Signataires ({signatures.length})
        </button>
        <button
          type="button"
          className={`btn-ghost btn-tight${tab === 'UNSIGNED' ? ' btn-ghost--active' : ''}`}
          onClick={() => setTab('UNSIGNED')}
          style={{
            borderRadius: 0,
            borderBottom:
              tab === 'UNSIGNED'
                ? '2px solid #2563eb'
                : '2px solid transparent',
            background: 'transparent',
            paddingBottom: 8,
          }}
        >
          À relancer ({stats.unsignedMemberIds.length})
        </button>
      </div>

      {tab === 'SIGNED' ? (
        sigLoading && signatures.length === 0 ? (
          <p className="cf-muted">Chargement…</p>
        ) : signatures.length === 0 ? (
          <p className="cf-muted">Aucune signature enregistrée pour ce document.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cf-table" style={{ width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>
                    Signataire
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>
                    Version
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>
                    Signé le
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>
                    IP
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>
                    Statut
                  </th>
                  <th style={{ textAlign: 'right', padding: '10px 8px' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {signatures.map((s) => {
                  const isObsolete = !!s.invalidatedAt;
                  return (
                    <tr
                      key={s.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        opacity: isObsolete ? 0.7 : 1,
                      }}
                    >
                      <td style={{ padding: '10px 8px' }}>
                        <strong>{s.signerDisplayName ?? '—'}</strong>
                      </td>
                      <td
                        style={{
                          padding: '10px 8px',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        v{s.version}
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: 13 }}>
                        {fmtDateTime(s.signedAt)}
                      </td>
                      <td
                        style={{
                          padding: '10px 8px',
                          fontFamily: 'monospace',
                          fontSize: 12,
                          color: '#475569',
                        }}
                      >
                        {s.ipAddress ?? '—'}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        {isObsolete ? (
                          <span
                            className="cf-pill cf-pill--warn"
                            title={`Invalidée le ${fmtDateTime(s.invalidatedAt)}`}
                          >
                            Signature obsolète
                          </span>
                        ) : (
                          <span className="cf-pill cf-pill--ok">Valide</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                        {s.signedAssetUrl ? (
                          <a
                            href={s.signedAssetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-ghost btn-tight"
                          >
                            Télécharger
                          </a>
                        ) : (
                          <span className="cf-muted">PDF indisponible</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === 'UNSIGNED' ? (
        stats.unsignedMemberIds.length === 0 ? (
          <p className="cf-muted">
            Tous les membres concernés ont signé la version courante.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cf-table" style={{ width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>
                    Membre
                  </th>
                  <th style={{ textAlign: 'right', padding: '10px 8px' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.unsignedMemberIds.map((id) => {
                  const m = memberById.get(id);
                  const label = m
                    ? `${m.firstName} ${m.lastName}`
                    : `Membre ${id.slice(0, 8)}…`;
                  return (
                    <tr key={id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 8px' }}>{label}</td>
                      <td
                        style={{ padding: '10px 8px', textAlign: 'right' }}
                      >
                        <button
                          type="button"
                          className="btn-ghost btn-tight"
                          onClick={() => placeholderRemind(id)}
                          title="Disponible en livraison 5 (campagnes de relance)"
                        >
                          Envoyer une relance
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </>
  );
}
