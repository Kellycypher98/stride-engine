'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const { buildJsonSchema } = require('../src/schema/json-schema');
const { buildReference } = require('../src/schema/reference');
const { loadRules } = require('../src/engine');
const { validateArchitecture, COMPONENT_TYPES } = require('../src/schema/architecture');
const { PROPERTY_DOCS, COMPONENT_TYPE_DOCS } = require('../src/schema/docs');

const ROOT = path.join(__dirname, '..');
const published = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'architecture.schema.json'), 'utf8'));

const ajv = new Ajv2020({ allErrors: true });
ajv.addKeyword('markdownEnumDescriptions'); // VS Code hover text, not a validation keyword
const validate = ajv.compile(published);

const examples = fs.readdirSync(path.join(ROOT, 'examples'))
  .filter((f) => f.endsWith('.json') && !f.endsWith('.seeded.json'))
  .map((f) => [f, JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', f), 'utf8'))]);

test('json schema: published file is up to date (run `npm run build:schema`)', () => {
  assert.deepEqual(published, buildJsonSchema());
});

test('model reference doc is up to date (run `npm run build:schema`)', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'docs', 'model-reference.md'), 'utf8'), buildReference(loadRules()));
});

test('starter template is a valid model with no warnings', () => {
  const yaml = require('js-yaml');
  const { analyse } = require('../src/engine');
  const model = yaml.load(fs.readFileSync(path.join(ROOT, 'templates', 'starter.yaml'), 'utf8'), { schema: yaml.JSON_SCHEMA });
  assert.ok(validate(model), ajv.errorsText(validate.errors));
  assert.deepEqual(analyse(model).warnings, []);
});

test('json schema: every component type and control is documented', () => {
  for (const t of COMPONENT_TYPES) assert.ok(COMPONENT_TYPE_DOCS[t], t);
  const declared = Object.keys(published.properties.components.items.properties.properties.properties);
  assert.deepEqual(declared.sort(), Object.keys(PROPERTY_DOCS).sort());
});

test('json schema: agrees with the engine validator on valid and invalid models', () => {
  for (const [name, model] of examples) {
    assert.ok(validate(model), `${name}: ${ajv.errorsText(validate.errors)}`);
    assert.doesNotThrow(() => validateArchitecture(model), name);
  }
  const base = examples.find(([n]) => n === 'ecommerce.json')[1];
  const broken = [
    { ...base, components: [{ ...base.components[0], type: 'mainframe' }] },
    { ...base, components: [{ ...base.components[0], properties: { authentication: 'password' } }] },
    { ...base, trustBoundaries: [{ id: 'x', name: 'X', level: 11 }] },
    { ...base, dataFlows: [{ ...base.dataFlows[0], dataClassification: 'secret' }] },
    { ...base, extra: true },
  ];
  for (const model of broken) {
    assert.equal(validate(model), false, 'JSON Schema rejects');
    assert.throws(() => validateArchitecture(model), 'engine rejects');
  }
  assert.ok(validate({ ...base, $schema: 'x' }) && validateArchitecture({ ...base, $schema: 'x' }), '$schema hint is accepted');
});
