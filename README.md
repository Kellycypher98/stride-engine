# stride-engine

Rule-based STRIDE threat detection with DREAD risk scoring, built to run as a DevSecOps pipeline gate.
MSc Cybersecurity thesis artefact (Design Science Research), Arden University.

```
architecture (JSON/YAML) → validate → build views → evaluate STRIDE rules → DREAD score → sorted report
```

## Use it on your own system

```bash
npx github:Kellycypher98/stride-engine init --out threat-model.yaml   # commented starter model
npx github:Kellycypher98/stride-engine validate threat-model.yaml     # mistakes and warnings
npx github:Kellycypher98/stride-engine analyze threat-model.yaml      # threats, highest risk first
```

In GitHub Actions:

```yaml
- uses: Kellycypher98/stride-engine@master
  with:
    model: threat-model.yaml
    fail-on: High
```

Read the [modelling guide](docs/modelling-guide.md) first (about 15 minutes). Every field is listed in the
[model reference](docs/model-reference.md). The [JSON Schema](schema/architecture.schema.json) gives
autocomplete and inline errors in VS Code and JetBrains editors.

## Quick start

```bash
npm install
npm test                                   # 55 tests (builds the UI first)
node src/cli.js analyze examples/ecommerce.json
node src/cli.js analyze examples/ecommerce.json --format md --out report.md
node src/cli.js analyze examples/ecommerce.json --fail-on Critical   # exit 1 → fails the build
npm start                                  # builds the UI, then web UI + REST API on http://localhost:3000
npm run dev:ui                             # UI dev server with hot reload (run npm start alongside)
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/schema/architecture.js` | Joi schema + referential integrity (unique ids, valid boundary/flow references, no self-loops) |
| `src/engine/predicate.js` | Declarative predicate DSL (`all`/`any`/`not`, 14 operators); rules contain no code |
| `src/engine/dread.js` | DREAD scoring: base vector per rule, deterministic context adjustments, `risk` (default), `mean` or `weighted` aggregation |
| `src/engine/index.js` | Rule engine: component / dataFlow / system views, sorting, summary, model hash |
| `src/rules/stride.rules.json` | 18 rules, 3 per STRIDE category, with CWE/OWASP/AWS Well-Architected references |
| `src/report/format.js` | JSON, Markdown and text renderers |
| `src/cli.js` | CLI with `--fail-on` gating |
| `ui/` | Web interface (React, Tailwind CSS, D3): data flow diagram in DFD notation with threats pinned to components and flows, STRIDE and severity filters, threat inspector with the OWASP likelihood × impact matrix and DREAD breakdown, model editor (JSON/YAML), Markdown/JSON export. Built by Vite into `dist/web`, which the API serves |
| `src/api/server.js` | Express API (helmet security headers, rate limiting, 1 MB body limit) |
| `schema/`, `docs/model-reference.md` | JSON Schema and field reference, generated from `src/schema/docs.js` (`npm run build:schema`) |
| `templates/starter.yaml` | Starter model used by `init` and the web editor |
| `action.yml` | GitHub Action: analyse a model, post the report to the job summary, fail on a severity |
| `examples/ecommerce.json` | Case study 1: AWS serverless e-commerce platform |
| `examples/healthcare.json` | Case study 2: FHIR/HL7 healthcare API, hybrid AWS + on-prem ([write-up](docs/case-studies/healthcare.md)) |
| `examples/payroll-saas.json` | Case study 3: multi-tenant payroll SaaS on EKS with the CI/CD pipeline in scope ([write-up](docs/case-studies/payroll-saas.md)) |
| `examples/*.seeded.json` | Seeded-weakness keys, recorded before first run |
| `scripts/compare.js` | Recall/precision of findings against a key (seeded or manual STRIDE baseline) |

## Modelling

An architecture has **trust boundaries** (`level` 0 = internet, higher = more trusted), **components** (14 types, each
mapped to a kind: actor, process, datastore, edge, external) and **data flows**. Security controls live in
`component.properties` (`authentication`, `authorization`, `mfa`, `inputValidation`, `logging`, `rateLimited`,
`encryptionAtRest`, `dataClassification`, `leastPrivilege`, `privileged`, `dependencyScanning`, `redundancy`, `waf`,
`publicFacing`). Unknown properties are allowed so custom rules can use them.

**Undeclared controls are treated as absent.** The engine never credits a control the model doesn't state. Flow
encryption is derived from the protocol when not given (`https`, `tls`, `mtls`, `grpcs`, `wss`, `sftp`).

## Rules

```json
{
  "id": "I-01", "category": "Information Disclosure", "appliesTo": "component",
  "when": { "all": [
    { "fact": "component.kind", "op": "eq", "value": "datastore" },
    { "fact": "component.properties.dataClassification", "op": "in", "value": ["confidential", "restricted"] },
    { "fact": "component.properties.encryptionAtRest", "op": "notTrue" }
  ] },
  "dread": { "damage": 8, "reproducibility": 4, "exploitability": 4, "affectedUsers": 8, "discoverability": 4 },
  "remediation": ["..."], "references": ["CWE-311"]
}
```

Rule bases are validated on load (schema, unique ids, id prefix matches category, predicates compile).
Pass a custom base with `--rules file.json`.

## Scoring

Each finding: rule base vector → context adjustments (data sensitivity, internet exposure, internal trust zone),
clamped 1–10, every adjustment recorded with its reason → aggregated → severity.

| `--scoring` | Score | Severity |
| --- | --- | --- |
| `risk` (default) | likelihood × impact / 10, where impact = mean(D, A) and likelihood = mean(R, E, Di) | OWASP Risk Rating severity matrix over Low (<4) / Medium (<7) / High levels of likelihood and impact |
| `mean` | classic DREAD arithmetic mean | Low < 4 ≤ Medium < 7 ≤ High < 9 ≤ Critical |
| `weighted` | weighted mean (D .30, R .15, E .25, A .20, Di .10) | as `mean` |

Findings are sorted by severity, then score.

**Why `risk` is the default.** On the e-commerce reference model, classic DREAD compresses 13 of 16 findings into
Medium (`mean`: 0 Critical / 3 High / 13 Medium / 0 Low), and re-weighting does not help (`weighted`: same
distribution). Averaging five ratings that mostly sit between 4 and 8 regresses every score to the middle.
Separating likelihood from impact and combining them through the OWASP matrix uses the full scale
(`risk`: 2 Critical / 6 High / 6 Medium / 2 Low), so severity becomes a usable pipeline threshold.
`mean` and `weighted` are kept for comparison.

## Determinism

Arrays are canonicalised by id before analysis and findings sorted by score → STRIDE order → rule id → target id.
The same architecture, written in any order, gives a byte-identical report and the same `model.sha256`.

## Exit codes

`0` ok · `1` `--fail-on` threshold breached · `2` invalid architecture · `3` usage / I/O / rule-base error

## Web interface

`npm start`, then open http://localhost:3000. Choose the bundled example (or paste/upload a JSON or YAML model),
pick a scoring method and press **Analyse** (or Ctrl/⌘+Enter). The report shows severity counts, STRIDE coverage,
an architecture diagram with trust boundaries as columns (components outlined by their worst finding; click one to
filter), and a findings table that expands to show the threat, remediation, DREAD vector, likelihood × impact and the
reason for every score adjustment. Reports download as Markdown or JSON.

The page uses no third-party code and is served with a same-origin-only CSP (no inline script or style); all text
from the model is inserted as text, never HTML.

## API hardening

`helmet` security headers with a deny-all CSP (the API serves no HTML), `Cache-Control: no-store`, per-client rate
limit on `POST /analyze` (60/min by default; set `TRUST_PROXY=1` behind a load balancer so limits apply per client),
1 MB body limit, no stack traces in error responses, submitted models are never stored.

## CI

`.github/workflows/threat-model.yml` runs `npm audit --audit-level=high`, the test suite, and a gate demo that
asserts the deliberately insecure reference model fails at `--fail-on Critical`.
