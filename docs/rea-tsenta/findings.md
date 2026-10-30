# Tsenta public-surface investigation

Investigated 31 October 2026. Scope: publicly accessible `tsenta.com` landing/job pages and JavaScript actually shipped to the browser. No account created, authentication bypassed, application submitted, paid service invoked, or private backend obtained. REA skill and JavaScript/runtime guides were followed using the existing REA 6.8.0 CLI; the installed skill alone does not expose an MCP server.

## What the evidence supports

| Question | Finding | Evidence / confidence |
|---|---|---|
| Frontend search | Public Jobs page has title/company search, location input, grouped experience/work-mode/employment/date/sponsorship controls and pagination. | [Live public search](https://tsenta.com/jobs); actual CUA DOM and screenshot retained privately. Observed UI. |
| Multiple experience choices | Shipped `JobFilters` code parses `jobType` into an array from comma-separated URL values. Toggle removes an existing item or appends a new one and resets pagination. Workplace and employment filters follow the same pattern. | Jobs REA Evidence below, `25idxk-93ogv-.js`. Static observation, not proof that all choices produce correct server results. |
| Location suggestions | Component combines city/state/country lists; case-insensitive substring filtering yields up to eight suggestions. Selection becomes a removable chip. Its `activeLocation` is singular: this public component does **not** establish multiple selected locations. | Same Jobs chunk. Static observation. |
| India listings | Public search renders Hyderabad, Karnataka and Chandigarh records. One directly opened detail has Bengaluru, Remote (India), and INR450,000–600,000 annual salary. | [Specific public role](https://tsenta.com/jobs/weekday-ai-yc-w21-product-support-specialist-l0-f7f19149-05fd-4e75-800b-7c2057e7f73a). Listing presence observed; current employer vacancy and successful submission not verified. |
| Data quality | That detail labels the role Entry Level at the top but Experience Not Specified in its sidebar. A visible classification should therefore retain its source/confidence. | Same public role. Observed contradiction. |
| Public API boundary | REA recovers an exact `fetch` target `https://api.autojobs.me/api/v1/public/pricing` from a landing chunk. An affiliate tracking endpoint expression is also present; it was not invoked by this investigation. | Landing REA Evidence; endpoint existence in shipped syntax only. This reveals no backend source or discovery algorithm. |
| Authenticated onboarding / dashboard | Dashboard navigation timed out; independent page fetch showed only Loading. Help destination was unavailable through the research tool. | Bounded observed blockers. No conclusions about hidden onboarding fields or authenticated recommendations. |
| Working filter results | In this browser session, typing India and activating the visible filters/search did not produce a confirmed changed result set or URL. | CUA observation; interaction success is unresolved. Do not present static filter intent as verified end-to-end behavior. |

## Product behavior advertised, not runtime verified

The [landing page](https://tsenta.com/) presents discovery, document preparation, submission and tracking as one pipeline. Its dashboard illustration contains literal sample application rows in the downloaded bundle, so those displayed totals are demonstrations. It describes reviewable document changes and application receipts. Large monitoring/ATS coverage claims were not independently measured.

The [AI disclosure](https://tsenta.com/ai-disclosure) describes resume-aware scoring, answer drafting, form recognition, optional reply routing and multiple supported ATS families. These are vendor declarations. We did not observe the cloud submission worker, model, matching weights, supported-employer success rate, queue infrastructure, storage schema, or any private server implementation.

## REA provenance and limits

Private artifacts live under ignored `artifacts/rea-tsenta/`; do not publish downloaded vendor code or raw captures.

- Landing analysis: `ev_21e321002f584965773a0710d5ca5ae32072132619a387cb5674933272d7a28a`. Three selected feature-bearing scripts parsed; 11 inventoried files outside scope. AST parsed without failures, but semantic analysis reached a deliberately bounded 4,000-node per-file ceiling for one script. Application and semantic coverage are partial.
- Jobs analysis: `ev_3e538bc607f65690ce783a0c2af65239e761adcb90c728d4fa89eceb3be46991`. Two selected scripts, 20,199 bytes, 5,781 visited AST nodes, zero parse failures. Other scripts and dynamic/server behavior remain unexamined; semantic coverage remains partial.
- Pricing endpoint node: `jag_node_17cc374562ff5e55760abc1f3d34825301fa8ff5f80a0152e6ede96f98f87596`; source `1_4pt9whn1vgk.js`, line 1 columns 21,755–21,837; source SHA-256 `b278ac7f3cc80f0caeec333b9dcf6c73e07806bf014ec45ee3133fd4d32b3772`.
- Raw `manifest.json` records downloaded script URLs, sizes and hashes. `static-evidence.json` and `jobs-static-evidence.json` preserve complete REA records. `jobs-dom.txt` and `jobs.png` preserve actual public browser state. The separate `jobs.html` download was truncated on timeout and must not be treated as a complete capture.
- Static analysis parsed inert text; it did not execute scripts or establish server behavior. No REA runtime capture was requested because CUA owned browser interaction and no suitable CDP endpoint was supplied.

## Feasible lessons for Job-Hunter (our design recommendations)

1. Keep the public catalogue separate from each account's discovered opportunities. An empty new account should show a setup/search action, not another user's cached total. Persist account-to-job membership and show the source/run that produced it.
2. Store roles, skills, locations and experience choices as arrays. Searchable suggestion popovers with removable chips should support keyboard navigation and custom entries. Unlike the observed singular Tsenta location component, accept several places concurrently.
3. Use role-dependent suggested skills and adjacent roles as optional additions. Never infer that selecting Software Engineer proves Java competence or silently edits a user's background. Explain that suggestions are examples.
4. Treat India as geography and eligibility, not a decorative switch: normalize Bengaluru/Bangalore and Gurugram/Gurgaon, distinguish Remote India from worldwide, preserve INR salary period, and retain unknown salary/experience explicitly.
5. Build discovery as bounded connectors → normalized source records → URL-aware deduplication → eligibility/ranking → account-owned matches. Store fetch time, employer URL, provider/platform, coverage failures and freshness separately. A large catalogue count cannot prove exhaustive coverage.
6. Keep preparation and submission states explicit: draft, awaiting review, queued, processing, needs user, confirmed, failed. Mark submission successful only from employer confirmation; retain a receipt and idempotency key. Our current reviewed autofill does not become a verified cloud auto-apply service merely by copying this interface.
7. Add concise help buttons accessible by hover, focus and tap. Explain salary periods, remote-country restrictions, unknown attributes and matching rules next to the decision.

These are independently implementable architecture choices, not recovered Tsenta backend code. The unresolved authenticated flows and private backend prevent a full-system reconstruction claim.
