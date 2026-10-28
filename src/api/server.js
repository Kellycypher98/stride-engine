'use strict';

/**
 * REST API.
 *
 *   GET  /health                       liveness
 *   GET  /rules                        loaded rule base
 *   POST /analyze?scoring=&format=     body: architecture JSON → report
 *
 * 200 report · 400 bad request · 422 architecture invalid · 500 internal error
 */

const express = require('express');
const { analyse, loadRules } = require('../engine');
const { ValidationError } = require('../schema/architecture');
const { render } = require('../report/format');

function createApp({ rules = loadRules() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.get('/rules', (req, res) => res.json(rules));

  app.post('/analyze', (req, res, next) => {
    try {
      const scoring = { method: req.query.scoring || 'mean' };
      if (!['mean', 'weighted'].includes(scoring.method)) {
        return res.status(400).json({ error: 'scoring must be "mean" or "weighted"' });
      }
      const format = req.query.format || 'json';
      if (!['json', 'md'].includes(format)) {
        return res.status(400).json({ error: 'format must be "json" or "md"' });
      }
      const report = analyse(req.body, { rules, scoring });
      if (format === 'md') return res.type('text/markdown').send(render(report, 'md'));
      return res.json(report);
    } catch (e) {
      if (e instanceof ValidationError) return res.status(422).json({ error: 'invalid architecture', details: e.details });
      return next(e);
    }
  });

  // Malformed JSON bodies and unexpected errors — never leak stack traces.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'malformed JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload too large' });
    return res.status(500).json({ error: 'internal error' });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => process.stdout.write(`stride-engine API listening on :${port}\n`));
}

module.exports = { createApp };
