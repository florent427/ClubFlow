import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseUsers } from '../lib/auth.js';
import { createHandler } from '../lib/app.js';
import { openDb } from '../lib/db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('budgetperso API', () => {
  let server;
  let baseUrl;
  let origin;
  const sent = [];

  before(async () => {
    server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    baseUrl = `${origin}/budgetperso`;
    server.on(
      'request',
      createHandler({
        db: openDb(':memory:'),
        users: parseUsers('florent@example.com:Florent,nelly@example.com:Nelly'),
        mailer: { sendLoginLink: async (to, link) => sent.push({ to, link }) },
        publicUrl: baseUrl,
        publicDir: join(root, 'public'),
        trustProxy: false,
      }),
    );
  });

  after(() => server.close());

  const post = (path, body, headers = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
      body: JSON.stringify(body),
    });

  async function login(email) {
    sent.length = 0;
    await post('/api/auth/request', { email });
    const token = new URL(sent[0].link).searchParams.get('token');
    const res = await post('/api/auth/verify', { token });
    assert.equal(res.status, 200);
    return { cookie: res.headers.get('set-cookie').split(';')[0], token };
  }

  it('sends no link to an address outside the list, with the same answer', async () => {
    sent.length = 0;
    const res = await post('/api/auth/request', { email: 'intrus@example.com' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(sent.length, 0);
  });

  it('logs in with a single-use link and an HttpOnly cookie scoped to the app', async () => {
    sent.length = 0;
    await post('/api/auth/request', { email: '  Florent@Example.com ' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'florent@example.com');
    assert.ok(sent[0].link.startsWith(`${baseUrl}/?token=`));
    const token = new URL(sent[0].link).searchParams.get('token');

    const res = await post('/api/auth/verify', { token });
    assert.equal(res.status, 200);
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Path=\/budgetperso/);
    assert.equal((await res.json()).me.name, 'Florent');

    const reused = await post('/api/auth/verify', { token });
    assert.equal(reused.status, 401);
  });

  it('refuses the data without a session', async () => {
    assert.equal((await fetch(`${baseUrl}/api/state`)).status, 401);
    assert.equal((await post('/api/sync', { ops: [] })).status, 401);
  });

  it('refuses a write coming from another site', async () => {
    const { cookie } = await login('nelly@example.com');
    const res = await post('/api/sync', { ops: [] }, { Cookie: cookie, Origin: 'https://evil.test' });
    assert.equal(res.status, 403);
  });

  it('seeds the validated budget: 7 096 € with the 10 % margin on estimated lines', async () => {
    const { cookie } = await login('florent@example.com');
    const state = await (await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } })).json();
    assert.equal(state.days.length, 21);
    assert.equal(state.settings.margin, 0.1);
    const { summarize } = await import('../public/model.js');
    const { totals } = summarize(state);
    assert.ok(Math.abs(totals.planned - 668_800) <= 100, `prévu ${totals.planned}`);
    assert.ok(Math.abs(totals.budget - 709_600) <= 100, `budget ${totals.budget}`);
  });

  it('applies valid operations, rejects invalid ones without blocking the batch', async () => {
    const { cookie } = await login('nelly@example.com');
    const res = await post(
      '/api/sync',
      {
        ops: [
          {
            opId: 'op-1',
            type: 'expense.put',
            data: {
              id: 'exp-1',
              date: '2027-01-17',
              category: 'peages',
              label: 'Péage Lançon',
              amount: 1290,
              share: 4 / 6,
              paidBy: 'Nelly',
            },
          },
          {
            opId: 'op-2',
            type: 'expense.put',
            data: { id: 'exp-2', date: '2027-02-01', category: 'repas', amount: 100, share: 1 },
          },
        ],
      },
      { Cookie: cookie },
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.accepted, ['op-1']);
    assert.equal(body.rejected[0].opId, 'op-2');
    const expense = body.expenses.find((e) => e.id === 'exp-1');
    assert.equal(expense.amount, 1290);
    assert.equal(expense.paidBy, 'Nelly');
    assert.equal(body.expenses.some((e) => e.id === 'exp-2'), false);

    const deleted = await post(
      '/api/sync',
      { ops: [{ opId: 'op-3', type: 'expense.delete', data: { id: 'exp-1' } }] },
      { Cookie: cookie },
    );
    assert.equal((await deleted.json()).expenses.length, 0);
  });

  it('keeps a planned line edited in the app', async () => {
    const { cookie } = await login('florent@example.com');
    const state = await (await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } })).json();
    const line = state.plans.find((p) => p.category === 'shopping');
    const res = await post(
      '/api/sync',
      { ops: [{ opId: 'op-4', type: 'plan.put', data: { ...line, amount: 80_000 } }] },
      { Cookie: cookie },
    );
    const body = await res.json();
    const updated = body.plans.find((p) => p.id === line.id);
    assert.equal(updated.amount, 80_000);
    assert.equal(updated.estimated, false);
    assert.equal(body.plans.length, state.plans.length);
  });

  it('serves the app shell and redirects the bare path', async () => {
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.equal(home.headers.get('referrer-policy'), 'no-referrer');
    const bare = await fetch(baseUrl, { redirect: 'manual' });
    assert.equal(bare.status, 301);
    assert.equal((await fetch(`${baseUrl}/../server.js`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/lib/db.js`)).status, 404);
  });
});
