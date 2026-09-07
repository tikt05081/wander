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

## Premium tier — Blender renders
`blender/wander_blender.py` builds the same house in Blender (Cycles) with the Poly Haven furniture, one camera per room, and a 30 s tour.
```
/Applications/Blender.app/Contents/MacOS/Blender --background --python blender/wander_blender.py -- --project projects/perth-road-flat.json --out renders/perth --stills --samples 64
```
Add `--tour` for the video (slow), or `--preview` and open `renders/perth/house.blend` in Blender to look around / tweak before rendering.

## Furniture
`models/` are CC0 scans from [Poly Haven](https://polyhaven.com) (no attribution required). `models/manifest.json` maps names → files + real-world sizes.
