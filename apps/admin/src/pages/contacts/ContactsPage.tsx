import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CLUB_CONTACTS } from '../../lib/documents';
import type { ClubContactRow, ClubContactsQueryData } from '../../lib/types';
import { useMembersUi } from '../members/members-ui-context';
import { ContactDetailDrawer } from './ContactDetailDrawer';

type VerifiedFilter = 'all' | 'yes' | 'no';
type SortKey = 'lastName' | 'firstName' | 'email';

export function ContactsPage() {
  const navigate = useNavigate();
  const { setDrawerMemberId } = useMembersUi();
  const [drawerContactId, setDrawerContactId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [verified, setVerified] = useState<VerifiedFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('lastName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { data, loading, error, refetch } = useQuery<ClubContactsQueryData>(
    CLUB_CONTACTS,
    { fetchPolicy: 'cache-and-network' },
  );

  const contacts = data?.clubContacts ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = contacts;
    if (q) {
      rows = rows.filter((c) => {
        const blob = `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase();
        return blob.includes(q);
      });
    }
    if (verified === 'yes') {
      rows = rows.filter((c) => c.emailVerified);
    } else if (verified === 'no') {
      rows = rows.filter((c) => !c.emailVerified);
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = [...rows].sort((a, b) => {
      const va = a[sortKey].toLowerCase();
      const vb = b[sortKey].toLowerCase();
      return va.localeCompare(vb, 'fr') * dir;
    });
    return sorted;
  }, [contacts, search, verified, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortLabel(key: SortKey, label: string) {
    const active = sortKey === key;
    const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return (
      <button
        type="button"
        className="members-table-sort-btn"
        onClick={() => toggleSort(key)}
      >
        {label}
        {arrow}
      </button>
    );
  }

  function openLinkedMember(c: ClubContactRow) {
    if (!c.linkedMemberId) return;
    setDrawerMemberId(c.linkedMemberId);
    void navigate('/members');
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">Portail membre</p>
            <h1 className="members-loom__title">Contacts</h1>
            <p className="members-loom__lede">
              Personnes inscrites comme contacts via le portail. Les
              modifications de prénom / nom synchronisent le{' '}
              <strong>nom affiché</strong> du compte (effet global pour ce
              compte utilisateur).
            </p>
          </div>
        </div>
      </header>

      <div className="members-loom__grid members-loom__grid--single">
        <section className="members-panel members-panel--table">
          <h2 className="members-panel__h">Liste des contacts</h2>
          <div className="contacts-toolbar">
            <label className="field members-directory__search">
              <span>Recherche</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Prénom, nom ou e-mail"
                autoComplete="off"
              />
            </label>
            <div className="contacts-filter" role="group" aria-label="Filtre e-mail vérifié">
              <button
                type="button"
                className={
                  verified === 'all' ? 'btn btn-primary btn-tight' : 'btn btn-ghost btn-tight'
                }
                onClick={() => setVerified('all')}
              >
                Tous
              </button>
              <button
                type="button"
                className={
                  verified === 'yes'
                    ? 'btn btn-primary btn-tight'
                    : 'btn btn-ghost btn-tight'
                }
                onClick={() => setVerified('yes')}
              >
                E-mail vérifié
              </button>
              <button
                type="button"
                className={
                  verified === 'no'
                    ? 'btn btn-primary btn-tight'
                    : 'btn btn-ghost btn-tight'
                }
                onClick={() => setVerified('no')}
              >
                Non vérifié
              </button>
            </div>
          </div>

          {loading ? (
            <p className="muted">Chargement…</p>
          ) : error ? (
            <p className="form-error">{error.message}</p>
          ) : contacts.length === 0 ? (
            <p className="muted">Aucun contact pour ce club.</p>
          ) : filtered.length === 0 ? (
            <p className="muted">Aucun résultat.</p>
          ) : (
            <div className="members-table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>{sortLabel('lastName', 'Nom')}</th>
                    <th>{sortLabel('firstName', 'Prénom')}</th>
                    <th>{sortLabel('email', 'E-mail')}</th>
                    <th>Vérifié</th>
                    <th>Membre lié</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      className="members-table__row--clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => setDrawerContactId(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDrawerContactId(c.id);
                        }
                      }}
                    >
                      <td>{c.lastName}</td>
                      <td>{c.firstName}</td>
                      <td>{c.email}</td>
                      <td>{c.emailVerified ? 'Oui' : 'Non'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {c.linkedMemberId ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight"
                            onClick={() => openLinkedMember(c)}
                          >
                            Ouvrir la fiche membre
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ContactDetailDrawer
        contactId={drawerContactId}
        onClose={() => setDrawerContactId(null)}
        onChanged={() => void refetch()}
      />
    </>
  );
}
