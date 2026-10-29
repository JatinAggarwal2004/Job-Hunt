# Job-Hunter benchmark: Simplify, with Teal and Huntr references

Research date: 29 October 2026. This is a bounded product comparison and public runtime observation, not proof of a universally best platform or access to proprietary implementation.

## Decision

**Simplify is the closest product benchmark for Job-Hunter's requested workflow.** Its public product and help pages connect profile, job matching, role-specific materials, application assistance and tracking. Teal is a useful tracker/workflow reference; Huntr is a useful resume-review reference. This judgment concerns feature fit, not a measured ranking of hiring outcomes.

Use those workflow patterns in Job-Hunter's own implementation. Do not integrate Simplify's private APIs, copy its code/assets, or claim we run its AI.

## Runtime investigation contract

- Target: public `https://simplify.jobs/`, its observed `/copilot` navigation link and public `/jobs` listing page.
- Start: isolated REA-owned Chrome profile, no signed-in account or initial storage.
- Declared actions: navigate to homepage; bounded settle; click public Copilot link; bounded settle; navigate to public jobs; bounded settle.
- Expected evidence: rendered URL, DOM, accessibility tree, viewport screenshot and bounded network metadata.
- Failure signals: failed action, auth gate, challenge, missing artifacts or timeout. Stop on auth/challenge; do not bypass or create accounts.
- Stopping condition: public workflow captured, or one corrected retry after a concrete locator failure.
- Excluded: account actions, application submissions, extension installation, authentication/storage values, network bodies, payments and messages.
- Browser lifecycle: each launch owns a temporary profile and must report cleanup.

## REA Evidence ledger

Full unmodified Evidence and exact requests are retained in `docs/rea-simplify/`. The local CLI is rea-agents 6.8.0; installed skill version 53. Runtime uses the existing bundled Node 24.22.1 and existing Google Chrome; no engine/runtime installation or MCP registration change was needed.

| Claim | Evidence | Type / boundary |
| --- | --- | --- |
| Homepage has separate Copilot, tracker and resume-builder navigation, profile-oriented discovery messaging and links to role categories. | `ev_b1161704442b333d6f897f9a2fbf011ef47e386e3749b8c2539b1c7d956877af`, `evidence.json`, `landing-accessibility.json`, `landing.png` | Observed public rendered UI. Messaging is the vendor's claim; it does not prove outcomes or backend behavior. |
| Homepage runtime capture finished without artifact truncation or missing sections; 168 network events retained, none dropped. | Same Evidence, `normalized_result.completeness` and `events` | Observed within a 12.4-second window. Not all website traffic/history. |
| First multi-page workflow stopped on an ambiguous Copilot link: header and footer each matched the role locator. | `ev_da7a8f80d7addb95e05bf7316d8b4c8cc8814a0ad28db602b476b7178b5b5562`, `workflow-evidence.json`, step `open_copilot` | Observed failure; later actions cancelled. Retry narrows CSS to the observed Main navigation link. |

The corrected workflow attempt is retained as `workflow-retry-request.json` / `workflow-retry-evidence.json`. It returned `provider_timeout` at a configured 60,000 ms provider deadline, with partial observation reporting 69 network events and no completed steps. Cleanup explicitly reported `terminated-owned-process`. No further retry was made. Therefore **Copilot navigation and the jobs-listing runtime behavior remain unobserved**; descriptions below come from primary documentation. The timeout result has no Evidence ID and is not represented as successful Evidence. Its reported duration was 184,480 ms, which also shows the provider deadline is not a hard wall-clock guarantee including shutdown.

Reproduce the successful bounded homepage capture from the project directory:

```sh
/Users/jatin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /Users/jatin/.npm/_npx/af752b90495482d7/node_modules/rea-agents/scripts/rea.mjs capture-browser-scenario docs/rea-simplify/request.json --format json > docs/rea-simplify/evidence.json
```

This command replaces the existing output file; choose a new Evidence filename for a new investigation to preserve the record cited above.

## Primary-source comparison

- **Simplify:** public [Copilot page](https://simplify.jobs/copilot) describes profile-backed autofill, job-specific writing and automatic tracking. Its current [paid feature guide](https://help.simplify.jobs/en/help/articles/5623502-whats-included-in-simplify-features-and-pricing) differentiates paid AI tools from core tools. The [credit guide](https://help.simplify.jobs/help/articles/4455305-autopilot-credits-and-failed-applications) says successful submissions consume credits and failed/cancelled attempts do not. These are vendor documentation claims, not tested application execution.
- **Teal:** [Job Tracker](https://www.tealhq.com/tools/job-tracker) presents save → organize → tailor/apply → monitor/follow-up. Useful reference for visible pipeline stages, retained job details and next actions. No authenticated Teal workflow was exercised.
- **Huntr:** [product page](https://huntr.co/) describes role-targeted resume reviews, explanations and individual/bulk accept/reject suggestions, alongside tracking and autofill. Useful reference for user control over resume edits. No authenticated Huntr workflow was exercised.

## Translation into our product

1. Keep one reusable, editable profile; pass the selected job, factual resume and user instructions into generation.
2. Present AI edits as proposals with rationale and accept/reject controls. Never invent employers, degrees or achievements.
3. Keep job matching, resume readiness and application state connected to the same job record.
4. Show the source, freshness and a real coverage boundary. Competitor marketing is not evidence of complete company coverage.
5. Meter the user-approved unit: five **successful discovery scans per account for life**, including scheduled scans; failed scans return capacity. This differs from Simplify's application-submission credit unit and is our explicit product decision.
6. Resolve access on the server: blocked user overrides all access; global free mode, a complimentary user allowlist and verified paid subscription can unlock premium access. Admin price changes must not silently change existing gateway subscriptions.
7. Payment completion must be verified by server signatures and authoritative gateway state. A browser redirect, supplied subscription ID or client premium flag cannot unlock features.
8. Keep automation's true status visible: unsupported application forms require assistance/manual completion; a saved application is not proof of submission.

## Limits and unresolved questions

Public captures establish visible behavior and requested page/network metadata only. They do not establish Simplify's matching algorithm, private API, model provider, source coverage quality, authenticated application flow, billing enforcement or production architecture. No benchmark of hiring success or accuracy was performed. Job-Hunter's code and tests must establish its own guarantees.
