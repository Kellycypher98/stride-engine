'use strict';

/*
 * The web UI's data flow diagram layout (ui/src/layout.js) is a pure function,
 * so it is tested here without a browser.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validateArchitecture } = require('../src/schema/architecture');

const load = (name) => validateArchitecture(require(path.join(__dirname, '..', 'examples', `${name}.json`)));
const layoutModule = () => import('../ui/src/layout.js');

test('ui layout: zones are columns ordered by trust level; every component and flow is placed', async () => {
  const { layoutDfd } = await layoutModule();
  for (const name of ['ecommerce', 'healthcare', 'payroll-saas']) {
    const arch = load(name);
    const l = layoutDfd(arch);
    assert.equal(l.nodes.length, arch.components.length, name);
    assert.equal(l.flows.length, arch.dataFlows.length, name);
    const levels = l.zones.map((z) => z.level);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b), `${name}: internet on the left`);
    for (const n of l.nodes) {
      const zone = l.zones.findIndex((z) => z.id === n.component.trustBoundary);
      assert.equal(n.col, zone, `${name}: ${n.id} sits in its own trust zone`);
      assert.ok(n.x >= 0 && n.x + n.w <= l.width && n.y >= 0 && n.y + n.h <= l.height, `${name}: ${n.id} inside canvas`);
    }
    for (const f of l.flows) assert.match(f.d, /^M[\d.-]+,[\d.-]+C/, `${name}: ${f.id} is a cubic path`);
  }
});

test('ui layout: nodes in a column never overlap, and layout is deterministic', async () => {
  const { layoutDfd } = await layoutModule();
  const arch = load('healthcare');
  const a = layoutDfd(arch);
  const byCol = new Map();
  for (const n of a.nodes) byCol.set(n.col, [...(byCol.get(n.col) || []), n]);
  for (const col of byCol.values()) {
    col.sort((p, q) => p.y - q.y);
    for (let i = 1; i < col.length; i += 1) assert.ok(col[i].y >= col[i - 1].y + col[i - 1].h, 'no overlap');
  }
  const b = layoutDfd(arch);
  assert.deepEqual(b.nodes.map((n) => [n.id, n.x, n.y]), a.nodes.map((n) => [n.id, n.x, n.y]));
  assert.deepEqual(b.flows.map((f) => f.d), a.flows.map((f) => f.d));
});

test('ui layout: long names wrap to two lines and are truncated after that', async () => {
  const { wrap } = await layoutModule();
  assert.deepEqual(wrap('API Gateway', 20), ['API Gateway']);
  assert.deepEqual(wrap('FHIR Response Cache (ElastiCache Redis)', 20), ['FHIR Response Cache', '(ElastiCache Redis)']);
  const [, second] = wrap('Reminder Notification Service (Lambda) with a very long suffix', 20);
  assert.ok(second.length <= 20 && second.endsWith('…'));
});
