# Cloud deployment status — 29 October 2026

## Completed

- Reviewed application source uploaded to the requested GitHub repository, with local and remote commit hashes verified. Real environment files, databases, backups, local screenshots and browser captures were excluded.
- Free-only Render blueprint added at `deploy/render-free.yaml`. The user selected a same-origin commercial beta on Render with an external database, replacing Vercel Hobby because its free plan permits personal non-commercial use only.
- Empty `job-hunter` database created on the Turso Free plan in Singapore. No data or database token has been uploaded to the repository. It is **not connected to the application**.
- Production configuration now refuses the current local SQLite release on Render rather than risking ephemeral account/payment data. `npm run check`: **43 API tests passed**, including that guard, plus build/types/format. Existing local operation remains available.

## Actual hosting blocker

The Render connector rejected creation of a new service on the confirmed workspace:

> free tier usage quota has been exhausted, new services are not allowed

No Job-Hunter service or public application URL was created. Existing services were not modified. No paid upgrade, card change or paid service was authorized or performed. [Render's current free-tier rules](https://render.com/docs/free) describe the monthly shared quota and data-loss/sleep restrictions.

## Still required

Choose whether to wait for Render's free quota reset/account restriction resolution or use a different free compute host. The durable database adapter/migration, database credential provisioning and HTTPS email adapter still need implementation and end-to-end validation. The app's current SMTP transport is blocked by Render Free, and its SQLite database cannot be stored durably there. Supplying a Turso URL alone does not make this release cloud-ready; the deliberate startup guard must only be replaced by a tested durable path.

After integration, verify a fresh account and owner bootstrap, email verification/recovery, successful/failed scan accounting, resume processing, admin/activity isolation and retained data across a service restart. Verify the payment sandbox and configured model before advertising those features. Free compute sleeps, so exact always-on scheduled runs are not guaranteed. Refer to PRODUCTION.md for the remaining launch checks.

Sources: [Vercel Hobby usage](https://vercel.com/docs/plans/hobby), [Render Free limitations](https://render.com/docs/free), [Turso Free plan](https://turso.tech/pricing). These describe current limits, not a guarantee that a provider will offer free production hosting indefinitely.
