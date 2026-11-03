'use strict';

/**
 * DREAD risk scoring.
 *
 * Each rule carries a base DREAD vector (1–10 per dimension). The vector is
 * then adjusted deterministically from the target's context (data sensitivity,
 * internet exposure, trust level). Every adjustment is recorded with its
 * reason so a score can always be traced back to the model.
 *
 * Aggregation is configurable:
 *   - "risk"     (default) likelihood × impact, structured after the OWASP Risk
 *                Rating Methodology:
 *                  impact     = mean(damage, affectedUsers)
 *                  likelihood = mean(reproducibility, exploitability, discoverability)
 *                  score      = likelihood × impact / 10            (0.1–10, for ranking)
 *                  severity   = OWASP severity matrix over the Low/Medium/High
 *                               levels of likelihood and impact
 *   - "mean"     classic DREAD: arithmetic mean of the five dimensions
 *   - "weighted" weighted mean of the five dimensions
 *
 * "mean" and "weighted" are kept so the thesis can compare against classic
 * DREAD: on the reference model both compress 13/16 findings into Medium.
 */

const DIMENSIONS = Object.freeze([
  'damage',
  'reproducibility',
  'exploitability',
  'affectedUsers',
  'discoverability',
]);

const DEFAULT_WEIGHTS = Object.freeze({
  damage: 0.3,
  reproducibility: 0.15,
  exploitability: 0.25,
  affectedUsers: 0.2,
  discoverability: 0.1,
});

const SEVERITY_BANDS = Object.freeze([
  { name: 'Critical', min: 9 },
  { name: 'High', min: 7 },
  { name: 'Medium', min: 4 },
  { name: 'Low', min: 0 },
]);

const SEVERITY_ORDER = Object.freeze(['Low', 'Medium', 'High', 'Critical']);

const METHODS = Object.freeze(['risk', 'mean', 'weighted']);
const DEFAULT_METHOD = 'risk';

/** Likelihood / impact levels on the 1–10 scale (same cut points as the bands). */
const levelOf = (x) => (x < 4 ? 'Low' : x < 7 ? 'Medium' : 'High');

/**
 * OWASP Risk Rating "overall risk severity" matrix, indexed [impact][likelihood].
 * OWASP's lowest cell ("Note") is mapped to Low.
 */
const RISK_MATRIX = Object.freeze({
  High: Object.freeze({ Low: 'Medium', Medium: 'High', High: 'Critical' }),
  Medium: Object.freeze({ Low: 'Low', Medium: 'Medium', High: 'High' }),
  Low: Object.freeze({ Low: 'Low', Medium: 'Low', High: 'Medium' }),
});

function likelihoodImpact(v) {
  return {
    likelihood: (v.reproducibility + v.exploitability + v.discoverability) / 3,
    impact: (v.damage + v.affectedUsers) / 2,
  };
}

const clamp = (n) => Math.min(10, Math.max(1, n));
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Context-driven adjustments. Each entry: test(context) → boolean,
 * delta per dimension, and a human-readable reason.
 */
const ADJUSTMENTS = Object.freeze([
  {
    id: 'sensitivity.restricted',
    test: (ctx) => ctx.dataClassification === 'restricted',
    delta: { damage: 2, affectedUsers: 1 },
    reason: 'Target handles restricted data',
  },
  {
    id: 'sensitivity.confidential',
    test: (ctx) => ctx.dataClassification === 'confidential',
    delta: { damage: 1 },
    reason: 'Target handles confidential data',
  },
  {
    id: 'sensitivity.public',
    test: (ctx) => ctx.dataClassification === 'public',
    delta: { damage: -2 },
    reason: 'Target handles only public data',
  },
  {
    id: 'exposure.internet',
    test: (ctx) => ctx.internetExposed === true,
    delta: { discoverability: 2, exploitability: 1 },
    reason: 'Target is reachable from the public internet',
  },
  {
    id: 'exposure.internal',
    test: (ctx) => ctx.internetExposed === false && ctx.trustLevel >= 2,
    delta: { exploitability: -1, discoverability: -1 },
    reason: 'Target sits in an internal trust zone',
  },
]);

function validateWeights(weights) {
  for (const d of DIMENSIONS) {
    if (typeof weights[d] !== 'number' || weights[d] < 0) {
      throw new Error(`DREAD weight for "${d}" must be a non-negative number`);
    }
  }
  const sum = DIMENSIONS.reduce((s, d) => s + weights[d], 0);
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`DREAD weights must sum to 1 (got ${sum})`);
}

function aggregate(vector, scoring) {
  if (scoring.method === 'risk') {
    const { likelihood, impact } = likelihoodImpact(vector);
    return (likelihood * impact) / 10;
  }
  if (scoring.method === 'mean') {
    return DIMENSIONS.reduce((s, d) => s + vector[d], 0) / DIMENSIONS.length;
  }
  if (scoring.method === 'weighted') {
    return DIMENSIONS.reduce((s, d) => s + vector[d] * scoring.weights[d], 0);
  }
  throw new Error(`Unknown scoring method "${scoring.method}"`);
}

function severityFor(score) {
  return SEVERITY_BANDS.find((b) => score >= b.min).name;
}

function normaliseScoring(options = {}) {
  const method = options.method || DEFAULT_METHOD;
  if (!METHODS.includes(method)) throw new Error(`Unknown scoring method "${method}"`);
  const scoring = { method };
  if (method === 'weighted') {
    scoring.weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
    validateWeights(scoring.weights);
  }
  return scoring;
}

/**
 * Score one finding.
 * @param {object} base     base DREAD vector from the rule
 * @param {object} context  { dataClassification, internetExposed, trustLevel }
 * @param {object} scoring  output of normaliseScoring()
 */
function scoreThreat(base, context, scoring) {
  const final = { ...base };
  const applied = [];
  for (const adj of ADJUSTMENTS) {
    if (!adj.test(context)) continue;
    for (const [dim, delta] of Object.entries(adj.delta)) final[dim] = clamp(final[dim] + delta);
    applied.push({ id: adj.id, reason: adj.reason, delta: adj.delta });
  }
  const score = round1(aggregate(final, scoring));
  const result = {
    base: pick(base),
    adjustments: applied,
    final: pick(final),
    score,
    severity: severityFor(score),
  };
  if (scoring.method === 'risk') {
    const { likelihood, impact } = likelihoodImpact(final);
    const l = levelOf(likelihood);
    const i = levelOf(impact);
    result.risk = { likelihood: round1(likelihood), likelihoodLevel: l, impact: round1(impact), impactLevel: i };
    result.severity = RISK_MATRIX[i][l];
  }
  return result;
}

// Fixed key order keeps serialised output byte-identical.
function pick(v) {
  const out = {};
  for (const d of DIMENSIONS) out[d] = v[d];
  return out;
}

module.exports = {
  scoreThreat,
  normaliseScoring,
  severityFor,
  DIMENSIONS,
  DEFAULT_WEIGHTS,
  SEVERITY_BANDS,
  SEVERITY_ORDER,
  ADJUSTMENTS,
  METHODS,
  DEFAULT_METHOD,
  RISK_MATRIX,
  levelOf,
};
