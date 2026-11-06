# Generative RAG activation — 6 November 2026

## WHAT
Turn scoped lexical/MiniLM job retrieval into a conversational answer with verified source IDs. Activate a verified Gemini Free project only after action-time credential approval. Preserve ₹0, account isolation and existing resume scoring; do not send resumes through the free provider.

## Decision — 3 Lens
Contrarian: keep extractive search if privacy or free eligibility is uncertain. A local generative LLM competes with MiniLM and parsing within the existing512MB host and lacks demonstrated answer quality. First Principles: existing retrieval and Gemini adapter already implement most of the pipeline; finish the missing provider activation and evidence/failure UX. Executor: an isolated Gemini project without billing avoids another host/card/paid token balance. A dedicated key prevents sharing Finance or other project quotas.
Chosen: Gemini Free public-job generation, model selected from currently published free pricing and actual account quota. No billing account/card. Rejected local large LLM for memory/quality risk; rejected paid APIs due explicit₹0 rule. Confidence medium pending actual quota and cited-answer check. Kill criteria: no Free project, billing/card requirement, unusable citations, private-content transmission or repeated provider errors. Fallback remains semantic source excerpts. Reversible: disable hosted AI/private environment flag and keep retrieval.

## HOW
Reuse grounded generation with a structured schema and source ID validation. Cap context to6 excerpts,800characters each; reject contact details in questions; strip contacts/URLs from public-source payload. Free public-only mode explicitly disables Gemini resume wording and distinguishes RAG availability from resume-model availability. A shared persistent daily reservation joins per-account caps and bounded concurrency. UI explains free-tier data use, asks per-request consent, and retains retrieved evidence on provider failure. No new application dependencies.
Architect rejects sending resumes after a generic consent checkbox because the free provider's terms say not to submit personal/sensitive content. User Advocate requires conversational answers labelled separately from fallback excerpts, inline source IDs and a visible no-personal-data note. Contrarian requires empty evidence produce no provider call and malformed/unknown references fail closed. PLAN GREEN FLAG: implement independently of pending external key approval; external activation remains gated.

## CHECKS
|#|Check|Verification|Result|
|---|---|---|---|
|1|Build/run|npm run check client/server/types/format/API suite|PENDING|
|2|Normal|Actual cited answer from retrieved public job evidence; mock structural tests|PENDING|
|3|Edges|Empty/foreign/unknown citations, no context, malformed output, safety block|PENDING|
|4|Errors|Quota/provider failures retain labelled source excerpts|PENDING|
|5|Security|Key never in files/client/logs; account ownership, explicit consent, public-only resume block|PENDING|
|6|Bounded cost/complexity|Verified project Free/no billing; shared/day and per-account caps,6 excerpts, output/body/timeout bounds|PENDING|
|7|Readability|Dedicated budget/privacy/generation modules; current UI components reused|PENDING|
|8|User advocate|CUA consent → generated answer → cited source; privacy copy; fallback|PENDING|
|9|Regression|Existing resume/MiniLM, account, membership and discovery tests pass; no new discovery scans|PENDING|
|10|Rollback|Hosted flag off keeps original retrieval; additive usage table; existing profile unchanged|PENDING|

## Local pre-deployment evidence
`npm run check`:99/99 API checks, both builds/types/format pass. `npm audit --omit=dev`:0. CUA isolated3009: generation checkbox reveals free-tier disclosure; submit remains disabled until per-request consent; generated fixture answer shows[S1]; simulated provider429 returns labelled source excerpts. No live provider called by fixture. New tests cover private-question rejection, contact/URL stripping, schema source enum, unknown inline/unsent IDs, shared caps across accounts/instances, empty context no-call, free-mode hosted-resume block, actual authenticated generated route/foreign404/fallback.
Actual AI Studio Free project verified; gemini-2.5-flash-lite quota10RPM/250KTPM/20RPD, appcap18. Owner approved project/key/privateRailway transfer/up to3 public-question tests. First unused key revoked/replaced after redaction miss, replacement never printed and staged privately; no billing/card linked. Five config changes staged, not applied yet. Local activation preparation GREEN; actual production answer and final gate remain pending after deploy.

Activation verification extension: browser session remains signed out after reported login (likely another browser). Host console legitimately confirms private flags and enabled only aiEnabled/provider/model, preserving other settings. Add a reproducible operator-only probe compiled with the server: uses the same retrieval, eligibility, semantic and generation modules against the verified bootstrap owner's public-job context; creates no sessions/accounts and never reads resumes. Uses existing SSH authorization, shared request reservations, fixed public questions and≤3approved live calls. Rejects wrong/free-private config or non-verified/non-admin owner. No HTTP authentication bypass. This permits actual pipeline verification while the browser login handoff remains pending. PLAN GREEN for this limited diagnostic; rerun full checks and actual output before claiming live RAG.

Operator probe local verification: full npm run check99/99 re-passed, including strict type-checking for scripts/**/*.ts; build emits verify-rag.mjs. Running without approved config exits1 before database/provider access. The probe drops root to runtime UID1000, requires verified bootstrap admin and exact approved Gemini/public-only settings, never creates sessions, and consumes the same shared/per-account reservation as the app. Actual live calls remain0 before deployment of probe.

Live round1/2: first actual pipeline503; credential metadata200. A diagnostic second approved generation showed404 NOT_FOUND:2.5Flash-Lite unavailable to new users despite quota-list entry. Replacement3.5Flash-Lite has actual Free15RPM/250KTPM/500RPD and published free text pricing; switch exactapproved model to3.5 and sharedcap100 (hard app ceiling, below500 quota), without billing/newkey. Two approved generation attempts used, one remains. No success claimed yet; re-run full table after correction.

3.5 compatibility review: actual model metadata returns200 and supports generateContent. Official current structured-output guide documents generationConfig.responseFormat.text with APPLICATION_JSON/schema; updated from legacy responseJsonSchema and removed deprecated hosted temperature (3.5 ignores it). Lite's default minimal thinking retained. Unit assertions cover new REST schema, allowed citation enum and absence of deprecated temperature. Re-run complete99 checks before deploying; only third approved generation will be attempted afterward.
