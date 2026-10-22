# Parrfums Vault

Client-ready storefront for Parrfums Vault, Mumbai. This is a static website built with plain HTML, CSS, and JavaScript; it has no build step. Guest orders go through WhatsApp; signed-in customers can save an unpaid order request to Supabase.

## Run locally

From this directory, run a static file server:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>. The default route is the landing page; `#home` opens the store.

The original full-screen landing entrance is preserved, with Shop now leading to the upgraded store. The combo slideshow remains below the landing hero and advances every four seconds with a 500ms crossfade. Only Combos appears in navigation; existing `#offers` links remain compatible.

Light/dark controls are available on the landing page and in the store header. The first visit follows the system theme. A visitor's explicit choice is saved locally, synchronized across tabs, and applied by `theme.js` before styles load to avoid a bright flash. Later changes use a 450ms page crossfade, with colour interpolation as a fallback. Rapid toggles finish the previous transition safely. Product photographs keep their original colours in both themes. Reduced-motion preferences disable the crossfade and autoplay by default.

## Deploy to Vercel

Import this GitHub repository in Vercel. Use the repository root as the project root; leave the framework preset as **Other** and the build and output commands empty. Vercel serves `index.html` and the local assets directly. Pushes to the production branch trigger deployments.

## Project files

- `index.html` — document shell, navigation, footer, metadata, and favicon
- `app.js` — landing page, catalogue, routes, account flows, cart, checkout, and interactions
- `theme.js` — early theme initialization, system preferences and persistent theme controls
- `styles.css`, `polish.css` — base and brand styling
- `upgrade.css` — current collection layout, responsive navigation and combo presentation
- `assets/` — self-hosted photography and the supplied Parrfums Vault logo
- `BRAND.md` — verified brand facts, product names, and prices
- `supabase/migrations/` — versioned catalogue and customer account schema, RLS, and server-calculated order RPC
- `vendor/` — pinned, self-hosted Supabase JavaScript client and MIT license

Business contacts and prices are shown on the storefront; update them only after confirming the current official details.

## Supabase catalogue

### October 22 catalogue update

Owner-confirmed bottle prices are ₹400 / ₹750 / ₹1,250 for 30 / 50 / 100ml. Shipping is extra on every order: Mumbai ₹100, outside Mumbai ₹120. `calculate_shipping()` and the order RPC calculate this on the server using the delivery city (trimmed, case-insensitive Mumbai/Bombay; other cities use ₹120). Cart location is an estimate; checkout uses the actual entered city. Existing order snapshots are preserved.

Apply `supabase/migrations/20261022095133_owner_media_pricing_shipping.sql` before releasing this frontend. The `storefront_settings` revision prevents an outdated live catalogue from replacing the bundled owner-approved catalogue. If the current revision cannot be read, shopping and WhatsApp ordering remain available while saving account orders is disabled.

`#combos` shows the two actual offers and all five supplied posters. The landing slideshow has previous/next, direct slide selection, pause/play, keyboard and touch support. Autoplay pauses during interaction, offscreen, and in background tabs; reduced-motion users start with autoplay off. Free fragrance choices are confirmed on WhatsApp.

All 18 supplied images have 400 / 720 / 1080px WebP exports in `assets/media/`. They preserve the complete artwork; the hero alone uses a decorative crop. Images use responsive sources and explicit dimensions. The hero and first combo poster load eagerly; remaining images load lazily. Vercel caches media for a day with background revalidation.

To regenerate exports, install `sharp` as a development dependency outside the served root, make it available through `NODE_PATH`, then run:

```sh
node scripts/optimize-media.cjs "path/to/Parrfum vault"
```

Runtime still has no build step or npm dependencies. To run the isolated database integration checks, make `@electric-sql/pglite` available through `NODE_PATH` and run `node tests/database.cjs`. Browser checks use Playwright via `node tests/browser.cjs` against the local server. Test packages are development tools, never loaded by customers.

The storefront reads active products, size prices, and offers from the Parrfums Vault Supabase Data API at startup. It uses the project's public publishable key, which is safe for browser use only because the exposed tables have RLS enabled and SELECT-only grants. If the API is unavailable or returns invalid data, the bundled catalogue remains available. The catalogue data schema and seed are in `supabase/migrations/`.

Google sign-in must be enabled by the client before accounts work. Signed-in profile/address/wishlist and pending order request data are stored in Supabase under owner-scoped RLS. Guest checkout stays on WhatsApp. Never place a database password or secret/service-role key in frontend code or Git. The project is intended to be transferable to the client organization at handoff.

`vercel.json` sets a restrictive Content Security Policy and standard browser security headers. The policy permits scripts only from this site and limits network connections to the configured Supabase project. These hosting headers take effect after deployment; local static-server tests do not apply them.

## Customer accounts (Google sign-in)

The account flow uses a locally vendored, pinned Supabase JavaScript client and PKCE. Signed-in customers can sync wishlists, save/remove delivery addresses, update their profile, and see their own order requests. Checkout stores pending/unpaid requests only for signed-in customers; a database function re-reads catalogue prices and calculates shipping instead of trusting browser totals. Guest checkout continues through WhatsApp. No payment is taken. Tables use RLS and owner-scoped grants; customer order tables have no direct client write grant.

### Owner setup still required

Google sign-in is not enabled until the client completes OAuth setup:

1. In Google Cloud Console, configure the OAuth consent screen/app branding for the store and create a **Web application** OAuth client.
2. Add this exact authorized redirect URI in Google: `https://atxvfmvhnidknnhgwgaq.supabase.co/auth/v1/callback`.
3. In Supabase Dashboard → Authentication → Sign-in providers → Google, enable Google and enter the OAuth client ID and client secret. Enter the secret only in Supabase Dashboard; never in Git or chat.
4. In Supabase Authentication URL Configuration, set the production Site URL and allow the local URL `http://127.0.0.1:4321/**` plus the final production URL (and preview URLs only if needed).
5. Review and approve the account/privacy notice in the storefront, then test Google sign-in, wishlist sync, address saving, and order history before launch.

The Vercel project/domain is not yet available to this connection, so the production URL and production OAuth allowlist entry cannot be finalized here. The account data migration has been applied to the Supabase project; Google login stays blocked until the owner setup above is completed.

## Reuse and ownership

This repository is published for client handoff. No open-source license is included; public visibility does not by itself grant reuse rights. Confirm asset and code rights with the project owner before reuse or redistribution.
