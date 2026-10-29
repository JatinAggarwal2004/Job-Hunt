# Job-Hunter deployment and operations

Prepared for a single persistent Node 24 instance behind HTTPS. This is a deployment recipe, not evidence that a public service, merchant account or real model has been activated. No billable service was used during implementation.

## Required before opening registration

1. Choose a domain and host with persistent storage. Configure `APP_ORIGIN=https://your-domain.example`, `NODE_ENV=production`, `BOOTSTRAP_ADMIN_EMAIL=your-owned-address`, and authenticated SMTP in a private `.env.production`. Set `APP_DOMAIN` and `TLS_CONTACT_EMAIL` for Caddy. Keep `HOST=0.0.0.0` and `TRUST_PROXY=1` only behind the included single trusted proxy. Do not expose port 3001 publicly.
2. Start from a fresh production database, not a QA database. If moving an existing local database, audit its existing administrator roles first: migrations preserve accounts and privileges. Production registration only assigns new administrator ownership to `BOOTSTRAP_ADMIN_EMAIL`; that address must verify before using admin features.
3. Run `npm ci && npm run build`, then `npm start` with the environment loaded. Alternatively use `docker compose --env-file .env.production -f deploy/compose.yml up --build -d`. The compose recipe loads private `.env.production` for both containers and mounts persistent data and backup volumes. One app replica only. Docker execution was not verified here because the Docker daemon was unavailable.
4. Register the owner account and confirm actual delivery of verification and recovery emails. Verify HTTPS, Secure/HttpOnly/SameSite cookies, sign-in/out, reset-link expiry and access isolation from a second account on the public domain.
5. Configure payment test mode and AI as below. `npm run verify:deployment` checks health/readiness at `APP_ORIGIN`; both must return 200. Readiness checks configuration/build availability, not actual SMTP delivery, Razorpay credentials, domain reachability from providers or AI quality. A real end-to-end pass remains required.

Caddy handles TLS and compression. Access logging is disabled so reset/verification query tokens are not recorded by this proxy. Check any upstream CDN/host logs for the same protection. Helmet adds CSP, frame protection and HSTS in production. Do not put secrets in frontend Vite variables, source, support messages or logs.

## Razorpay subscriptions

Initial suggested price is **₹299/month**, editable in **Admin studio → Access & subscriptions**. It is a product starting point, not a market-validated optimal price. Free accounts receive five successful discovery scans for life; failed scans release their reservation. Partial runs with at least one successful source count. Paid, complimentary and globally free accounts unlock scheduled discovery, AI drafts and the assistant. Actual AI/source availability still depends on server configuration.

Use Razorpay **test** keys first: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and a separate `RAZORPAY_WEBHOOK_SECRET`. Configure the dashboard webhook to `https://your-domain.example/api/billing/webhook`. Subscribe to subscription lifecycle events (authenticated, activated, charged, pending, halted, paused, resumed, cancelled, completed), captured-payment and refund events. The handler verifies the exact raw-body signature and event ID; known subscriptions are reconciled against Razorpay before any grant. Set a webhook alert/retry policy in the merchant dashboard.

A browser checkout redirect never activates membership. Access requires a captured payment matching the stored subscription, original plan, amount and INR currency. Existing billing agreements keep their agreed price when Admin changes new-subscription pricing. Renewals extend the verified paid period. Cancellation stops future renewal while preserving that period; a reconciled refund revokes its grant. Owner cancellation remains reachable even after blocking. Global-free mode requires confirmed cancellation of active renewals before switching; prior payments are not automatically refunded.

Before enabling live keys, test a new subscription, activation/capture, renewal, failed payment, duplicate/out-of-order webhook, refund, cancellation, block with renewal cancellation, and switching to global free. Provider-mocked automated checks pass; actual merchant sandbox delivery and payment lifecycle have **not** been exercised. Live requests additionally require `ALLOW_LIVE_PAYMENTS=true`. This flag can incur real charges: only enable after the merchant account, pricing/tax/refund policies and lifecycle checks are ready.

If checkout is interrupted while a subscription may have been created, a durable pending marker blocks duplicate creation. Reconcile the merchant dashboard using its `notes.user_id`, confirm/cancel the orphan subscription, then perform a reviewed support repair of the pending marker. Do not simply clear it and issue another subscription. Audit rows retain cancellation failures; retry explicitly rather than assuming blocking stopped billing.

## AI configuration

Rules-based resume review works without a model and is labelled as a writing checklist, never an ATS/hiring prediction. AI is a separately requested draft, not an automatic edit.

- **Ollama:** run an already installed licensed model on the same server. Choose Ollama and its exact model in Admin, then enable AI. The service uses loopback port 11434; the supplied containers do not provision Ollama. No models are downloaded automatically.
- **Gemini:** configure server-only `AI_GEMINI_API_KEY`, an approved exact `AI_GEMINI_MODEL`, and `ENABLE_HOSTED_AI=true`. Select Gemini and the same model name in Admin, enable AI and set the per-account daily request cap. Resume studio requires explicit consent before text/job requirements are sent to Google. Review provider retention, pricing and terms before activation. Configured status is not a real inference test. No real Gemini request was made during development.

A user can run one draft at a time, with two globally; daily attempts are recorded persistently (default 20/account/day UTC). Failed attempts also count to bound abuse/cost. Set model-provider project spending quotas independently; application caps are not a total spending guarantee. Drafts must reference a unique exact resume excerpt and pass length/schema checks. Users must verify facts before accepting. Automated checks use injected responses; real quality/latency needs a configured-model pass.

## Admin operations

Find users by ID, email or name. Complimentary membership is keyed by exact account ID and audited. Blocking overrides subscriptions, complimentary grants and global-free mode on existing sessions and extension tokens; the last active admin is protected. Blocking alone does not stop billing—select renewal cancellation and verify its result. Existing users can export data and manage cancellation while restricted.

One worker owns the database via a renewable lease. A crash can delay restart for up to 90 seconds until the lease expires; never force-clear a live lease. Scheduled scans persist local-day deduplication and catch up after restart. The host must stay running. This architecture is deliberately one replica; horizontal scaling requires a shared database, distributed queue/locks and durable rate-limit storage.

## Data, backup and recovery

The database contains personal information and resume text in plaintext. Original uploaded document bytes are discarded. Use encrypted host storage, restricted host access, private encrypted off-host backups and a written retention policy before public use. File modes alone do not provide encryption. Resume parsing uses bounded worker threads (5 MB input, 15-second deadline, PDF/ZIP limits); V8 heap limits are not an operating-system sandbox. The supplied container adds a total memory limit; retain that boundary.

`npm run backup` creates a consistent SQLite snapshot using `VACUUM INTO`, chmods it to 0600, and checks integrity. Schedule backups using your hosting operations; none was scheduled by this build. Back up before every update. To restore: stop the app cleanly; preserve the current DB privately; replace it with the verified snapshot; remove old WAL/SHM files only while no instance is running; restore correct ownership/0600 permissions; restart after any prior worker lease expires; run health/readiness and an account-isolation smoke test. Restoring a snapshot can roll back billing records, so reconcile active subscriptions with Razorpay before opening access.

Add host alerts for health failures, disk capacity, backup age, process restarts and Razorpay webhook delivery failures. Keep a rollback artifact plus its compatible database backup. Updates apply additive table/column migrations at startup; no destructive down-migration is provided.

## Coverage boundary

Discovery checks explicitly connected public sources: Arbeitnow, Greenhouse, Lever and Ashby company boards. No system can substantiate a guarantee to miss no company. Source errors, unknown salaries and freshness are visible. The assistant fills supported empty contact fields after a click; it never submits applications, uploads resumes, or answers legal/demographic questions. External forms and hiring decisions require user review.
