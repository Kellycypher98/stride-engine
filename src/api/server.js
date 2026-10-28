'use strict';

/**
 * REST API.
 *
 *   GET  /                             web interface (static, src/web)
 *   GET  /health                       liveness
 *   GET  /rules                        loaded rule base
 *   GET  /examples                     names of bundled example architectures
 *   GET  /examples/:name               one example architecture
 *   POST /analyze?scoring=&format=     body: architecture JSON or YAML → report
 *
 * 200 report · 400 bad request · 413 too large · 422 architecture invalid
 * 429 rate limited · 500 internal error
 *
 * Hardening (requirement SR3): security headers via helmet with a deny-all
 * CSP (the API serves no HTML), per-client rate limiting on /analyze,
 * a 1 MB body limit, no stack traces in responses, and no persistence of
 * submitted architectures.
 */

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const yaml = require('js-yaml');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { analyse, loadRules } = require('../engine');
const { ValidationError } = require('../schema/architecture');
const { render } = require('../report/format');
const { METHODS } = require('../engine/dread');

const DEFAULT_RATE_LIMIT = Object.freeze({ windowMs: 60_000, limit: 60 });
const WEB_DIR = path.join(__dirname, '..', 'web');
const EXAMPLES_DIR = path.join(__dirname, '..', '..', 'examples');
const YAML_TYPES = ['application/yaml', 'application/x-yaml', 'text/yaml'];

// The web UI is the only route that serves HTML; it gets a same-origin-only CSP
// (no inline script/style, no third-party resources). Every other route keeps deny-all.
const UI_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Bundled examples, discovered once; names are whitelisted from the directory listing. */
function loadExamples(dir = EXAMPLES_DIR) {
  const out = new Map();
  for (const file of fs.readdirSync(dir).sort()) {
    if (path.extname(file) !== '.json') continue;
    out.set(path.basename(file, '.json'), JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
  }
  return out;
}

function createApp({ rules = loadRules(), rateLimit: rl = DEFAULT_RATE_LIMIT, trustProxy = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Behind a load balancer / API Gateway set trustProxy so limits apply per client, not per proxy.
  app.set('trust proxy', trustProxy);
  app.use(helmet({
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  }));
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.text({ type: YAML_TYPES, limit: '1mb' }));

  app.use(express.static(WEB_DIR, {
    index: 'index.html',
    setHeaders: (res) => res.setHeader('Content-Security-Policy', UI_CSP),
  }));

  const examples = loadExamples();

  const analyzeLimiter = rateLimit({
    windowMs: rl.windowMs,
    limit: rl.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'too many requests' },
  });

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.get('/rules', (req, res) => res.json(rules));

  app.get('/examples', (req, res) => res.json(
    [...examples.entries()].map(([name, arch]) => ({ name, title: arch.name, description: arch.description || '' })),
  ));
  app.get('/examples/:name', (req, res) => {
    const arch = examples.get(req.params.name);
    if (!arch) return res.status(404).json({ error: 'example not found' });
    return res.json(arch);
  });

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
      let model = req.body;
      if (typeof model === 'string') {
        try {
          model = yaml.load(model, { schema: yaml.JSON_SCHEMA });
        } catch (e) {
          return res.status(400).json({ error: 'malformed YAML body', details: [e.reason || 'parse error'] });
        }
      }
      const report = analyse(model, { rules, scoring });
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
