# How stride-engine works

## It reads a description, not your system

stride-engine **never connects to your APIs, servers or cloud account.** It doesn't scan, call or test anything
that is running. It reads a short file that *describes* how your system is built, and works out what could go
wrong with that design.

Think of a building inspector reviewing **blueprints** before construction starts. They can tell you "the vault
door has no lock" or "this fire exit leads into a locked room" without ever visiting the building. The drawing
tells them enough.

stride-engine does the same for software. Your **model file is the blueprint.**

| | stride-engine (threat modelling) | Scanners such as OWASP ZAP or Burp |
| --- | --- | --- |
| Looks at | A description of the design | A running application |
| When | Before or while you build | After it is deployed |
| Finds | Design flaws: missing controls, risky data paths | Bugs in the live code |
| Needs access to your system | No | Yes |

The two complement each other. Threat modelling finds design problems early, when they are cheapest to fix.

## What you do

Say you're building a shop with an API, an order service and a database.

**1. Describe the system** in a file such as `threat-model.yaml`, from what you already know about it:

- Customers on the internet call our API Gateway over HTTPS. It uses OAuth logins.
- The API calls our order service, which writes to a Postgres database.
- The database holds customer data and is encrypted. It is not replicated.

`stride-engine init` gives you a commented example to edit, and the [modelling guide](modelling-guide.md)
explains each part. For a typical service this takes 20–30 minutes.

**2. Run stride-engine** on the file: in this web app, from the command line, or in your CI pipeline.

**3. Read the threats.** For example:

- *Order database is a single point of failure.* Fix: deploy it across availability zones.
- *Order service runs with an over-permissive role.* Fix: give its IAM role only the permissions it needs.

Each threat names its STRIDE category, how serious it is and why, and how to fix it.

**4. Fix the design, or accept the risk**, then update the file.

**5. Keep the file in your repository.** When the design changes (a new service, a new database), update the
file. Your pipeline runs stride-engine again and fails the build if a serious new threat appears.

## Why it works this way

- **Early:** it finds design flaws before code is written, when they cost least to fix (shift-left security).
- **Safe:** it needs no credentials or network access to your systems, so it can't break anything.
- **Repeatable:** the same file always gives the same result, which suits pipelines and reviews.

## The one thing to get right

The result is only as accurate as the description. stride-engine treats any control you don't mention as
**missing**, and believes anything you say is in place. Describe the system as it really is. The editor help,
the starter template and the warnings (for example, for misspelt controls) help you do that.

## Try it in two minutes

1. In the web app, choose **Edit model**, then **Start from template**, then **Analyse model**. The template
   describes a well-protected system, so no threats appear.
2. Open **Edit model** again, change `encryptionAtRest: true` to `false` on the database, and analyse again.
   A new threat appears: the database is not encrypted at rest.

That is the whole idea: describe, analyse, fix.
