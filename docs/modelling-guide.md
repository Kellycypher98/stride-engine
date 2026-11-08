# Modelling guide

stride-engine finds threats in a **model** of your system: a short JSON or YAML file that describes where data
goes and which security controls protect it. You don't need security training to write one. This guide takes
about 15 minutes, and a first model of a typical service takes 20–30.

Every field is listed in the [model reference](model-reference.md).

## 1. Start from the template

```bash
npx github:Kellycypher98/stride-engine init --out threat-model.yaml
```

This writes a commented example: a customer, an API gateway, a service, a database and logging. Edit it to
describe your system. Keep the file in your repository next to the code it describes, so it's reviewed and
updated with that code.

**Get autocomplete and checking while you type.** The first line of the template points your editor at the
model's JSON Schema. VS Code (with the Red Hat *YAML* extension) and JetBrains IDEs then suggest field names,
explain each one on hover, and underline mistakes. For a JSON model, add the same URL as a `"$schema"` key:

```json
{ "$schema": "https://raw.githubusercontent.com/Kellycypher98/stride-engine/master/schema/architecture.schema.json", "name": "..." }
```

## 2. Draw your trust boundaries

A trust boundary is a line that data crosses where the level of trust changes. Most threats sit on these lines,
so they matter more than any other part of the model.

Give each zone a `level`: **0 is the public internet**, and higher numbers are more trusted. A typical AWS
system looks like this:

| Zone | `level` |
| --- | --- |
| Public internet (customers, attackers) | 0 |
| Third parties you call or that call you; public endpoints (API Gateway, CloudFront, public load balancers) | 1 |
| Private application subnets, your cluster, your build system | 2 |
| Isolated data tier | 3 |

Put a separate zone around anything run by someone else (a payment provider, a bank, a partner's network), even
if you connect to it privately.

## 3. List the components

Add everything that sends, processes or stores data, and the people and outside systems that use it. Pick the
closest `type`. Accuracy matters most for data stores (`database`, `object_storage`, `cache`, `queue`), because
several rules check only data stores.

Then **list the controls each component has** under `properties`. This is the step that matters most:

> **Controls you leave out count as missing.** If your database is encrypted but you don't write
> `encryptionAtRest: true`, you will get a finding for it.

That's deliberate: the tool never assumes protection you haven't stated. A model that declares nothing produces
many findings, and most of them are false. To fill in controls quickly, go down the
[controls table](model-reference.md#component-controls-properties) once for each component and answer yes or
no. Write `false` for controls you know are missing; it documents the decision.

Set `dataClassification` on every data store and on any service that handles personal or payment data. It
decides how serious a finding is:

| Value | Use for |
| --- | --- |
| `public` | Marketing pages, product images |
| `internal` | Not public, little harm if leaked |
| `confidential` | Customer contact details, orders, business data |
| `restricted` | Credentials, payment cards, health data, government ids |

If you have central logging (CloudTrail, CloudWatch, a SIEM), add it as a `monitoring` component. Otherwise
rule R-03 reports that there is none.

## 4. Add the data flows

One entry per direction that data moves: `from`, `to` and `protocol`. Two fields change the result:

- `authenticated: true` when the receiver checks who is sending (IAM signatures, mTLS, a service token).
  The default is `false`.
- `dataClassification` for the most sensitive data on the flow. The default is `internal`.

Encryption is worked out from the protocol (`https`, `tls`, `grpcs`, `mtls`, `wss` and `sftp` count as
encrypted). Add `encrypted: true` only when the protocol name doesn't show it, for example plain TCP inside a
VPN tunnel.

You don't need a flow for every API call. One per pair of components per direction is enough.

## 5. Check and analyse

```bash
npx github:Kellycypher98/stride-engine validate threat-model.yaml   # errors and warnings only
npx github:Kellycypher98/stride-engine analyze threat-model.yaml    # threats, highest risk first
```

`validate` reports mistakes in plain words (`data flow "f3" references unknown target "dbb"`) and **warnings**
for things that are valid but probably wrong:

- a misspelt control, with the correct spelling (`encryptionAtRst`, did you mean `encryptionAtRest`?);
- an application component that declares no controls at all;
- a component with no data flows.

To explore the result visually, run the web interface (`npm start` in a clone of the repository) and paste the
model into *Edit model*.

## 6. Add it to your pipeline

With GitHub Actions:

```yaml
# .github/workflows/threat-model.yml
name: threat-model
on: [pull_request]
jobs:
  stride:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Kellycypher98/stride-engine@master
        with:
          model: threat-model.yaml
          fail-on: High        # Low | Medium | High | Critical | none
```

The report appears on the job's summary page, and the job fails if any threat is at or above `fail-on`. Start
with `fail-on: none` while you tune the model, then tighten it.

In any other CI system, run the CLI and use its exit code:

```bash
npx github:Kellycypher98/stride-engine analyze threat-model.yaml --fail-on High --format md --out threat-report.md
# exit 0 = passed, 1 = threats at or above the threshold, 2 = invalid model, 3 = usage or file error
```

## When a finding is wrong

Most false findings come from the model, not the rules. In order, check that:

1. the control is declared, and spelt correctly (look for warnings);
2. the component is in the right trust zone and has the right `type`;
3. the flow's `authenticated`, `protocol` and `dataClassification` are right.

If the model is correct and you have accepted the risk, keep the finding. Raise `fail-on` only if your team has
agreed to accept that whole severity level.

## What it does not find

The rules check the controls you declare against known STRIDE patterns. They don't read your code, and they
can't judge whether a control is implemented well. Known gaps include supply-chain risks (unsigned images,
untrusted build inputs), tenant isolation, SSRF, and how much personal data you share with third parties. Use
the report as the starting point for a threat-modelling conversation, not as a replacement for one.
