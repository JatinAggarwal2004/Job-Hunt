# Job-Hunter verification — 29 October 2026

## Current implementation

- `npm run check`: passed. Frontend and backend types/build, executable backend bundle, formatting, and **42 API tests** passed.
- `npm run test:e2e`: **8 Chrome browser tests passed in 41.2 seconds**, using one worker for the final run. Real running bundled API, isolated QA databases, live public discovery and actual document fixtures; no QA accounts inserted into the main installation.
- Browser coverage: landing/reduced motion/storage failure; profile → live discovery → tracker → resume → admin → assistant; mobile screens including Membership/Admin in both themes; admin price confirmation, complimentary access, blocking/unblocking an existing signed-in user, global free mode; assistant domain-permission and invalid-origin handling with a mocked Chrome API. No horizontal overflow/axe WCAG A/AA findings in tested workspace states at 375px, with overview additionally checked at 820/1440px.
- Backend coverage: auth and ownership, restart persistence/scheduling, source failures/adapters, text extraction and optional edits; transactional five-successful-scan limit and failed/restart refunds; blocked precedence, admin authorization and existing extension-token checks; signed/deduplicated raw Razorpay events, authoritative captured-payment matching, refund/out-of-order/cancel/price/free-mode behavior; checkout interruption and block/cancel races; secure production configuration, explicit admin bootstrap, email verification/password recovery/session revocation; Gemini consent/configuration/limits and validated drafts; worker lease ownership/handover.
- Document isolation: **8 of the 42 API tests** exercise real PDF/DOCX/TXT extraction, malformed inputs, concurrency, empty/scanned content, external-link non-fetching, inflated ZIP limits and PDF page limits. Worker limits do not constitute an OS sandbox.
- Payments: **17 of the 42 API tests** use provider fixtures, including cancellation confirmation and concurrent blocking. No merchant API calls, transactions, real invoices or live webhook deliveries occurred. No client redirect grants access.
- AI: controlled provider responses exercise the real request adapter and draft validator. **No real Ollama/Gemini inference occurred.** Neither a model nor credentials is configured here.
- `npm audit --omit=dev`: **0 vulnerabilities reported**. Pattern scan of source/shared/extension/deployment/sample config found no real-key/private-key patterns. Fixture credentials are deliberately fictional.
- `JOB_HUNTER_DB=data/e2e.sqlite npm run backup`: created a private snapshot and passed SQLite integrity verification. `npm run verify:deployment` returned local health/readiness 200, while reporting paymentsConfigured false and aiEnabled false.
- Extension ZIP regenerated from all six reviewable source files, including explicit HTTPS workspace-domain permission. Controlled form fill is tested; real Chrome extension installation/public-domain permissions/employer ATS flows still require manual smoke testing.
- Actual Simplify REA homepage capture succeeded: complete DOM/accessibility/screenshot with 168 network metadata events. Deeper navigation retry timed out and is retained as a failure, with owned-browser cleanup confirmed. See `docs/rea-benchmark.md` and unmodified Evidence under `docs/rea-simplify/`.

Earlier desktop Lighthouse scores (99 performance/100 accessibility/96 best practices/100 SEO for signup) predate the monetization screens; they are not measurements of every current page. The current frontend retains lazy workspace loading and local fonts. No new Lighthouse score is claimed.

## Launch checks still unverified

Real merchant sandbox capture/renewal/refund/cancellation/webhook delivery; SMTP delivery on the public domain; configured-model quality/latency and provider spending limits; HTTPS deployment/session/account-isolation checks; monitoring and off-host backup/restore drill. Docker daemon was unavailable, so the supplied Docker/Caddy recipe was not executed. No public hosting or billable resources were provisioned. These are explicit launch gates, not completed production certification.

## Final rerun

Monetization baseline browser rerun: **7/7 passed in 26.9 seconds**. Current API/build/format checks: **42/42 passed**. Rebuilt local server restarted; health/readiness both 200, with payment/AI activation explicitly false.

## Activity tracking checks

Three new API checks exercise strict session-owned ingestion, admin/blocked-account guards, deduplication, authoritative counts and no beacon-driven usage inflation; run/request linkage and content exclusion; missed/hidden/idle and multiple-tab presence; retention/pause boundaries and preserved run history. Admin access events identify actor and affected user. Final build/type/format and API rerun: 42/42 passed. Browser check verifies a unique signed-in account’s real beacon, actual scan totals/history and request ID, simulated six-minute inactivity, and admin pause/retention controls. Anonymous visitor tracking and external employer activity are outside this feature.

Browser stability note: an eight-test run passed in34.1s, but other full runs encountered intermittent stalls in loading/axe/billing checks while the dedicated activity flow passed. Final single-worker rerun is recorded separately; do not treat a prior successful run as proof that these stalls never occur.

Final activity build verification: npm run check passed with42/42 API tests. `/usr/bin/caffeinate -i npm run test:e2e` passed **8/8 in41.2s** with a single worker. The bounded wake lock ended with the test command. This successful rerun does not establish the cause of prior intermittent stalls; the suite now uses one worker to reduce contention. No change to production activation gates.


## Hosted beta verification — 30 October 2026

- `npm run check`:50 API tests passed, build/types/format passed. New checks cover Railway's production-mode requirement, absent/outside/symlink-escaped volumes, local file restart persistence and Brevo HTTPS verification/failure handling. Brevo responses are simulated; no real mail was sent.
- Actual Railway Free account activated without a card; real Docker deployment logs show `/app/data` volume mounted and runtime UID1000. A marker written through the running-container console survived a replacement container (399bfae6 →6d19e61b); SQLite `PRAGMA quick_check` returned `ok`. No user/resume data was uploaded to perform this check.
- Public `/` and `/app`:200 HTML; `/api/health`:200; `/api/admin` and `/api/profile` unauthenticated:401; production registration without email:503 before any account creation. `/api/ready`:503 with `email_delivery` and `payment_gateway`, honestly reflecting missing integrations.
- Real browser rendered the public landing and workspace sign-in screen; theme toggled both ways and workflow preview switched to Refine. Existing local8-test browser baseline is unchanged; no new claim of a full authenticated hosted end-to-end pass.
- The earlier statement that no public resources were provisioned describes the29 October checkpoint. The beta is now provisioned at https://job-hunt-production-c65f.up.railway.app; mail/payment/AI, full authenticated hosted flows and off-host restore remain launch gates.

- Follow-up email activation: user approved a restricted Brevo key (only Transactional email, three-month expiry) and private Railway storage. No key value was printed, saved to a local file or committed. Brevo logs show **Delivered** for both `Verify your Job-Hunter email` and `Reset your Job-Hunter password`. Owner-created account is verified and the actual public Admin studio loads. Password replacement was not performed; the owner chose their own credentials.
- After email configuration, public readiness503 reports only `payment_gateway`; health remains200. Mail is no longer missing. Earlier registration503 observations describe the safe pre-configuration gate, not the now-open signup state. Payment/hosted AI activation and a complete authenticated user-flow suite remain separate launch gates.

## Wider discovery — 30 October 2026

`npm run check`: build, server/client types, formatting and **58 API checks passed**. Eight new checks exercise indexed multi-platform links, breadth-first pagination, omitted queries, repeated tokens, provider errors, Free-only guards, atomic/persistent shared budgets, partial feed pages and cross-account search/tracker access.

CUA isolated browser preview on3003 verified saved role/location query, page/result counts, platform provenance and employer/LinkedIn application links against explicitly labelled illustrative fixtures. No live provider result is claimed. Real public Arbeitnow check returned300 jobs and status limited at the configured cap. Changed-source secret-pattern scan and `git diff --check` passed.

Google Jobs adapter remains **inactive on the hosted beta** until owner Free account and private credential activation are verified. No new provider account/key/search or paid resources were provisioned by this change.

## Personal discovery and profile controls — 31 October 2026

`npm run check`: client/server builds and types, formatting and **62 API tests pass**. New checks reproduce a populated shared catalogue followed by a fresh account: personal list/bootstrap remain0; foreign job reads/tracking return404. Own scans populate only that account; tracked historical jobs retain access. Multi-location/experience profiles round-trip, legacy experience strings remain accepted, multiple levels use OR eligibility, unknown seniority stays reviewable, city aliases are checked.

CUA isolated account on3004 started at0 despite another account’s scan. Selected2 roles,2 suggested skills,3 Indian locations and2 experience levels; saved and reloaded successfully. Custom role Enter/add and Escape/close verified. Help explained annual salary and dismissed with Escape. Responsive390px check caught a tooltip clipping defect, corrected to an inset mobile tooltip. Fixtures are labelled illustrative; no QA accounts or preferences were written to the hosted owner’s data. Existing E2E source updated for the new controls; full CLI browser suite is not claimed rerun this slice.

Two explicitly requested REA agents produced [Tsenta](rea-tsenta/findings.md) and [Jobright](rea-jobright/findings.md) reports from actual shipped frontend artifacts and public UI. Neither recovers private backend code or establishes exhaustive ingestion/application success. No paid operations, new credentials or competitor accounts.

Migration: existing web-result memberships are retained. Previously global feed records are not retroactively attributed to accounts; an existing user may need a fresh scan to populate personal discovery. Saved applications remain accessible. Google Jobs provider activation remains pending.

## Live web index and independent backend guidance — 31 October2026

Owner approved existing SerpApi key transfer solely to Railway private `SERPAPI_API_KEY`, web opt-in/200monthly cap, and up to6Free test searches. Actual account Active/Free/$0/250verified. Private settings deploymentc44a382f ACTIVE. One hosted account scan sent “Software Engineer jobs in India”; web coverage reports2pages,17normalized indexed listings, bounded/limited coverage. Provider dashboard now248remaining:2Free searches used, no paid activation. Real employer/Cargill, BuiltIn, LinkedIn andBeBee links were observed in a normalized job modal. Opening/validity/submission with those employers was not tested.

A live result exposed 4–8years title and a Qualifications6plusyears description being treated unknown under Internship. Added explicit title-year and nearby qualifications/minimum-experience checks, with regression controls excluding unrelated “company founded6years ago” text. Unknown experience remains advisory.

Authenticated strict `/profile/guidance` now supplies curated role-based skill examples and readiness steps without a model/provider call or persisting draft data. Frontend consumes guidance with a debounced request and discards stale responses; offline rules remain fallback. CUA isolated browser confirmed missing-role/location/source guidance. Final `npm run check`:65APIchecks, build/types/format pass. This implements independent workflow patterns informed by public REA findings; it does not reuse private competitor backend code or establish full feature parity.

Hosted verification:89f4309 ACTIVEf624da41, health200, actual server guidance visible, owner session/profile/Indiaresults retained. Numeric/qualification experience checks reduced6stored matches to4without another search. Paused invalid GoogleGreenhouseboard afterconfirming sluggoogle/HTTP404; source update confirmed2enabled/3configured. No applications submitted or payment/model calls.
