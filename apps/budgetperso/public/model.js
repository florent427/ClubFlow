// Shared by the browser (offline edits) and the server (validation, tests).
// Amounts are integer cents; `share` is the fraction of a bill we pay.

export const CATEGORIES = [
  { id: 'repas', label: 'Repas', vehicle: false },
  { id: 'activites', label: 'Activités', vehicle: false },
  { id: 'shopping', label: 'Shopping', vehicle: false },
  { id: 'carburant', label: 'Carburant', vehicle: true },
  { id: 'peages', label: 'Péages', vehicle: true },
  { id: 'parking', label: 'Parking', vehicle: true },
  { id: 'transports', label: 'Transports en commun', vehicle: false },
  { id: 'divers', label: 'Divers', vehicle: false },
];

// Vehicle costs are split with the other family: we pay 4 shares out of 6.
export const VEHICLE_SHARE = 4 / 6;
export const MAX_AMOUNT_CENTS = 10_000_000;

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function defaultShare(categoryId) {
  return CATEGORIES.find((c) => c.id === categoryId)?.vehicle ? VEHICLE_SHARE : 1;
}

export function ourPart(item) {
  return Math.round(item.amount * item.share);
}

function fail(message) {
  throw new Error(message);
}

function cleanText(value, max, required) {
  if (value == null) value = '';
  if (typeof value !== 'string') fail('Texte invalide');
  const text = value.trim();
  if (required && !text) fail('Libellé obligatoire');
  if (text.length > max) fail(`Texte trop long (${max} caractères max.)`);
  return text;
}

function cleanId(value) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) fail('Identifiant invalide');
  return value;
}

function cleanItem(data, dayDates) {
  if (!data || typeof data !== 'object') fail('Données manquantes');
  if (!dayDates.has(data.date)) fail('Jour hors du séjour');
  if (!CATEGORY_IDS.has(data.category)) fail('Catégorie inconnue');
  if (!Number.isInteger(data.amount) || data.amount < 0 || data.amount > MAX_AMOUNT_CENTS) {
    fail('Montant invalide');
  }
  if (typeof data.share !== 'number' || !(data.share > 0 && data.share <= 1)) fail('Part invalide');
  return {
    id: cleanId(data.id),
    date: data.date,
    category: data.category,
    amount: data.amount,
    share: data.share,
  };
}

// Returns a normalised copy of the operation, or throws with a French message.
export function validateOp(op, dayDates) {
  if (!op || typeof op !== 'object') fail('Opération invalide');
  const opId = cleanId(op.opId);
  const data = op.data ?? {};
  switch (op.type) {
    case 'expense.put':
      return {
        opId,
        type: op.type,
        data: {
          ...cleanItem(data, dayDates),
          label: cleanText(data.label, 120, false),
          paidBy: cleanText(data.paidBy, 40, false) || null,
        },
      };
    case 'plan.put':
      return {
        opId,
        type: op.type,
        data: {
          ...cleanItem(data, dayDates),
          label: cleanText(data.label, 120, true),
          estimated: data.estimated !== false,
        },
      };
    case 'expense.delete':
    case 'plan.delete':
      return { opId, type: op.type, data: { id: cleanId(data.id) } };
    case 'settings.put': {
      const margin = data.margin;
      if (typeof margin !== 'number' || margin < 0 || margin > 1) fail('Marge invalide');
      return { opId, type: op.type, data: { margin } };
    }
    default:
      return fail('Type d’opération inconnu');
  }
}

// Applies a validated operation to an in-memory state (browser side).
export function applyOp(state, op) {
  const next = { ...state, plans: [...state.plans], expenses: [...state.expenses] };
  const list = op.type.startsWith('plan.') ? 'plans' : 'expenses';
  if (op.type.endsWith('.put')) {
    const index = next[list].findIndex((item) => item.id === op.data.id);
    if (index === -1) next[list].push(op.data);
    else next[list][index] = { ...next[list][index], ...op.data };
  } else if (op.type.endsWith('.delete')) {
    next[list] = next[list].filter((item) => item.id !== op.data.id);
  } else if (op.type === 'settings.put') {
    next.settings = { ...state.settings, ...op.data };
  }
  return next;
}

// Planned budget, margin (on estimated lines only) and spending, per day and per category.
export function summarize({ days, plans, expenses, settings }) {
  const margin = settings?.margin ?? 0;
  const byDay = new Map(
    days.map((d) => [d.date, { ...d, planned: 0, estimated: 0, margin: 0, budget: 0, spent: 0 }]),
  );
  const byCategory = new Map(CATEGORIES.map((c) => [c.id, { ...c, planned: 0, spent: 0 }]));

  for (const plan of plans) {
    const day = byDay.get(plan.date);
    const part = ourPart(plan);
    if (day) {
      day.planned += part;
      if (plan.estimated) day.estimated += part;
    }
    const category = byCategory.get(plan.category);
    if (category) category.planned += part;
  }
  for (const expense of expenses) {
    const part = ourPart(expense);
    const day = byDay.get(expense.date);
    if (day) day.spent += part;
    const category = byCategory.get(expense.category);
    if (category) category.spent += part;
  }

  const totals = { planned: 0, margin: 0, budget: 0, spent: 0 };
  for (const day of byDay.values()) {
    day.margin = Math.round(day.estimated * margin);
    day.budget = day.planned + day.margin;
    totals.planned += day.planned;
    totals.margin += day.margin;
    totals.budget += day.budget;
    totals.spent += day.spent;
  }
  totals.remaining = totals.budget - totals.spent;
  return { days: [...byDay.values()], categories: [...byCategory.values()], totals };
}
