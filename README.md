# Parrfums Vault

Client-ready storefront for Parrfums Vault, Mumbai. This is a static website built with plain HTML, CSS, and JavaScript; it has no build step or package dependencies. Product ordering is handled through WhatsApp, phone, and Instagram DM.

## Run locally

From this directory, run a static file server:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>. The default route is the landing page; `#home` opens the store.

## Deploy to Vercel

Import this GitHub repository in Vercel. Use the repository root as the project root; leave the framework preset as **Other** and the build and output commands empty. Vercel serves `index.html` and the local assets directly. Pushes to the production branch trigger deployments.

## Project files

- `index.html` — document shell, navigation, footer, metadata, and favicon
- `app.js` — landing page, catalogue, routes, cart, checkout, and interactions
- `styles.css`, `polish.css` — base and brand styling
- `assets/` — self-hosted photography and the supplied Parrfums Vault logo
- `BRAND.md` — verified brand facts, product names, and prices
- `supabase/migrations/` — versioned public read-only catalogue schema and seed data

Business contacts and prices are shown on the storefront; update them only after confirming the current official details.

## Supabase catalogue

The storefront reads active products, size prices, and offers from the Parrfums Vault Supabase Data API at startup. It uses the project's public publishable key, which is safe for browser use only because the exposed tables have RLS enabled and SELECT-only grants. If the API is unavailable or returns invalid data, the bundled catalogue remains available. The catalogue data schema and seed are in `supabase/migrations/`.

Orders/customer data are not sent to Supabase; ordering remains WhatsApp-based. Never place a database password or secret/service-role key in frontend code or Git. The project is intended to be transferable to the client organization at handoff.

`vercel.json` sets a restrictive Content Security Policy and standard browser security headers. The policy permits scripts only from this site and limits network connections to the configured Supabase project. These hosting headers take effect after deployment; local static-server tests do not apply them.

## Reuse and ownership

This repository is published for client handoff. No open-source license is included; public visibility does not by itself grant reuse rights. Confirm asset and code rights with the project owner before reuse or redistribution.
