# First-party activity and run traceability

Admin studio → **People & activity** shows active accounts, account search, last observed page/time, per-account run totals, free-quota usage and AI request totals. Select an account to inspect activity events or discovery run history; both histories are paginated. Lists refresh every 30 seconds and can be refreshed manually.

## What is measured

The authenticated browser beacon (`POST /api/activity`) sends only random event/tab IDs, event type, an allowlisted workspace page and elapsed idle time. Account identity comes from the server session, not a submitted user ID. Visible workspaces send a heartbeat every 30 seconds, stop reporting active after five minutes without interaction, and report inactivity when hidden or leaving. Missing heartbeats expire after 90 seconds. Multiple tabs are combined per account, so hiding one tab does not override another active tab; ephemeral tab records are capped at 20 per account. This is approximate observed presence: blockers, network failures, throttled background tabs and browser reports affect it. It is not proof of productive work or a security guarantee.

Server operation records include the account, actor, action name, timestamp, HTTP result, resource ID when available, and a generated request ID. The request ID is returned in `X-Request-Id`; manual discovery requests and completion/failure events link to their run. Scheduled runs are labelled separately. Admin access changes identify the actor and affected account. Payment-specific audit records remain in Access & subscriptions.

Discovery totals come from persisted backend run records, including records predating this feature. Completed and partial scans count as successful; failures and running scans are shown separately. Free quota is the independent billing ledger: failed scans return capacity, and premium scans do not consume the five-run free balance. AI attempts come from the backend daily-use ledger and include failed attempts that reached that ledger. A browser beacon cannot increment any of these usage or billing counts.

## Controls and data boundary

Admin can pause browser presence/page-view collection and choose **7–365 days** of activity retention (default 90). Pausing clears observed presence and rejects further collection without breaking product usage. Server operation records remain enabled. Lowering retention removes older activity; usage, billing records and existing run history remain. Pruning runs on reads/writes and hourly maintenance while the worker is running. Historical page activity before this feature is unknown and is not fabricated.

Activity records exclude passwords, authentication tokens, resume text, typed field/form contents, full request URLs/query strings, raw IP addresses, device fingerprints, browsing history and session replay. No third-party pixel, analytics vendor or advertising service is contacted. Workspace Settings and the authentication screen disclose account activity recording. Account export includes up to 10,000 of that account's retained activity entries with the limit explicitly included in the response.

This is an operational history in the application's database, not an immutable external audit system. It covers instrumented Job-Hunter operations and observed workspace pages, not actions on external employer websites. Anonymous visitors are not tracked by this beacon. Existing production launch gates in PRODUCTION.md remain unchanged.

## API

- `POST /api/activity`: session-required, strict allowlisted body, server timestamp, bounded per-account ingestion rate. No arbitrary metadata.
- `GET /api/admin/activity?q=&offset=0&limit=25`: admin-only overview and paginated accounts; maximum 100 rows.
- `GET /api/admin/activity/users/:id?offset=0&limit=25`: admin-only retained events and run history. Events include operations initiated by or affecting the selected account.
- `PATCH /api/admin/activity/settings`: admin-only `{enabled:boolean,retentionDays:number}`. Existing origin, verification and blocked-account guards apply.
