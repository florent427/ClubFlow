import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import {
  CATEGORY_LABEL,
  VIEWER_DOCUMENTS_TO_SIGN,
  VIEWER_SIGN_CLUB_DOCUMENT,
  type ClubDocumentFieldType,
  type ViewerDocumentToSign,
} from '../lib/documents-signature';

type Data = { viewerDocumentsToSign: ViewerDocumentToSign[] };

type FieldValue = {
  fieldId: string;
  type: ClubDocumentFieldType;
  valuePngBase64?: string;
  text?: string;
  bool?: boolean;
};

/**
 * Page « Documents à signer » du portail web membre.
 *
 * - Liste tous les documents obligatoires non encore signés (query
 *   `viewerDocumentsToSign` qui filtre déjà version courante + minorsOnly).
 * - Sélection d'un document → affichage du PDF en iframe + formulaire de
 *   signature : signature_pad pour les champs SIGNATURE, input pour TEXT/
 *   DATE, checkbox pour CHECKBOX.
 * - Soumission → mutation `viewerSignClubDocument` qui génère le PDF
 *   signé côté serveur (overlay pdf-lib) et invalide les versions
 *   précédentes.
 */
export function DocumentsToSignPage() {
  const { data, loading, refetch } = useQuery<Data>(VIEWER_DOCUMENTS_TO_SIGN, {
    errorPolicy: 'all',
    fetchPolicy: 'cache-and-network',
  });
  const [signMutation, { loading: signing }] = useMutation(
    VIEWER_SIGN_CLUB_DOCUMENT,
    {
      // Rafraîchit la bannière persistante affichée sur Dashboard /
      // Billing / Adhesion / ContactHome dès que la signature est
      // confirmée, sans attendre le polling 30s.
      refetchQueries: ['ViewerDocumentsToSign'],
      awaitRefetchQueries: true,
    },
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const docs = data?.viewerDocumentsToSign ?? [];
  const selected = useMemo(
    () => docs.find((d) => d.id === selectedId) ?? null,
    [docs, selectedId],
  );

  if (loading && docs.length === 0) {
    return <p className="cf-muted">Chargement…</p>;
  }
  if (docs.length === 0) {
    return (
      <div className="docs-empty">
        <h1>Documents à signer</h1>
        <div className="docs-empty__card">
          <span aria-hidden>✓</span>
          <h2>Tout est à jour</h2>
          <p>Aucun document n'attend votre signature.</p>
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <DocumentSignForm
        doc={selected}
        signing={signing}
        onCancel={() => setSelectedId(null)}
        onSign={async (fieldValues) => {
          await signMutation({
            variables: {
              input: { documentId: selected.id, fieldValues },
            },
          });
          await refetch();
          setSelectedId(null);
        }}
      />
    );
  }

  return (
    <div className="docs-list">
      <header className="docs-list__hero">
        <h1>Documents à signer</h1>
        <p>
          {docs.length} document{docs.length > 1 ? 's' : ''} obligatoire
          {docs.length > 1 ? 's' : ''}. Signez-les pour accéder à toutes
          vos fonctionnalités.
        </p>
      </header>
      <ul className="docs-list__cards">
        {docs.map((doc) => (
          <li key={doc.id} className="docs-list__card">
            <div className="docs-list__card-meta">
              <span className="docs-list__pill">
                {CATEGORY_LABEL[doc.category]}
              </span>
              {doc.minorsOnly ? (
                <span className="docs-list__pill docs-list__pill--minor">
                  Mineurs
                </span>
              ) : null}
              <span className="docs-list__version">v{doc.version}</span>
            </div>
            <h2>{doc.name}</h2>
            {doc.description ? <p>{doc.description}</p> : null}
            <button
              type="button"
              className="btn-primary"
              onClick={() => setSelectedId(doc.id)}
            >
              Signer ce document →
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocumentSignForm({
  doc,
  signing,
  onCancel,
  onSign,
}: {
  doc: ViewerDocumentToSign;
  signing: boolean;
  onCancel: () => void;
  onSign: (values: FieldValue[]) => Promise<void>;
}) {
  /** State indexé par fieldId. */
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [boolValues, setBoolValues] = useState<Record<string, boolean>>({});
  const [signatureBase64, setSignatureBase64] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState<string | null>(null);

  const sortedFields = useMemo(
    () => [...doc.fields].sort((a, b) => a.sortOrder - b.sortOrder),
    [doc.fields],
  );

  // Vérifie tous les required.
  const canSubmit = sortedFields.every((f) => {
    if (!f.required) return true;
    if (f.fieldType === 'SIGNATURE') return !!signatureBase64[f.id];
    if (f.fieldType === 'TEXT') {
      return (textValues[f.id] ?? '').trim().length > 0;
    }
    if (f.fieldType === 'DATE') return true; // si vide, le backend met now()
    if (f.fieldType === 'CHECKBOX') return boolValues[f.id] === true;
    return true;
  });

  const submit = async () => {
    setError(null);
    const values: FieldValue[] = sortedFields.map((f) => {
      if (f.fieldType === 'SIGNATURE') {
        return {
          fieldId: f.id,
          type: 'SIGNATURE',
          valuePngBase64: signatureBase64[f.id] ?? '',
        };
      }
      if (f.fieldType === 'TEXT') {
        return { fieldId: f.id, type: 'TEXT', text: textValues[f.id] ?? '' };
      }
      if (f.fieldType === 'DATE') {
        return { fieldId: f.id, type: 'DATE', text: textValues[f.id] ?? '' };
      }
      return {
        fieldId: f.id,
        type: 'CHECKBOX',
        bool: boolValues[f.id] ?? false,
      };
    });
    try {
      await onSign(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signature impossible.');
    }
  };

  return (
    <div className="docs-sign">
      <div className="docs-sign__header">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          ← Retour à la liste
        </button>
        <h1>{doc.name}</h1>
        {doc.description ? (
          <p className="docs-sign__description">{doc.description}</p>
        ) : null}
      </div>

      <div className="docs-sign__layout">
        <section className="docs-sign__pdf">
          <h2>Document à signer</h2>
          <iframe
            src={doc.mediaAssetUrl}
            title={doc.name}
            className="docs-sign__iframe"
          />
          <a
            href={doc.mediaAssetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="docs-sign__open-external"
          >
            Ouvrir dans un nouvel onglet ↗
          </a>
        </section>

        <section className="docs-sign__form">
          <h2>Vos informations</h2>
          {sortedFields.map((f) => {
            if (f.fieldType === 'SIGNATURE') {
              return (
                <SignatureCanvas
                  key={f.id}
                  label={f.label ?? 'Signature'}
                  required={f.required}
                  onChange={(b64) =>
                    setSignatureBase64((prev) => ({ ...prev, [f.id]: b64 }))
                  }
                />
              );
            }
            if (f.fieldType === 'TEXT') {
              return (
                <label key={f.id} className="docs-sign__field">
                  <span>
                    {f.label ?? 'Texte'}
                    {f.required ? ' *' : ''}
                  </span>
                  <input
                    type="text"
                    value={textValues[f.id] ?? ''}
                    onChange={(e) =>
                      setTextValues((prev) => ({
                        ...prev,
                        [f.id]: e.target.value,
                      }))
                    }
                  />
                </label>
              );
            }
            if (f.fieldType === 'DATE') {
              return (
                <label key={f.id} className="docs-sign__field">
                  <span>{f.label ?? 'Date'} (laisser vide = aujourd'hui)</span>
                  <input
                    type="text"
                    placeholder="JJ/MM/AAAA"
                    value={textValues[f.id] ?? ''}
                    onChange={(e) =>
                      setTextValues((prev) => ({
                        ...prev,
                        [f.id]: e.target.value,
                      }))
                    }
                  />
                </label>
              );
            }
            return (
              <label key={f.id} className="docs-sign__checkbox">
                <input
                  type="checkbox"
                  checked={boolValues[f.id] ?? false}
                  onChange={(e) =>
                    setBoolValues((prev) => ({
                      ...prev,
                      [f.id]: e.target.checked,
                    }))
                  }
                />
                <span>
                  {f.label ?? 'Je confirme'}
                  {f.required ? ' *' : ''}
                </span>
              </label>
            );
          })}

          {error ? <p className="form-error">{error}</p> : null}

          <p className="docs-sign__legal">
            Votre signature est horodatée. L'IP, le user-agent et un hash
            SHA-256 du document sont enregistrés à des fins de preuve.
          </p>

          <div className="docs-sign__actions">
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canSubmit || signing}
              onClick={() => void submit()}
            >
              {signing ? 'Signature en cours…' : 'Valider et signer'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Wrapper signature_pad. Émet un base64 PNG via onChange à chaque
 * fin de trait (signature_pad expose onEnd via la classe).
 */
function SignatureCanvas({
  label,
  required,
  onChange,
}: {
  label: string;
  required: boolean;
  onChange: (base64Png: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize crisp avec devicePixelRatio.
    const ratio = Math.max(window.devicePixelRatio ?? 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);

    const pad = new SignaturePad(canvas, {
      penColor: '#0f172a',
      backgroundColor: 'rgba(0,0,0,0)',
    });
    pad.addEventListener('endStroke', () => {
      if (pad.isEmpty()) {
        onChange('');
        return;
      }
      onChange(pad.toDataURL('image/png'));
    });
    padRef.current = pad;
    return () => {
      pad.off();
      padRef.current = null;
    };
    // onChange est intentionnellement hors deps : on ne réinitialise pas
    // le pad à chaque re-render parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clear = () => {
    padRef.current?.clear();
    onChange('');
  };

  return (
    <div className="docs-sign__signature">
      <div className="docs-sign__signature-header">
        <span>
          {label}
          {required ? ' *' : ''}
        </span>
        <button type="button" className="btn-ghost btn-tight" onClick={clear}>
          Effacer
        </button>
      </div>
      <canvas ref={canvasRef} className="docs-sign__signature-canvas" />
      <p className="docs-sign__hint">
        Signez avec votre souris ou votre doigt sur écran tactile.
      </p>
    </div>
  );
}
