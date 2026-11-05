import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { validateOp } from '../public/model.js';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  consumeLoginToken,
  createLoginToken,
  createRateLimiter,
  createSession,
  deleteSession,
  normalizeEmail,
  readCookie,
  sessionEmail,
} from './auth.js';
import { applyOps, dayDates, readState } from './db.js';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; " +
    "connect-src 'self'; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  // The login link carries its token in the query string: never leak it.
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

const MAX_BODY_BYTES = 256 * 1024;
const MAX_OPS = 500;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function loadStatic(dir) {
  const files = new Map();
  for (const name of readdirSync(dir)) {
    const type = CONTENT_TYPES[extname(name)];
    if (type) files.set(name, { body: readFileSync(join(dir, name)), type });
  }
  return files;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function sendJson(res, status, value, headers = {}) {
  send(res, status, JSON.stringify(value), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

async function readJson(req) {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
    throw new HttpError(415, 'JSON attendu');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Requête trop grosse');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'JSON invalide');
  }
}

export function createHandler({ db, users, mailer, publicUrl, publicDir, trustProxy }) {
  const base = new URL(publicUrl);
  const basePath = base.pathname.replace(/\/$/, '');
  const secureCookie = base.protocol === 'https:';
  const files = loadStatic(publicDir);
  const loginPerIp = createRateLimiter(10, 60 * 60 * 1000);
  const loginPerEmail = createRateLimiter(5, 60 * 60 * 1000);
  const verifyPerIp = createRateLimiter(20, 60 * 60 * 1000);

  // Behind Caddy the real client is the last X-Forwarded-For entry (the one Caddy added).
  const clientIp = (req) => {
    const forwarded = trustProxy ? req.headers['x-forwarded-for'] : undefined;
    return forwarded ? forwarded.split(',').at(-1).trim() : req.socket.remoteAddress;
  };

  const cookie = (value, maxAgeSeconds) =>
    `${SESSION_COOKIE}=${value}; Path=${basePath}; HttpOnly; SameSite=Lax; ` +
    `Max-Age=${maxAgeSeconds}${secureCookie ? '; Secure' : ''}`;

  const currentUser = (req) => {
    const email = sessionEmail(db, readCookie(req.headers.cookie, SESSION_COOKIE));
    // Removing someone from BUDGET_USERS revokes their open sessions too.
    return email && users.has(email) ? { email, name: users.get(email) } : null;
  };

  const requireUser = (req) => {
    const user = currentUser(req);
    if (!user) throw new HttpError(401, 'Connexion nécessaire');
    return user;
  };

  const state = (user) => ({ ...readState(db), me: user, users: [...users.values()] });

  const checkOrigin = (req) => {
    const origin = req.headers.origin;
    if (origin && origin !== base.origin) throw new HttpError(403, 'Origine refusée');
  };

  const routes = {
    'POST /api/auth/request': async (req, res) => {
      const { email: raw } = await readJson(req);
      const email = normalizeEmail(raw);
      if (!loginPerIp(clientIp(req)) || !loginPerEmail(email)) {
        throw new HttpError(429, 'Trop de demandes, réessayez dans une heure');
      }
      // Same answer whether or not the address is allowed: no list to probe.
      if (users.has(email)) {
        const token = createLoginToken(db, email);
        await mailer.sendLoginLink(email, `${base.origin}${basePath}/?token=${token}`);
      }
      sendJson(res, 200, { ok: true });
    },
    'POST /api/auth/verify': async (req, res) => {
      if (!verifyPerIp(clientIp(req))) throw new HttpError(429, 'Trop de tentatives');
      const { token } = await readJson(req);
      const email = consumeLoginToken(db, token);
      if (!email || !users.has(email)) throw new HttpError(401, 'Lien expiré ou déjà utilisé');
      const session = createSession(db, email);
      const user = { email, name: users.get(email) };
      sendJson(res, 200, state(user), {
        'Set-Cookie': cookie(session, Math.floor(SESSION_TTL_MS / 1000)),
      });
    },
    'POST /api/auth/logout': async (req, res) => {
      deleteSession(db, readCookie(req.headers.cookie, SESSION_COOKIE));
      sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
    },
    'GET /api/state': async (req, res) => {
      sendJson(res, 200, state(requireUser(req)));
    },
    'POST /api/sync': async (req, res) => {
      const user = requireUser(req);
      const { ops } = await readJson(req);
      if (!Array.isArray(ops) || ops.length > MAX_OPS) throw new HttpError(400, 'Opérations invalides');
      const dates = dayDates(db);
      const accepted = [];
      const rejected = [];
      for (const op of ops) {
        try {
          accepted.push(validateOp(op, dates));
        } catch (error) {
          rejected.push({ opId: typeof op?.opId === 'string' ? op.opId : null, error: error.message });
        }
      }
      applyOps(db, accepted, user.email);
      sendJson(res, 200, {
        ...state(user),
        accepted: accepted.map((op) => op.opId),
        rejected,
      });
    },
  };

  return async (req, res) => {
    try {
      const url = new URL(req.url, base.origin);
      if (url.pathname === basePath) {
        return send(res, 301, '', { Location: `${basePath}/` });
      }
      if (!url.pathname.startsWith(`${basePath}/`)) throw new HttpError(404, 'Introuvable');
      const path = url.pathname.slice(basePath.length);

      const route = routes[`${req.method} ${path}`];
      if (route) {
        if (req.method !== 'GET') checkOrigin(req);
        return await route(req, res);
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        const file = files.get(path === '/' ? 'index.html' : path.slice(1));
        if (file) {
          return send(res, 200, req.method === 'HEAD' ? '' : file.body, {
            'Content-Type': file.type,
            // The service worker keeps the offline copy; the network copy is always revalidated.
            'Cache-Control': 'no-cache, private',
          });
        }
      }
      throw new HttpError(404, 'Introuvable');
    } catch (error) {
      if (!(error instanceof HttpError)) console.error(error);
      const status = error instanceof HttpError ? error.status : 500;
      sendJson(res, status, { error: status === 500 ? 'Erreur serveur' : error.message });
    }
  };
}
