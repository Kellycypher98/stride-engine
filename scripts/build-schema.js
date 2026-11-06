#!/usr/bin/env node
'use strict';

/**
 * Writes the generated model documentation:
 *   schema/architecture.schema.json  JSON Schema for editors
 *   docs/model-reference.md          field and rule reference
 */

const fs = require('node:fs');
const path = require('node:path');
const { buildJsonSchema } = require('../src/schema/json-schema');
const { buildReference } = require('../src/schema/reference');
const { loadRules } = require('../src/engine');

const root = path.join(__dirname, '..');
const outputs = [
  ['schema/architecture.schema.json', `${JSON.stringify(buildJsonSchema(), null, 2)}\n`],
  ['docs/model-reference.md', buildReference(loadRules())],
];
for (const [rel, text] of outputs) {
  fs.writeFileSync(path.join(root, rel), text);
  process.stdout.write(`wrote ${rel}\n`);
}
