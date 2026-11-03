#!/usr/bin/env node
'use strict';

/**
 * Compare engine findings against a reference key (seeded weaknesses or a
 * manual STRIDE baseline) and report detection metrics.
 *
 *   node scripts/compare.js <architecture.json> <key.json> [--json]
 *
 * Key format: { weaknesses: [{ id, category, target, expected: "<ruleId>@<target>" | null, description }] }
 *   expected = null marks a weakness the rule base is not designed to detect.
 *
 * Matching is on (STRIDE category, target id), so a key written by hand
 * without knowledge of rule ids still matches.
 */

const fs = require('node:fs');
const { analyse } = require('../src/engine');

function compare(report, key) {
  const findings = report.findings;
  const matchedFindings = new Set();
  const rows = key.weaknesses.map((w) => {
    const hits = findings.filter((f) => f.category === w.category && f.target.id === w.target);
    hits.forEach((f) => matchedFindings.add(f.id));
    return { ...w, detected: hits.length > 0, findings: hits.map((f) => f.id) };
  });
  const unmatched = findings.filter((f) => !matchedFindings.has(f.id)).map((f) => f.id);
  const tp = rows.filter((r) => r.detected).length;
  const inScope = rows.filter((r) => r.expected !== null);
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
  return {
    weaknesses: rows.length,
    detected: tp,
    recall: pct(tp, rows.length),
    inScopeRecall: pct(inScope.filter((r) => r.detected).length, inScope.length),
    precision: pct(matchedFindings.size, findings.length),
    unmatchedFindings: unmatched,
    missed: rows.filter((r) => !r.detected).map((r) => r.id),
    rows,
  };
}

if (require.main === module) {
  const [archPath, keyPath, flag] = process.argv.slice(2);
  if (!archPath || !keyPath) {
    process.stderr.write('Usage: node scripts/compare.js <architecture.json> <key.json> [--json]\n');
    process.exit(3);
  }
  const result = compare(
    analyse(JSON.parse(fs.readFileSync(archPath, 'utf8'))),
    JSON.parse(fs.readFileSync(keyPath, 'utf8')),
  );
  if (flag === '--json') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    for (const r of result.rows) {
      process.stdout.write(`${r.detected ? '✓' : '✗'} ${r.id}  ${r.category.padEnd(22)} ${r.target.padEnd(22)} ${r.findings.join(', ') || (r.expected === null ? '(known gap)' : 'MISSED')}\n`);
    }
    process.stdout.write(`\nDetected ${result.detected}/${result.weaknesses} (recall ${result.recall}%, in-scope ${result.inScopeRecall}%)\n`);
    process.stdout.write(`Precision ${result.precision}%  unmatched findings: ${result.unmatchedFindings.join(', ') || 'none'}\n`);
  }
}

module.exports = { compare };
