# Resume-first job workspace

The workspace starts with an optional resume upload, reviewed extraction, then roles and locations. Existing profiles and saved onboarding drafts remain. PDF/DOCX/TXT text is parsed locally. Only checked fields are copied after **Use selected details**; the account sign-in email is never replaced. Extraction detects explicit text, not implied qualifications or complete employment timelines. Scanned image-only PDFs may need a text-based version.

## Retrieval and AI

Discovery still uses the configured public feeds, company boards, careers-page adapters and the approved Google Jobs index. Searches use the user's chosen roles and places; coverage and failures remain visible. No system can enumerate every employer on the web. Provider request/page budgets remain in force.

Descriptions enter a local SQLite FTS5 index, never resumes or contact details. Queries can retrieve only jobs discovered or tracked by that account, with current source/profile eligibility. BM25 retrieves a bounded candidate set (200 SQL rows, up to31 excerpts); local MiniLM re-ranks those excerpts and returns up to6 supporting passages, at most2 per job. Relatedness below0.18 is omitted; that heuristic cutoff is not a relevance guarantee. References link to the actual employer/board URL. An empty search stays empty.

The assistant labels its default answer **Semantic source matches** or **Source excerpts**. This is extractive retrieval, not free-form generated reasoning. Optional Gemini/Ollama generation is separately gated by existing admin settings, credentials, daily budget and explicit hosted consent. No hosted generative model was activated by this release.

### Open-source semantic model

- Model: [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2), ONNX conversion of [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2).
- License: Apache-2.0. Pinned revision `751bff37182d3f1213fa05d7196b954e230abad9`; model files retain their published attribution. Runtime `@huggingface/transformers`4.3.2.
- 384-dimensional English sentence embeddings, quantized q8 CPU inference. This is an existing general semantic model, not a newly trained hiring model or an applicant dataset.
- First use downloads approximately23MB of public model files from Hugging Face; resume/query text is processed in a local worker and is not sent there. Cache is `models/` beside the database, `/app/data/models` on Railway.
- One worker/request at a time,32 texts per batch,4,000 characters/text,90-second timeout,60-second idle eviction. Worker JS heap96MB; native ONNX memory is additional.5,000 account-scoped hashed vector cache entries; no document text is stored in that table. The existing database still stores owned resume text.
- Production defaults enabled; set `ENABLE_SEMANTIC_MODEL=false` to disable. Development requires explicit `true`. Errors/busy/timeouts fall back to labelled evidence-only results. No paid API key is required.
- Local real-weight proof: `npm run verify:semantic` (downloads public weights if not cached). The proof compares synthetic related backend and unrelated marketing text and exits nonzero if the related pair does not rank higher. `MODEL_CACHE_DIR` can choose a cache folder. The script requires dev dependencies; it is a manual integration check, not a hidden network test in CI.

## Per-job resume review

Open a job → **Resume fit** → select up to5 of your own uploaded versions → **Compare selected resumes**. Reviews never modify a resume. Evidence includes job/resume quotes, missing vocabulary, relevant passages and optional semantic evidence. The highest score is relative only to those selected versions for that job. Other users' resumes and private applicant data are never fetched.

The rubric scores supported job-skill mentions (50), document term evidence (35), familiar section labels (15), plus semantic relatedness (25 when available), normalized over assessed dimensions. Unknown skill vocabulary is unassessed. Semantic inference chooses up to4 requirement/title-focused job windows and4 lexically relevant windows per resume from the first30,000 characters; it does not inspect unlimited text. Identical claims repeated do not add keyword credit. A mention does not demonstrate proficiency; scores are heuristic document-review aids, not ATS outcomes, candidate percentiles or hiring probabilities. Work authorization, timelines, employer preferences and interviews need human review. English embeddings may be weaker for other languages.

## All matches and deadlines

All eligible matches are reachable with Previous/Next,36 cards per page. The API supports1–200 per page plus offset/total/nextOffset. The previous100-display ceiling is removed; collection budgets and source completeness are separate. Text, exclusions, remote, tracked, source and deadline filters apply before pagination.

Employer `validThrough`/explicit deadline fields are retained when parseable. Missing or relative dates are not invented. Saving a job with an exact future timestamp creates an in-app reminder24 hours before it; date-only expiry needs a user-confirmed closing time/timezone. A user can also enter a deadline manually in the job's **Deadline** tab.

Email is off by default and requires configured mail plus a verified sign-in address. The existing worker processes5 due alerts per tick, at most3 send attempts and100 shared alert-mail attempts/day, separate from account recovery emails. Failed email retains the in-app alert. Blocked users cannot receive reminder mail. Queue state persists across restarts; retries can duplicate an email if the provider accepted it immediately before a crash. Free-host suspension/sleep can delay mail, and expired deadlines are not emailed. Confirm dates on the employer page; this is not a guaranteed delivery service.

## Operations and rollback

`npm run check` builds both applications, checks types/format and runs API tests. `npm audit --omit=dev` checks runtime dependencies. Disable semantic inference through the environment flag if Linux native loading or memory pressure occurs. Revert the release for UI/API rollback; the new FTS, vector and alert tables are additive. Back up the SQLite database using the existing consistent backup command before destructive maintenance. Existing profiles, scans, applications, billing controls and five-run accounting retain their previous contracts.
