'use strict';

/**
 * STRIDE rule engine.
 *
 * Pipeline: validate → build views → evaluate rules → score → sort → report.
 *
 * Views are the facts a rule's predicate can see:
 *   component  { component, boundary, internetExposed }
 *   dataFlow   { flow, source, target, sourceBoundary, targetBoundary,
 *                crossesBoundary, entersHigherTrust, sensitive }
 *   system     { system: { componentCount, hasMonitoring, hasEdgeProtection,
 *                hasPublicFacing, hasSensitiveData, ... } }
 *
 * Output is deterministic: the same architecture (regardless of the order its
 * arrays were written in) always yields a byte-identical report.
 */

const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const Joi = require('joi');

const { validateArchitecture, KINDS, DATA_CLASSIFICATIONS } = require('../schema/architecture');
const { compilePredicate, evaluate } = require('./predicate');
const { scoreThreat, normaliseScoring, DIMENSIONS, SEVERITY_ORDER } = require('./dread');
const pkg = require('../../package.json');

const STRIDE = Object.freeze([
  'Spoofing',
  'Tampering',
  'Repudiation',
  'Information Disclosure',
  'Denial of Service',
  'Elevation of Privilege',
]);

const DEFAULT_RULES_PATH = path.join(__dirname, '..', 'rules', 'stride.rules.json');

// ---------------------------------------------------------------- rule loading

const dreadScore = Joi.number().integer().min(1).max(10).required();

const ruleSchema = Joi.object({
  id: Joi.string().pattern(/^[STRIDE]-\d{2}$/).required(),
  category: Joi.string().valid(...STRIDE).required(),
  title: Joi.string().required(),
  description: Joi.string().required(),
  appliesTo: Joi.string().valid('component', 'dataFlow', 'system').required(),
  when: Joi.object().required(),
  dread: Joi.object(Object.fromEntries(DIMENSIONS.map((d) => [d, dreadScore]))).required(),
  remediation: Joi.array().items(Joi.string()).min(1).required(),
  references: Joi.array().items(Joi.string()).default([]),
});

const ruleBaseSchema = Joi.object({
  version: Joi.string().required(),
  description: Joi.string().allow(''),
  rules: Joi.array().items(ruleSchema).min(1).required(),
});

function loadRules(source = DEFAULT_RULES_PATH) {
  const raw = typeof source === 'string' ? JSON.parse(fs.readFileSync(source, 'utf8')) : source;
  const { error, value } = ruleBaseSchema.validate(raw, { abortEarly: false });
  if (error) throw new Error(`Invalid rule base: ${error.details.map((d) => d.message).join('; ')}`);

  const ids = new Set();
  for (const rule of value.rules) {
    if (ids.has(rule.id)) throw new Error(`Invalid rule base: duplicate rule id "${rule.id}"`);
    ids.add(rule.id);
    if (rule.id[0] !== rule.category[0]) {
      throw new Error(`Invalid rule base: rule "${rule.id}" prefix does not match category "${rule.category}"`);
    }
    compilePredicate(rule.when, `${rule.id}.when`);
  }
  return value;
}

// ------------------------------------------------------------------ views

const classRank = (c) => DATA_CLASSIFICATIONS.indexOf(c);
const maxClass = (list) =>
  list.filter(Boolean).reduce((a, b) => (classRank(b) > classRank(a) ? b : a), 'public');

function buildViews(arch) {
  const boundaries = new Map(arch.trustBoundaries.map((b) => [b.id, b]));
  const components = new Map(
    arch.components.map((c) => [c.id, { ...c, kind: KINDS[c.type] }]),
  );

  const componentViews = [...components.values()].map((component) => {
    const boundary = boundaries.get(component.trustBoundary);
    const internetExposed = component.properties.publicFacing === true || boundary.level === 0;
    return {
      target: { type: 'component', id: component.id, name: component.name },
      facts: { component, boundary, internetExposed },
      context: {
        dataClassification: component.properties.dataClassification,
        internetExposed,
        trustLevel: boundary.level,
      },
    };
  });

  const dataFlowViews = arch.dataFlows.map((flow) => {
    const source = components.get(flow.from);
    const target = components.get(flow.to);
    const sourceBoundary = boundaries.get(source.trustBoundary);
    const targetBoundary = boundaries.get(target.trustBoundary);
    const internetExposed = sourceBoundary.level === 0 || targetBoundary.level === 0;
    return {
      target: { type: 'dataFlow', id: flow.id, name: `${source.name} → ${target.name}` },
      facts: {
        flow,
        source,
        target,
        sourceBoundary,
        targetBoundary,
        crossesBoundary: sourceBoundary.id !== targetBoundary.id,
        entersHigherTrust: targetBoundary.level > sourceBoundary.level,
        sensitive: classRank(flow.dataClassification) >= classRank('confidential'),
      },
      context: {
        dataClassification: flow.dataClassification,
        internetExposed,
        trustLevel: Math.max(sourceBoundary.level, targetBoundary.level),
      },
    };
  });

  const all = [...components.values()];
  const has = (pred) => all.some(pred);
  const highest = maxClass([
    ...all.map((c) => c.properties.dataClassification),
    ...arch.dataFlows.map((f) => f.dataClassification),
  ]);
  const system = {
    componentCount: all.length,
    dataFlowCount: arch.dataFlows.length,
    hasMonitoring: has((c) => c.type === 'monitoring'),
    hasIdentityProvider: has((c) => c.type === 'identity_provider'),
    hasEdgeProtection: has((c) => (c.kind === 'edge' || c.type === 'api') && c.properties.waf === true),
    hasPublicFacing: componentViews.some((v) => v.facts.internetExposed && v.facts.component.kind !== 'actor'),
    hasSensitiveData: classRank(highest) >= classRank('confidential'),
    highestDataClassification: highest,
  };
  const systemViews = [{
    target: { type: 'system', id: 'system', name: arch.name },
    facts: { system },
    context: {
      dataClassification: highest,
      internetExposed: system.hasPublicFacing,
      trustLevel: 0,
    },
  }];

  return { component: componentViews, dataFlow: dataFlowViews, system: systemViews };
}

// --------------------------------------------------------------- utilities

/** JSON.stringify with sorted object keys — used for the model hash. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalModel(arch) {
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    ...arch,
    trustBoundaries: [...arch.trustBoundaries].sort(byId),
    components: [...arch.components].sort(byId),
    dataFlows: [...arch.dataFlows].sort(byId),
  };
}

function compareFindings(a, b) {
  return (
    b.score - a.score ||
    STRIDE.indexOf(a.category) - STRIDE.indexOf(b.category) ||
    (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0) ||
    (a.target.id < b.target.id ? -1 : a.target.id > b.target.id ? 1 : 0)
  );
}

// ------------------------------------------------------------------ analyse

/**
 * Analyse an architecture.
 * @param {object} input            raw architecture (validated here)
 * @param {object} [options]
 * @param {object} [options.rules]  pre-loaded rule base (defaults to bundled rules)
 * @param {object} [options.scoring] { method: 'mean'|'weighted', weights? }
 * @returns {object} report
 */
function analyse(input, options = {}) {
  const arch = canonicalModel(validateArchitecture(input));
  const ruleBase = options.rules || loadRules();
  const scoring = normaliseScoring(options.scoring);
  const views = buildViews(arch);

  const findings = [];
  for (const rule of ruleBase.rules) {
    for (const view of views[rule.appliesTo]) {
      if (!evaluate(rule.when, view.facts)) continue;
      const risk = scoreThreat(rule.dread, view.context, scoring);
      findings.push({
        id: `${rule.id}@${view.target.id}`,
        ruleId: rule.id,
        category: rule.category,
        title: rule.title,
        description: rule.description,
        target: view.target,
        score: risk.score,
        severity: risk.severity,
        dread: { base: risk.base, adjustments: risk.adjustments, final: risk.final },
        remediation: rule.remediation,
        references: rule.references,
      });
    }
  }
  findings.sort(compareFindings);

  const byCategory = Object.fromEntries(STRIDE.map((c) => [c, 0]));
  const bySeverity = Object.fromEntries([...SEVERITY_ORDER].reverse().map((s) => [s, 0]));
  for (const f of findings) {
    byCategory[f.category] += 1;
    bySeverity[f.severity] += 1;
  }

  return {
    tool: { name: pkg.name, version: pkg.version, ruleBaseVersion: ruleBase.version },
    model: {
      name: arch.name,
      version: arch.version,
      sha256: crypto.createHash('sha256').update(stableStringify(arch)).digest('hex'),
      components: arch.components.length,
      dataFlows: arch.dataFlows.length,
      trustBoundaries: arch.trustBoundaries.length,
    },
    scoring,
    summary: {
      total: findings.length,
      highestSeverity: findings.length ? findings[0].severity : null,
      bySeverity,
      byCategory,
      coverage: {
        rulesEvaluated: ruleBase.rules.length,
        rulesTriggered: new Set(findings.map((f) => f.ruleId)).size,
        strideCategoriesHit: STRIDE.filter((c) => byCategory[c] > 0).length,
      },
    },
    findings,
  };
}

/** True when any finding meets or exceeds the given severity. */
function exceedsThreshold(report, severity) {
  const min = SEVERITY_ORDER.indexOf(severity);
  if (min === -1) throw new Error(`Unknown severity "${severity}"`);
  return report.findings.some((f) => SEVERITY_ORDER.indexOf(f.severity) >= min);
}

module.exports = {
  analyse,
  loadRules,
  buildViews,
  exceedsThreshold,
  stableStringify,
  STRIDE,
  DEFAULT_RULES_PATH,
};
