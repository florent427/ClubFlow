import Database from 'better-sqlite3';
import { DAYS, SEED_MARGIN, seedPlans } from './seed-data.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS days (
  date TEXT PRIMARY KEY,
  place TEXT NOT NULL,
  title TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  amount INTEGER NOT NULL,
  share REAL NOT NULL,
  estimated INTEGER NOT NULL,
  position INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  amount INTEGER NOT NULL,
  share REAL NOT NULL,
  paid_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_tokens (
  hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
`;

export function openDb(path) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

// Days always follow the code; plan lines and settings are only seeded once,
// so later edits made in the app are never overwritten by a restart.
function seed(db) {
  const putDay = db.prepare(
    'INSERT INTO days (date, place, title) VALUES (@date, @place, @title) ' +
      'ON CONFLICT(date) DO UPDATE SET place = excluded.place, title = excluded.title',
  );
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const day of DAYS) putDay.run(day);
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('margin', ?)").run(
      String(SEED_MARGIN),
    );
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM plans').get();
    if (count === 0) {
      seedPlans().forEach((plan, position) =>
        putPlan(db, { ...plan, position }, 'seed', now),
      );
    }
  })();
}

function putPlan(db, plan, email, now) {
  db.prepare(
    `INSERT INTO plans (id, date, category, label, amount, share, estimated, position, updated_at, updated_by)
     VALUES (@id, @date, @category, @label, @amount, @share, @estimated, @position, @now, @email)
     ON CONFLICT(id) DO UPDATE SET date = excluded.date, category = excluded.category,
       label = excluded.label, amount = excluded.amount, share = excluded.share,
       estimated = excluded.estimated, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run({
    ...plan,
    estimated: plan.estimated ? 1 : 0,
    position:
      plan.position ??
      db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM plans').get().next,
    now,
    email,
  });
}

function putExpense(db, expense, email, now) {
  db.prepare(
    `INSERT INTO expenses (id, date, category, label, amount, share, paid_by, created_at, updated_at, updated_by)
     VALUES (@id, @date, @category, @label, @amount, @share, @paidBy, @now, @now, @email)
     ON CONFLICT(id) DO UPDATE SET date = excluded.date, category = excluded.category,
       label = excluded.label, amount = excluded.amount, share = excluded.share,
       paid_by = excluded.paid_by, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run({ ...expense, now, email });
}

export function dayDates(db) {
  return new Set(db.prepare('SELECT date FROM days').pluck().all());
}

// Ops are already validated; they are applied in one transaction, in order.
export function applyOps(db, ops, email) {
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const op of ops) {
      switch (op.type) {
        case 'expense.put':
          putExpense(db, op.data, email, now);
          break;
        case 'expense.delete':
          db.prepare('DELETE FROM expenses WHERE id = ?').run(op.data.id);
          break;
        case 'plan.put':
          putPlan(db, op.data, email, now);
          break;
        case 'plan.delete':
          db.prepare('DELETE FROM plans WHERE id = ?').run(op.data.id);
          break;
        case 'settings.put':
          db.prepare(
            "INSERT INTO settings (key, value) VALUES ('margin', ?) " +
              'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          ).run(String(op.data.margin));
          break;
      }
    }
  })();
}

export function readState(db) {
  const settings = Object.fromEntries(
    db.prepare('SELECT key, value FROM settings').all().map((row) => [row.key, Number(row.value)]),
  );
  return {
    days: db.prepare('SELECT date, place, title FROM days ORDER BY date').all(),
    plans: db
      .prepare(
        'SELECT id, date, category, label, amount, share, estimated FROM plans ORDER BY date, position',
      )
      .all()
      .map((row) => ({ ...row, estimated: row.estimated === 1 })),
    expenses: db
      .prepare(
        `SELECT id, date, category, label, amount, share, paid_by AS paidBy,
                created_at AS createdAt, updated_by AS updatedBy
         FROM expenses ORDER BY date, created_at`,
      )
      .all(),
    settings,
  };
}
