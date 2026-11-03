'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { analyse } = require('../src/engine');
const { compare } = require('../scripts/compare');

const arch = require(path.join(__dirname, '..', 'examples', 'healthcare.json'));
const key = require(path.join(__dirname, '..', 'examples', 'healthcare.seeded.json'));

test('healthcare: validates and every in-scope seeded weakness is detected', () => {
  const result = compare(analyse(arch), key);
  assert.equal(result.inScopeRecall, 100);
  assert.deepEqual(result.missed, ['W16', 'W17', 'W18', 'W19', 'W20'], 'only the documented gaps are missed');
});

test('healthcare: finding set is stable (regression lock)', () => {
  const ids = analyse(arch).findings.map((f) => f.id).sort();
  assert.deepEqual(ids, [
    'D-01@admin-console', 'D-03@fhir-cache', 'E-01@notification-service', 'E-02@appointment-service',
    'E-03@integration-engine', 'I-01@fhir-cache', 'I-01@reminder-queue', 'I-02@h09', 'I-02@h14',
    'R-01@notification-service', 'R-02@documents', 'R-02@fhir-cache', 'S-02@h15', 'S-03@admin-console',
    'T-02@integration-engine', 'T-03@integration-engine',
  ]);
});

test('healthcare: secure parts of the model produce no findings', () => {
  const targets = new Set(analyse(arch).findings.map((f) => f.target.id));
  for (const clean of ['api-gw', 'auth', 'fhir-service', 'ehr-db', 'export-job', 'system']) {
    assert.ok(!targets.has(clean), `${clean} should be clean`);
  }
});
