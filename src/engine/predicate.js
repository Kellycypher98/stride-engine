'use strict';

/**
 * Declarative predicate DSL.
 *
 * Rules express their trigger conditions as JSON, never as code, so the rule
 * base stays portable, auditable and safe to load from untrusted files.
 *
 *   { "all": [ <pred>, ... ] }           logical AND (true for empty list)
 *   { "any": [ <pred>, ... ] }           logical OR  (false for empty list)
 *   { "not": <pred> }                    negation
 *   { "fact": "a.b.c", "op": "...", "value": ... }
 *
 * Operators:
 *   eq, ne, in, nin, gt, gte, lt, lte, contains,
 *   exists, absent, truthy, falsy, notTrue
 *
 * `notTrue` is the workhorse for control checks: it is true when a control is
 * explicitly false OR not declared, matching the schema's conservative
 * "undeclared = absent" assumption.
 */

const OPERATORS = {
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
  in: (a, b) => Array.isArray(b) && b.includes(a),
  nin: (a, b) => Array.isArray(b) && !b.includes(a),
  gt: (a, b) => typeof a === 'number' && a > b,
  gte: (a, b) => typeof a === 'number' && a >= b,
  lt: (a, b) => typeof a === 'number' && a < b,
  lte: (a, b) => typeof a === 'number' && a <= b,
  contains: (a, b) => (Array.isArray(a) || typeof a === 'string') && a.includes(b),
  exists: (a) => a !== undefined && a !== null,
  absent: (a) => a === undefined || a === null,
  truthy: (a) => Boolean(a),
  falsy: (a) => !a,
  notTrue: (a) => a !== true,
};

const UNARY = new Set(['exists', 'absent', 'truthy', 'falsy', 'notTrue']);

class PredicateError extends Error {
  constructor(message, path) {
    super(path ? `${message} (at ${path})` : message);
    this.name = 'PredicateError';
  }
}

function resolveFact(context, path) {
  let cur = context;
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, key)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** Structural check so malformed rules fail at load time, not mid-analysis. */
function compilePredicate(pred, path = 'when') {
  if (pred === null || typeof pred !== 'object' || Array.isArray(pred)) {
    throw new PredicateError('predicate must be an object', path);
  }
  const keys = Object.keys(pred);
  if ('all' in pred || 'any' in pred) {
    const k = 'all' in pred ? 'all' : 'any';
    if (keys.length !== 1) throw new PredicateError(`"${k}" must be the only key`, path);
    if (!Array.isArray(pred[k])) throw new PredicateError(`"${k}" must be an array`, path);
    pred[k].forEach((p, i) => compilePredicate(p, `${path}.${k}[${i}]`));
    return pred;
  }
  if ('not' in pred) {
    if (keys.length !== 1) throw new PredicateError('"not" must be the only key', path);
    compilePredicate(pred.not, `${path}.not`);
    return pred;
  }
  if (typeof pred.fact !== 'string' || !pred.fact) throw new PredicateError('missing "fact"', path);
  if (!(pred.op in OPERATORS)) throw new PredicateError(`unknown operator "${pred.op}"`, path);
  if (!UNARY.has(pred.op) && !('value' in pred)) {
    throw new PredicateError(`operator "${pred.op}" requires "value"`, path);
  }
  return pred;
}

function evaluate(pred, context) {
  if ('all' in pred) return pred.all.every((p) => evaluate(p, context));
  if ('any' in pred) return pred.any.some((p) => evaluate(p, context));
  if ('not' in pred) return !evaluate(pred.not, context);
  return OPERATORS[pred.op](resolveFact(context, pred.fact), pred.value);
}

module.exports = { evaluate, compilePredicate, resolveFact, PredicateError, OPERATORS };
