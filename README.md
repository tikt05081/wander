# Wander

**Walk through it before you view it.**

Wander turns a property listing's floorplan + photos into an interactive 3D walkthrough, delivered as a concierge service to estate agents and private sellers.

- `index.html` — public site (pitch, pricing, request form)
- `studio.html` — the internal build tool: trace rooms on a floorplan → generate a first-person 3D walkthrough
- `lib/` — three.js (vendored, no build step)

## Run locally
```
python3 -m http.server 8080
```
then open http://localhost:8080

## Deploy
Static site — no build. Push to GitHub, import into Vercel, done.

## Before going live
- Replace `YOUR_FORM_ID` in `index.html` with a real Formspree form id (free tier is fine)
- Replace `hello@example.com` with your email
