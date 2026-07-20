import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  CREATE_SHOP_SUPPLIER,
  SHOP_SUPPLIERS,
  UPDATE_SHOP_SUPPLIER,
} from '../../lib/documents';
import type {
  CreateShopSupplierMutationData,
  ShopSupplier,
  ShopSuppliersQueryData,
  UpdateShopSupplierMutationData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { Drawer, EmptyState } from '../../components/ui';
import { parseOptionalInt } from '../../lib/shop-variant-matrix';

type SupplierDraft = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  accountRef: string;
  leadTimeDaysStr: string;
  notes: string;
};

const EMPTY: SupplierDraft = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  accountRef: '',
  leadTimeDaysStr: '',
  notes: '',
};

function toDraft(s: ShopSupplier): SupplierDraft {
  return {
    name: s.name,
    contactName: s.contactName ?? '',
    email: s.email ?? '',
    phone: s.phone ?? '',
    accountRef: s.accountRef ?? '',
    leadTimeDaysStr: s.leadTimeDays === null ? '' : String(s.leadTimeDays),
    notes: s.notes ?? '',
  };
}

/** `''` → `null` : un champ vidé efface la valeur, il ne l'ignore pas. */
function orNull(v: string): string | null {
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export function SuppliersTab() {
  const { showToast } = useToast();
  const [includeInactive, setIncludeInactive] = useState(false);

  const { data, loading, refetch } = useQuery<ShopSuppliersQueryData>(
    SHOP_SUPPLIERS,
    {
      variables: { includeInactive },
      fetchPolicy: 'cache-and-network',
    },
  );

  const [createSupplier, { loading: creating }] =
    useMutation<CreateShopSupplierMutationData>(CREATE_SHOP_SUPPLIER);
  const [updateSupplier, { loading: updating }] =
    useMutation<UpdateShopSupplierMutationData>(UPDATE_SHOP_SUPPLIER);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ShopSupplier | null>(null);
  const [draft, setDraft] = useState<SupplierDraft>(EMPTY);

  const suppliers = data?.shopSuppliers ?? [];

  function openCreate() {
    setEditing(null);
    setDraft(EMPTY);
    setDrawerOpen(true);
  }

  function openEdit(s: ShopSupplier) {
    setEditing(s);
    setDraft(toDraft(s));
    setDrawerOpen(true);
  }

  function patch(p: Partial<SupplierDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (draft.name.trim().length === 0) {
      showToast('Un fournisseur doit être nommé.', 'error');
      return;
    }
    const lead = parseOptionalInt(draft.leadTimeDaysStr);
    if (!lead.ok) {
      showToast('Délai de livraison invalide', 'error');
      return;
    }
    if (lead.value !== null && lead.value < 0) {
      showToast('Le délai de livraison ne peut pas être négatif', 'error');
      return;
    }

    const shared = {
      name: draft.name.trim(),
      contactName: orNull(draft.contactName),
      email: orNull(draft.email),
      phone: orNull(draft.phone),
      accountRef: orNull(draft.accountRef),
      leadTimeDays: lead.value,
      notes: orNull(draft.notes),
    };

    try {
      if (editing) {
        await updateSupplier({
          variables: { input: { supplierId: editing.id, ...shared } },
        });
        showToast('Fournisseur mis à jour', 'success');
      } else {
        await createSupplier({ variables: { input: shared } });
        showToast('Fournisseur créé', 'success');
      }
      setDrawerOpen(false);
      // La liste est filtrée par `includeInactive` côté serveur : la réponse
      // d'une mutation ne dit pas à Apollo si le fournisseur y entre ou en
      // sort. On relit.
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onToggleActive(s: ShopSupplier) {
    try {
      await updateSupplier({
        variables: { input: { supplierId: s.id, active: !s.active } },
      });
      showToast(
        s.active ? 'Fournisseur désactivé' : 'Fournisseur réactivé',
        'success',
      );
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <div>
      <div className="cf-toolbar">
        <button
          type="button"
          className="cf-btn cf-btn--primary"
          onClick={openCreate}
        >
          Nouveau fournisseur
        </button>
        <label className="cf-checkbox">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          <span>Afficher aussi les fournisseurs désactivés</span>
        </label>
      </div>

      {loading && suppliers.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon="local_shipping"
          title="Aucun fournisseur"
          message="Enregistrez vos fournisseurs habituels : c’est le préalable à toute commande d’approvisionnement."
        />
      ) : (
        <div className="cf-variant-matrix">
          <table className="cf-data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Contact</th>
                <th>Référence client</th>
                <th>Délai habituel</th>
                <th>État</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    {s.notes ? (
                      <div className="cf-muted">{s.notes}</div>
                    ) : null}
                  </td>
                  <td>
                    {s.contactName ?? '—'}
                    {s.email ? (
                      <div className="cf-muted">{s.email}</div>
                    ) : null}
                    {s.phone ? <div className="cf-muted">{s.phone}</div> : null}
                  </td>
                  <td>
                    {s.accountRef ? (
                      <code className="cf-product-card__sku">
                        {s.accountRef}
                      </code>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {s.leadTimeDays === null
                      ? '—'
                      : `${s.leadTimeDays} jour${s.leadTimeDays > 1 ? 's' : ''}`}
                  </td>
                  <td>
                    <span
                      className={`cf-pill cf-pill--${s.active ? 'ok' : 'muted'}`}
                    >
                      {s.active ? 'Actif' : 'Désactivé'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="cf-btn cf-btn--sm"
                      onClick={() => openEdit(s)}
                    >
                      Modifier
                    </button>{' '}
                    <button
                      type="button"
                      className="cf-btn cf-btn--sm"
                      onClick={() => void onToggleActive(s)}
                    >
                      {s.active ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cf-field__hint">
            Un fournisseur ne se supprime pas : les commandes passées chez lui
            le référencent. « Désactiver » le retire des listes de choix sans
            emporter l’historique.
          </p>
        </div>
      )}

      <Drawer
        open={drawerOpen}
        title={editing ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
        onClose={() => setDrawerOpen(false)}
      >
        <form onSubmit={(e) => void onSubmit(e)} className="cf-form">
          <label className="cf-field">
            <span className="cf-field__label">Nom</span>
            <input
              type="text"
              className="cf-input"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              required
              maxLength={160}
              placeholder="Décathlon Pro"
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Interlocuteur</span>
            <input
              type="text"
              className="cf-input"
              value={draft.contactName}
              onChange={(e) => patch({ contactName: e.target.value })}
              maxLength={160}
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">E-mail</span>
            <input
              type="email"
              className="cf-input"
              value={draft.email}
              onChange={(e) => patch({ email: e.target.value })}
              maxLength={200}
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Téléphone</span>
            <input
              type="tel"
              className="cf-input"
              value={draft.phone}
              onChange={(e) => patch({ phone: e.target.value })}
              maxLength={40}
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">
              Référence du club chez ce fournisseur
            </span>
            <input
              type="text"
              className="cf-input"
              value={draft.accountRef}
              onChange={(e) => patch({ accountRef: e.target.value })}
              maxLength={80}
              placeholder="Numéro de compte client"
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">
              Délai de livraison habituel (jours)
            </span>
            <input
              type="number"
              className="cf-input"
              min={0}
              value={draft.leadTimeDaysStr}
              onChange={(e) => patch({ leadTimeDaysStr: e.target.value })}
            />
            <span className="cf-field__hint">
              Sert à dater l’arrivée attendue au moment de l’envoi d’une
              commande. Laissé vide, aucune date d’arrivée n’est proposée.
            </span>
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Notes</span>
            <textarea
              className="cf-input"
              rows={3}
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              maxLength={500}
            />
          </label>
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-btn"
              onClick={() => setDrawerOpen(false)}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="cf-btn cf-btn--primary"
              disabled={creating || updating}
            >
              {editing ? 'Enregistrer' : 'Créer le fournisseur'}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
