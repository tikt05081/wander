# Wander

**Walk through it before you view it.**

Wander turns a property listing's floorplan + photos into an interactive 3D walkthrough, delivered as a concierge service to estate agents and private sellers.

- `index.html` — public site (pitch, pricing, request form)
- `studio.html` — internal build tool: trace rooms → 3D. `view.html?p=<name>` — public walkthrough viewer. `projects/` + `portfolio/` — sample properties (regenerate plans with `python3 tools/make_floorplans.py`).
- `lib/` — three.js (vendored, no build step)

## Run locally
```
python3 -m http.server 8080
```
then open http://localhost:8080

## Deploy
Static site — no build. Push to GitHub, import into Vercel, done.

## Before going live
- Change `EMAIL` at the bottom of `index.html` to your real address
- Replace `hello@example.com` with your email
