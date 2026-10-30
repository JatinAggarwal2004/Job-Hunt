# Job-Hunter: make the journey easier

Reviewed31 October2026. The owner clarified the objective: understand how Tsenta and Jobright guide people and make their websites easier to use. This review focuses on decisions and task flow, not private services or copying their appearance.

## What was actually observed

| Surface | Useful pattern | Limit or friction | Lesson for Job-Hunter |
|---|---|---|---|
| [Tsenta public jobs](https://tsenta.com/jobs) | Jobs appear immediately. Experience, work mode and employment filters are visible pills. In this walkthrough, one click on Internship visibly selected the pill, changed the displayed total and replaced the cards with internship-labelled roles. | Public catalogue results are not automatically personal matches. Several filter groups compete for attention, and earlier detail evidence contained contradictory seniority labels. | Offer immediate examples and responsive filter feedback. Clearly separate a labelled public preview from the account's own results. Keep common filters visible and optional ones expandable. |
| [Jobright public homepage](https://jobright.ai/) | Search uses familiar title, work model, country, city and experience choices. Experience options distinguish Intern/New Grad, Entry Level and later stages. Feature actions describe user outcomes such as finding matches. | Public country selection previously observed excludes India. Feature-carousel content changes while browsing. Marketing claims do not establish logged-in usability or application success. | Use plain task labels and relevant presets, offer India explicitly, and keep the main workspace action stable. |
| Jobright shipped onboarding UI, from the earlier REA report | Separate goal, diagnostic/preference, optional refinement and resume components; custom entries and explanatory controls. | This establishes intended UI structure, not the exact live order or successful completion behind login. | Progressive disclosure is a useful design hypothesis to test in our own app. |

The new Tsenta filter test resolves the earlier report's unconfirmed filter interaction for this specific Internship action. It does not verify every filter or all result accuracy. Current screenshots are private artifacts: `artifacts/discovery/ux-tsenta-filter.png` and `ux-jobright-experience.png`. Existing detailed evidence remains in the [Tsenta report](rea-tsenta/findings.md) and [Jobright report](rea-jobright/findings.md).

## Where Job-Hunter still asks too much

1. **The first setup is a long settings form.** Roles, skills, location, experience, salary, currency, headcount, contact details, summary and schedule compete before the user sees value. Multiple-choice inputs help individual fields but do not reduce the number of decisions.
2. **Helpful information repeats too much.** Persistent hints, information buttons, readiness guidance and several explanatory paragraphs can say similar things. Keep essential guidance visible; put secondary explanations in help.
3. **The workflow is spread across navigation areas.** People must understand the relationship among Search & profile, Discover roles, Resume studio and Applications. The job itself should lead naturally to preparing an application.
4. **A percentage can look more certain than the data.** A preference score can appear beside a role whose experience requirement is unknown. Show concrete reasons and uncertainties prominently.
5. **Opening an employer form needs an explicit handoff.** The user should understand what was prepared, what still needs completing, and that opening a link is not a submitted application.

These are a design assessment of the current flow, not measured abandonment rates. No new production controls were changed during this review.

## Proposed journey

**First visit: three short steps.**

1. **Work:** choose roles and acceptable experience levels. Provide examples and custom entry.
2. **Place:** choose countries/cities and work mode. Offer India and major Indian cities early, while keeping the choice explicit.
3. **Profile:** optionally upload a resume or skip. Any extracted information needs review before saving; this review-to-profile step is a proposed enhancement.

Then show a short search summary and one primary action: **Find my matches**. Explain the five lifetime free scans immediately before the first run. Salary, company size, scheduling and detailed profile fields belong under optional refinements or later settings.

**Returning visit: useful jobs first.** Each job should show role/company/place, concrete fit reasons, freshness, and a short “Check before applying” note for unknown eligibility. Quick actions should be Save, Dismiss and Prepare application. A detail pane can keep the list in view instead of repeatedly opening and closing a modal.

**Application: one contextual workspace.** From a chosen job, show the relevant resume, optional suggested edits, reviewable contact/form details and the employer application handoff. Record preparation progress automatically where observable. Only move to Applied after a real submission confirmation or the user's explicit confirmation.

## Recommended next implementation

Replace the long first-run profile form with the three-step setup above, preserving the existing profile editor for later changes. This is the highest-impact next slice because it reduces decisions before value without changing the working discovery backend. Verify it with a fresh-account browser task: choose multiple roles/Indian places/experience, skip or review a resume, inspect the summary, complete one real discovery, and resume an interrupted setup without losing selections. Avoid promising a completion time until it is measured.

## Approved first slice implemented

The owner approved quick setup: **roles → locations and experience → optional resume → Find my matches**. This resolves the long initial form; full refinements remain in Search & profile. Drafts are account-owned and saved on Continue/Back/explicit skip. Resume upload stores the file for later Resume studio review; extracting suggested profile facts remains a later enhancement. Returning accounts keep the overview entry point. Other journey recommendations above remain proposals, not implemented parity claims.
