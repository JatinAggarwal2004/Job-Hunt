# Job-Hunter: platform research and REA evidence ledger

Checked 29 October 2026. Scope: public, unauthenticated primary pages of six relevant platforms; no applications submitted, accounts created, paid services used, or authenticated products inspected. This is a bounded design benchmark, not an objective ranking of the entire market.

## Questions and findings

| Question | Status | Evidence and decision |
|---|---|---|
| Which workflows belong together? | Answered for sampled public pages | Discovery, reusable profile, resume tailoring, assisted applications and tracking recur across the sampled platforms. Build one connected workspace. |
| What makes a match/resume score useful? | Partly answered | Public pages describe keyword/role comparisons; their algorithms and predictive validity remain unknown. Show our own factors and missing data; never imply hiring probability. |
| Can every company and application be covered? | Unresolved globally | These public pages cannot prove universal coverage or universal autofill. Source health, freshness, duplicates and known limits must be visible. |
| What actually works in competitor authenticated flows? | Unresolved | No account access or application tests. Marketing demonstrations are not execution evidence. |
| Is requested REA skill installed and usable? | Skill verified; runtime constrained | Upstream skill v53 installed and hash-checked. CLI doctor executed but returned unhealthy; see below. |

## Primary-source benchmark

**[Simplify](https://simplify.jobs/)** — public page promotes one profile, matching, autofill, resume suggestions accepted individually and application tracking. Its speed, hiring-rate, coverage and automation percentages are vendor claims, not independently verified results. Product lesson: make the next action clear, keep corrections optional and preserve a reusable answer profile. Do not copy numerical outcome promises or automatically add unverified achievements.

**[Huntr](https://huntr.co/)** — public navigation and page content present tracker, resume builder/tailoring/review, autofill, contact and interview tools. Runtime observation HUNTR-UI-01 confirmed the public heading and links to tracker, resume tools and application autofill in headless Chrome. No underlying authenticated operation was tested. Product lesson: job details, notes and application state belong together.

**[Teal](https://www.tealhq.com/)** — public tools navigation describes job tracking, resume/job-description comparison, keyword checks and bullet improvement. Score validity and hiring outcomes were not tested. Product lesson: separate general document completeness from alignment with a particular job, and explain each recommendation.

**[Wellfound](https://wellfound.com/)** — public page emphasizes startups, direct candidate access to founders/hiring managers and role examples with compensation/location. Startup counts are vendor claims. Product lesson: explicitly include small companies and show company context rather than limiting the search to famous brands.

**[LinkedIn Jobs](https://www.linkedin.com/jobs/)** — retrieved public page contains role categories, sign-in and Open To Work explanations. This does not establish access to private matches, alerts, Easy Apply, or a reusable public API. Product lesson: multiple role interests and recruiter visibility are distinct preferences; don't assume one implies the other.

**[Indeed](https://www.indeed.com/)** — web retrieval exposed title/company and location/remote inputs, salary/review navigation and personalized recommendations behind sign-in. Independent headless Chrome observation INDEED-UI-01 returned “Blocked - Indeed.com” and “Request Blocked.” These results differ by retrieval method. Product lesson: source failure must be a visible state, never an empty successful search. No bypass attempted.

## Recommended behavior for Job-Hunter

These are design decisions inferred from the benchmark, not claims about competitors' internals:

1. Saved search preferences support several roles, locations, remote preference and a schedule. Show when the server must remain running and when the next run will occur.
2. Ingest only explicitly supported public feeds/company boards. Preserve source URL, external ID, employer, timestamps, description and source status. Deduplicate stable IDs and canonical URLs. Extend a configurable company registry to smaller employers; do not claim exhaustive discovery.
3. Explain matches with available role/location/skill evidence. Missing salary or geography stays unknown; never manufacture it. Distinguish remote from worldwide eligibility.
4. Parse resumes into editable text/profile fields. Show extraction errors. Keep original text, accepted suggestions and rejected suggestions separate. Rules-based checks must be labeled as such; an unavailable language model must not masquerade as AI output.
5. Prepare a reviewable application packet from verified profile facts. Opening a company's application URL is not submission; only mark applied after user confirmation or a supported integration's actual receipt.
6. Admin controls should save real values: source enablement, company registry, schedule/defaults and product appearance. Separate settings UI from proof of secure multi-user admin authorization.
7. Keep day-to-day workspace motion quiet; use more expressive storytelling on the landing page. Empty states and failed operations need equally clear visual treatment.

## REA installation and runtime record

Requested repository: [morluto/rea](https://github.com/morluto/rea). Skill path upstream: `.agents/skills/reverse-engineer-anything`.

- Existing `/Users/jatin/.codex/skills/reverse-engineer-anything/SKILL.md` was metadata version 49, SHA-256 `8866a9102de4ca5d6110e280a5d53fa67f0600d26b75cfaff4e9b252af631bcf`.
- Compared live upstream before changing anything: version 53, different hash. Preserved the entire old directory at `/Users/jatin/.codex/skill-backups/reverse-engineer-anything-v49-20261029`.
- Used the official local skill-installer helper:

```sh
python3 /Users/jatin/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py --repo morluto/rea --path .agents/skills/reverse-engineer-anything
```

- Command exited 0: installed to `/Users/jatin/.codex/skills/reverse-engineer-anything`. Re-fetched upstream and compared bytes: exact match; SHA-256 `21f88794f1110630e91d421129efb5c869816e1a54a7fa3ca14b1a29a9188a72`.
- Read REA SKILL and runtime-observation, evidence-workflows and connection-and-recovery guides. Applied its explicit questions → evidence → limitations workflow here.
- Ran `npx -y rea-agents@latest doctor --client codex --json`. It downloaded to npm cache and exited 1. CLI package 6.8.0 reported Node 24.18.0 unsupported (requires 22.23.4+, 24.22.1+, or 26.12.1+ in those supported lines), missing setup-owned Codex registration and unknown live-server state. It also reported its expected bundled skill as 49, showing npm release and upstream main are not identical.
- No Node upgrade, MCP configuration edit, native-engine installation or unrelated setup was performed. A missing setup-owned registration alone does not prove absence of a plugin-owned registration; no REA tools were available in this session.
- Consequently no REA browser capture or REA Evidence ID is claimed. Public page retrieval and Playwright observations above are ordinary tool evidence, with local ledger labels HUNTR-UI-01 and INDEED-UI-01, not REA IDs. Fallback used an installed Chrome browser through Playwright; each temporary page and owned browser was closed.
- “Skill book” entry appended to `/Users/jatin/.claude/projects/-Users-jatin/memory/reference_installed_skills.md`. Newly installed instructions become available in subsequent turns; reading them now enabled this investigation methodology.

## Remaining validation

Authenticated competitor behavior, complete market coverage, resume prediction accuracy, universal cross-site autofill and production multi-user security are not established by this research. Validate Job-Hunter's own functionality independently with persistence, failure-path and real-browser tests; this report does not certify implementation.
