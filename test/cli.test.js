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
  assert.equal(run(['analyze', EXAMPLE, '--fail-on', 'critical']).code, EXIT.OK);
  const breached = run(['analyze', EXAMPLE, '--fail-on', 'high']);
  assert.equal(breached.code, EXIT.THRESHOLD);
  assert.match(breached.stderr, /failing build/);

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
