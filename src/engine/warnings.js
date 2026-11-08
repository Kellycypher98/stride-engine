'use strict';

/**
 * Model warnings: things that are valid but probably not what the author meant.
 *
 * Because undeclared controls count as missing, a typo such as
 * "encryptionAtRst" silently turns a real control into a finding. These checks
 * catch that and similar slips, without failing validation (custom rules may
 * use their own properties).
 */

const { PROPERTY_DOCS } = require('../schema/docs');

const APP_TYPES = new Set(['web_app', 'api', 'service', 'function']);

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function suggest(name, known) {
  const lower = name.toLowerCase();
  let best = null;
  let bestD = Infinity;
  for (const k of known) {
    const d = k.toLowerCase() === lower ? 0 : levenshtein(lower, k.toLowerCase());
    if (d < bestD) { best = k; bestD = d; }
  }
  return bestD <= Math.max(2, Math.floor(name.length / 5)) ? best : null;
}

/** Property names read by a rule base (for custom rules with their own properties). */
function ruleProperties(ruleBase) {
  const out = new Set();
  const walk = (p) => {
    if (!p || typeof p !== 'object') return;
    if (p.all) p.all.forEach(walk);
    else if (p.any) p.any.forEach(walk);
    else if (p.not) walk(p.not);
    else if (typeof p.fact === 'string' && p.fact.startsWith('component.properties.')) {
      out.add(p.fact.slice('component.properties.'.length).split('.')[0]);
    }
  };
  for (const r of ruleBase.rules) walk(r.when);
  return out;
}

function modelWarnings(arch, ruleBase) {
  const known = new Set([...Object.keys(PROPERTY_DOCS), ...ruleProperties(ruleBase)]);
  const connected = new Set(arch.dataFlows.flatMap((f) => [f.from, f.to]));
  const warnings = [];

  for (const c of arch.components) {
    for (const prop of Object.keys(c.properties).sort()) {
      if (known.has(prop)) continue;
      const hint = suggest(prop, known);
      warnings.push({
        code: 'unknown-property',
        target: c.id,
        message: hint
          ? `Component "${c.id}" has property "${prop}", which no rule reads. Did you mean "${hint}"? Until it is fixed, "${hint}" counts as missing.`
          : `Component "${c.id}" has property "${prop}", which no rule reads, so it has no effect.`,
        ...(hint ? { suggestion: hint } : {}),
      });
    }
    if (APP_TYPES.has(c.type) && Object.keys(c.properties).length === 0) {
      warnings.push({
        code: 'no-controls',
        target: c.id,
        message: `Component "${c.id}" declares no security controls, so every control counts as missing. List the controls it has under "properties".`,
      });
    }
    if (!connected.has(c.id) && arch.dataFlows.length > 0) {
      warnings.push({
        code: 'isolated-component',
        target: c.id,
        message: `Component "${c.id}" has no data flows, so flow-based threats cannot be found for it. Add the flows it sends or receives.`,
      });
    }
  }
  return warnings.sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : a.code < b.code ? -1 : 1));
}

module.exports = { modelWarnings, suggest, levenshtein };
