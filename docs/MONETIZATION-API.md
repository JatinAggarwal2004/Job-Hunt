# Monetization API contract
User confirmed Razorpay and five successful lifetime discovery scans. Suggested starting price299 INR/month, editable by admin. All API responses use JSON; errors {error,code?}. Shared shapes in shared/billing.ts. No credentials in browser responses. Checkout only creates a provider subscription linked to current authenticated owner; client redirect/callback never unlocks access. Server-verified captured payment/provider state grants access until verified paidThrough.

GET /api/billing -> {entitlements:Entitlements}
POST /api/billing/checkout -> {url:string,subscriptionId:string}; unconfigured503; not allowed in free mode; existing active plan cannot duplicate.
POST /api/billing/cancel -> {entitlements}; cancel renewal at period end, preserve earned paid period.
POST /api/billing/reconcile -> {entitlements}; verify provider snapshot from server.
POST /api/billing/webhook -> raw JSON signed Razorpay x-razorpay-signature, x-razorpay-event-id, public route outside session auth and JSON parser.
GET /api/admin/monetization -> MonetizationAdmin
PATCH /api/admin/monetization -> {settings,...}; body {mode?,monthlyPriceInr?,cancelRenewals?:boolean}. Fixed freeRunLimit5. Existing renewals must be explicitly handled before modefree: if activeSubscriptions>0 return409 unless cancelRenewals true, then cancel renewal before mode switch; do not silently keep charging. Partial provider failures leave paid mode with actionable response and recorded audit.
PUT /api/admin/complimentary/:userId -> {entitlements}; body {enabled:boolean,note?:string}
PATCH /api/admin/users/:id/access -> {entitlements}; body {blocked:boolean,reason?:string,cancelRenewal?:boolean}; blocked overrides everything, invalidates active feature access, last admin cannot be blocked. Show if renewal remains pending; subscriptions can still be managed/cancelled by owner even when blocked.

Feature gating: free accounts use rules review/profile/tracker and 5 successful discovery scans; premium unlocks AI drafting, daily scheduling and assistant. Admin, complimentary IDs, active paid period, and globalfree unlock all except blocked. Raw trial use isn't client-writeable. Failed/no-enabled-source runs release reservation. Partial successful collections count. Restart recovers outstanding reservations. Billed amount changes create new immutable plan for future subscriptions; existing agreement stays unchanged.

Backend module interface createBilling(db,{fetcher?,env?,clock?}) returns summary(uid), guard(uid,feature), reserveDiscovery(uid,runId), settleDiscovery(runId,success), router(session auth mounted by caller), webhook(raw-body handler), recoverReservations(), config/readiness status as needed. Exports typed helpers if useful. Database uses users existing table but access state/complimentary list/ledger/subscriptions/settings/audit in new tables. Root owns server/app.ts integration.
