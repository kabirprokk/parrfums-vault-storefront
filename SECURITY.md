# Security review and operating boundaries

## Checks implemented

| Risk | Control in this repository | Verification |
| --- | --- | --- |
| Browser changes price, discount, shipping, quantity or total | Checkout accepts product/variant identifiers and quantities, then loads active catalogue prices, stock, shipping rules and coupon eligibility inside database transactions. Snapshot values are immutable on the order. | PGlite tests mutate browser prices, cart/coupon state, stock and catalogue values. |
| Duplicate checkout and inventory decrement | Client idempotency key plus server request fingerprint; transactional row locks and reservations; payment/refund/inventory operations use unique event/request IDs. | Repeated quote/order, duplicate webhook, retry/release and state-order tests. |
| SQL injection | SDK query builder for table access; typed RPC arguments; RPC dynamic query paths are not assembled from user text. RLS and narrow view/function grants constrain reads and writes. | Security source checks plus parameterized RPC/database tests. |
| XSS and payment skimming | Dynamic text is escaped; JSON-LD and server metadata are escaped; Content Security Policy disallows inline and eval scripts and narrows script/connect/frame sources. Razorpay script loads only for its payment flow. No tag manager or analytics provider is configured. | Adversarial product/search text browser test, CSP/source checks and axe/browser audit. |
| Admin route exposure or role spoofing | Server/database `require_admin` checks membership and MFA assurance (`aal2`) for protected operations. No frontend role value grants authority. No admin users exist yet. | Unauthenticated and non-admin RPC checks; AAL1/AAL2 database tests; live anonymous RPC smoke check. |
| Private order/customer/payment leakage | RLS, owner-scoped order reads, private schema helpers, `security_invoker` public projection views and no anonymous grants on private tables. | Database isolation tests and live anonymous table requests. |
| Fake frontend success or webhook replay | Payment state changes require a server-verified provider payment/signature; provider interface is isolated; webhook signature and event identity are checked; duplicate and out-of-order events are idempotent. | Isolated Razorpay-shaped provider fixtures and signed/tampered/duplicate webhook tests. No live provider credentials were available for a real-money test. |
| Secret exposure | Only the Supabase publishable key is in browser code. Provider/service credentials are not committed; `.env.example` contains names/placeholders only. | Frontend secret scan, ignored-secret checks and source review. |
| Stale dependency/plugin exploit | No CMS or plugin system. Browser SDK is pinned and vendored; npm lockfile pins dev/test packages. | SDK integrity test and `npm audit --audit-level=moderate` (zero findings at review). |
| Browser transport/script abuse | Vercel CSP, HSTS, `nosniff`, referrer, frame and permissions headers; restrictive rewrites keep tests/scripts/dependencies out of served routes. | Static policy checks. Hosting headers require deployment to take effect; verify the actual production response after deploy. |

## Live checks performed

On 2026-10-22 the connected project was queried without making production writes. The public product/projection endpoints responded; anonymous requests to private order/ledger/admin-related tables and the admin RPC were denied. Both deployed payment functions returned a safe configuration-required response. Supabase Google authentication was disabled. Security Advisor had no ERROR findings after the projection-view migration. It reported five private tables with RLS enabled and no client policy (expected); it also listed authenticated execution of 12 guarded `SECURITY DEFINER` RPCs (expected for server operations; verify each change preserves its `require_admin` or user-ownership guard).

This is evidence for the observed configuration at that time, not a guarantee against future code, dependency, dashboard or account changes. Run `npm run test:live` again after deployment/configuration; it is read-only. Recheck Supabase Security Advisor, Vercel headers, browser console and the production domain after each release.

## Remaining risk boundaries

- Google sign-in and MFA enrollment are not enabled/configured for a real owner yet. There is no admin membership. Admin APIs fail closed until the owner completes setup.
- Stock is unknown for all 18 size variants; quantities remain `NULL`. This safely blocks online reservation/payment until counted stock is entered. Combo component recipes likewise need owner confirmation.
- Razorpay credentials/webhook configuration and a real test payment/refund are absent. Payment endpoints safely report configuration required; no order may be considered paid based on client UI state.
- The Supabase SDK stores its PKCE session in browser storage. A same-origin JavaScript compromise could reach it; CSP and output escaping reduce the exposure, but this is not equivalent to an HttpOnly cookie session.
- The database MFA gate checks auth assurance (`aal2`), but project-level MFA enrollment policy and recovery procedure still need owner verification.
- Rate limiting is implemented for checkout paths, but the production API gateway/WAF and abuse alerts still require deployment-level monitoring. No external analytics or error-tracking credential is configured.
- Legal text and business commitments must be reviewed and approved by the owner before launch.

## Response and maintenance

Keep service-role and payment secrets only in Supabase's server-side secret store. Rotate any credential exposed through a dashboard, log or commit. Review dependency updates before changing the SDK lock/pinned vendor asset. Preserve migration history and use reviewed migrations for schema changes. Investigate unexpected `payment_events`, failed signature checks, reservation expiry spikes, new Security Advisor findings, CSP reports, or changes to admin membership. Do not manually mark orders paid or fulfil them from a browser-only signal.
