# Generative job answers

The assistant can now pass account-scoped retrieval results to a configured language model and return a prose answer with inline source IDs. Discovery, resume extraction and MiniLM matching are separate operations. Generation does not run another job search and does not submit applications.

## Free public-job connection

Use a dedicated Gemini project with **Free tier and no linked billing account**. The verified Job-Hunt project exposes `gemini-3.5-flash-lite` at15 requests/minute,250K input tokens/minute and500 requests/day as of6 November2026. These account quotas can change. The app's shared daily cap is set to100 attempts, alongside the existing per-account allowance. Requests beyond either cap return source excerpts; the app never upgrades the account or retries with a paid provider.

[Google pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite) and [billing](https://ai.google.dev/gemini-api/docs/billing) describe the free tier. [Unpaid-service data terms](https://ai.google.dev/gemini-api/terms#data-use-unpaid) allow prompts/outputs to be reviewed and used for product improvement and say not to submit personal, confidential or sensitive information. This deployment therefore uses the connection only for public job questions. Resume extraction, review and MiniLM comparisons stay on the app server.

Server variables:

- `AI_GEMINI_API_KEY`: private credential, never a Vite variable or an admin form value.
- `ENABLE_HOSTED_AI=true` and `AI_GEMINI_MODEL=gemini-3.5-flash-lite`: approve the exact model.
- `AI_GEMINI_PUBLIC_JOBS_ONLY=true`: disables hosted resume wording, rejects contact details/common personal-document requests in questions and strips contacts/URLs from outgoing source text. This is not a complete detector of sensitive information; users must keep such information out.
- `RAG_DAILY_SHARED_LIMIT=100`: persistent shared attempt cap (hard application ceiling100). API failures consume an attempt. Provider resets and the app's UTC day may differ; provider429 responses retain retrieval.

In Admin studio choose Gemini, enter the same approved model, set the per-account allowance and enable connected AI features. Existing profile/source/membership controls are retained. In Discover roles choose **Use AI to explain the retrieved jobs**, review the free-tier disclosure, consent for that request and choose **Explain my matches**. Entitlement checks still apply. The server reports public-job RAG availability separately from resume-writing availability.

## Evidence and failure behavior

Only the question and up to6 retrieved snippets are sent, with at most800 characters/snippet and240/title. Account IDs, profile fields, resume content and source URLs are not included in this public-only payload. Retrieval still enforces ownership and profile/source eligibility. No supporting context means no generation call.

The model receives a structured JSON schema restricted to the supplied IDs. Unknown source IDs, unknown inline references, empty/oversized answers and malformed provider responses are rejected. The displayed answer links back to the retained source excerpts. References establish what context was supplied; they do not prove every generated claim. Users should verify dates, salary, eligibility and availability on the employer site.

Generation has2 in-flight requests maximum, a45-second request timeout,100KB response cap and1000 output-token budget. Shared reservations are committed before sending and survive adapter/process restarts. Busy/quota/runtime errors return clearly labelled retrieved evidence instead of a fabricated answer. Missing configuration still reports503; lack of consent or a personal-content guard returns400 before a provider call. Resume/job/application data is never edited by this endpoint.

## Disable or roll back

Set `ENABLE_HOSTED_AI=false` or disable connected AI in Admin; original semantic/extractive retrieval remains. The `rag_daily_usage` table is additive. Do not link billing unless the owner explicitly changes the budget and data-processing plan. Check actual account eligibility/quotas before changing the model. No generation activation is claimed solely because a key variable exists: verify a real hosted cited answer after deployment.

## Operator verification

`npm run verify:rag` runs the built diagnostic with private server environment variables. It requires the verified bootstrap admin and the approved public-only Gemini configuration. It reuses the production ownership/eligibility, lexical retrieval, MiniLM reranking and generation modules, consumes one normal shared/per-account request reservation, and prints only a generated public-job answer with source IDs. `node --max-old-space-size=128 build/server/verify-rag.mjs --unknowns` checks how absent salary/deadline evidence is reported. It creates no session/account and never reads resumes. It needs existing operator access to the service; it is not a public endpoint. Run only with approved free quota; both commands can send a real request. A browser consent/citation test remains useful for verifying the signed-in UI separately.

Live activation correction: the quota page still listed2.5Flash-Lite, and model metadata returned200, but actual generation returned404 saying it is no longer available to new users. Switched to the verified Free3.5Flash-Lite allowance rather than retrying a retired model. Model metadata alone is not proof generation works.

Verification on6 November2026:the actual production-module pipeline returned a generated answer with5 validated citations using3.5Flash-Lite. Exactly3 approved generation attempts were made, including2 retired-model failures. Shared reservation count3 persisted through rollout. Local browser consent/fallback flow and100 API checks passed; the controlled hosted browser login remained unavailable, so hosted browser UI generation was not separately exercised. Citation validity is not a guarantee of every claim's truth.
