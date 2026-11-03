'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyse, loadRules, exceedsThreshold, STRIDE } = require('../src/engine');
const { render } = require('../src/report/format');
const { loadExample, minimal } = require('./helpers');

const shuffle = (arr) => [...arr].reverse();

test('rules: bundled rule base has 18 valid rules, 3 per STRIDE category', () => {
  const { rules } = loadRules();
  assert.equal(rules.length, 18);
  for (const c of STRIDE) assert.equal(rules.filter((r) => r.category === c).length, 3, c);
});

test('rules: invalid rule bases are rejected at load time', () => {
  const good = loadRules();
  const clone = () => JSON.parse(JSON.stringify(good));

  const dup = clone(); dup.rules[1].id = dup.rules[0].id;
  assert.throws(() => loadRules(dup), /duplicate rule id/);

  const prefix = clone(); prefix.rules[0].category = 'Tampering';
  assert.throws(() => loadRules(prefix), /prefix does not match/);

  const pred = clone(); pred.rules[0].when = { fact: 'x', op: 'eval', value: 'process.exit()' };
  assert.throws(() => loadRules(pred), /unknown operator/);

  const range = clone(); range.rules[0].dread.damage = 11;
  assert.throws(() => loadRules(range), /Invalid rule base/);
});

test('engine: reference e-commerce example produces the expected findings', () => {
  const report = analyse(loadExample());
  assert.deepEqual(report.findings.map((f) => f.id).sort(), [
    'D-02@system',
    'D-03@customer-db',
    'E-01@order-service',
    'E-02@order-service',
    'E-03@payment-service',
    'I-01@customer-db',
    'I-02@f13',
    'I-03@product-images',
    'R-01@catalog-service',
    'R-02@orders-db',
    'R-03@system',
    'S-02@f08',
    'S-03@auth',
    'T-01@f13',
    'T-02@catalog-service',
    'T-03@catalog-service',
  ]);
  assert.equal(report.summary.coverage.strideCategoriesHit, 6);
  assert.equal(report.findings[0].id, 'I-03@product-images', 'highest risk first');
});

test('engine: findings are sorted by severity, then score desc, STRIDE order, rule id, target id', () => {
  const sev = ['Low', 'Medium', 'High', 'Critical'];
  for (const method of ['risk', 'mean']) {
    const { findings } = analyse(loadExample(), { scoring: { method } });
    for (let i = 1; i < findings.length; i += 1) {
      const a = findings[i - 1];
      const b = findings[i];
      const sa = sev.indexOf(a.severity);
      const sb = sev.indexOf(b.severity);
      assert.ok(sa > sb || (sa === sb && (a.score > b.score || (a.score === b.score && (
        STRIDE.indexOf(a.category) < STRIDE.indexOf(b.category)
        || (a.category === b.category && `${a.ruleId}${a.target.id}` <= `${b.ruleId}${b.target.id}`))))),
      `${a.id} before ${b.id}`);
    }
  }
});

test('determinism: repeated runs and reordered input yield byte-identical reports', () => {
  const input = loadExample();
  const reordered = {
    ...input,
    trustBoundaries: shuffle(input.trustBoundaries),
    components: shuffle(input.components),
    dataFlows: shuffle(input.dataFlows),
  };
  for (const format of ['json', 'md', 'text']) {
    const a = render(analyse(input), format);
    assert.equal(render(analyse(input), format), a, `${format}: repeated run`);
    assert.equal(render(analyse(reordered), format), a, `${format}: reordered input`);
  }
});

test('remediation: applying the recommended controls clears the corresponding findings', () => {
  const input = loadExample();
  const byId = Object.fromEntries(input.components.map((c) => [c.id, c]));
  Object.assign(byId['customer-db'].properties, { encryptionAtRest: true, redundancy: true });
  Object.assign(byId['order-service'].properties, { leastPrivilege: true, authorization: true });
  byId['product-images'].properties.publicFacing = false;
  input.dataFlows.find((f) => f.id === 'f13').protocol = 'tls';

  const ids = analyse(input).findings.map((f) => f.id);
  for (const cleared of ['I-01@customer-db', 'D-03@customer-db', 'E-01@order-service',
    'E-02@order-service', 'I-03@product-images', 'T-01@f13', 'I-02@f13']) {
    assert.ok(!ids.includes(cleared), `${cleared} cleared`);
  }
  assert.equal(ids.length, 9);
});

test('engine: a fully hardened architecture produces no findings', () => {
  const secure = {
    publicFacing: true, authentication: 'oauth', authorization: true, inputValidation: true, logging: true,
    rateLimited: true, leastPrivilege: true, dependencyScanning: true, waf: true,
  };
  const arch = minimal({
    trustBoundaries: [{ id: 'internet', name: 'Internet', level: 0 }, { id: 'edge', name: 'Edge', level: 1 },
      { id: 'data', name: 'Data', level: 3 }],
    components: [
      { id: 'user', name: 'User', type: 'user', trustBoundary: 'internet' },
      { id: 'api', name: 'API', type: 'api', trustBoundary: 'edge', properties: secure },
      { id: 'db', name: 'DB', type: 'database', trustBoundary: 'data',
        properties: { dataClassification: 'restricted', encryptionAtRest: true, logging: true, redundancy: true } },
      { id: 'mon', name: 'Monitoring', type: 'monitoring', trustBoundary: 'data' },
    ],
    dataFlows: [
      { id: 'f1', from: 'user', to: 'api', protocol: 'https', authenticated: true, dataClassification: 'restricted' },
      { id: 'f2', from: 'api', to: 'db', protocol: 'tls', authenticated: true, dataClassification: 'restricted' },
    ],
  });
  const report = analyse(arch);
  assert.deepEqual(report.findings, []);
  assert.equal(report.summary.highestSeverity, null);
});

test('engine: custom rule bases can target extension properties', () => {
  const rules = loadRules({
    version: 'custom-1',
    rules: [{
      id: 'I-90', category: 'Information Disclosure', title: 'PII in logs', description: 'Logs contain PII.',
      appliesTo: 'component', when: { fact: 'component.properties.logsPii', op: 'eq', value: true },
      dread: { damage: 6, reproducibility: 6, exploitability: 6, affectedUsers: 6, discoverability: 6 },
      remediation: ['Redact PII before logging.'],
    }],
  });
  const arch = minimal({ components: [{ id: 'svc', name: 'Svc', type: 'service', trustBoundary: 'app',
    properties: { logsPii: true } }] });
  const report = analyse(arch, { rules });
  assert.deepEqual(report.findings.map((f) => f.id), ['I-90@svc']);
  assert.equal(report.tool.ruleBaseVersion, 'custom-1');
});

test('engine: exceedsThreshold respects severity order', () => {
  const report = analyse(loadExample(), { scoring: { method: 'mean' } }); // highest finding is High
  assert.equal(exceedsThreshold(report, 'Medium'), true);
  assert.equal(exceedsThreshold(report, 'High'), true);
  assert.equal(exceedsThreshold(report, 'Critical'), false);
  assert.equal(exceedsThreshold(analyse(loadExample()), 'Critical'), true, 'risk scoring reaches Critical');
  assert.throws(() => exceedsThreshold(report, 'Severe'), /Unknown severity/);
});

test('scoring: risk matrix spreads the reference model across all four bands', () => {
  const report = analyse(loadExample());
  assert.equal(report.scoring.method, 'risk', 'risk is the default');
  assert.deepEqual(report.summary.bySeverity, { Critical: 2, High: 6, Medium: 6, Low: 2 });
  const mean = analyse(loadExample(), { scoring: { method: 'mean' } });
  assert.deepEqual(mean.summary.bySeverity, { Critical: 0, High: 3, Medium: 13, Low: 0 }, 'classic DREAD compresses');
  assert.equal(report.findings[0].id, 'I-03@product-images');
  assert.ok(report.findings.every((f) => f.dread.risk && f.dread.risk.likelihoodLevel && f.dread.risk.impactLevel));
});
