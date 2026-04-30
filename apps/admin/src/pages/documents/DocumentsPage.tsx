import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ARCHIVE_CLUB_DOCUMENT,
  CLUB_DOCUMENTS,
  CREATE_CLUB_DOCUMENT,
  DELETE_CLUB_DOCUMENT,
  UPDATE_CLUB_DOCUMENT,
} from '../../lib/documents-signature';
import type {
  ClubDocument,
  ClubDocumentCategory,
  ClubDocumentsQueryData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';
import { getClubId, getToken } from '../../lib/storage';

function apiBase(): string {
  return (
    (import.meta.env as Record<string, string | undefined>)
      .VITE_GRAPHQL_HTTP?.replace(/\/graphql.*$/, '') ?? 'http://localhost:3000'
  );
}

const CATEGORY_LABEL: Record<ClubDocumentCategory, string> = {
  REGLEMENT_INTERIEUR: 'Règlement intérieur',
  AUTORISATION_PARENTALE: 'Autorisation parentale',
  DROIT_IMAGE: 'Droit à l’image',
  REGLEMENT_FEDERAL: 'Règlement fédéral',
  AUTRE: 'Autre',
};

/**
 * Mapping catégorie → palette pill. On garde des `--cf-pill` neutres pour les
 * catégories existantes, plus une couleur dédiée par type pour discriminer
 * d'un coup d'œil les règlements internes / fédéraux / images / parentales.
 */
const CATEGORY_PILL_STYLE: Record<
  ClubDocumentCategory,
  { background: string; color: string }
> = {
  REGLEMENT_INTERIEUR: { background: '#dbeafe', color: '#1e40af' },
  AUTORISATION_PARENTALE: { background: '#fed7aa', color: '#9a3412' },
  DROIT_IMAGE: { background: '#e9d5ff', color: '#6b21a8' },
  REGLEMENT_FEDERAL: { background: '#e2e8f0', color: '#334155' },
  AUTRE: { background: '#f1f5f9', color: '#475569' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

function isoToInputDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function inputDateToIso(input: string): string | null {
  if (!input) return null;
  // Saisie locale → ISO UTC midnight pour rester stable côté backend.
  return new Date(`${input}T00:00:00Z`).toISOString();
}

interface FormState {
  name: string;
  description: string;
  category: ClubDocumentCategory;
  isRequired: boolean;
  isActive: boolean;
  validFrom: string;
  validTo: string;
  minorsOnly: boolean;
  /** id mediaAsset déjà uploadé (set après upload). */
  mediaAssetId: string | null;
  /** Nom du fichier sélectionné (UI hint avant upload). */
  fileName: string | null;
}

function emptyFormState(): FormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: '',
    description: '',
    category: 'REGLEMENT_INTERIEUR',
    isRequired: true,
    isActive: true,
    validFrom: today,
    validTo: '',
    minorsOnly: false,
    mediaAssetId: null,
    fileName: null,
  };
}

/**
 * Page d'index du module "Documents à signer" :
 *  - KPIs (actifs / archivés / % moyen signé)
 *  - Tableau des documents avec actions (édition champs, suivi signatures,
 *    archivage / restauration / suppression)
 *  - Drawer création / édition (upload PDF via /media/upload)
 *
 * Les coordonnées des fields ne sont pas éditées ici — un bouton dédié sur
 * chaque ligne renvoie vers `/documents/:id/editor` (PDF.js drag/drop).
 */
export function DocumentsPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useQuery<ClubDocumentsQueryData>(
    CLUB_DOCUMENTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [createDoc, { loading: creating }] = useMutation(CREATE_CLUB_DOCUMENT);
  const [updateDoc, { loading: updating }] = useMutation(UPDATE_CLUB_DOCUMENT);
  const [archiveDoc] = useMutation(ARCHIVE_CLUB_DOCUMENT);
  const [deleteDoc] = useMutation(DELETE_CLUB_DOCUMENT);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ClubDocument | null>(null);
  const [form, setForm] = useState<FormState>(emptyFormState);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ClubDocument | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<ClubDocument | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const documents = useMemo(
    () => data?.clubDocuments ?? [],
    [data?.clubDocuments],
  );

  const kpi = useMemo(() => {
    const active = documents.filter((d) => d.isActive).length;
    const archived = documents.filter((d) => !d.isActive).length;
    // signedCount agrégé / nombre de documents — proxy lisible pour
    // l'admin (pas un vrai % de couverture, qui dépend du module Members).
    // La page de suivi par document expose le vrai stats par appel dédié.
    const avgSigned =
      documents.length > 0
        ? documents.reduce((acc, d) => acc + d.signedCount, 0) /
          documents.length
        : 0;
    return { active, archived, avgSigned: Math.round(avgSigned * 10) / 10 };
  }, [documents]);

  function openCreate() {
    setEditing(null);
    setForm(emptyFormState());
    setDrawerOpen(true);
  }

  function openEdit(doc: ClubDocument) {
    setEditing(doc);
    setForm({
      name: doc.name,
      description: doc.description ?? '',
      category: doc.category,
      isRequired: doc.isRequired,
      isActive: doc.isActive,
      validFrom: isoToInputDate(doc.validFrom),
      validTo: isoToInputDate(doc.validTo),
      minorsOnly: doc.minorsOnly,
      mediaAssetId: null, // null = pas de remplacement par défaut
      fileName: null,
    });
    setDrawerOpen(true);
  }

  async function uploadPdf(file: File): Promise<string | null> {
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) {
      showToast('Session invalide', 'error');
      return null;
    }
    if (file.type !== 'application/pdf') {
      showToast('Seuls les fichiers PDF sont acceptés.', 'error');
      return null;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      // L'endpoint /media/upload lit `kind` et `ownerKind` en query string ; le
      // contrôleur (apps/api/src/media/media.controller.ts) bascule sur
      // `uploadDocument` si `kind=document`. Pas de FormData fields ici.
      const res = await fetch(
        `${apiBase()}/media/upload?kind=document&ownerKind=DOCUMENT`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Club-Id': clubId,
          },
          body: fd,
        },
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Upload PDF échoué (${res.status}) : ${txt.slice(0, 200)}`);
      }
      const asset = (await res.json()) as { id: string };
      return asset.id;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const id = await uploadPdf(f);
    if (id) {
      setForm((prev) => ({ ...prev, mediaAssetId: id, fileName: f.name }));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('Le nom est obligatoire.', 'error');
      return;
    }
    const validFromIso = inputDateToIso(form.validFrom);
    if (!validFromIso) {
      showToast('La date de début de validité est obligatoire.', 'error');
      return;
    }
    const validToIso = inputDateToIso(form.validTo);
    try {
      if (editing) {
        // Mode édition : on n'envoie mediaAssetId que si l'utilisateur a
        // remplacé le PDF (sinon backend conserve le fichier source).
        await updateDoc({
          variables: {
            input: {
              id: editing.id,
              name: form.name.trim(),
              description: form.description.trim() || null,
              category: form.category,
              isRequired: form.isRequired,
              isActive: form.isActive,
              validFrom: validFromIso,
              validTo: validToIso,
              minorsOnly: form.minorsOnly,
              ...(form.mediaAssetId
                ? { mediaAssetId: form.mediaAssetId }
                : {}),
            },
          },
        });
        showToast(
          form.mediaAssetId
            ? 'Document mis à jour (nouvelle version).'
            : 'Document mis à jour.',
          'success',
        );
      } else {
        if (!form.mediaAssetId) {
          showToast('Téléverse d’abord un PDF.', 'error');
          return;
        }
        await createDoc({
          variables: {
            input: {
              name: form.name.trim(),
              description: form.description.trim() || null,
              category: form.category,
              mediaAssetId: form.mediaAssetId,
              isRequired: form.isRequired,
              isActive: form.isActive,
              validFrom: validFromIso,
              validTo: validToIso,
              minorsOnly: form.minorsOnly,
            },
          },
        });
        showToast('Document créé.', 'success');
      }
      setDrawerOpen(false);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doArchive(doc: ClubDocument) {
    try {
      if (doc.isActive) {
        // archive
        await archiveDoc({ variables: { id: doc.id } });
        showToast('Document archivé.', 'success');
      } else {
        // restore via update isActive=true
        await updateDoc({
          variables: { input: { id: doc.id, isActive: true } },
        });
        showToast('Document restauré.', 'success');
      }
      setConfirmArchive(null);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doDelete(doc: ClubDocument) {
    try {
      await deleteDoc({ variables: { id: doc.id } });
      showToast('Document supprimé.', 'success');
      setConfirmDelete(null);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">Communauté</p>
            <h1 className="members-loom__title">Documents à signer</h1>
            <p className="members-loom__subtitle">
              Règlement intérieur, droit à l’image, autorisations parentales —
              versionnés et archivés avec audit signataire.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => openCreate()}
          >
            <span className="material-symbols-outlined" aria-hidden>
              add
            </span>
            Ajouter un document
          </button>
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
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: 12,
            padding: 16,
            background: '#fff',
          }}
        >
          <p
            className="cf-muted"
            style={{ margin: 0, fontSize: 12, textTransform: 'uppercase' }}
          >
            Documents actifs
          </p>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 28,
              fontWeight: 700,
              color: '#0f172a',
            }}
          >
            {kpi.active}
          </p>
        </article>
        <article
          style={{
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: 12,
            padding: 16,
            background: '#fff',
          }}
        >
          <p
            className="cf-muted"
            style={{ margin: 0, fontSize: 12, textTransform: 'uppercase' }}
          >
            Documents archivés
          </p>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 28,
              fontWeight: 700,
              color: '#475569',
            }}
          >
            {kpi.archived}
          </p>
        </article>
        <article
          style={{
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: 12,
            padding: 16,
            background: '#fff',
          }}
        >
          <p
            className="cf-muted"
            style={{ margin: 0, fontSize: 12, textTransform: 'uppercase' }}
          >
            Signatures (moy. par doc)
          </p>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 28,
              fontWeight: 700,
              color: '#16a34a',
            }}
          >
            {kpi.avgSigned}
          </p>
        </article>
      </section>

      {error ? (
        <p className="form-error">{error.message}</p>
      ) : loading && documents.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : documents.length === 0 ? (
        <EmptyState
          icon="description"
          title="Aucun document"
          message="Ajoute ton premier document à signer pour démarrer."
          action={
            <button
              type="button"
              className="btn-primary"
              onClick={() => openCreate()}
            >
              + Ajouter un document
            </button>
          }
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            className="cf-table"
            style={{ width: '100%', borderCollapse: 'collapse' }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>Nom</th>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>
                  Catégorie
                </th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>
                  Version
                </th>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>
                  Validité
                </th>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>
                  Statut
                </th>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>
                  Signatures
                </th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const pillStyle = CATEGORY_PILL_STYLE[doc.category];
                return (
                  <tr key={doc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>
                        {doc.name}
                      </div>
                      {doc.description ? (
                        <div
                          className="cf-muted"
                          style={{
                            fontSize: 12,
                            marginTop: 2,
                            maxWidth: 380,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={doc.description}
                        >
                          {doc.description}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span
                        className="cf-pill"
                        style={{
                          background: pillStyle.background,
                          color: pillStyle.color,
                        }}
                      >
                        {CATEGORY_LABEL[doc.category]}
                      </span>
                      {doc.minorsOnly ? (
                        <span
                          className="cf-pill"
                          style={{
                            marginLeft: 6,
                            background: '#fef3c7',
                            color: '#92400e',
                          }}
                          title="S’applique uniquement aux mineurs"
                        >
                          Mineurs
                        </span>
                      ) : null}
                    </td>
                    <td
                      style={{
                        padding: '10px 8px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      v{doc.version}
                    </td>
                    <td style={{ padding: '10px 8px', fontSize: 13 }}>
                      <div>{fmtDate(doc.validFrom)}</div>
                      <div className="cf-muted" style={{ fontSize: 11 }}>
                        → {fmtDate(doc.validTo)}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <span
                        className={
                          doc.isActive
                            ? 'cf-pill cf-pill--ok'
                            : 'cf-pill cf-pill--draft'
                        }
                      >
                        {doc.isActive ? 'Actif' : 'Archivé'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', minWidth: 140 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {doc.signedCount} signature
                        {doc.signedCount > 1 ? 's' : ''}
                      </div>
                      {doc.fields.length === 0 ? (
                        <div
                          style={{
                            fontSize: 11,
                            color: '#92400e',
                            marginTop: 2,
                          }}
                        >
                          Aucun champ — éditeur requis
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'flex',
                          gap: 4,
                          justifyContent: 'flex-end',
                          flexWrap: 'wrap',
                        }}
                      >
                        <Link
                          to={`/documents/${doc.id}/editor`}
                          className="btn-ghost btn-tight"
                          title="Éditer les champs sur le PDF"
                        >
                          Champs
                        </Link>
                        <Link
                          to={`/documents/${doc.id}/signatures`}
                          className="btn-ghost btn-tight"
                          title="Suivi des signatures"
                        >
                          Signatures
                        </Link>
                        <button
                          type="button"
                          className="btn-ghost btn-tight"
                          onClick={() => openEdit(doc)}
                        >
                          Éditer
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-tight"
                          onClick={() => setConfirmArchive(doc)}
                        >
                          {doc.isActive ? 'Archiver' : 'Restaurer'}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-tight btn-ghost--danger"
                          onClick={() => setConfirmDelete(doc)}
                          title="Suppression définitive"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={drawerOpen}
        title={editing ? 'Modifier le document' : 'Nouveau document'}
        onClose={() => setDrawerOpen(false)}
        footer={
          <div
            style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}
          >
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setDrawerOpen(false)}
            >
              Annuler
            </button>
            <button
              type="submit"
              form="doc-form"
              className="btn-primary"
              disabled={creating || updating || uploading}
            >
              {editing ? 'Mettre à jour' : 'Créer'}
            </button>
            {editing && form.mediaAssetId ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setDrawerOpen(false);
                  navigate(`/documents/${editing.id}/editor`);
                }}
              >
                Aller à l’éditeur de champs
              </button>
            ) : null}
          </div>
        }
      >
        <form id="doc-form" onSubmit={(e) => void onSubmit(e)} className="cf-form">
          <label className="cf-field">
            <span>Nom *</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) =>
                setForm((p) => ({ ...p, name: e.target.value }))
              }
              maxLength={200}
              required
            />
          </label>
          <label className="cf-field">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((p) => ({ ...p, description: e.target.value }))
              }
              rows={3}
              maxLength={2000}
            />
          </label>
          <label className="cf-field">
            <span>Catégorie *</span>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  category: e.target.value as ClubDocumentCategory,
                }))
              }
            >
              {(Object.keys(CATEGORY_LABEL) as ClubDocumentCategory[]).map(
                (c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ),
              )}
            </select>
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
            }}
          >
            <label className="cf-field">
              <span>Valide à partir de *</span>
              <input
                type="date"
                value={form.validFrom}
                onChange={(e) =>
                  setForm((p) => ({ ...p, validFrom: e.target.value }))
                }
                required
              />
            </label>
            <label className="cf-field">
              <span>Jusqu’à</span>
              <input
                type="date"
                value={form.validTo}
                onChange={(e) =>
                  setForm((p) => ({ ...p, validTo: e.target.value }))
                }
              />
            </label>
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
            }}
          >
            <input
              type="checkbox"
              checked={form.isRequired}
              onChange={(e) =>
                setForm((p) => ({ ...p, isRequired: e.target.checked }))
              }
            />
            <span>Obligatoire pour tous les adhérents</span>
          </label>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <input
              type="checkbox"
              checked={form.minorsOnly}
              onChange={(e) =>
                setForm((p) => ({ ...p, minorsOnly: e.target.checked }))
              }
            />
            <span>Concerne uniquement les mineurs</span>
          </label>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) =>
                setForm((p) => ({ ...p, isActive: e.target.checked }))
              }
            />
            <span>Document actif (visible des adhérents)</span>
          </label>

          <div
            style={{
              marginTop: 16,
              padding: 12,
              border: '1px dashed #cbd5e1',
              borderRadius: 8,
              background: '#f8fafc',
            }}
          >
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>
              {editing ? 'Remplacer le PDF source' : 'PDF source *'}
            </p>
            <p
              className="cf-muted"
              style={{ margin: '0 0 8px', fontSize: 12 }}
            >
              {editing
                ? 'Téléverser un nouveau fichier crée une version v'
                  + (editing.version + 1)
                  + ' et invalide les signatures précédentes.'
                : 'Format PDF uniquement. Les zones signature seront positionnées dans l’étape suivante.'}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => void onPickFile(e)}
              disabled={uploading}
            />
            {form.fileName ? (
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: 12,
                  color: '#16a34a',
                }}
              >
                Fichier prêt : {form.fileName}
              </p>
            ) : null}
            {uploading ? (
              <p
                className="cf-muted"
                style={{ margin: '8px 0 0', fontSize: 12 }}
              >
                Téléversement…
              </p>
            ) : null}
          </div>
        </form>
      </Drawer>

      <ConfirmModal
        open={!!confirmArchive}
        title={
          confirmArchive?.isActive ? 'Archiver le document ?' : 'Restaurer ?'
        }
        message={
          confirmArchive?.isActive
            ? 'Le document ne sera plus proposé aux adhérents. Les signatures existantes restent consultables.'
            : 'Le document redeviendra visible et signable.'
        }
        confirmLabel={confirmArchive?.isActive ? 'Archiver' : 'Restaurer'}
        onCancel={() => setConfirmArchive(null)}
        onConfirm={() => {
          if (confirmArchive) void doArchive(confirmArchive);
        }}
      />

      <ConfirmModal
        open={!!confirmDelete}
        title="Supprimer définitivement ?"
        message={
          <>
            Cette action est <strong>irréversible</strong>. Le document, ses
            zones signature et l’historique des signatures seront effacés.
            Préfère l’archivage pour conserver les preuves.
          </>
        }
        confirmLabel="Supprimer"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void doDelete(confirmDelete);
        }}
      />
    </>
  );
}
