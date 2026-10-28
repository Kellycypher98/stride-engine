'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXAMPLE = path.join(__dirname, '..', 'examples', 'ecommerce.json');

const loadExample = () => JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));

/** Smallest valid architecture; override pieces per test. */
function minimal({ components, dataFlows, trustBoundaries } = {}) {
  return {
    name: 'test',
    trustBoundaries: trustBoundaries || [
      { id: 'internet', name: 'Internet', level: 0 },
      { id: 'app', name: 'App', level: 2 },
    ],
    components: components || [{ id: 'svc', name: 'Service', type: 'service', trustBoundary: 'app' }],
    dataFlows: dataFlows || [],
  };
}

module.exports = { EXAMPLE, loadExample, minimal };
