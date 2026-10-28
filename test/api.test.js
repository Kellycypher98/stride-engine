'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/api/server');
const { loadExample } = require('./helpers');

let server;
let base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (url, body, raw = false) => fetch(`${base}${url}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: raw ? body : JSON.stringify(body),
});

test('api: POST /analyze returns a report; GET /health and /rules respond', async () => {
  const res = await post('/analyze?scoring=weighted', loadExample());
  assert.equal(res.status, 200);
  const report = await res.json();
  assert.equal(report.summary.total, 16);
  assert.equal(report.scoring.method, 'weighted');

  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await (await fetch(`${base}/rules`)).json()).rules.length, 18);

  const md = await post('/analyze?format=md', loadExample());
  assert.match(md.headers.get('content-type'), /text\/markdown/);
});

test('api: security headers are set and stack/framework details are not exposed', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-powered-by'), null);
  const report = await (await post('/analyze', loadExample())).json();
  assert.equal(report.scoring.method, 'risk', 'API defaults to risk scoring');
});

test('api: /analyze is rate limited per client', async () => {
  const app = createApp({ rateLimit: { windowMs: 60_000, limit: 2 } });
  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  const url = `http://127.0.0.1:${srv.address().port}/analyze`;
  const send = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(loadExample()) });
  try {
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 200);
    const limited = await send();
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get('ratelimit') || limited.headers.get('ratelimit-policy'));
    assert.equal((await fetch(url.replace('/analyze', '/health'))).status, 200, 'health is not limited');
  } finally {
    srv.close();
  }
});

test('api: error handling — 422 invalid model, 400 malformed body / bad params, no stack leaks', async () => {
  const invalid = await post('/analyze', { name: 'x' });
  assert.equal(invalid.status, 422);
  assert.ok((await invalid.json()).details.length > 0);

  const malformed = await post('/analyze', '{"name":', true);
  assert.equal(malformed.status, 400);
  assert.doesNotMatch(await malformed.text(), /at .*\.js/);

  assert.equal((await post('/analyze?scoring=median', loadExample())).status, 400);
  assert.equal((await post('/analyze?format=pdf', loadExample())).status, 400);
});

test('web: UI is served with a same-origin CSP; API routes keep deny-all', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.match(await page.text(), /stride-engine/);
  assert.equal((await fetch(`${base}/app.js`)).status, 200);
  assert.equal((await fetch(`${base}/health`)).headers.get('content-security-policy'), "default-src 'none';frame-ancestors 'none'");
});

test('api: examples are listed and served; unknown names and traversal attempts are 404', async () => {
  const list = await (await fetch(`${base}/examples`)).json();
  assert.ok(list.some((e) => e.name === 'ecommerce'));
  const ex = await fetch(`${base}/examples/ecommerce`);
  assert.equal(ex.status, 200);
  assert.deepEqual(await ex.json(), loadExample());
  assert.equal((await fetch(`${base}/examples/nope`)).status, 404);
  assert.equal((await fetch(`${base}/examples/..%2Fpackage`)).status, 404);
});

test('api: YAML bodies are accepted and give the same report as JSON', async () => {
  const yaml = require('js-yaml');
  const asJson = await (await post('/analyze', loadExample())).json();
  const res = await fetch(`${base}/analyze`, { method: 'POST', headers: { 'content-type': 'application/yaml' }, body: yaml.dump(loadExample()) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), asJson);
  const bad = await fetch(`${base}/analyze`, { method: 'POST', headers: { 'content-type': 'application/yaml' }, body: 'a: [unclosed' });
  assert.equal(bad.status, 400);
  const tagged = await fetch(`${base}/analyze`, { method: 'POST', headers: { 'content-type': 'application/yaml' }, body: 'name: !!js/function "function(){}"' });
  assert.equal(tagged.status, 400, 'non-JSON YAML tags are rejected');
});
