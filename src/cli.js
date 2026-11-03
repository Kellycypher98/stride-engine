#!/usr/bin/env node
'use strict';

/**
 * stride-engine CLI — designed to run as a CI/CD security gate.
 *
 *   stride-engine analyze <architecture.json|yaml> [options]
 *   stride-engine rules [--rules <file>]
 *
 * Options:
 *   --format <json|md|text>    output format (default: text)
 *   --out <file>               write report to file instead of stdout
 *   --fail-on <severity>       exit 1 if any finding is >= Low|Medium|High|Critical
 *   --scoring <risk|mean|weighted>  DREAD aggregation (default: risk = likelihood × impact)
 *   --rules <file>             custom rule base (default: bundled STRIDE rules)
 *
 * Exit codes:
 *   0  analysis completed, threshold not breached
 *   1  analysis completed, --fail-on threshold breached
 *   2  architecture failed validation
 *   3  usage, I/O or rule-base error
 */

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const { analyse, loadRules, exceedsThreshold, DEFAULT_RULES_PATH } = require('./engine');
const { ValidationError } = require('./schema/architecture');
const { SEVERITY_ORDER } = require('./engine/dread');
const { render } = require('./report/format');

const EXIT = { OK: 0, THRESHOLD: 1, INVALID: 2, ERROR: 3 };

const USAGE = `Usage:
  stride-engine analyze <architecture.json|yaml> [--format json|md|text] [--out file]
                        [--fail-on Low|Medium|High|Critical] [--scoring risk|mean|weighted] [--rules file]
  stride-engine rules [--rules file]`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-h' || a === '--help') args.help = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith('--')) throw new Error(`Option --${key} requires a value`);
      args[key] = val;
      i += 1;
    } else args._.push(a);
  }
  return args;
}

function readArchitecture(file) {
  const text = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file).toLowerCase();
  return ext === '.yaml' || ext === '.yml' ? yaml.load(text, { schema: yaml.JSON_SCHEMA }) : JSON.parse(text);
}

function normaliseSeverity(s) {
  const match = SEVERITY_ORDER.find((x) => x.toLowerCase() === String(s).toLowerCase());
  if (!match) throw new Error(`--fail-on must be one of ${SEVERITY_ORDER.join(', ')}`);
  return match;
}

function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    io.stderr.write(`${e.message}\n${USAGE}\n`);
    return EXIT.ERROR;
  }
  const [command, file] = args._;
  if (args.help || !command) {
    io.stdout.write(`${USAGE}\n`);
    return args.help ? EXIT.OK : EXIT.ERROR;
  }

  try {
    const rules = loadRules(args.rules || DEFAULT_RULES_PATH);

    if (command === 'rules') {
      for (const r of rules.rules) io.stdout.write(`${r.id}  ${r.category.padEnd(22)} ${r.appliesTo.padEnd(9)} ${r.title}\n`);
      return EXIT.OK;
    }
    if (command !== 'analyze') throw new Error(`Unknown command "${command}"\n${USAGE}`);
    if (!file) throw new Error(`analyze requires an architecture file\n${USAGE}`);

    const failOn = args['fail-on'] ? normaliseSeverity(args['fail-on']) : null;
    const report = analyse(readArchitecture(file), { rules, scoring: { method: args.scoring } });
    const output = render(report, args.format || 'text');

    if (args.out) fs.writeFileSync(args.out, output);
    else io.stdout.write(output);

    if (failOn && exceedsThreshold(report, failOn)) {
      io.stderr.write(`stride-engine: findings at or above ${failOn} — failing build\n`);
      return EXIT.THRESHOLD;
    }
    return EXIT.OK;
  } catch (e) {
    if (e instanceof ValidationError) {
      io.stderr.write(`${e.message}\n`);
      return EXIT.INVALID;
    }
    io.stderr.write(`stride-engine: ${e.message}\n`);
    return EXIT.ERROR;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, EXIT };
