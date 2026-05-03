import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CLUB_VITRINE_CATEGORIES,
  CREATE_VITRINE_CATEGORY,
  DELETE_VITRINE_CATEGORY,
  UPDATE_VITRINE_CATEGORY,
  type AdminVitrineCategory,
  type ClubVitrineCategoriesData,
} from '../../lib/vitrine-documents';
import { useToast } from '../../components/ToastProvider';

/**
 * CRUD catégories d'articles vitrine (type WordPress).
 *
 * Chaque catégorie a : name, slug (auto), description, color (hex pour badge),
 * sortOrder. Les articles sont reliés via la table de jointure
 * VitrineArticleCategories (set depuis l'éditeur d'article).
 */
export function VitrineCategoriesPage() {
  const { showToast } = useToast();
  const { data, loading, error } = useQuery<ClubVitrineCategoriesData>(
    CLUB_VITRINE_CATEGORIES,
    { fetchPolicy: 'cache-and-network' },
  );
  const [create, { loading: creating }] = useMutation(CREATE_VITRINE_CATEGORY, {
    refetchQueries: [{ query: CLUB_VITRINE_CATEGORIES }],
  });
  const [update] = useMutation(UPDATE_VITRINE_CATEGORY, {
    refetchQueries: [{ query: CLUB_VITRINE_CATEGORIES }],
  });
  const [remove] = useMutation(DELETE_VITRINE_CATEGORY, {
    refetchQueries: [{ query: CLUB_VITRINE_CATEGORIES }],
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#c9a96a');

  async function handleCreate(): Promise<void> {
    if (!name.trim()) {
      showToast('Nom requis', 'error');
      return;
    }
    try {
      await create({
        variables: {
          input: {
            name: name.trim(),
            description: description.trim() || undefined,
            color: color || undefined,
          },
        },
      });
      setName('');
      setDescription('');
      showToast('Catégorie créée.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  const categories = data?.clubVitrineCategories ?? [];

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              <Link to="/vitrine">← Site vitrine</Link>
            </p>
            <h1 className="members-loom__title">
              Catégories <span className="muted">({categories.length})</span>
            </h1>
            <p className="muted" style={{ marginTop: 4 }}>
              Organise tes articles par thème (type WordPress). Chaque article
              peut appartenir à plusieurs catégories.
            </p>
          </div>
        </div>
      </header>

      <section
        style={{
          background: '#fff',
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 17 }}>Créer une catégorie</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 3fr 100px auto',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <label className="field" style={{ margin: 0 }}>
            <span>Nom</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Compétitions, Stage, Technique…"
            />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Description (optionnelle)</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Courte description affichée en haut de la page catégorie"
            />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Couleur</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ height: 36, padding: 2 }}
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => void handleCreate()}
            disabled={creating}
          >
            {creating ? 'Création…' : '+ Créer'}
          </button>
        </div>
      </section>

      {error ? (
        <p className="form-error">{error.message}</p>
      ) : loading && categories.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : categories.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center', padding: 24 }}>
          Aucune catégorie. Créez-en une ci-dessus pour commencer à organiser
          tes articles.
        </p>
      ) : (
        <div className="members-table-wrap">
          <table className="members-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Nom</th>
                <th>Slug</th>
                <th>Articles</th>
                <th>Ordre</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  onUpdate={(input) =>
                    void update({ variables: { input } }).catch((err) =>
                      showToast(
                        err instanceof Error ? err.message : 'Échec',
                        'error',
                      ),
                    )
                  }
                  onDelete={() => {
                    if (
                      window.confirm(
                        `Supprimer la catégorie « ${c.name} » ? (les articles ne seront pas supprimés)`,
                      )
                    ) {
                      void remove({ variables: { id: c.id } });
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CategoryRow({
  category,
  onUpdate,
  onDelete,
}: {
  category: AdminVitrineCategory;
  onUpdate: (input: {
    id: string;
    name?: string;
    slug?: string;
    color?: string | null;
    sortOrder?: number;
  }) => void;
  onDelete: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(category.name);

  function commitName(): void {
    setEditingName(false);
    if (draftName.trim() && draftName !== category.name) {
      onUpdate({ id: category.id, name: draftName.trim() });
    } else {
      setDraftName(category.name);
    }
  }

  return (
    <tr>
      <td>
        <span
          style={{
            display: 'inline-block',
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: category.color ?? '#c9a96a',
            border: '1px solid #cbd5e1',
          }}
          title={category.color ?? 'couleur par défaut'}
        />
      </td>
      <td>
        {editingName ? (
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') {
                setDraftName(category.name);
                setEditingName(false);
              }
            }}
            autoFocus
            style={{ fontSize: 14, padding: 4 }}
          />
        ) : (
          <strong
            style={{ cursor: 'pointer' }}
            onClick={() => setEditingName(true)}
            title="Cliquer pour renommer"
          >
            {category.name}
          </strong>
        )}
        {category.description ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {category.description}
          </div>
        ) : null}
      </td>
      <td>
        <code style={{ fontSize: 12 }}>{category.slug}</code>
      </td>
      <td>
        <span className="muted">{category.articleCount}</span>
      </td>
      <td>
        <input
          type="number"
          value={category.sortOrder}
          onChange={(e) =>
            onUpdate({
              id: category.id,
              sortOrder: Number(e.target.value) || 0,
            })
          }
          style={{ width: 60, padding: 4, fontSize: 13 }}
        />
      </td>
      <td style={{ display: 'flex', gap: 6 }}>
        <input
          type="color"
          value={category.color ?? '#c9a96a'}
          onChange={(e) => onUpdate({ id: category.id, color: e.target.value })}
          style={{ width: 32, height: 28, padding: 0, border: 0 }}
          title="Changer la couleur"
        />
        <button
          type="button"
          className="btn btn-tight btn-ghost"
          onClick={onDelete}
        >
          Supprimer
        </button>
      </td>
    </tr>
  );
}
