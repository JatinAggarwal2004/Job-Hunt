# Council Contract — resume-first retrieval and job review
## WHAT
Resume-first onboarding with reviewable extracted facts; owned-job retrieval with citations; compare up to5 account-owned resume versions against one job with job-specific evidence, gaps and explained rubric. Optional consented generation when an existing approved model is configured. No private applicant comparison or model-training claim.
## HOW
Architect: SQLite FTS5 chunk retrieval plus profile eligibility; deterministic evidence scorer separate from generation; existing safe model adapter extended for grounded explanations. Extract tentative profile fields locally, apply only explicit selection. Reject training a foundation model/new vector service: no dataset or paid infrastructure authorized. No new credentials without userhandoff. Lexical retrieval must be named as such until embedding/modelactivation exists.
Contrarian: role/location preference filters stay hard constraints; full resume text never in global index; foreign resumes/jobs404. Prompt injection is source data, not instructions. Dates/metrics never invented. User Advocate: uploadfirstoptional, reviewbeforeapply, clear scoring evidence and engine labels.
PLAN GREEN FLAG 2026-11-05: execute within₹0 and existingprivacy/accountownership.
## CHECKS
|#|Check|Verify|Result|
|---|---|---|---|
|1|Build/run|npm run check|PASS — npm run check: client/server builds, types, formatting and93/93 API tests (Nov5 final).|
|2|Normal|retrievalcitations and job-specificresumecomparison fixtures|PASS — personalization tests: scoped source citations, per-job ranking and selected version immutability; CUA25 real MiniLM Backend90 versus Marketing16.|
|3|Edges|empty/malformed/private/foreign/stale/missingevidence|PASS — API tests cover empty descriptions, foreign job/resume404,5-version bound, malformed questions, later resume windows and unrelated semantic evidence exclusion.|
|4|Errors|unconfiguredAIexplicit503; incompleteprofile guidance|PASS — missing hosted key/consent rejected; injected unavailable semantic encoder returns no unrelated evidence; explicit fallback label.|
|5|Secrets/security|credentialscan0; scopedFTS queries; consent|PASS — Python pattern scan30 changed/new source files:0 possible key files; auth/ownership SQL tested; Gemini mock wire contains only supplied question and passages.|
|6|Complexity|boundedchunks/context/resumeversions, no billabledefaults|PASS — worker max32 texts/4k chars,96MB worker JS heap,90s timeout/60s idle;5000 vectors; actual quantized inference384dims and related0.610>unrelated0.089.|
|7|Readable|dedicatedparser/retrieval/evaluator/UI modules; JSX40linecapwaived|PASS — read dedicated extraction/retrieval/review/model modules; repaired timeout listener cleanup and post-inference stale-resume check.|
|8|Useradvocate|CUAupload→review→apply;job→comparison→evidence|PASS — CUA25: upload syntheticTXT → inspect extracted fields → deselect email → accept → next roles retained; two-version model review quotes visible, Escape closes drawer.|
|9|Cost|₹0, modelactivation separatelyverified|PASS — no hosted generation/key/payment activation or new SerpApi searches; model public download uses no paid API. npm audit --omit=dev:0.|
|10|Rollback|revertrelease,additivetables,profiledataretained|PASS — inspected additive FTS/vector tables and optional fields; disabling ENABLE_SEMANTIC_MODEL returns evidence rules; old source can ignore added tables.|

## User steering: open-source model,2026-11-05
User asked to find/use an existing open-source model and delegated bestchoice. Decision3Lens: Contrarian rejects training on absent applicantcorpus; FirstPrinciples picks384dim semantic embeddings with evidence-basedcomparisons; Executor rejects running a largegenerative model on512MBfreehost. Chosen quantizedApache2 all-MiniLM-L6-v2 via pinnedTransformers.js3.8.1, isolatedsinglethreadworker with boundedcache/batches, semanticmatch in separatelylabelleddimension. Model downloadpubliconly, no resume senttoHuggingFace. Optional remotegeneration remainsdisabledwithoutkey/consent. Add checks actualweightsinference semanticrelated>unrelated, memorycap and latency; gracefulunavailablefallback explicitlylabelled, no fake AIclaim. PLAN GREEN FLAG: boundedopen-sourceworker approved within₹0; rollbackdisableflag/modelworker.

Forced deviation: pinned runtime upgraded3.8.1→4.3.2 after actual npm audit foundhighseveritytransitivesharp;4.3.2isofficialstable/npm andquerieddocs. RetainfixedMiniLMrevision. Re-run actualinference andproductionaudit afterupgrade.

## Final local review — November5
Iterative review passes covered runtime audit upgrade, restart fixture repair, browser flow and final semantic fallbacks. The final complete rerun passed all93 tests after fixes.
Code Auditor: checked server/app.ts ownership on extraction/comparison/alerts, retrieval.ts scoped joins and candidate-only fallback, semantic.ts timeout/idle cleanup, alerts.ts bounded queue claims and verified recipients. User Advocate: upload stays optional, extraction needs acceptance, heuristic scores show limitations, match badges differ from resume scores. Executor: actual browser and real-weight CPU inference executed, not mocked alone.
Blind spots: security — secret scan0 plus cross-account tests; money — no paid activation; user impact — first use may wait for weights, fallback explicitly labelled; rollback — revert source or disable semantic; edges — empty/malformed/private/unrelated/restart/late sections tested; dependencies — current runtime audit0.
LOCAL GREEN FLAG. Accepted residual limits: bounded candidate/chunk retrieval and uncalibrated scoring, English model limitations, free-host delayed reminders, at-least-once mail retry semantics. Hosted Linux inference and deployment remain a separate verification gate after push; no hosted success claimed here.
