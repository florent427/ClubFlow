import { createHash, randomBytes } from 'node:crypto';

export const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = 'bp_session';

const hash = (token) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// BUDGET_USERS="florent@example.com:Florent,nelly@example.com:Nelly"
export function parseUsers(value = '') {
  const users = new Map();
  for (const entry of value.split(',')) {
    const [email, name] = entry.split(':').map((part) => part.trim());
    if (email) users.set(normalizeEmail(email), name || email);
  }
  return users;
}

export function createLoginToken(db, email, now = Date.now()) {
  const token = newToken();
  db.prepare('DELETE FROM login_tokens WHERE expires_at < ?').run(now);
  db.prepare('INSERT INTO login_tokens (hash, email, expires_at) VALUES (?, ?, ?)').run(
    hash(token),
    email,
    now + LOGIN_TOKEN_TTL_MS,
  );
  return token;
}

// Single use: the token is burnt even if the session is never used.
export function consumeLoginToken(db, token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 100) return null;
  const row = db
    .prepare('SELECT email, expires_at, used FROM login_tokens WHERE hash = ?')
    .get(hash(token));
  if (!row || row.used || row.expires_at < now) return null;
  db.prepare('UPDATE login_tokens SET used = 1 WHERE hash = ?').run(hash(token));
  return row.email;
}

export function createSession(db, email, now = Date.now()) {
  const token = newToken();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('INSERT INTO sessions (hash, email, expires_at) VALUES (?, ?, ?)').run(
    hash(token),
    email,
    now + SESSION_TTL_MS,
  );
  return token;
}

export function sessionEmail(db, token, now = Date.now()) {
  if (!token) return null;
  const row = db.prepare('SELECT email, expires_at FROM sessions WHERE hash = ?').get(hash(token));
  return row && row.expires_at >= now ? row.email : null;
}

export function deleteSession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE hash = ?').run(hash(token));
}

export function readCookie(header, name) {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

// Fixed window counter, in memory: enough for two users behind one Caddy.
export function createRateLimiter(limit, windowMs) {
  const hits = new Map();
  return (key, now = Date.now()) => {
    // Bots probing the public URL must not grow the map forever.
    if (hits.size > 10_000) {
      for (const [k, e] of hits) if (e.resetAt <= now) hits.delete(k);
    }
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
