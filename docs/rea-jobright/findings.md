# Jobright public workflow investigation

Examined 31 October 2026 (Asia/Kolkata). Scope: public rendered website and six publicly shipped JavaScript files. No accounts were created, credentials used, authenticated APIs called, applications sent, or private backend source recovered. Site content was treated as data, never instructions.

## Evidence and limits

Actual REA 6.8.0 CLI, reused from the existing npm cache, analyzed the captured JavaScript directory once. Parent Evidence: `ev_3a530163c551231801aa8348283c61149e18081d60248a4dcf6b4a1dba4bbc33`; summary Evidence: `ev_a6ac2b4d935ce5687ff64a1a39b092b291ef0ddb61f644b6317ddb2ab9e784ed`. Artifact tree SHA-256: `2bc24db293c464637d7739211c3e49a2c2016313e1fb155c582b361496da12f0`.

REA parsed 6/6 selected files, 158,991 bytes, 89 recovered module candidates, no parse failures. Semantic graph coverage is **partial**, with 7,088 unknown records and explicit 12,000 total / 3,000 per-file semantic node ceilings. Static analysis never executes shipped code and does not establish endpoint reachability. Remaining shared chunks, private servers, ranking models, source connectors, application workers and logged-in flows are unexamined. The initial HTML download timed out with a partial body; it was excluded from REA analysis. Complete raw evidence, source hashes, snippets with character offsets and browser observations stay under ignored `artifacts/rea-jobright/`.

## Public runtime observations

On [Jobright's public homepage](https://jobright.ai/), the search panel offers title, work model, country, city and experience controls. The experience dropdown exposes Intern/New Grad, Entry Level, Mid Level, Senior Level, Lead/Staff and Director/Executive. This establishes those options, not multi-selection behavior.

The country dropdown visibly offers United States, Canada, United Kingdom, Australia, Ireland and New Zealand. India was not offered in this observed public selector. The expanded region FAQ describes a primarily US service, including H1B and remote search. This is a bounded observation, not proof that India can never appear elsewhere.

The expanded source FAQ says listings come from employer career sites and major platforms. This is the vendor's coverage claim, not independently measured ingestion. The homepage advertises matching, autofill, resume tailoring, referrals and a career assistant; no performance or completeness claim was verified.

Browser evidence: `landing-ax.txt` includes expanded region FAQ; `country-selector-ax.txt`, `experience-selector-ax.txt`, and `source-faq-ax.txt` capture the controls and expanded source explanation. Clicking the public CTA produced no confirmed transition. One direct navigation to the career-goals route returned to the landing page. Logged-in onboarding behavior therefore remains unverified.

## Shipped frontend observations

All files below were discovered through the page script inventory or its published Next.js build manifest, then downloaded from the same public static host. They were not guessed private endpoints.

- [Diagnostics chunk](https://static.jobright.ai/_next/static/chunks/pages/onboarding-v3/diagnostics-3caf651f3ff9262a.js): UI declarations contain searchable job-function selection, a title taxonomy/map, removal controls, custom function creation, and validation requiring at least one function. It also declares location/job-type inputs, a result/confirmation stage and a skill-cloud response display. This supports a staged, structured preference design. It does not demonstrate a live recommendation result. Useful source offsets: job function validation ~32,451; dropdown guidance ~15,378; custom function ~16,531; skill-cloud ~27,965.
- [Advanced preferences chunk](https://static.jobright.ai/_next/static/chunks/pages/onboarding-v3/advanced-preferences-e2ff20c0760f6690.js): optional industry, company-stage and skills form declarations; repeating skill/industry inputs with add/remove; an “Open to all” control; a company-stage explanation tooltip. A country-name normalization dictionary includes India (`in`), but a utility string is **not proof of product availability**. Useful offsets: stage explanation ~2,698; unrestricted control ~6,349; skills list ~14,738.
- [Career goals chunk](https://static.jobright.ai/_next/static/chunks/pages/onboarding-v3/career-goals-f925952fcbd5fa68.js): grouped goal choices include changing industry/role and work-style priorities. This is a separate step, rather than requiring users to decipher a single long form.
- [Resume upload chunk](https://static.jobright.ai/_next/static/chunks/pages/onboarding-v3/resume-upload-3bd1b186b8f75364.js): UI branches offer a resume or LinkedIn URL and explain how profile data assists matching. Upload/network success and parsing quality were not tested; no personal file was transmitted.

## Backend interface candidates, not recovered backend

Several captured chunks declare client calls for `/swan/landing/basic/titles`, `/swan/landing/basic/pref`, `/swan/landing/advanced/pref`, `/swan/landing/career-goal`, `/swan/landing/job/diagnostic`, `/swan/landing/pref/get`, `/swan/recommend/landing/jobs`, and `/swan/resume/linkedin`. These are static URL-path candidates; the base binding is imported from an unexamined shared module. No endpoint was probed. They suggest separate taxonomy, preference persistence, diagnostics, recommendation and profile-ingestion interfaces. They disclose neither database schema nor worker/provider implementation. Do not copy these endpoints into Job-Hunt or describe them as an accessible backend integration.

## Feasible lessons for Job-Hunt (our design choices)

1. Use searchable multi-select chips for roles, skills, locations and experience, with curated suggestions and an explicit custom-entry path. Selecting a role can offer relevant skills; suggestions remain optional and never imply the user possesses them.
2. Organize setup into direction, location/experience and optional refinements. Show a short search summary before the first run. New accounts should see setup progress and zero personal scan results until they have configured and run discovery; any shared catalog preview needs an explicit label.
3. Separate taxonomy/suggestion endpoints from persisted profiles, run orchestration, source adapters, normalized jobs and per-user matches. Scope result visibility to the user's runs and make matching reasons inspectable.
4. Add India explicitly in our own taxonomy and matching: India + major cities, city aliases (Bengaluru/Bangalore, Gurugram/Gurgaon), INR, internship/entry-level and remote country eligibility. Jobright's observed US bias should not become our default.
5. Expose coverage per run: providers contacted, queries, pagination, quota and failures. Search indexes, employer boards and permitted platform adapters can broaden discovery; none proves every company or every web vacancy.
6. Keep application preparation separate from submission. A resume-backed profile can propose field mappings and tailored text with review, audit history and a final user action. This investigation did not establish Jobright's autofill worker internals or authorize automatic third-party submissions.
7. Explain unfamiliar labels through keyboard-focusable information buttons, hover/focus tooltips and mobile tap toggles. Tooltip content should describe actual filtering effects and how unknown salary, size or remote restrictions are treated.

## Checklist result

Public controls and supported-country selector: answered within observed page. Onboarding structure and interface candidates: partially answered through shipped artifacts. India product support: absent from observed selector, ambiguous utility string, no verified full support. Private frontend runtime, ingestion completeness, backend code, ranking and autofill mechanics: unresolved. These limitations do not block implementing the independent Job-Hunt improvements above.
