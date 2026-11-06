'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { analyse } = require('../src/engine');
const { compare } = require('../scripts/compare');

const arch = require(path.join(__dirname, '..', 'examples', 'payroll-saas.json'));
const key = require(path.join(__dirname, '..', 'examples', 'payroll-saas.seeded.json'));

test('payroll-saas: every in-scope seeded weakness is detected, with no unmatched findings', () => {
  const result = compare(analyse(arch), key);
  assert.equal(result.inScopeRecall, 100);
  assert.equal(result.precision, 100);
  assert.deepEqual(result.missed, ['W14', 'W15', 'W16', 'W17', 'W18'], 'only the documented gaps are missed');
});

test('payroll-saas: finding set is stable (regression lock)', () => {
  const ids = analyse(arch).findings.map((f) => f.id).sort();
  assert.deepEqual(ids, [
    'D-01@webhook-receiver', 'D-03@event-bus', 'E-01@ci-runner', 'E-03@ci-runner', 'I-02@p04', 'I-02@p11',
    'R-01@bank-connector', 'R-02@event-bus', 'R-03@system', 'S-02@p15', 'S-03@webhook-receiver',
    'T-02@report-service', 'T-03@payroll-engine',
  ]);
});

test('payroll-saas: secure parts of the model produce no findings', () => {
  const targets = new Set(analyse(arch).findings.map((f) => f.target.id));
  for (const clean of ['alb', 'web-app', 'tenant-api', 'tenant-db', 'payslip-bucket', 'registry', 'p17', 'p19', 'p20']) {
    assert.ok(!targets.has(clean), `${clean} should be clean`);
  }
});
