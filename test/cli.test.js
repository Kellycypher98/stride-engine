'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { main, EXIT } = require('../src/cli');
const { EXAMPLE, loadExample } = require('./helpers');

function run(args) {
  let stdout = '';
  let stderr = '';
  const code = main(args, { stdout: { write: (s) => { stdout += s; } }, stderr: { write: (s) => { stderr += s; } } });
  return { code, stdout, stderr };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stride-cli-'));

test('cli: exit codes for pipeline gating (0 pass, 1 threshold, 2 invalid, 3 error)', () => {
  assert.equal(run(['analyze', EXAMPLE]).code, EXIT.OK);
  // default risk scoring: the reference model has Critical findings
  const breached = run(['analyze', EXAMPLE, '--fail-on', 'critical']);
  assert.equal(breached.code, EXIT.THRESHOLD);
  assert.match(breached.stderr, /failing build/);
  // classic mean scoring tops out at High
  assert.equal(run(['analyze', EXAMPLE, '--scoring', 'mean', '--fail-on', 'critical']).code, EXIT.OK);
  assert.equal(run(['analyze', EXAMPLE, '--scoring', 'mean', '--fail-on', 'high']).code, EXIT.THRESHOLD);
  assert.equal(run(['analyze', EXAMPLE, '--scoring', 'median']).code, EXIT.ERROR);

  const bad = path.join(tmp, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ name: 'x', trustBoundaries: [], components: [] }));
  assert.equal(run(['analyze', bad]).code, EXIT.INVALID);

  assert.equal(run(['analyze', path.join(tmp, 'missing.json')]).code, EXIT.ERROR);
  assert.equal(run(['analyze', EXAMPLE, '--fail-on', 'extreme']).code, EXIT.ERROR);
  assert.equal(run(['frobnicate']).code, EXIT.ERROR);
});

test('cli: YAML input gives the same report as JSON, and --out writes the file', () => {
  const yml = path.join(tmp, 'ecommerce.yaml');
  fs.writeFileSync(yml, yaml.dump(loadExample()));
  const fromJson = run(['analyze', EXAMPLE, '--format', 'json']).stdout;
  const out = path.join(tmp, 'report.json');
  assert.equal(run(['analyze', yml, '--format', 'json', '--out', out]).code, EXIT.OK);
  assert.equal(fs.readFileSync(out, 'utf8'), fromJson);
});

test('cli: rules command lists the rule base', () => {
  const { code, stdout } = run(['rules']);
  assert.equal(code, EXIT.OK);
  assert.equal(stdout.trim().split('\n').length, 18);
});

test('cli: init writes the starter (refusing to overwrite), and validate reports warnings without analysing', () => {
  const out = path.join(tmp, 'threat-model.yaml');
  assert.equal(run(['init']).stdout, fs.readFileSync(path.join(__dirname, '..', 'templates', 'starter.yaml'), 'utf8'));
  assert.equal(run(['init', '--out', out]).code, EXIT.OK);
  assert.equal(run(['init', '--out', out]).code, EXIT.ERROR, 'never overwrites an existing model');

  const ok = run(['validate', out]);
  assert.equal(ok.code, EXIT.OK);
  assert.match(ok.stdout, /is valid: 5 components/);
  assert.equal(ok.stderr, '');

  fs.writeFileSync(out, fs.readFileSync(out, 'utf8').replace('encryptionAtRest: true', 'encryptionAtRst: true'));
  const typo = run(['validate', out]);
  assert.equal(typo.code, EXIT.OK);
  assert.match(typo.stderr, /Did you mean "encryptionAtRest"/);
  assert.match(run(['analyze', out, '--format', 'json']).stderr, /encryptionAtRst/, 'warnings reach the build log');

  const bad = path.join(tmp, 'bad-ref.yaml');
  fs.writeFileSync(bad, fs.readFileSync(out, 'utf8').replace('to: db', 'to: dbb'));
  const invalid = run(['validate', bad]);
  assert.equal(invalid.code, EXIT.INVALID);
  assert.match(invalid.stderr, /unknown target "dbb"/);
});
