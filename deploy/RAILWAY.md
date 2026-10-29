# Railway Free beta

This is a limited beta, not an always-on paid production service. The Free plan has $1 of resource credit per month, 512 MB RAM and one 0.5 GB persistent volume. Compute, storage and egress consume that allowance. Keep the plan Free, do not add a card or paid upgrade, and monitor the account's actual usage and retention notices. Sleeping compute cannot guarantee scheduled discovery at an exact time.

## Service configuration

Use the repository Dockerfile, one replica, and a volume attached at `/app/data`. Set the start command in the service dashboard to `node --max-old-space-size=128 scripts/railway-start.mjs`, healthcheck `/api/health`, restart policy On Failure with two retries. Leave Serverless enabled. Route the generated HTTPS domain to port 3001. The current dashboard says new services cannot opt into legacy `railway.json` configuration; these settings are deliberately configured in the dashboard.

Set these private runtime variables:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
APP_ORIGIN=https://your-generated-hostname.up.railway.app
JOB_HUNTER_DB=/app/data/job-hunter.sqlite
TRUST_PROXY=1
BOOTSTRAP_ADMIN_EMAIL=your-owned-address
REQUIRE_EMAIL_VERIFICATION=true
RAILWAY_RUN_UID=0
ALLOW_LIVE_PAYMENTS=false
ENABLE_HOSTED_AI=false
```

Railway mounts volumes as root. The launcher changes only the mounted directory's ownership, clears supplemental groups and drops to UID/GID1000 **before** importing the server. It refuses another mount path or runtime user. The application separately rejects missing volumes, in-memory databases, paths outside the mount and symlink escapes. The mount is not an off-host backup: keep regular encrypted exports outside Railway and heed the provider's expiry/retention policy.

## Email before registration

Railway Free blocks SMTP. For the included Brevo HTTPS adapter, configure a verified sender in a free Brevo account, then privately add:

```dotenv
MAIL_PROVIDER=brevo
BREVO_API_KEY=your-private-provider-key
MAIL_FROM_EMAIL=your-verified-sender-address
MAIL_FROM_NAME=Job-Hunter
```

Do not paste keys into chat or commit them. Verify actual delivery and password recovery before opening registration. Brevo's published Free plan permits 300 emails/day, subject to account approval; no real provider requests were made during development. Provider acceptance is not proof of inbox delivery. AI and payment providers need separate configuration and verification.

## Validation

`npm run check` builds, checks formatting and runs the API tests. `APP_ORIGIN=https://your-host npm run verify:deployment` must report health200 and readiness200 before a complete production-readiness claim. Health200 alone confirms only a running API. Missing email/payment configuration intentionally reports readiness503. Confirm data survives a real redeployment, not only a local process restart.

Sources: [plans](https://docs.railway.com/pricing/plans), [volumes](https://docs.railway.com/volumes/reference), [serverless](https://docs.railway.com/deployments/serverless), [SMTP restriction](https://docs.railway.com/networking/outbound-networking), [Brevo Free limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan).

## Activated beta

The current hosted beta uses a dedicated restricted Brevo key with only Transactional email access; all other resource permissions are None. Brevo's minimum send-capable permission also permits template, blocklist and log management. Its configured expiry is January 29, 2027, or after 90 days unused. Rotate it privately in Brevo/Railway before expiry; never commit the key. Owner signup/verification/admin access and verification/recovery mail delivery have been tested on the real deployment. An actual password replacement, merchant/AI activation and off-host restore are still unverified.
