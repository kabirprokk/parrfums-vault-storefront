# Parrfums Vault production-readiness handoff

This file is the context packet for the next engineer. It records the work, the security evidence, how to verify it, and the items that still require the business owner. Read it with `README.md` and `SECURITY.md`. Never infer unknown stock, provider credentials, legal promises, tracking values or product facts.

## User requirements and preserved behavior

The request was to upgrade the existing Parrfums Vault e-commerce repository into a production-capable store, preserving its visual identity, existing Supabase architecture, catalogue, security posture, responsiveness and functions. Requested areas included owner/admin, inventory, persistent orders and tracking, server-validated checkout, isolated payments, coupons, search/filter/sort, product data, related/recent products, reorder, moderated reviews, wishlist, policy routes, SEO/social share, speed/accessibility/error/empty states, security/database hardening, analytics abstraction, extensive automated/edge-case tests and a final production audit.

Previously accepted visual requirements still apply: the landing page is an editorial presentation with no purchase controls, while the shop is separate; one Combos navigation entry; the landing carousel cross-fades every four seconds; theme changes animate; preserve the visual design and dark/light mode. Current price facts confirmed by the owner are ₹400 / ₹750 / ₹1,250 for 30 / 50 / 100 ml, plus shipping ₹100 Mumbai / ₹120 elsewhere.

## Implemented

- **Existing storefront integrated:** Added product search, fragrance family/size/price/availability filters, sorting, product clean URLs and metadata, structured available product facts, similar/recommended items from actual catalogue rules, recently viewed products, sharing, product availability and related-combo links. Wishlist empty state/current price/availability/remove/move-to-cart behavior was preserved and extended. No reviews or product facts were invented.
- **Checkout and order database:** Added versioned commerce schema for order/item snapshots, variants, stock, reservations, coupons, payment events, audit trail, reviews, admin membership, tracking fields and private helpers. Checkout re-reads current catalogue values in SQL, validates input and coupon rules, calculates shipping/totals on the server, snapshots prices, reserves known stock transactionally, and uses an idempotency key/fingerprint. Checkout and payment state remain separate. Signed-in customers can access their own order data; anonymous guest enquiries still use WhatsApp.
- **Unknown stock handled safely:** All 18 real variants remain with unknown (`NULL`) availability; no stock numbers were fabricated. Online order reservation is blocked until the owner enters actual inventory. Existing WhatsApp enquiry remains useful meanwhile. Combo ingredient recipes also require owner setup before online combo purchase.
- **Admin foundation and interface:** Added a separate, direct `/admin` page with its own responsive header and theme control, plus protected dashboard overview, product/archive editing, variant size/price/stock/threshold/active controls, coupon management, order/customer lookup/status/tracking management, reviews moderation and basic sales statistics. Google sign-in initiated there returns to `/admin`. The UI is not the security boundary: database RPCs check admin membership and AAL2 MFA. Admin is not provisioned yet, so the route fails closed.
- **Payments isolated:** Added Razorpay-oriented initiation, verification and webhook handlers, provider abstraction, signed webhook validation, server-side amount checks, duplicate/replay protection, pending/failure/cancel/refund states and safe missing-configuration responses. Payment status cannot be changed by frontend success. The deployed edge functions currently respond with `CONFIGURATION_REQUIRED` because real provider secrets/configuration are absent.
- **Database/API safeguards:** Public catalogue/review projections use narrow view readers. Public tables and private schema access are guarded with RLS, grants, constraints and indexes. Legacy client-trusted order function removed. Definer helpers use restricted search paths; admin operations verify membership/MFA. Order prices are immutable snapshots. No fake customer/order/test data was inserted in production.
- **SEO, policies, errors:** Added server product metadata endpoints, canonical/social tags, product JSON-LD based on live fields, sitemap and robots, clean product route support, 404 handling, and owner-review policy/contact/FAQ framework. Legal and business language that requires owner confirmation remains marked for approval.
- **Security headers and serving:** Added a restrictive CSP and standard browser headers plus Vercel rewrites that avoid serving repository tests, scripts, development packages and configuration as site files. Static app continues to use plain HTML/CSS/JS, no build. Supabase publishable key is the only browser key; no service-role/provider secrets were added.
- **Privacy-aware events:** Added optional first-party event abstraction. It requires local consent and respects GPC/Do Not Track; there is no configured analytics vendor or analytics credential.
- **Accessibility/performance:** Added/reused responsive source sets and lazy loading for noncritical media, clear loading/empty/error states, keyboard controls, form feedback, reduced-motion behavior, contrast/focus fixes and mobile handling. Landing design and full-resolution source artwork were preserved.
- **Owner edit mode:** `edit-mode.js` gives a signed-in administrator an in-place editing layer over the storefront. A single click edits text only (prices, images and product records are untouched); a double click skips editing and behaves exactly as it does for a shopper (opens links, fires buttons); grid/flex blocks such as product cards can be dragged into a new order; and a fixed bottom-left toolbar provides Done/Save, Discard and Reset all. Edits are addressed by stable element paths, re-applied after every render/navigation, and published to `public.site_content` through `admin_save_site_content` (guarded by `require_admin()` + `aal2`, plus input-shape validation and an admin audit entry) so every visitor sees them. Until the owner's session is `aal2`, changes fall back to local browser storage with a visible notice. Anonymous read of `site_content` is intended; anonymous writes are denied (verified live: 401/42501) and covered by database tests.
- **Storefront/admin updates:** Home nav entry and brand-to-landing links, clickable landing product/combo imagery, "Enter the vault" repositioned with "Discover our world" removed, two-option admin menu, admin sales statistics, custom cursor, collapsible shop filters, images/cards resized to their artwork (no white bands), and a cart that routes anonymous shoppers to sign in before proceeding.
- **Docs/automation:** Added this handoff, `SECURITY.md`, updated `README.md`, pinned npm lockfile and CI workflow. Supabase SDK remains pinned/self-hosted.

## Repository areas changed

Primary application: `index.html`, `app.js`, `edit-mode.js`, `commerce.js`, `commerce-views.js`, `admin.js`, `seo.js`, `commerce.css`, `upgrade.css`, `vercel.json`, `robots.txt`, `api/`, `.env.example`, `supabase/config.toml`, `supabase/functions/`.

Four commerce migrations already applied remotely: `supabase/migrations/20261022105858_commerce_foundation.sql`, `20261022105905_checkout_inventory_admin.sql`, `20261022105916_payment_state.sql`, `20261022110040_public_projection_security.sql`. The fifth, `20261022114100_database_query_indexes_and_policy_consolidation.sql`, and the sixth, `20261022153000_site_content_edits.sql` (owner site-text edits), are now applied to the live project — verified on 2026-10-22 by checking `admin_audit_actor_lookup` exists and `public.site_content` resolves.

Verification and CI: `package.json`, `package-lock.json`, `.github/workflows/test.yml`, `tests/database.cjs`, `tests/commerce-database.cjs`, `tests/payments.mjs`, `tests/security.cjs`, `tests/seo.cjs`, `tests/browser.cjs`, `tests/commerce-browser.cjs`, `tests/admin-browser.cjs`, `tests/edit-mode-browser.cjs`, `tests/audit.cjs`, `tests/live-smoke.mjs`, `tests/catalogue-fixture.cjs`, and `scripts/serve.cjs`.

## Database migrations and connected production state

The first four commerce migrations above were applied to the connected Supabase project. Their local/remote version records matched. Payment Edge Functions `payments` and `payment-webhook` were deployed and are active, with JWT gateway verification disabled because the handler itself validates the user JWT or raw webhook signature. The `pv-expire-reservations` scheduled job is active every five minutes. During the follow-up audit, Supabase advisor found 12 unindexed foreign-key paths and six pairs of overlapping authenticated read policies; the fifth migration adds those FK indexes and consolidates those policies, and the sixth adds `public.site_content` with admin-only write RPCs. Both are now live (verified by catalog queries on 2026-10-22), so re-run the advisor rather than assuming those warnings remain.

Google sign-in is now enabled in the project (`external_google_enabled=true`) with Site URL `https://parrfumsvault.in` and redirect allowlist `https://parrfums-vault.vercel.app/**,https://parrfumsvault.in/**`; localhost is intentionally not allowlisted, so local callback testing needs it added temporarily. The project has one user and one `admin_users` row: the owner UUID `f3295e90-cde2-4df2-906a-5a45cb495a01` (`kabirsayed.k@gmail.com`). That membership alone does not authorize admin writes — `require_admin()` also demands an `aal2` MFA session, and the owner has not enrolled yet (see external actions).

Live checks still show zero orders, zero inventory counts and no fabricated rows; payment functions safely report missing provider configuration. The publishable key is public by design and permission-limited; never place a service-role key in the frontend.

## Security review results

The user's requested vulnerability checks map to these results:

1. **Price/business-logic tampering:** Browser totals, discounts, shipping and claimed payment result are not trusted. SQL rereads price and stock, validates coupon/order details, calculates the charge, snapshots values and controls state transitions. Test suites include altered prices, stock races/changed catalogue values and duplicate submissions.
2. **SQL injection:** Data access uses parameterized Supabase SDK query filters or typed PostgreSQL RPC parameters. Public input does not become raw SQL. User-controlled text is escaped at HTML/metadata output. Database tests and source/security checks pass.
3. **Outdated software/plugins:** This is not WordPress/Magento and contains no CMS/plugin system. SDK is pinned/self-hosted; lockfile records dev/test tools. `npm audit --audit-level=moderate` found zero known advisories in that dependency tree. This does not check the future status of the deployed platform or all transitive/runtime supply chain changes; rerun regularly.
4. **XSS/skimming:** Text output escaping and strict CSP reduce injection paths; no tag manager, third-party analytics or unknown payment JavaScript is loaded on general page views. Razorpay is only loaded for payment. Browser tests attempt hostile catalogue/search text. A code test is not proof that no future supply-chain or account compromise can inject a skimmer. The SDK's browser-stored session remains script-accessible if same-origin JS is compromised.
5. **Admin/account takeover:** Database admin permission requires an owner-granted membership and `aal2` MFA. The UI cannot grant itself access. Google OAuth is enabled with a production Site URL/redirect allowlist and one owner membership exists, but admin writes still fail closed until that owner completes MFA enrollment and presents an `aal2` session; edit-mode publishing uses the same guard. This is fail-closed, not a missing frontend button.
6. **Data exposure:** Production live smoke checks could read public catalogue projection but anonymous requests to order/payment/admin private tables and admin RPC were rejected. Security Advisor after the view-hardening migration had no ERROR finding. It listed five private RLS tables without client policies (intended) and 12 guarded authenticated SECURITY DEFINER RPCs (expected; maintain each guard). Re-run advisor after future schema changes.
7. **Headers/secrets:** npm/source checks found no leaked secrets; CSP/security-header definitions are in Vercel config, but only a post-deploy response check proves the hosting edge applied them. Do not claim the browser uses HttpOnly cookies: Supabase PKCE session is in SDK browser storage.

Expanded mappings, verification boundaries and response guidance are in `SECURITY.md`. The latest advisor still reports 12 authenticated-callable SECURITY DEFINER RPCs; their database functions contain the corresponding user-ownership/admin+MFA checks. It also reports 11 currently unused indexes, which were left in place because the production commerce tables have little or no workload yet; do not delete them based on cold-project statistics alone.

## Tests and actual results

Run from repository root:

```powershell
npm ci
npm test
npm run test:browser
npm run test:audit
npm audit --audit-level=moderate
npm run test:live
```

At handoff, the deterministic suites passed:

- Database: server pricing/shipping, coupons, inventory, address/quantity validation, snapshots, idempotency, releases/retries, private data isolation, admin AAL2, tracking/order lifecycle, webhook state validation, review moderation, and guarded site text (`site_content` readable by visitors, writable only through the admin RPCs).
- Payment fixtures: provider state mapping, HMAC and signature checks, user ownership/auth, origin validation, server amount binding, duplicate/replayed/tampered webhook, failure/pending/refund behavior, missing config and network failure. These are isolated fixtures; no actual payment was made.
- Security: CSP/header definitions, vendored SDK integrity, frontend secret/dynamic-code checks, ignored-secret rules, legacy checkout removal and MFA boundary.
- SEO: real database price values, omitting unknown stock/fake ratings, escaped metadata/JSON-LD, canonical setup, sitemap, 404 and API errors.
- Existing and new browser journeys: landing/store navigation, theme, carousel, catalog, cart, shipping/WhatsApp, checkout form, stale cart/offline fallback, mobile routes, search/filter/sort, product URL/history, XSS output, wishlist, quote/retry, order tracking, admin guards, policy routes, admin product/variant/stock/archive/coupon and tab flows, plus edit mode (bottom-left toolbar, click-to-edit text, double-click behaves like a shopper, drag reorders blocks, Save publishes through the RPC).
- Full-page accessibility/layout audit passed WCAG A/AA axe checks on landing, home, shop, product, combos, account, admin and privacy at 390px and 1440px in both themes, with no horizontal overflow/page errors.
- `npm audit --audit-level=moderate`: zero findings.
- Live smoke: passed; public projections accessible, private endpoints and anonymous admin calls denied, payment functions fail safely for missing secrets, no production data changed.

One parallel browser run transiently observed an auth variable error while changes were being edited. The session handling was corrected and a fresh sequential full browser run passed. Do not cite the transient run as final failure.

There is no real Google OAuth/MFA owner session, credentialed Razorpay payment/refund, courier event, production browser-header check, owner-authenticated dashboard session, or true concurrent multi-client PostgreSQL stress run in the environment. Isolated database tests exercise business invariants, but must not be described as proof of multi-session load behavior.

## EXTERNAL OWNER ACTIONS REQUIRED

1. **Google auth redirects (applied, verify after deploy):** Supabase Auth now has Site URL `https://parrfumsvault.in` and redirect allowlist `https://parrfums-vault.vercel.app/**,https://parrfumsvault.in/**`; localhost is deliberately excluded (add it temporarily only for local callback testing). Google Console's authorized redirect URI remains `https://lshwmudskeeknmcxlffe.supabase.co/auth/v1/callback`. When the real domain is accessible, confirm the sign-in round-trip on it.
2. **Enroll MFA, then admin is fully live:** The owner auth user `f3295e90-cde2-4df2-906a-5a45cb495a01` (`kabirsayed.k@gmail.com`) already holds `admin_users` membership. The remaining step is for that owner to sign in at `/admin`, complete "Verify with authenticator", and present an `aal2` session. Until then every admin write — order/stock/coupon changes and edit-mode Save — fails closed, and edit-mode changes only persist in that browser's local storage. Do not make all authenticated customers admins.
3. **Configure real business inventory:** Count and enter stock for all actual 18 variants. Confirm real combo component recipes before enabling online combo checkout. Until then, unknown inventory and combo config correctly block online order reservation.
4. **Configure payment provider:** Add the real Razorpay key ID, API secret and webhook signing secret only to Supabase Edge Function secrets; set `PAYMENT_PROVIDER=razorpay` and `ALLOWED_ORIGINS` to the actual site origin. Register `/functions/v1/payment-webhook` in Razorpay and verify with provider sandbox transactions/refund before launch. No credentials are in Git.
5. **Approve legal/business content:** Replace/approve policy placeholders and confirm contact, privacy, terms, cancellation, return/refund, delivery estimates and any tax/business details. No unsupported promises were invented.
6. **After production deployment:** Verify the real domain's CSP/security headers and OAuth return; exercise the admin with MFA, customer order ownership, stock contention, Razorpay webhook and refund in sandbox; inspect Supabase Security Advisor and browser/server logs. Add real courier integration only if the owner provides an account and tracking workflow.

## Continuation instructions

Read `README.md`, `SECURITY.md`, `supabase/migrations/` (or the consolidated `supabase/ALL_MIGRATIONS.sql`), `api/`, `edit-mode.js` and the Edge Function handlers before making architecture changes. All six migrations are applied to the live project; after any future schema change, re-run both advisor categories. Inspect live migrations/advisors before any new DB change. Keep the landing page editorial, keep stock unknown until counted, preserve the owner prices/shipping, never trust client totals/payment success, never expose service-role/payment secrets, and do not invent reviews/product notes/policies. Run `npm run test:all`, `npm audit`, and the read-only live smoke after changes. After deploy, repeat the external checks above; code presence alone does not make sign-in, payment or production headers live.
