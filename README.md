# Parrfums Vault

Buildless storefront for Parrfums Vault. The presentation landing page remains an editorial introduction; `#home` opens the separate shop. Guest enquiries continue through WhatsApp. Persistent checkout and online payment require a signed-in customer and owner-configured provider credentials. The site never treats a browser-supplied price or payment result as authoritative.

## Local development

Install the pinned development tools with `npm ci`, then run `npm start` and open `http://127.0.0.1:8000`. The customer-facing site itself is plain HTML, CSS and JavaScript and does not require a build step. `npm run test:all` runs isolated database/payment/security/SEO tests, browser integration tests and the full-page accessibility/layout audit. `npm run test:live` is a read-only check against configured Supabase; it performs no production writes. GitHub Actions runs the deterministic suites and dependency audit.

## Application map

- `index.html`, `app.js`, `styles.css`, `polish.css`, `upgrade.css`, `theme.js`: existing storefront, landing page, theme, cart, account and responsive UI.
- `commerce.js`, `commerce-views.js`, `commerce.css`, `admin.js`, `seo.js`: commerce integration, customer order/wishlist/review views, owner console, product metadata and SEO helpers.
- `edit-mode.js`: owner edit mode. In edit mode a single click edits a text in place, a double click behaves like a normal click for every visitor (links open, buttons fire), grid/flex blocks can be dragged to a new order, and a fixed bottom-left toolbar holds Done/Save, Discard and Reset all. Saving publishes the edits through the admin RPC so every visitor sees them.
- `api/`: Vercel server-rendered product metadata and sitemap endpoints. `robots.txt` controls crawlers. `vercel.json` contains rewrites and security/cache headers.
- `supabase/migrations/`: ordered, versioned SQL changes. `supabase/functions/`: isolated payment initiation, verification and webhook handlers.
- `tests/`: PGlite database invariants, payment provider fixtures, frontend/security/SEO checks, browser journeys, accessibility audit, and optional read-only live smoke test.
- `assets/` and `vendor/`: supplied media, optimized responsive image exports, and pinned self-hosted Supabase SDK.

## Commerce and catalog rules

Owner-confirmed prices are ₹400 / ₹750 / ₹1,250 for 30 / 50 / 100 ml. Shipping is ₹100 within Mumbai and ₹120 elsewhere. The database recalculates prices, shipping, coupons, stock availability and totals at checkout. Variants retain `NULL` available quantity until the owner supplies counted stock; this intentionally blocks paid checkout for unconfirmed stock. Combo recipes must also be configured from real component variants before an online combo order is allowed. Existing offers and WhatsApp enquiry flows remain available.

The public catalogue is read through the Supabase publishable key and RLS-protected read-only projection views. No service-role key belongs in the browser. Reviews are visible only after moderation. Product facts and review ratings are shown only when present in database records. Guest recently viewed IDs stay in local storage. Wishlist sync remains owner-scoped in Supabase. Optional first-party analytics requires explicit local consent and respects browser privacy signals.

## Migrations and database

The commerce migrations below were applied to the connected Supabase project, and each one was verified present in the live database:

1. `20261022105858_commerce_foundation.sql`
2. `20261022105905_checkout_inventory_admin.sql`
3. `20261022105916_payment_state.sql`
4. `20261022110040_public_projection_security.sql`
5. `20261022114100_database_query_indexes_and_policy_consolidation.sql`
6. `20261022153000_site_content_edits.sql` (owner-published site text)

Use Supabase migration tooling and review SQL before applying changes elsewhere. The performance migration adds indexes for foreign-key lookup paths and merges overlapping authenticated read policies. `site_content` stores owner-published site text: anyone may read it (it is public website copy), but rows are written only through the admin RPCs `admin_save_site_content` / `admin_delete_site_content`, which check signed-in admin membership server-side; direct table writes are blocked by RLS. The checkout RPC takes product and variant identifiers, then reads current prices and inventory inside a transaction. It snapshots item details and totals, reserves stock idempotently, validates coupons, and maintains order/payment state separately. Admin RPCs check database membership; hiding the admin route is not the security boundary. Private tables have RLS and no anonymous access. Payment webhook events have unique replay protection and signed payload validation.

## Security controls

The storefront does not run a CMS or third-party plugin framework. The Supabase SDK is pinned and self-hosted; npm audit currently reports no known vulnerabilities in the locked development dependency tree. Database calls use the Supabase SDK's parameterized filters or typed RPC arguments. User-entered text is escaped before HTML rendering, metadata and JSON-LD are escaped, and the CSP blocks inline/eval scripts and unapproved origins. Vercel adds frame, MIME, referrer, transport and content-security headers. Public read models expose only the catalogue/review fields needed by customers.

See [SECURITY.md](SECURITY.md) for the specific attack checks and their remaining boundaries. The Supabase browser session uses the SDK's PKCE local session storage; same-origin script execution could access a signed-in session, so preventing XSS and limiting script sources remain important. Admin sign-in supports email OTP and Google; access is based on the signed-in user's `admin_users` membership, with no separate authenticator MFA. Email OTP requires the Supabase Magic Link template to include `{{ .Token }}` and working production email delivery. No order, inventory count, review or payment secret was fabricated.

## Owner content editing

A signed-in administrator can open edit mode from the admin menu. The toolbar stays in the bottom-left corner while edit mode is on: **Done / Save** publishes, **Discard** reverts the unsaved session, **Reset all** clears stored edits and returns to the rendered catalogue. Only text can be changed — prices, images, product records and layout styles are not editable this way. A single click starts editing text; a double click skips editing and acts exactly as it does for a shopper (opening links, firing buttons). Blocks inside a row or grid (product cards, gallery tiles) can be dragged to a new order. Saved edits are keyed by a stable element path, so they re-apply after every re-render and navigation, and are published for all visitors through `admin_save_site_content`, which requires admin membership. If the signed-in account is not an approved administrator, changes cannot be published.

## Required owner setup before production checkout

See [SECURITY.md](SECURITY.md) and the deployment settings. Google OAuth and email OTP sign-in are available; approved admin identities are held in `admin_users`, not shown in the UI. Configure the Supabase Magic Link email template to include `{{ .Token }}` and ensure production email delivery is configured for OTP codes. This setup intentionally does not require an authenticator second factor, so protect the approved email accounts. Enter counted stock for the actual 18 variants and actual component recipes for each online combo. Configure Razorpay test/live credentials and webhook signing secret only as Supabase Edge Function secrets; set the actual Vercel origin allowlist. Enter and approve the store's privacy, terms, shipping, refund, cancellation and contact wording. Exact values and steps are listed in `HANDOFF.md`; do not add secrets to Git or the frontend.

## Brand and media

The landing page is presentation-only and contains no buying controls. It retains the original brand style, dark/light mode, and four-second combo slideshow with a fade. The shop remains separate. Responsive image exports preserve original artwork and load below-the-fold media lazily. Owner-confirmed brand details live in `BRAND.md`; verify any business contact/policy change with the owner before publishing.
