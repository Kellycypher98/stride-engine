'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateArchitecture, ValidationError } = require('../src/schema/architecture');
const { loadExample, minimal } = require('./helpers');

test('schema: reference example validates', () => {
  assert.doesNotThrow(() => validateArchitecture(loadExample()));
});

test('schema: rejects unknown component type and missing fields, reporting all errors', () => {
  const arch = minimal({ components: [{ id: 'x', type: 'mainframe', trustBoundary: 'app' }] });
  assert.throws(() => validateArchitecture(arch), (e) => {
    assert.ok(e instanceof ValidationError);
    assert.ok(e.details.length >= 2, 'name and type errors both reported');
    return true;
  });
});

test('schema: referential integrity — unknown boundary, dangling flow, duplicate id, self-loop', () => {
  const arch = minimal({
    components: [
      { id: 'a', name: 'A', type: 'service', trustBoundary: 'app' },
      { id: 'a', name: 'A2', type: 'service', trustBoundary: 'app' },
      { id: 'b', name: 'B', type: 'service', trustBoundary: 'nowhere' },
    ],
    dataFlows: [
      { id: 'f1', from: 'a', to: 'ghost', protocol: 'https' },
      { id: 'f2', from: 'a', to: 'a', protocol: 'https' },
    ],
  });
  assert.throws(() => validateArchitecture(arch), (e) => {
    const msg = e.details.join('\n');
    assert.match(msg, /duplicate component id "a"/);
    assert.match(msg, /unknown trust boundary "nowhere"/);
    assert.match(msg, /unknown target "ghost"/);
    assert.match(msg, /self-loop/);
    return true;
  });
});

test('schema: encryption is derived from protocol when not declared, and input is not mutated', () => {
  const input = minimal({
    components: [
      { id: 'a', name: 'A', type: 'service', trustBoundary: 'app' },
      { id: 'b', name: 'B', type: 'database', trustBoundary: 'app' },
    ],
    dataFlows: [
      { id: 'f1', from: 'a', to: 'b', protocol: 'HTTPS' },
      { id: 'f2', from: 'a', to: 'b', protocol: 'tcp' },
    ],
  });
  const snapshot = JSON.stringify(input);
  const out = validateArchitecture(input);
  assert.equal(out.dataFlows[0].encrypted, true);
  assert.equal(out.dataFlows[1].encrypted, false);
  assert.equal(out.dataFlows[0].dataClassification, 'internal');
  assert.equal(JSON.stringify(input), snapshot);
});
