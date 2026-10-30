# Wider discovery

The initial default feed, Arbeitnow, is primarily European. It cannot provide broad Indian or worldwide coverage by itself. Greenhouse, Lever and Ashby boards remain configurable company-by-company.

The optional Google Jobs adapter queries an index across employers and job platforms using the signed-in account’s roles and locations. Indexed entries retain their reported “via” platform and up to ten HTTPS application links. This does not mean direct integration with LinkedIn or Indeed, and it cannot guarantee all openings or that an indexed opening is still available. No authenticated platform data is scraped. No minimum company-size threshold is imposed; unknown sizes remain unknown.

## Private activation

1. The owner must create/verify a genuinely free SerpApi account without a card or upgrade. Official [pricing](https://serpapi.com/pricing) publishes250 free searches/month; verify the actual account before activation.
2. Store `SERPAPI_API_KEY` only in the backend host’s private variables. Set `ENABLE_WEB_DISCOVERY=true` and optionally `WEB_SEARCH_MONTHLY_CAP=200` (clamped1–250), then redeploy.
3. The built-in Google Jobs source is activated once when configured. Later administrator pauses persist across restarts. Keep the existing feeds enabled as fallback.
4. Save at least one role and preferred locations in Search & profile, then run discovery. Open “Connected sources & search coverage” to inspect that account’s actual queries, pages, omissions and failures.

Each run checks the provider’s [free Account API](https://serpapi.com/account-api) and refuses a paid, unknown or inactive plan before issuing searches. The account API requires no paid search credit. No provider key or account response reaches the client. Search calls use the provider’s required server-side API-key parameter; errors discard provider bodies/URLs. Do not enable host HTTP request logging that captures secret query parameters.

## Limits and retention

- Up to six provider searches per discovery run; breadth-first role/location combinations, then up to a second page per query. Extra combinations and remaining pages are reported as limited coverage.
- A shared SQLite monthly budget reserves requests atomically before dispatch; failed attempts conservatively retain their reservation. Provider remaining allowance also bounds each run. Restarting the service does not reset the budget. This limits a shared free beta, not five full-web searches for every free account at unlimited scale.
- Only an account whose scan found a job can see or track it, across both feeds and the web index. Saved historical applications retain access. New accounts start at zero even when the shared source catalogue is populated. Another account’s search cannot remove prior results. Repeated listings update with SQL UPSERT so existing access memberships and applications survive.
- Existing feed/board refreshes report result/page limits. Arbeitnow pages are constructed on its fixed endpoint (max five), never followed to arbitrary returned URLs. Only complete feed responses retire missing jobs; partial failures retain earlier data.
- Indexed dates/salaries stay unknown unless normalized reliably; there is no invented posting date or model-ranked hiring probability. Confirm on the employer/application page before applying.

## Verification status

Local fixture tests cover multiple application platforms, fixed-host pagination, omitted queries, repeated tokens, Free-only guards, private errors, shared budgets and cross-user visibility. Actual provider account activation and a real hosted search remain pending; absent private configuration, the UI explicitly says wider search is not connected. No new provider searches or charges were made during fixture testing.

Provider contract: [Google Jobs API](https://serpapi.com/google-jobs-api). This adapter does not use a language model to invent openings or bypass platform access restrictions.
