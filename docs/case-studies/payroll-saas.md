# Case study 3: Multi-tenant Payroll SaaS (EKS + CI/CD)

Model: [`examples/payroll-saas.json`](../../examples/payroll-saas.json) · Key: [`examples/payroll-saas.seeded.json`](../../examples/payroll-saas.seeded.json)

## Purpose

This is the third and final evaluation architecture. It was chosen to differ from case studies 1 and 2 in
runtime (Kubernetes containers rather than serverless or hybrid), in tenancy (many customers on one platform)
and, most importantly for a DevSecOps thesis, because **the CI/CD pipeline is modelled as part of the attack
surface**. The rule base stays unchanged (v1.0.0). The model and its seeded-weakness key were finished before
the engine was first run.

## Architecture

A payroll platform on Amazon EKS, behind an Application Load Balancer with WAF. A Kafka event bus feeds a
payroll engine, which produces PDF payslips and sends payment files to a bank over SFTP. The bank posts status
callbacks to a public webhook. Code flows from GitHub to a self-hosted CI runner, then to ECR, then into the
cluster, and the runner also runs production database migrations. There are 6 trust boundaries, 18 components
and 20 data flows.

## Results (rule base 1.0.0)

| Metric | Value |
| --- | --- |
| Seeded weaknesses | 18 (13 in rule-base scope, 5 known gaps) |
| Detected | 13/18 (recall 72.2%) |
| In-scope recall | 13/13 (100%) |
| Findings | 13; all match a seeded weakness (precision 100%) |
| Clean components | ALB, web frontend, tenant API, tenant DB, payslip store, registry, and all CI/CD flows |
| Severity, risk matrix (default) | 1 Critical · 6 High · 6 Medium · 0 Low |
| Severity, arithmetic mean | 0 Critical · 1 High · 12 Medium · 0 Low |

Run it with `node scripts/compare.js examples/payroll-saas.json examples/payroll-saas.seeded.json`.

### Gaps (not detected)

| # | Weakness | Why the rule base misses it |
| --- | --- | --- |
| W14 | Cross-tenant data leakage (shared schema, `tenant_id` filter) | The schema has no concept of tenancy or isolation model |
| W15 | Unsigned images, no provenance check at deploy | No rule or property for artefact integrity in the supply chain |
| W16 | CI pipeline holds production DB credentials | E-01 flags the runner's broad role, but not the build → production data path as such |
| W17 | SSRF in the PDF renderer | T-02 fires on missing validation (Tampering), but nothing models outbound fetches or metadata access |
| W18 | Fork PRs run on a self-hosted runner | Rules check how a flow is protected, not whether its *source* is trusted code |

Four of the five gaps (W15, W16, W18 and, in part, W14) concern the **software supply chain and pipeline**,
the area a DevSecOps tool is expected to cover. The schema has no component types for build systems,
artefact registries or secret stores. CI/CD components had to be modelled as generic `service` and
`object_storage` types, so the engine assesses them like runtime components.

## Cross-case observation: D-01 calibration

| Case study | Top finding (risk matrix) | Only Critical? |
| --- | --- | --- |
| 1 E-commerce | I-03 public data store | No (2 Critical) |
| 2 Healthcare | D-01 no rate limiting, admin console | Yes |
| 3 Payroll SaaS | D-01 no rate limiting, webhook receiver | Yes |

D-01's base vector (D5 R8 E7 A8 Di7) puts almost all of its weight on likelihood. The internet-exposure
adjustment adds +1 Exploitability and +2 Discoverability, so missing rate limiting outranks data-exposure
weaknesses such as IDOR (case 2) or plaintext bank details (case 3). The cause is the rule's calibration, not
the aggregation method. The manual STRIDE baseline should decide whether D-01's base vector is revised in
rule base v1.1.

## Across case studies 2 and 3 (unseen by the rule author)

| | Weaknesses | In scope | Detected | Findings | Matched |
| --- | --- | --- | --- | --- | --- |
| Healthcare | 20 | 15 | 15 | 16 | 15 |
| Payroll SaaS | 18 | 13 | 13 | 13 | 13 |
| **Total** | **38** | **28** | **28 (100%)** | **29** | **28 (96.6%)** |

Overall recall against all seeded weaknesses is 28/38 (73.7%).
