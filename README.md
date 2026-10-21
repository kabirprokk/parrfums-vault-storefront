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

Business contacts and prices are shown on the storefront; update them only after confirming the current official details.

## Reuse and ownership

This repository is published for client handoff. No open-source license is included; public visibility does not by itself grant reuse rights. Confirm asset and code rights with the project owner before reuse or redistribution.
