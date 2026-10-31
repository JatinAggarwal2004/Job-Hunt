# Automatic employer career discovery

An administrator enables **Automatic employer & startup discovery** once in Admin studio. Users then run normal discovery using their roles and locations; no company-by-company setup is needed for the starter registry or supported links found in Google Jobs results.

The collector checks Amazon's public career search directly, a finite starter registry of 13 Greenhouse/Ashby employers (including Stripe), and supported Greenhouse/Lever/Ashby links found in indexed application links. An optional additional employer careers URL is detected as an ATS board or read for public JSON-LD JobPosting data. A page with no direct data can follow up to two same-origin job/career detail links. It does not execute JavaScript, log in, bypass restrictions or crawl arbitrary navigation. Robots exclusions and unsuccessful robots checks prevent generic page reading; redirects are rejected so an administrator can supply the final URL.

## Bounds and accounting

- One user discovery run covers all child employers; no extra account run is consumed per company.
- Up to20 ATS boards,4 additional career URLs,3,000 canonical-URL-unique listings per aggregate scan; extra targets rotate across scans. A finite registry plus observed links is not exhaustive discovery of every startup.
- ATS feeds read up to1,000 records each, independently of the older feed setting. Stripe's746-record feed was completely read in the live check. Larger employer feeds show limited coverage.
- Amazon queries up to3 chosen roles,6 pages total (up to100 records per page), deduplicates canonical URLs and retains earlier results if a later request fails. Indian preferences use countryIND; other searches use the first preferred location. Global multi-country Amazon querying is not implemented.
- Shared successful reads cache for15minutes; account ownership is granted only by that account's own discovery scan. New accounts still start with zero results. Cache keys for Amazon include chosen roles/locations.
- Existing web-provider six-request/200-shared-monthly budgets remain unchanged. No new paid API, model, credentials or hosting resource is added.
- Per-employer coverage exposes completed/limited/failed outcomes and collected counts. Collected counts precede location/experience matching; they are not a guarantee of suitable or currently open jobs. Aggregate coverage always remains limited because the web and startup registry are not exhaustive. Job availability must still be checked with the employer; limited scans do not globally expire jobs discovered by other profiles.

Generic HTTPS reads resolve all DNS addresses, reject private/reserved addresses, and pin the checked public address to the TLS request. IP-literal/credential/custom-port URLs are rejected. Redirects are never followed; body size is capped at2MB and transport time at10seconds. Fixed ATS/Amazon JSON collectors use their existing8MB/15second bounds. Reads are sequential to avoid a burst against small career sites. Only role/location search terms are sent; resumes/contact details are not used.

## Endpoints

Admin-only: `POST /api/admin/career-discovery` with `{enabled:boolean}` adds or toggles the aggregate source. `GET /api/admin/career-sites` lists extra URLs. `POST` and `DELETE /api/admin/career-sites` accept `{url:string}`. At most20 additional URLs may be registered. The ordinary source enable/disable controls also work after creation.

## Verification

`npm run check`:78 API tests plus builds/types/format. Fixtures cover >300 Stripe collection, ATS detection, structured data, expired/malformed jobs, Amazon pagination/partial failure, cache reuse, target rotation, admin authorization and per-account isolation. Public-reader tests cover encoded IP/private/mixed DNS, address pinning, robots, redirects and2MB rejection.

Actual local collector against public endpoints returned1,495 unique raw listings in8seconds: Amazon282 across3pages with India filter, Stripe746, and the remaining starter boards. This is a measured collection result, not1,495 personalized matches or a permanent listing count. DNS-pinned public reading also returned the supplied Stripe career-page content. No SerpApi or model calls were made for this check. Browser fixture confirmed enabling discovery, adding a full careers URL, one scan yielding Amazon/startup cards, and expandable employer coverage. Full CLI browser suite and long-running production load were not rerun for this slice.
