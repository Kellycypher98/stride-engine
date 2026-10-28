'use strict';

/**
 * REST API.
 *
 *   GET  /health                       liveness
 *   GET  /rules                        loaded rule base
 *   POST /analyze?scoring=&format=     body: architecture JSON → report
 *
 * 200 report · 400 bad request · 413 too large · 422 architecture invalid
 * 429 rate limited · 500 internal error
 *
 * Hardening (requirement SR3): security headers via helmet with a deny-all
 * CSP (the API serves no HTML), per-client rate limiting on /analyze,
 * a 1 MB body limit, no stack traces in responses, and no persistence of
 * submitted architectures.
 */

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { analyse, loadRules } = require('../engine');
const { ValidationError } = require('../schema/architecture');
const { render } = require('../report/format');
const { METHODS } = require('../engine/dread');

const DEFAULT_RATE_LIMIT = Object.freeze({ windowMs: 60_000, limit: 60 });

function createApp({ rules = loadRules(), rateLimit: rl = DEFAULT_RATE_LIMIT, trustProxy = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Behind a load balancer / API Gateway set trustProxy so limits apply per client, not per proxy.
  app.set('trust proxy', trustProxy);
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  }));
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '1mb' }));

  const analyzeLimiter = rateLimit({
    windowMs: rl.windowMs,
    limit: rl.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'too many requests' },
  });

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.get('/rules', (req, res) => res.json(rules));

  app.post('/analyze', analyzeLimiter, (req, res, next) => {
    try {
      const scoring = { method: req.query.scoring };
      if (scoring.method !== undefined && !METHODS.includes(scoring.method)) {
        return res.status(400).json({ error: `scoring must be one of ${METHODS.join(', ')}` });
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
  createApp({ trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false }).listen(port, () => process.stdout.write(`stride-engine API listening on :${port}\n`));
}

module.exports = { createApp };
