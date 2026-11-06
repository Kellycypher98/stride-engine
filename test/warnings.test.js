'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyse, loadRules } = require('../src/engine');
const { suggest } = require('../src/engine/warnings');
const { minimal, loadExample } = require('./helpers');

test('warnings: bundled examples produce none', () => {
  assert.deepEqual(analyse(loadExample()).warnings, []);
});

test('warnings: a misspelt control is flagged with a suggestion, and the finding it causes is still reported', () => {
  const arch = minimal({
    components: [
      { id: 'svc', name: 'Svc', type: 'service', trustBoundary: 'app', properties: { logging: true } },
      { id: 'db', name: 'DB', type: 'database', trustBoundary: 'app',
        properties: { dataClassification: 'restricted', encryptionAtRst: true, Logging: true, redundancy: true } },
    ],
    dataFlows: [{ id: 'f1', from: 'svc', to: 'db', protocol: 'tls', authenticated: true }],
  });
  const report = analyse(arch);
  const typos = report.warnings.filter((w) => w.code === 'unknown-property');
  assert.deepEqual(typos.map((w) => w.suggestion).sort(), ['encryptionAtRest', 'logging']);
  assert.match(typos.find((w) => w.suggestion === 'encryptionAtRest').message, /Did you mean "encryptionAtRest"/);
  assert.ok(report.findings.some((f) => f.id === 'I-01@db'), 'the typo still counts as a missing control');
});

test('warnings: app components with no controls, and components with no flows', () => {
  const arch = minimal({
    components: [
      { id: 'a', name: 'A', type: 'service', trustBoundary: 'app' },
      { id: 'b', name: 'B', type: 'service', trustBoundary: 'app', properties: { logging: true } },
      { id: 'lonely', name: 'L', type: 'database', trustBoundary: 'app' },
    ],
    dataFlows: [{ id: 'f1', from: 'a', to: 'b', protocol: 'https' }],
  });
  const got = analyse(arch).warnings.map((w) => `${w.code}@${w.target}`);
  assert.deepEqual(got, ['no-controls@a', 'isolated-component@lonely']);
});

test('warnings: properties read by a custom rule base are not flagged', () => {
  const rules = loadRules({
    version: 'custom',
    rules: [{
      id: 'I-90', category: 'Information Disclosure', title: 'PII in logs', description: 'x', appliesTo: 'component',
      when: { fact: 'component.properties.logsPii', op: 'eq', value: true },
      dread: { damage: 5, reproducibility: 5, exploitability: 5, affectedUsers: 5, discoverability: 5 },
      remediation: ['x'],
    }],
  });
  const arch = minimal({ components: [{ id: 's', name: 'S', type: 'service', trustBoundary: 'app', properties: { logsPii: true } }] });
  assert.deepEqual(analyse(arch, { rules }).warnings, []);
});

test('warnings: suggestions only for close matches', () => {
  const known = ['encryptionAtRest', 'logging', 'mfa'];
  assert.equal(suggest('encryptionAtRst', known), 'encryptionAtRest');
  assert.equal(suggest('LOGGING', known), 'logging');
  assert.equal(suggest('costCentre', known), null);
});
