# Table for One

*Party of one · eat the world.* A solo meal planner: seven days of Kenyan,
Swahili, Nigerian, Ugandan, Indian and Italian cooking sized for one person —
batch-cooked dinners roll into next-day lunches, a shopping list writes
itself, and a full-screen cook mode walks you through each recipe.

Implemented from the Claude Design source (`Table for One.dc.html`) as a
**zero-dependency, buildless vanilla-JS PWA** — ~35 KB gzipped for the whole
app, recipes included, installable and fully offline after first visit.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the design rationale.

## Run it

No build, no dependencies — serve the folder with any static server:

```sh
python3 -m http.server 8000
# or: npx http-server -p 8000
```

Then open http://localhost:8000. (A server is needed because the app uses
native ES modules; the service worker additionally wants `localhost` or
HTTPS.)

## Features

- **Today** — today's three meals with protein tracking, a "mark eaten" log,
  tonight's 2-minute prep nudge, the leftover shelf, and a use-it-up radar
  for perishables.
- **Weekly plan** — grid or agenda layout; batch/leftover/freezer/quick
  badges; one-tap meal swaps that respect the week's constraints.
- **Shopping list** — auto-generated from the week, grouped by aisle,
  pantry staples pre-crossed-off.
- **Pantry** — chip-based have/add list that feeds the shopping list and
  recipe "have it" markers.
- **Plan a new week** — lock the week to one cuisine and fit it to a local
  budget (KES / TZS / NGN / UGX / INR / EUR, PPP-adjusted), or mix them all.
- **Cook mode** — full-screen, step-at-a-time, with a satisfying "Plate up"
  that logs your protein.

On phones the sidebar becomes a bottom tab bar, the recipe panel becomes a
bottom sheet, and the week grid becomes a snap-scrolling carousel. State
(pantry, checks, eaten meals, swaps, plan choice) persists in localStorage.

## Optional cross-device sync

The app is **local-first** — it works fully offline and signed out. Sign in
with your email (a six-digit code, no password) and your pantry, plan choice
and week progress sync to any device you sign in on. It's a ~3 KB
dependency-free client over Supabase auth + REST; every table is guarded by
row-level security, so the publishable key in `js/config.js` is safe to ship.
See [ARCHITECTURE.md](ARCHITECTURE.md#backend-optional-sync-local-first-syncjs--supabase)
for the schema, RLS model, and conflict strategy.
