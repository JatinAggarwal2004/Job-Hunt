# Council Contract — relevant results workspace and deadline alerts
## WHAT
Every matching result accessible through pagination without100-result ceiling; compact readable jobcards/filters/detailworkspace inspired by user screenshots; alerts for actual employer deadlines or explicit user-entered dates, inapp and optional email.
## HOW
Architect: bounded page windows with total/offset/next state, ownedjobs only, retain current profile eligibility. Explicitdeadline provenance, persisted account-owned alerts, retrybounded mailqueue with5pertick/3attempts andworkerclaim. ReuseBrevoHTTPSadapter, no new external service. Reject renderingthousands heavycards inoneDOM or inferringdeadlines fromfetched dates.
Contrarian: do not equate validThrough to guaranteeddeadline; usermustcheckemployer; missingdeadline staysunknown. Freehostcan sleep; emailtimingnotguaranteed. UserAdvocate: allresultsreachable, loading/errors clear; no automatic email opt-in.
PLAN GREEN FLAG 2026-11-05: implement boundedpaging, meaningful UI, opt-in alertservice withinexistinghost.
## CHECKS
|#|Check|Verify|Result|
|---|---|---|---|
|1|Build/run|npm run check|PASS — npm run check: both builds/types/format and93/93 API tests.|
|2|Normal|>100resultsreachable,deadlinecreation/due/emailfixtures|PASS — CUA25 pages1–5 reached145/145 fixture rows; saved deadline appears Alerts. API verified reminder due/email/restart behavior.|
|3|Edges|invaliddates/foreignjobs/retry/restart/duplicatealerts/unknown deadlines|PASS — integration cases reject malformed/past dates, foreign jobs/alerts, repeated alert saves, unknown dates; three retries bounded, persistent DB reopen catches up.|
|4|Errors|emptyfilters/missingdeadline/unconfiguredemail actionable|PASS — empty/no-evidence states and no-mail copy; date inputs required and invalid dates caught before ISO conversion; alerts loading state added.|
|5|Security|ownership/auth/strictinputs/credentialscan|PASS — strict authenticated account-owned APIs, verified sign-in email recipient, blocked user disabled; credential pattern scan0.|
|6|Complexity|boundedpages,5mailjobs/tick,3attempts|PASS — API limits1–200/window and36 UI cards/page;5 emails/tick,3 attempts,100 shared alert attempts/day; provider discovery caps retained.|
|7|Readable|dedicatedalertservice/reusablejobworkspace|PASS — dedicated alerts service, reminder form/list and result workspace; exact employer expiry separated from user-entered date provenance.|
|8|Useradvocate|CUAdesktop/mobile/keyboard/filters/paging/alerts|PASS — CUA25 desktop drawer/two resumes/filters/all5pages/reminders;390px light layout width390 without overflow; keyboard Escape and setup heading focus verified.|
|9|Cost|existingfreeallowances, no newpaid resources|PASS — existing Railway/Brevo only; no new paid resources or signup, mail fixtures simulated; all email reminders opt-in.|
|10|Rollback|disablealerts/revertrelease,additivetables|PASS — additive alert tables/optional expiry; old release can ignore them; semantic flag supports inference rollback without deleting profiles.|

## Final local review — November5
Iterative review passes covered runtime audit upgrade, restart fixture repair, browser flow and final semantic fallbacks. The final complete rerun passed all93 tests after fixes.
Code Auditor: checked server/app.ts ownership on extraction/comparison/alerts, retrieval.ts scoped joins and candidate-only fallback, semantic.ts timeout/idle cleanup, alerts.ts bounded queue claims and verified recipients. User Advocate: upload stays optional, extraction needs acceptance, heuristic scores show limitations, match badges differ from resume scores. Executor: actual browser and real-weight CPU inference executed, not mocked alone.
Blind spots: security — secret scan0 plus cross-account tests; money — no paid activation; user impact — first use may wait for weights, fallback explicitly labelled; rollback — revert source or disable semantic; edges — empty/malformed/private/unrelated/restart/late sections tested; dependencies — current runtime audit0.
LOCAL GREEN FLAG. Accepted residual limits: bounded candidate/chunk retrieval and uncalibrated scoring, English model limitations, free-host delayed reminders, at-least-once mail retry semantics. Hosted Linux inference and deployment remain a separate verification gate after push; no hosted success claimed here.
