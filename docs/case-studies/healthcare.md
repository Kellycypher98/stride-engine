# Case study 2: Patient Records & Appointments API

Model: [`examples/healthcare.json`](../../examples/healthcare.json) · Key: [`examples/healthcare.seeded.json`](../../examples/healthcare.seeded.json)

## Purpose

Case study 1 (e-commerce) was the architecture the rule base was written against. This case study tests the
unchanged rule base (v1.0.0) on a different domain, to check that the rules generalise and were not tuned to
one example. The model and its list of seeded weaknesses were finished **before** the engine was first run on
it, and no rules were changed afterwards.

## Architecture

A FHIR R4 API on AWS that serves a patient app and clinicians. It also handles appointment booking with SMS
reminders, an HL7 v2 lab feed from an on-premises hospital network over a site-to-site VPN, and a nightly
pseudonymised export for a research partner. There are 6 trust boundaries, 21 components and 19 data flows.

It brings in patterns that case study 1 does not have: a hybrid on-premises link, a legacy protocol (MLLP),
data sent to third parties, a publicly exposed admin tool, and a secondary-use data export.

## Results (rule base 1.0.0)

| Metric | Value |
| --- | --- |
| Seeded weaknesses | 20 (15 in rule-base scope, 5 known gaps) |
| Detected | 15/20 (recall 75%) |
| In-scope recall | 15/15 (100%) |
| Findings | 16; 15 match a seeded weakness (precision 93.8%) |
| Clean components | API Gateway, Cognito, FHIR service, EHR database, export job, and the system-level rules all pass |

Run it with `node scripts/compare.js examples/healthcare.json examples/healthcare.seeded.json`.

### Unplanned finding

`R-02@fhir-cache`: the cache is declared confidential with `logging: false`. This is a valid finding, but
access-logging a Redis cache is impractical. It points to rule R-02 not telling durable stores apart from
ephemeral ones. It is a candidate false positive for the manual baseline to decide.

### Gaps (not detected)

| # | Weakness | Why the rule base misses it |
| --- | --- | --- |
| W16 | PHI sent to the SMS provider | Rules check transport security, not *whether* sensitive data should leave the boundary (data minimisation) |
| W17 | Pseudonymised export labelled `internal` | The engine trusts the declared classification; re-identification risk can't be expressed |
| W18 | Admin console writes directly to the EHR database | No rule for flows that skip a tier (edge → data) |
| W19 | Single on-prem integration engine | D-03 only covers stateful stores; services have no redundancy check |
| W20 | MLLP listener accepts unauthenticated senders | S-01 only applies to internet-facing components; unauthenticated *internal* receivers aren't covered |

W18–W20 could be handled by small rule additions. W16 and W17 show a limit of a rule-based approach: they need
knowledge of the data's semantics that the model schema doesn't capture.

### Scoring observation

| Scoring | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- |
| Arithmetic mean (`--scoring mean`) | 0 | 2 | 14 | 0 |
| Likelihood × impact matrix (default) | 1 | 7 | 8 | 0 |

With the mean, 14 of the 16 findings fall in Medium, which repeats the compression seen in case study 1. The
risk matrix spreads them across three bands on a model it was not calibrated on, which supports that change.

Ranking is still open to question under both methods. Missing rate limiting on the admin console ranks first
(Critical), above the IDOR on appointment data (High). Most analysts would reverse that order. The cause is
the rule's base DREAD vector, not the aggregation method, so the manual baseline should check it.
