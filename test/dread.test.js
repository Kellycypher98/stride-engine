'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreThreat, normaliseScoring, severityFor } = require('../src/engine/dread');

const base = { damage: 5, reproducibility: 5, exploitability: 5, affectedUsers: 5, discoverability: 5 };
const neutral = { dataClassification: 'internal', internetExposed: false, trustLevel: 1 };
const mean = normaliseScoring({ method: 'mean' });

test('dread: mean of an unadjusted vector', () => {
  const r = scoreThreat(base, neutral, mean);
  assert.equal(r.score, 5);
  assert.equal(r.severity, 'Medium');
  assert.deepEqual(r.adjustments, []);
});

test('dread: context adjustments are applied, recorded and clamped to 1–10', () => {
  const r = scoreThreat(
    { ...base, damage: 9, discoverability: 9 },
    { dataClassification: 'restricted', internetExposed: true, trustLevel: 0 },
    mean,
  );
  assert.equal(r.final.damage, 10, 'damage 9 + 2 clamped to 10');
  assert.equal(r.final.discoverability, 10);
  assert.equal(r.final.exploitability, 6);
  assert.deepEqual(r.adjustments.map((a) => a.id), ['sensitivity.restricted', 'exposure.internet']);
  assert.deepEqual(r.base, { ...base, damage: 9, discoverability: 9 }, 'base vector preserved');

  const low = scoreThreat({ ...base, damage: 1 }, { dataClassification: 'public', internetExposed: false, trustLevel: 3 }, mean);
  assert.equal(low.final.damage, 1, 'clamped at lower bound');
});

test('dread: weighted aggregation uses weights and validates them', () => {
  const w = normaliseScoring({ method: 'weighted' });
  const v = { damage: 10, reproducibility: 1, exploitability: 1, affectedUsers: 1, discoverability: 1 };
  assert.equal(scoreThreat(v, neutral, w).score, 3.7); // 10*.3 + 1*.7
  assert.equal(scoreThreat(v, neutral, mean).score, 2.8);
  assert.throws(() => normaliseScoring({ method: 'weighted', weights: { damage: 0.9 } }), /sum to 1/);
  assert.throws(() => normaliseScoring({ method: 'median' }), /Unknown scoring/);
});

test('dread: severity band boundaries', () => {
  assert.equal(severityFor(3.9), 'Low');
  assert.equal(severityFor(4), 'Medium');
  assert.equal(severityFor(6.9), 'Medium');
  assert.equal(severityFor(7), 'High');
  assert.equal(severityFor(9), 'Critical');
});
