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
