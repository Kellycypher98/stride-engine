# stride-engine

Rule-based STRIDE threat detection with DREAD risk scoring, built to run as a DevSecOps pipeline gate.
MSc Cybersecurity thesis artefact (Design Science Research), Arden University.

```
architecture (JSON/YAML) → validate → build views → evaluate STRIDE rules → DREAD score → sorted report
```

## Quick start

```bash
npm install
npm test                                   # 27 tests
node src/cli.js analyze examples/ecommerce.json
node src/cli.js analyze examples/ecommerce.json --format md --out report.md
node src/cli.js analyze examples/ecommerce.json --fail-on High   # exit 1 → fails the build
npm start                                  # REST API on :3000
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/schema/architecture.js` | Joi schema + referential integrity (unique ids, valid boundary/flow references, no self-loops) |
| `src/engine/predicate.js` | Declarative predicate DSL (`all`/`any`/`not`, 14 operators); rules contain no code |
| `src/engine/dread.js` | DREAD scoring: base vector per rule, deterministic context adjustments, `mean` or `weighted` aggregation |
| `src/engine/index.js` | Rule engine: component / dataFlow / system views, sorting, summary, model hash |
| `src/rules/stride.rules.json` | 18 rules, 3 per STRIDE category, with CWE/OWASP/AWS Well-Architected references |
| `src/report/format.js` | JSON, Markdown and text renderers |
| `src/cli.js` | CLI with `--fail-on` gating |
| `src/api/server.js` | Express API |
| `examples/ecommerce.json` | Case study 1: AWS serverless e-commerce platform |

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
clamped 1–10, every adjustment recorded with its reason → aggregated → banded
(Low < 4 ≤ Medium < 7 ≤ High < 9 ≤ Critical).

## Determinism

Arrays are canonicalised by id before analysis and findings sorted by score → STRIDE order → rule id → target id.
The same architecture, written in any order, gives a byte-identical report and the same `model.sha256`.

## Exit codes

`0` ok · `1` `--fail-on` threshold breached · `2` invalid architecture · `3` usage / I/O / rule-base error

## Open decisions

- **DREAD aggregation.** On the e-commerce case, `mean` and the provisional `weighted` profile give the same
  distribution (3 High / 13 Medium). Weighting alone does not fix score compression; see thesis notes.
