import {
  CATEGORIES,
  VEHICLE_SHARE,
  applyOp,
  categoryLabel,
  defaultShare,
  ourPart,
  summarize,
  validateOp,
} from './model.js';

// Everything is kept in localStorage so the app works without network
// (Andorra has no EU roaming); edits wait in a queue until the next sync.
const STATE_KEY = 'bp_state';
const QUEUE_KEY = 'bp_queue';
const SYNC_EVERY_MS = 30_000;

const SHARES = [
  { value: 1, label: '100 % (pour nous 4)' },
  { value: VEHICLE_SHARE, label: '4/6 (frais véhicule partagés)' },
  { value: 0.5, label: '50 %' },
];

const app = document.getElementById('app');
const toastBox = document.getElementById('toast');

let state = load(STATE_KEY);
let queue = load(QUEUE_KEY) ?? [];
const status = { online: navigator.onLine, syncing: false, needLogin: false, lastSync: null };
let loginSent = false;

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function persist() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    toast('Stockage du téléphone indisponible : la saisie hors ligne ne sera pas gardée.');
  }
}

// ---------- formatting ----------

const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmt = (cents) => money.format(cents / 100);
const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const fmtDay = (date) => dayFormat.format(new Date(`${date}T00:00:00Z`));

function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function parseEuros(text) {
  const clean = String(text).replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return NaN;
  return Math.round(Number(clean) * 100);
}

const centsToInput = (cents) => (cents / 100).toFixed(2).replace('.', ',');

function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toast(message) {
  toastBox.textContent = message;
  toastBox.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (toastBox.hidden = true), 4000);
}

// ---------- server ----------

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw Object.assign(new Error(data.error), { auth: true });
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erreur serveur'), { server: true });
  return data;
}

function adoptServerState(data) {
  const { accepted, rejected, ...serverState } = data;
  const sent = new Set(accepted ?? []);
  for (const r of rejected ?? []) sent.add(r.opId);
  queue = queue.filter((op) => !sent.has(op.opId));
  // Edits made while the request was in flight are replayed on top.
  state = queue.reduce(applyOp, serverState);
  persist();
  if (rejected?.length) toast(`Saisie refusée par le serveur : ${rejected[0].error}`);
}

async function sync() {
  if (status.syncing) return;
  status.syncing = true;
  renderStatus();
  try {
    const batch = queue.slice();
    const data = batch.length ? await api('api/sync', { ops: batch }) : await api('api/state');
    adoptServerState(data);
    status.online = true;
    status.needLogin = false;
    status.lastSync = new Date();
  } catch (error) {
    if (error.auth) status.needLogin = true;
    else if (error.server) toast(error.message);
    else status.online = false;
  } finally {
    status.syncing = false;
    render();
  }
}

function commit(type, data) {
  const dates = new Set(state.days.map((d) => d.date));
  const op = validateOp({ opId: uid(), type, data }, dates);
  state = applyOp(state, op);
  queue.push(op);
  persist();
  sync();
}

// ---------- views ----------

function bar(spent, budget) {
  const ratio = budget > 0 ? Math.min(spent / budget, 1) : spent > 0 ? 1 : 0;
  const over = spent > budget;
  // Width is applied in render(): the CSP forbids inline style attributes.
  return `<div class="bar${over ? ' over' : ''}"><span data-width="${(ratio * 100).toFixed(1)}"></span></div>`;
}

function statusLine() {
  if (status.syncing) return '<span class="badge">Synchronisation…</span>';
  if (status.needLogin) return '<span class="badge warn">Session expirée</span>';
  if (!status.online) {
    return `<span class="badge warn">Hors ligne${queue.length ? ` · ${queue.length} en attente` : ''}</span>`;
  }
  if (queue.length) return `<span class="badge warn">${queue.length} en attente</span>`;
  return '<span class="badge ok">À jour</span>';
}

function renderStatus() {
  const slot = document.getElementById('status');
  if (slot) slot.innerHTML = statusLine();
}

function header(title, back) {
  return `
    <header class="top">
      ${back ? `<a class="back" href="${back}" aria-label="Retour">←</a>` : '<span></span>'}
      <h1>${esc(title)}</h1>
      <a class="icon" href="#/reglages" aria-label="Réglages">⚙</a>
    </header>
    <div class="status-row"><span id="status">${statusLine()}</span>${
      status.needLogin ? '<a href="#/connexion">Se reconnecter</a>' : ''
    }</div>`;
}

function viewLogin() {
  return `
    <section class="login">
      <h1>Budget vacances</h1>
      <p>Janvier 2027 · Paris, Brizon, Espagne</p>
      ${
        loginSent
          ? '<p class="notice">Si cette adresse est autorisée, un lien de connexion vient de partir. Ouvrez-le sur ce téléphone.</p>'
          : ''
      }
      <form data-form="login" class="card">
        <label>Adresse e-mail
          <input name="email" type="email" autocomplete="email" required inputmode="email" />
        </label>
        <button type="submit">Recevoir un lien de connexion</button>
      </form>
      ${state ? '<p><a href="#/">Revenir au budget (hors ligne)</a></p>' : ''}
    </section>`;
}

function viewOverview() {
  const summary = summarize(state);
  const { totals } = summary;
  const today = localToday();
  const todayDay = state.days.find((d) => d.date === today);
  const marginPct = Math.round((state.settings.margin ?? 0) * 100);
  return `
    ${header('Budget vacances')}
    <section class="card totals">
      <div class="big">
        <div><small>Budget</small><strong>${fmt(totals.budget)}</strong></div>
        <div><small>Dépensé</small><strong>${fmt(totals.spent)}</strong></div>
        <div><small>Reste</small><strong class="${totals.remaining < 0 ? 'neg' : ''}">${fmt(totals.remaining)}</strong></div>
      </div>
      ${bar(totals.spent, totals.budget)}
      <p class="muted">Prévu ${fmt(totals.planned)} + marge ${marginPct} % sur les postes estimés (${fmt(totals.margin)})</p>
    </section>
    ${todayDay ? `<a class="card today" href="#/jour/${today}">Aujourd’hui · ${esc(todayDay.place)} →</a>` : ''}
    <section class="card">
      <h2>Par poste</h2>
      <table class="cats">
        <thead><tr><th></th><th>Prévu</th><th>Dépensé</th></tr></thead>
        <tbody>
          ${summary.categories
            .filter((c) => c.planned || c.spent)
            .map(
              (c) => `<tr><td>${esc(c.label)}</td><td>${fmt(c.planned)}</td>
                <td class="${c.spent > c.planned ? 'neg' : ''}">${fmt(c.spent)}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </section>
    <section>
      <h2 class="section-title">Jour par jour</h2>
      <ul class="days">
        ${summary.days
          .map(
            (d) => `
          <li><a href="#/jour/${d.date}" class="${d.date === today ? 'is-today' : ''}">
            <div class="day-head"><span>${fmtDay(d.date)} · <b>${esc(d.place)}</b></span>
              <span>${fmt(d.spent)} / ${fmt(d.budget)}</span></div>
            <div class="muted">${esc(d.title)}</div>
            ${bar(d.spent, d.budget)}
          </a></li>`,
          )
          .join('')}
      </ul>
    </section>
    <a class="fab" href="#/depense/new">+ Dépense</a>`;
}

function shareNote(item) {
  return item.share < 1 ? `<small class="muted"> (${fmt(item.amount)} × ${shareLabel(item.share)})</small>` : '';
}

function shareLabel(share) {
  if (Math.abs(share - VEHICLE_SHARE) < 1e-9) return '4/6';
  return `${Math.round(share * 100)} %`;
}

function viewDay(date) {
  const summary = summarize(state);
  const index = summary.days.findIndex((d) => d.date === date);
  const day = summary.days[index];
  if (!day) return viewOverview();
  const prev = summary.days[index - 1];
  const next = summary.days[index + 1];
  const plans = state.plans.filter((p) => p.date === date);
  const expenses = state.expenses.filter((e) => e.date === date);
  return `
    ${header(fmtDay(date), '#/')}
    <section class="card">
      <h2>${esc(day.place)}</h2>
      <p class="muted">${esc(day.title)}</p>
      <div class="big">
        <div><small>Budget</small><strong>${fmt(day.budget)}</strong></div>
        <div><small>Dépensé</small><strong>${fmt(day.spent)}</strong></div>
        <div><small>Reste</small><strong class="${day.spent > day.budget ? 'neg' : ''}">${fmt(day.budget - day.spent)}</strong></div>
      </div>
      ${bar(day.spent, day.budget)}
      ${day.margin ? `<p class="muted">dont marge ${fmt(day.margin)}</p>` : ''}
    </section>
    <section class="card">
      <h2>Dépenses</h2>
      ${
        expenses.length
          ? `<ul class="lines">${expenses
              .map(
                (e) => `<li><a href="#/depense/${esc(e.id)}">
                  <span>${esc(e.label || categoryLabel(e.category))}
                    <small class="muted">${esc(categoryLabel(e.category))}${e.paidBy ? ` · ${esc(e.paidBy)}` : ''}</small></span>
                  <span>${fmt(ourPart(e))}${shareNote(e)}</span></a></li>`,
              )
              .join('')}</ul>`
          : '<p class="muted">Aucune dépense saisie.</p>'
      }
      <a class="button" href="#/depense/new?date=${date}">+ Dépense</a>
    </section>
    <section class="card">
      <h2>Prévu</h2>
      <ul class="lines">${plans
        .map(
          (p) => `<li><a href="#/prevu/${esc(p.id)}">
            <span>${esc(p.label)}<small class="muted">${esc(categoryLabel(p.category))}${
              p.estimated ? '' : ' · enveloppe fixe'
            }</small></span>
            <span>${fmt(ourPart(p))}${shareNote(p)}</span></a></li>`,
        )
        .join('')}</ul>
      <a class="button secondary" href="#/prevu/new?date=${date}">+ Ligne prévue</a>
    </section>
    <nav class="pager">
      ${prev ? `<a href="#/jour/${prev.date}">← ${fmtDay(prev.date)}</a>` : '<span></span>'}
      ${next ? `<a href="#/jour/${next.date}">${fmtDay(next.date)} →</a>` : '<span></span>'}
    </nav>`;
}

function dayOptions(selected) {
  return state.days
    .map(
      (d) => `<option value="${d.date}"${d.date === selected ? ' selected' : ''}>${fmtDay(d.date)} · ${esc(d.place)}</option>`,
    )
    .join('');
}

function categoryOptions(selected) {
  return CATEGORIES.map(
    (c) => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.label)}</option>`,
  ).join('');
}

function shareOptions(selected) {
  const options = SHARES.some((s) => Math.abs(s.value - selected) < 1e-9)
    ? SHARES
    : [...SHARES, { value: selected, label: shareLabel(selected) }];
  return options
    .map(
      (s) => `<option value="${s.value}"${Math.abs(s.value - selected) < 1e-9 ? ' selected' : ''}>${esc(s.label)}</option>`,
    )
    .join('');
}

function defaultDate(requested) {
  const dates = state.days.map((d) => d.date);
  if (dates.includes(requested)) return requested;
  const today = localToday();
  return dates.includes(today) ? today : dates[0];
}

function viewExpenseForm(id, params) {
  const existing = id === 'new' ? null : state.expenses.find((e) => e.id === id);
  if (id !== 'new' && !existing) return viewOverview();
  const category = existing?.category ?? 'repas';
  const item = existing ?? {
    date: defaultDate(params.get('date')),
    category,
    label: '',
    amount: 0,
    share: defaultShare(category),
    paidBy: state.me?.name ?? '',
  };
  const back = `#/jour/${item.date}`;
  return `
    ${header(existing ? 'Modifier la dépense' : 'Nouvelle dépense', back)}
    <form class="card" data-form="expense" data-id="${esc(existing?.id ?? '')}">
      <label>Montant payé (€)
        <input name="amount" inputmode="decimal" autocomplete="off" required
          value="${existing ? centsToInput(item.amount) : ''}" placeholder="0,00" ${existing ? '' : 'autofocus'} />
      </label>
      <label>Poste <select name="category">${categoryOptions(item.category)}</select></label>
      <label>Part à notre charge <select name="share">${shareOptions(item.share)}</select></label>
      <p class="muted" data-part></p>
      <label>Jour <select name="date">${dayOptions(item.date)}</select></label>
      <label>Libellé <input name="label" maxlength="120" value="${esc(item.label)}" placeholder="ex. Restaurant le midi" /></label>
      <label>Payé par
        <select name="paidBy">${state.users
          .map((u) => `<option${u === item.paidBy ? ' selected' : ''}>${esc(u)}</option>`)
          .join('')}</select>
      </label>
      <p class="error" data-error hidden></p>
      <button type="submit">Enregistrer</button>
      ${existing ? '<button type="button" class="danger" data-action="delete-expense">Supprimer</button>' : ''}
    </form>`;
}

function viewPlanForm(id, params) {
  const existing = id === 'new' ? null : state.plans.find((p) => p.id === id);
  if (id !== 'new' && !existing) return viewOverview();
  const item = existing ?? {
    date: defaultDate(params.get('date')),
    category: 'activites',
    label: '',
    amount: 0,
    share: 1,
    estimated: true,
  };
  return `
    ${header(existing ? 'Modifier le prévu' : 'Nouvelle ligne prévue', `#/jour/${item.date}`)}
    <form class="card" data-form="plan" data-id="${esc(existing?.id ?? '')}">
      <label>Libellé <input name="label" maxlength="120" required value="${esc(item.label)}" /></label>
      <label>Montant total prévu (€)
        <input name="amount" inputmode="decimal" autocomplete="off" required
          value="${existing ? centsToInput(item.amount) : ''}" placeholder="0,00" />
      </label>
      <label>Poste <select name="category">${categoryOptions(item.category)}</select></label>
      <label>Part à notre charge <select name="share">${shareOptions(item.share)}</select></label>
      <p class="muted" data-part></p>
      <label>Jour <select name="date">${dayOptions(item.date)}</select></label>
      <label class="check"><input type="checkbox" name="fixed"${item.estimated ? '' : ' checked'} />
        Enveloppe fixe (pas de marge)</label>
      <p class="error" data-error hidden></p>
      <button type="submit">Enregistrer</button>
      ${existing ? '<button type="button" class="danger" data-action="delete-plan">Supprimer</button>' : ''}
    </form>`;
}

function viewSettings() {
  const marginPct = Math.round((state.settings.margin ?? 0) * 100);
  return `
    ${header('Réglages', '#/')}
    <form class="card" data-form="settings">
      <label>Marge sur les postes estimés (%)
        <input name="margin" inputmode="numeric" value="${marginPct}" required />
      </label>
      <p class="error" data-error hidden></p>
      <button type="submit">Enregistrer</button>
    </form>
    <section class="card">
      <p>Connecté : <b>${esc(state.me?.name ?? '?')}</b> (${esc(state.me?.email ?? '')})</p>
      <p class="muted">${queue.length} saisie(s) en attente d’envoi.${
        status.lastSync ? ` Dernière synchro : ${status.lastSync.toLocaleTimeString('fr-FR')}.` : ''
      }</p>
      <button type="button" class="secondary" data-action="sync">Synchroniser maintenant</button>
      <button type="button" class="danger" data-action="logout">Se déconnecter</button>
    </section>`;
}

function route() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

function render() {
  const { parts, params } = route();
  if (!state || parts[0] === 'connexion') {
    app.innerHTML = viewLogin();
    return;
  }
  const [page, id] = parts;
  if (page === 'jour') app.innerHTML = viewDay(id);
  else if (page === 'depense') app.innerHTML = viewExpenseForm(id, params);
  else if (page === 'prevu') app.innerHTML = viewPlanForm(id, params);
  else if (page === 'reglages') app.innerHTML = viewSettings();
  else app.innerHTML = viewOverview();
  for (const el of app.querySelectorAll('[data-width]')) el.style.width = `${el.dataset.width}%`;
  updatePart();
  app.querySelector('[autofocus]')?.focus();
}

// ---------- forms ----------

function showError(form, message) {
  const box = form.querySelector('[data-error]');
  box.textContent = message;
  box.hidden = false;
}

function updatePart() {
  const form = app.querySelector('form[data-form="expense"], form[data-form="plan"]');
  const slot = form?.querySelector('[data-part]');
  if (!slot) return;
  const amount = parseEuros(form.amount.value);
  const share = Number(form.share.value);
  slot.textContent =
    Number.isNaN(amount) || share === 1 ? '' : `Notre part : ${fmt(Math.round(amount * share))}`;
}

const handlers = {
  async login(form) {
    const email = form.email.value;
    try {
      await api('api/auth/request', { email });
      loginSent = true;
      render();
    } catch (error) {
      showError(form, error.auth ? 'Refusé' : error.message || 'Pas de réseau : réessayez plus tard.');
    }
  },
  expense(form) {
    const amount = parseEuros(form.amount.value);
    if (Number.isNaN(amount)) return showError(form, 'Montant invalide (ex. 12,50)');
    const id = form.dataset.id || uid();
    commit('expense.put', {
      id,
      date: form.date.value,
      category: form.category.value,
      label: form.label.value,
      amount,
      share: Number(form.share.value),
      paidBy: form.paidBy.value,
    });
    toast('Dépense enregistrée');
    location.hash = `#/jour/${form.date.value}`;
  },
  plan(form) {
    const amount = parseEuros(form.amount.value);
    if (Number.isNaN(amount)) return showError(form, 'Montant invalide (ex. 12,50)');
    commit('plan.put', {
      id: form.dataset.id || uid(),
      date: form.date.value,
      category: form.category.value,
      label: form.label.value,
      amount,
      share: Number(form.share.value),
      estimated: !form.fixed.checked,
    });
    toast('Prévu mis à jour');
    location.hash = `#/jour/${form.date.value}`;
  },
  settings(form) {
    const pct = Number(form.margin.value.replace(',', '.'));
    if (!(pct >= 0 && pct <= 100)) return showError(form, 'Marge entre 0 et 100 %');
    commit('settings.put', { margin: pct / 100 });
    toast('Marge enregistrée');
    location.hash = '#/';
  },
};

const actions = {
  'delete-expense'(form) {
    if (!confirm('Supprimer cette dépense ?')) return;
    const date = form.date.value;
    commit('expense.delete', { id: form.dataset.id });
    location.hash = `#/jour/${date}`;
  },
  'delete-plan'(form) {
    if (!confirm('Supprimer cette ligne prévue ?')) return;
    const date = form.date.value;
    commit('plan.delete', { id: form.dataset.id });
    location.hash = `#/jour/${date}`;
  },
  sync() {
    sync();
  },
  async logout() {
    if (queue.length && !confirm(`${queue.length} saisie(s) pas encore envoyée(s) seront perdues. Continuer ?`)) {
      return;
    }
    try {
      await api('api/auth/logout', {});
    } catch {
      // Offline: the local copy is wiped anyway.
    }
    state = null;
    queue = [];
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(QUEUE_KEY);
    location.hash = '#/connexion';
    render();
  },
};

app.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  try {
    handlers[form.dataset.form](form);
  } catch (error) {
    showError(form, error.message);
  }
});

app.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  actions[button.dataset.action](button.closest('form'));
});

app.addEventListener('input', updatePart);
app.addEventListener('change', (event) => {
  // Picking a vehicle category switches the share to 4/6 (and back), the user can still override it.
  if (event.target.name === 'category') {
    event.target.form.share.innerHTML = shareOptions(defaultShare(event.target.value));
  }
  updatePart();
});

// ---------- start ----------

async function start() {
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  if (token) {
    // Drop the single-use token from the address bar and history at once.
    history.replaceState(null, '', location.pathname);
    try {
      adoptServerState(await api('api/auth/verify', { token }));
      status.needLogin = false;
      location.hash = '#/';
    } catch (error) {
      toast(error.message || 'Lien invalide');
    }
  }
  render();
  sync();
  setInterval(sync, SYNC_EVERY_MS);
  window.addEventListener('online', sync);
  window.addEventListener('offline', () => {
    status.online = false;
    renderStatus();
  });
  window.addEventListener('hashchange', render);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
