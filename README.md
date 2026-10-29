# Job-Hunter

A job-search workspace with real discovery, persistent accounts, resume review and reviewed application preparation. React + Vite + TypeScript + Tailwind + Framer Motion frontend; Node/Express + SQLite backend. Includes subscription/admin controls and optional local or hosted AI. No paid service is activated.

## Cloud hosting status

The [hosted beta](https://job-hunt-production-c65f.up.railway.app) runs on Railway Free with a persistent SQLite volume. Health and browser smoke checks pass, including database retention across a real redeployment. Email delivery, payments and hosted AI still require configuration and live validation; registration remains closed until email is configured. See [current hosting status](docs/CLOUD-STATUS.md) and [Railway setup](deploy/RAILWAY.md).

## Run locally

Requires Node 24.15+ and npm. This build was checked with Node 24.18.0. Fonts are served locally.

```sh
npm ci
npm run dev
```

`npm ci` installs the locked dependencies. `npm run dev` starts the API on **127.0.0.1:3001** and Vite on **127.0.0.1:5173**. Open the Vite URL, then choose **Start your search**. Create your own account; the first account becomes the local administrator. No demo account is created in the main database.

For a production bundle served locally:

```sh
npm run build
npm start
```

Build checks types and creates frontend `dist/` plus executable backend `build/server/index.mjs`. Start serves both the API and the built frontend at **http://127.0.0.1:3001**. Avoid starting a second API on the same port.

## What works

- Accounts with scrypt password hashes, HTTP-only sessions, sign-out and per-user ownership checks.
- Persistent profiles with several role interests, skills, locations, remote preference, experience, annual salary threshold, currency and company-size interests.
- Real public-feed collection from Arbeitnow, plus configurable Greenhouse, Lever and Ashby company boards. Add any supported company slug in Admin studio. Arbeitnow is the initial connected source; its coverage is primarily European. The source registry is deliberately explicit rather than a claim to cover every employer.
- Deduplicated canonical job URLs, preserved query-based job IDs, source freshness/errors, explained preference matching and unknown salary/headcount labels. Remote is checked against preferred geography; it is not treated as worldwide automatically.
- Daily timezone-aware scheduled searches with persisted daily deduplication and catch-up after a late start. **The server must remain running**; this is not an always-on cloud scheduler. Discovery never submits applications.
- Resume upload/extraction for PDF, DOCX and TXT, up to 5 MB; text versions, editing, deletion and text export. Scanned PDFs require manually pasted text. Uploaded original file bytes are not retained.
- Explained resume writing checks and job-specific skill coverage; proposed changes are optional and support undo. Scores are heuristic writing checks, not an ATS grade or a hiring probability.
- Optional local Ollama wording suggestions. No local model was running during the build; ordinary document checks work without it.
- Application states, preparation notes, saved opportunities, original employer links and manual confirmation of application status. Opening a link never marks an application as submitted.
- Admin settings for product name/accent, discovery enablement, collection caps, AI providers/request limits, company boards, source health, users and run history.
- A downloadable Manifest V3 contact-field autofill assistant, issued/revoked from Settings. It fills only recognized empty native contact fields after a user click. No automatic submissions, file uploads, demographic/authorization/salary answers, custom controls or embedded-frame support.

A successful source refresh retires jobs absent from its bounded response from discovery. Historical tracked jobs remain. Such absence can reflect a feed/page/cap change, not necessarily an employer closing the role. A failed source check retains earlier data and exposes the error. Live listings should always be confirmed on the employer page.

## Membership and AI

Free accounts receive **five successful discovery scans per account, for life**; failed scans return capacity. Pro unlocks AI drafts, schedules and the contact-field assistant. Initial suggested price: **₹299/month**, editable in Admin. Admin also controls global free/paid mode, blocked users and a complimentary user-ID list. Blocking takes precedence. Verified Razorpay subscription payments activate access automatically; client redirects cannot grant membership. Checkout stays disabled without credentials. Price changes affect new subscriptions, and global-free mode requires stopping existing renewals.

Resume writing checks work without AI. For AI drafts, configure an already installed Ollama model or the Gemini server adapter, then enable it in Admin. Gemini requires server credentials, an approved model, a separate hosted-AI opt-in and user consent before sending resume text. Suggestions remain optional and support undo. Daily and concurrency limits bound use. No real model inference, payments or model download occurred during development.

See [production and operations](docs/PRODUCTION.md) for exact configuration, merchant sandbox checks, account verification/recovery, privacy, backups and deployment. This repository is prepared for a single-instance deployment; it is **not yet a verified public production service**.

## Account activity

Admin studio now includes active-user presence, searchable per-user run totals, free-quota usage, AI attempts and dated server/browser histories. A first-party authenticated beacon reports workspace page/idle state; no third-party tracking, resume contents or form answers are collected. Admin can pause presence and configure activity retention. See [tracking scope and API](docs/ACTIVITY.md).

## Application assistant

In **Settings**, download and extract the ZIP. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted folder. Create a connection token in Settings and paste it into the assistant popup. Enter the trusted HTTPS workspace origin in the popup and approve permission for that domain, or use the default local API at 127.0.0.1:3001. Tokens expire after 30 days, are hashed in the database, and can be revoked/replaced. The assistant keeps its token in extension session storage and refreshes your profile before each fill.

The core injected fill behavior is browser-tested on a controlled form. Real employer forms still require human review; custom controls and embedded forms are not claimed as supported.

## Verification

```sh
npm run build
npm run typecheck:server
npm run test:api
npm run test:e2e
npm run format:check
```

Build/typecheck must exit 0. API tests use temporary databases and exercise auth, ownership, persistence/restarts, scheduling, source failures, adapters, resume parsing/edits, local-AI fallback, extension revocation and URL deduplication. Browser tests use installed Google Chrome. Playwright starts the production API/UI on port 3002 with **data/e2e-<runner-pid>.sqlite**, plus preview on 4173; it reuses these test servers if present. The main database is separate. The live discovery test requires internet access and will fail visibly if the public feed fails. The dedicated test account is fixture data in the E2E database only.

## Code map

- `src/components/`: landing/navigation and interactive illustrative hero.
- `src/workspace/Workspace.tsx`: authenticated screens, reusable fields, panels and flows.
- `src/workspace/api.ts`, `colors.ts`, `workspace.css`: API client, accessible accent colors and workspace styling.
- `src/theme.css`, `src/motion.ts`: shared design and motion tokens.
- `server/app.ts`: HTTP routes, accounts, authorization, SQLite persistence and discovery orchestration.
- `server/sources.ts`, `schedule.ts`, `resume.ts`, `ai.ts`: public adapters/matching, daily timing, writing rubric and optional local model.
- `shared/types.ts`, `docs/API-CONTRACT.md`: shared frontend/backend contract.
- `extension/`: reviewable extension source. `public/job-hunter-extension.zip`: installable unpacked bundle.
- `docs/platform-research.md`: live primary-source benchmark, earlier source comparison. `docs/rea-benchmark.md` contains the actual Simplify REA capture and evidence limits.

## Data and deployment boundary

The main database is **data/job-hunter.sqlite** (override with `JOB_HUNTER_DB`). Data and test databases are ignored by Git. Database files use owner-only filesystem permissions; resume text is not encrypted at rest. Use `npm run backup` for a consistent, integrity-checked private snapshot. Restore only while the API is stopped; see the operations guide.

Public deployment requires configured HTTPS, SMTP, explicit owner bootstrap, Razorpay merchant sandbox validation, real model validation if AI is advertised, backups and monitoring. Secure sessions, origin checks, verification/recovery, entitlement enforcement, worker leases and deployment files are implemented and automatically tested. These resources have not been provisioned or billed. [Verification evidence](docs/VERIFICATION.md) distinguishes measured local checks from remaining launch gates.

There is no universal job-coverage guarantee, automated discovery of every company, hiring-outcome guarantee, native PDF/DOCX rewrite preserving original formatting, or universal application submission integration. LinkedIn/Indeed authenticated data was not scraped or bypassed. Extend the supported source registry and form adapters with measured coverage.
