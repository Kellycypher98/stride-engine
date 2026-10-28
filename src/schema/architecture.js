'use strict';

/**
 * Architecture input schema.
 *
 * An architecture is a set of trust boundaries, components placed inside them,
 * and data flows between components. Validation is two-stage:
 *   1. Structural validation (Joi) — types, enums, required fields.
 *   2. Referential integrity — unique ids, flows reference real components,
 *      components reference real trust boundaries.
 *
 * Security controls that are not declared are treated as ABSENT. This is a
 * deliberately conservative assumption: the engine never credits a control
 * the model author did not state.
 */

const Joi = require('joi');

const COMPONENT_TYPES = Object.freeze([
  'user',               // external entity / actor
  'web_app',
  'api',
  'service',
  'function',           // serverless (e.g. AWS Lambda)
  'database',
  'object_storage',     // e.g. S3
  'cache',
  'queue',
  'identity_provider',  // e.g. Cognito
  'cdn',
  'load_balancer',
  'monitoring',         // log aggregation / SIEM (e.g. CloudWatch, CloudTrail)
  'external_service',   // third-party SaaS (e.g. payment provider)
]);

const KINDS = Object.freeze({
  user: 'actor',
  external_service: 'external',
  web_app: 'process',
  api: 'process',
  service: 'process',
  function: 'process',
  identity_provider: 'process',
  database: 'datastore',
  object_storage: 'datastore',
  cache: 'datastore',
  queue: 'datastore',
  cdn: 'edge',
  load_balancer: 'edge',
  monitoring: 'process',
});

const DATA_CLASSIFICATIONS = Object.freeze(['public', 'internal', 'confidential', 'restricted']);
const AUTH_METHODS = Object.freeze(['none', 'basic', 'api_key', 'token', 'oauth', 'mtls']);
const ENCRYPTED_PROTOCOLS = Object.freeze(['https', 'tls', 'grpcs', 'mtls', 'wss', 'sftp']);

const id = Joi.string().pattern(/^[A-Za-z0-9_.-]+$/).max(64);

const properties = Joi.object({
  publicFacing: Joi.boolean(),
  authentication: Joi.string().valid(...AUTH_METHODS),
  authorization: Joi.boolean(),        // object/function-level access control enforced
  mfa: Joi.boolean(),
  inputValidation: Joi.boolean(),
  logging: Joi.boolean(),
  rateLimited: Joi.boolean(),
  encryptionAtRest: Joi.boolean(),
  dataClassification: Joi.string().valid(...DATA_CLASSIFICATIONS),
  leastPrivilege: Joi.boolean(),       // IAM role scoped to minimum permissions
  privileged: Joi.boolean(),           // runs as root / privileged container
  dependencyScanning: Joi.boolean(),   // SCA in pipeline (npm audit, Snyk, Dependabot)
  redundancy: Joi.boolean(),           // multi-AZ / replicated
  waf: Joi.boolean(),
}).unknown(true); // allow extension properties for custom rules

const trustBoundary = Joi.object({
  id: id.required(),
  name: Joi.string().required(),
  // Higher level = more trusted. 0 is the public internet.
  level: Joi.number().integer().min(0).max(10).required(),
  description: Joi.string().allow(''),
});

const component = Joi.object({
  id: id.required(),
  name: Joi.string().required(),
  type: Joi.string().valid(...COMPONENT_TYPES).required(),
  trustBoundary: id.required(),
  description: Joi.string().allow(''),
  properties: properties.default({}),
});

const dataFlow = Joi.object({
  id: id.required(),
  from: id.required(),
  to: id.required(),
  protocol: Joi.string().lowercase().required(),
  encrypted: Joi.boolean(), // derived from protocol when omitted
  authenticated: Joi.boolean().default(false),
  dataClassification: Joi.string().valid(...DATA_CLASSIFICATIONS).default('internal'),
  description: Joi.string().allow(''),
});

const architectureSchema = Joi.object({
  name: Joi.string().required(),
  version: Joi.string().default('1.0'),
  description: Joi.string().allow(''),
  trustBoundaries: Joi.array().items(trustBoundary).min(1).required(),
  components: Joi.array().items(component).min(1).required(),
  dataFlows: Joi.array().items(dataFlow).default([]),
});

class ValidationError extends Error {
  constructor(details) {
    super(`Architecture validation failed:\n  - ${details.join('\n  - ')}`);
    this.name = 'ValidationError';
    this.details = details;
  }
}

function duplicates(items) {
  const seen = new Set();
  const dupes = new Set();
  for (const item of items) {
    if (seen.has(item.id)) dupes.add(item.id);
    seen.add(item.id);
  }
  return [...dupes];
}

function checkReferentialIntegrity(arch) {
  const errors = [];
  const boundaryIds = new Set(arch.trustBoundaries.map((b) => b.id));
  const componentIds = new Set(arch.components.map((c) => c.id));

  for (const d of duplicates(arch.trustBoundaries)) errors.push(`duplicate trust boundary id "${d}"`);
  for (const d of duplicates(arch.components)) errors.push(`duplicate component id "${d}"`);
  for (const d of duplicates(arch.dataFlows)) errors.push(`duplicate data flow id "${d}"`);

  for (const c of arch.components) {
    if (!boundaryIds.has(c.trustBoundary)) {
      errors.push(`component "${c.id}" references unknown trust boundary "${c.trustBoundary}"`);
    }
  }
  for (const f of arch.dataFlows) {
    if (!componentIds.has(f.from)) errors.push(`data flow "${f.id}" references unknown source "${f.from}"`);
    if (!componentIds.has(f.to)) errors.push(`data flow "${f.id}" references unknown target "${f.to}"`);
    if (f.from === f.to) errors.push(`data flow "${f.id}" is a self-loop on "${f.from}"`);
  }
  return errors;
}

/**
 * Validate and normalise an architecture. Returns a new object; input is not mutated.
 * Throws ValidationError listing every problem found.
 */
function validateArchitecture(input) {
  const { error, value } = architectureSchema.validate(input, { abortEarly: false, convert: true });
  if (error) throw new ValidationError(error.details.map((d) => d.message));

  const refErrors = checkReferentialIntegrity(value);
  if (refErrors.length) throw new ValidationError(refErrors);

  for (const f of value.dataFlows) {
    if (f.encrypted === undefined) f.encrypted = ENCRYPTED_PROTOCOLS.includes(f.protocol);
  }
  return value;
}

module.exports = {
  validateArchitecture,
  ValidationError,
  architectureSchema,
  COMPONENT_TYPES,
  KINDS,
  DATA_CLASSIFICATIONS,
  AUTH_METHODS,
  ENCRYPTED_PROTOCOLS,
};
