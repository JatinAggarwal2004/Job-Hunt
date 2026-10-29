# Cloud deployment status — 30 October 2026

## Hosted beta

Public URL: [Job-Hunter](https://job-hunt-production-c65f.up.railway.app). Railway Free deployment is active with the frontend and API on the same HTTPS origin. Public `/api/health` returned200; the real browser rendered the landing page. HTTPS email delivery is configured through a dedicated restricted Brevo key stored privately in Railway. The owner created an account and verified it; Admin studio opened successfully. Brevo logs confirm both verification and password-recovery emails were delivered. This is **not a complete production launch**: readiness still returns503 for the unconfigured payment gateway. Hosted AI is disabled.

The owner's existing expired Railway trial was switched to the published Free plan without adding a card. The dashboard showed $1 available. A 0.5GB persistent volume is attached at `/app/data`; runtime logs confirm the mount and unprivileged UID1000. A harmless SQLite retention marker survived a real deployment into a replacement container; the subsequent `PRAGMA quick_check` returned `ok` as UID1000. Free compute sleeps, its monthly resource allowance is limited, and provider retention rules apply. No uninterrupted availability or exact scheduled-run timing is promised.

## Source and checks

Reviewed source is uploaded to the requested [GitHub repository](https://github.com/JatinAggarwal2004/Job-Hunt). Environment files, databases, backups, local screenshots and raw browser captures are excluded. The Railway guard refuses missing/outside/symlink-escaped SQLite storage. The Brevo HTTPS email adapter supports free hosts that block SMTP. Current `npm run check` passed50 API tests, build/types and formatting; email tests use simulated provider responses. The owner explicitly approved live verification/recovery test emails, and both were delivered. No paid AI call or payment was sent.

Configure this service through the dashboard as documented in [deploy/RAILWAY.md](../deploy/RAILWAY.md). The actual dashboard says new services cannot opt into deprecated legacy config-as-code, so no `railway.json` is relied on.

## Other providers

Render rejected new free service creation because the workspace quota was exhausted; no Job-Hunter Render service was created. Existing Render services were not modified. Northflank's signed-in Free service form required a card, despite its no-card pricing headline; no card was entered and no service was created there. Vercel Hobby was excluded because its published scope is personal, non-commercial use.

The empty Turso Free database remains **unconnected**. No Turso token was generated or migration implemented. Railway's actual mounted disk enables the existing synchronous SQLite backend; it is not a remote Turso adapter or an off-host backup. Local application data was not uploaded.

## Remaining launch gates

Signup, owner email verification and admin access are verified on the public service. Recovery email delivery is verified; an actual password replacement remains untested. Verify full user isolation, scan accounting and resume processing on the deployed service. Configure and test Razorpay sandbox lifecycle events and an approved AI model before enabling those features. Verify off-host backup/restore and review free-quota retention notices before accepting production users.

Sources: [Railway plans](https://docs.railway.com/pricing/plans), [Railway outbound networking](https://docs.railway.com/networking/outbound-networking), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Render Free](https://render.com/docs/free), [Northflank pricing](https://northflank.com/pricing), [Turso Free](https://turso.tech/pricing). Provider limits can change; account eligibility and the actual dashboard take precedence over a pricing headline.
