'use strict';

/**
 * JSON Schema (draft 2020-12) for architecture models, generated from the same
 * constants as the Joi validator. Editors (VS Code, JetBrains, the YAML
 * language server) use it for autocomplete, hover help and live validation.
 *
 * Joi remains the authority: it also checks referential integrity (flows point
 * at real components, ids are unique), which JSON Schema cannot express.
 * Regenerate the published file with `npm run build:schema`.
 */

const { COMPONENT_TYPES, DATA_CLASSIFICATIONS, AUTH_METHODS } = require('./architecture');
const { COMPONENT_TYPE_DOCS, PROPERTY_DOCS, FLOW_DOCS, DATA_CLASSIFICATION_DOCS } = require('./docs');

const SCHEMA_URL = 'https://raw.githubusercontent.com/Kellycypher98/stride-engine/master/schema/architecture.schema.json';

const id = { type: 'string', pattern: '^[A-Za-z0-9_.-]+$', maxLength: 64 };
const classification = {
  enum: [...DATA_CLASSIFICATIONS],
  markdownEnumDescriptions: DATA_CLASSIFICATIONS.map((c) => DATA_CLASSIFICATION_DOCS[c]),
};

function propertySchema(name) {
  const description = PROPERTY_DOCS[name];
  if (name === 'authentication') return { description, enum: [...AUTH_METHODS] };
  if (name === 'dataClassification') return { description, ...classification };
  return { description, type: 'boolean' };
}

function buildJsonSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: SCHEMA_URL,
    title: 'stride-engine architecture model',
    description: 'Describe your system as trust boundaries, components and data flows. Controls you do not declare are treated as missing.',
    type: 'object',
    required: ['name', 'trustBoundaries', 'components'],
    additionalProperties: false,
    properties: {
      $schema: { type: 'string' },
      name: { type: 'string', description: 'Name of the system being modelled.' },
      version: { type: 'string', description: 'Version of this model, e.g. "1.0".' },
      description: { type: 'string' },
      trustBoundaries: {
        type: 'array',
        minItems: 1,
        description: 'Zones of equal trust. Data crossing from one zone to another is where most threats appear.',
        items: {
          type: 'object',
          required: ['id', 'name', 'level'],
          additionalProperties: false,
          properties: {
            id: { ...id, description: 'Unique id, referenced by components.' },
            name: { type: 'string' },
            level: { type: 'integer', minimum: 0, maximum: 10, description: 'How trusted the zone is: 0 is the public internet; higher is more trusted (e.g. 1 edge, 2 private app subnets, 3 isolated data tier).' },
            description: { type: 'string' },
          },
        },
      },
      components: {
        type: 'array',
        minItems: 1,
        description: 'Everything that processes, stores or sends data, plus the people and outside systems that use it.',
        items: {
          type: 'object',
          required: ['id', 'name', 'type', 'trustBoundary'],
          additionalProperties: false,
          properties: {
            id: { ...id, description: 'Unique id, referenced by data flows.' },
            name: { type: 'string' },
            type: { enum: [...COMPONENT_TYPES], markdownEnumDescriptions: COMPONENT_TYPES.map((t) => COMPONENT_TYPE_DOCS[t]) },
            trustBoundary: { ...id, description: 'Id of the trust boundary this component sits in.' },
            description: { type: 'string' },
            properties: {
              type: 'object',
              description: 'Security controls this component has. Anything you leave out is treated as missing.',
              properties: Object.fromEntries(Object.keys(PROPERTY_DOCS).map((p) => [p, propertySchema(p)])),
            },
          },
        },
      },
      dataFlows: {
        type: 'array',
        description: 'Data moving from one component to another.',
        items: {
          type: 'object',
          required: ['id', 'from', 'to', 'protocol'],
          additionalProperties: false,
          properties: {
            id: { ...id, description: FLOW_DOCS.id },
            from: { ...id, description: FLOW_DOCS.from },
            to: { ...id, description: FLOW_DOCS.to },
            protocol: { type: 'string', description: FLOW_DOCS.protocol },
            encrypted: { type: 'boolean', description: FLOW_DOCS.encrypted },
            authenticated: { type: 'boolean', description: FLOW_DOCS.authenticated },
            dataClassification: { description: FLOW_DOCS.dataClassification, ...classification },
            description: { type: 'string', description: FLOW_DOCS.description },
          },
        },
      },
    },
  };
}

module.exports = { buildJsonSchema, SCHEMA_URL };
