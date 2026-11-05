import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUsers } from './lib/auth.js';
import { createHandler } from './lib/app.js';
import { openDb } from './lib/db.js';
import { createMailer } from './lib/mail.js';

const root = dirname(fileURLToPath(import.meta.url));
const env = process.env;

const publicUrl = env.PUBLIC_URL || 'http://localhost:5180/budgetperso';
const users = parseUsers(env.BUDGET_USERS);
if (users.size === 0) {
  console.error('BUDGET_USERS est vide : personne ne pourrait se connecter.');
  process.exit(1);
}
if (publicUrl.startsWith('https:') && !env.SMTP_HOST) {
  console.error('SMTP_HOST manquant : les liens de connexion ne partiraient pas.');
  process.exit(1);
}

const dbPath = env.DB_PATH || join(root, 'data', 'budget.db');
mkdirSync(dirname(dbPath), { recursive: true });

const handler = createHandler({
  db: openDb(dbPath),
  users,
  mailer: createMailer(env),
  publicUrl,
  publicDir: join(root, 'public'),
  trustProxy: env.TRUST_PROXY === 'true',
});

const port = Number(env.PORT || 5180);
const host = env.HOST || '127.0.0.1';
createServer(handler).listen(port, host, () => {
  console.log(`budgetperso sur http://${host}:${port} (public : ${publicUrl})`);
});
