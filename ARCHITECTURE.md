# Table for One — Architecture

*A solo meal planner: seven days of world cooking sized for one, with smart
leftovers, a live shopping list, and a step-by-step cook mode. Implemented
from the Claude Design source (`Table for One.dc.html`) with a hard brief:
**fast, and optimized for mobile devices**.*

---

## The one-sentence architecture

**A zero-dependency, buildless vanilla-JS PWA**: ten native ES modules, one
stylesheet, one mutable state object, string-template views re-rendered per
animation frame into four DOM regions, four delegated event listeners, and a
cache-first service worker — **~35 KB gzipped for the entire application,
recipes included**.

```
index.html ── css/app.css (design system, 1 file)
     │
     └── js/app.js          boot · render loop · event delegation · SW registration
           ├── store.js     state object · set()/load() · localStorage persistence
           ├── data.js      62 recipes · plans · currencies · categories (from the design, 1:1)
           ├── dates.js     live Monday-start week (the design's fixed week, made real)
           ├── planner.js   week generation · budget fitting · money/PPP math · swaps
           ├── derive.js    pure selectors: shopping list, fridge, radar, nudge, stats
           ├── views.js     page renderers: Today · Plan · Shopping · Pantry · shell
           ├── overlays.js  recipe sheet · cook mode · generator modal
           ├── actions.js   every user interaction, keyed by data-act
           └── ui.js        esc() · emoji thumbs · toast
sw.js                       cache-first precache of everything above
manifest.webmanifest        installable PWA (standalone, theme-colored)
fonts/*.woff2               self-hosted variable fonts (latin subset)
```

---

## Why no framework (the load-bearing decision)

The brief says *fast on mobile*. On a mid-range Android phone over a mediocre
connection, the cost hierarchy is: **network bytes → JS parse/compile →
hydration/VDOM work → everything else**. A framework taxes all three before
the app does anything of its own. This app's actual workload is tiny: ~62
static recipes, four views, three overlays, and state transitions that are
trivially expressible as plain object mutation. Concretely:

| Approach | JS shipped (gz) | Build step | Hydration cost |
|---|---|---|---|
| React + Vite | ~45 KB framework **+ app** | yes | yes |
| Preact | ~4 KB framework + app + tooling | yes | yes |
| Svelte | small output, compiler lock-in | yes | some |
| **This (vanilla ESM)** | **26 KB total, half of it recipe data** | **none** | **none** |

The entire app — markup, styles, logic, *and the full recipe database* — is
~35 KB gzipped. That is smaller than most frameworks' runtime alone. First
load is four render-critical requests (HTML → CSS + 2 preloaded fonts), the
modules arrive warm via `<link rel="modulepreload">`, and there is no
hydration: the first render *is* the app.

Just as important: **no build step**. `git clone` + any static file server
(or GitHub Pages) is the whole deployment story. There is no dependency
graph to rot, no lockfile, no supply chain, no "works after `npm i` on the
right Node version". For a self-contained product like this, tooling would
be pure overhead — the browser's native module system already does the job.

The honest trade-off: no component ecosystem, no JSX ergonomics, and
templates are strings (escaping is on us — every interpolated value goes
through `esc()`). At this scale — ~600 lines of view code — that trade is
clearly favourable. The "when this stops being true" section below draws the
line.

## Rendering model: rebuild regions, not diff trees

State lives in **one mutable object** (`store.js`). `set(patch)` assigns and
schedules **one render per animation frame** (rAF-batched, so a burst of
mutations costs one render). Rendering rebuilds four independent DOM regions
by string concatenation and a single `innerHTML` write each:

```
#sidebar   desktop nav + week-at-a-glance stats
#tabbar    mobile bottom tabs
#view      the active page (Today / Plan / Shopping / Pantry)
#overlays  recipe sheet / cook mode / generator
```

Why this instead of a virtual DOM or fine-grained signals? Because the
numbers say it's already over-fast: the largest view (the 7-day grid, 21 meal
cards) is a few hundred elements; building the string and parsing it takes
~1–2 ms on a phone. A diffing layer would add code to *save* time we aren't
spending. Blowing away the DOM has real costs, though, and each one is
handled explicitly rather than papered over:

- **Event listeners** — none are attached to rendered nodes. Four delegated
  listeners on `document` (`click`, `input`, `change`, `keydown`) dispatch on
  `data-act` attributes to handlers in `actions.js`. Re-rendering never
  rebinds anything.
- **Entry animations** — naive innerHTML re-rendering replays every CSS
  entry animation on every state change (tap "Mark eaten", watch the whole
  page fade in again). Fixed structurally: all entry animations are gated
  behind a `[data-entering]` attribute that the renderer sets only when a
  region *actually enters* (view switched, overlay opened, plan regenerated).
  In-place re-renders parse without the attribute and paint directly in the
  final state.
- **Stateful widgets** — two cases where re-parsing would hurt, patched
  surgically instead:
  - the **budget range slider**: re-rendering mid-drag would recreate the
    input and drop the pointer. `input` events write state silently and patch
    only the value label; the full render happens on `change` (drag end).
  - **cook mode steps**: advancing a step updates the progress-bar width
    (preserving its CSS transition), step counter, step text (re-triggering
    only *its* animation), and footer buttons — the steam animation and the
    rest of the overlay never re-parse.
- **Scroll position** — the scroll container survives re-renders (equal
  content height), and is reset to top only on actual view entry.
- **Focus** — the focused control is identified by its `data-*` signature
  before each re-render and its replacement is re-focused after, so keyboard
  users are never dumped back to `<body>`. Overlays move focus in on open,
  trap Tab inside while open, and hand focus back to the triggering control
  on close.

This is the pragmatic middle ground: the *simplicity* of "UI = f(state)"
with targeted escape hatches where identity actually matters.

## State: derive everything, persist almost nothing

`derive.js` holds pure selectors that recompute the shopping list, leftover
shelf, use-it-up radar, tonight's prep nudge, and week stats from the plan on
every render — no caches, no invalidation bugs; the workload is microseconds.

Persistence (localStorage, written via `requestIdleCallback` so it never
blocks a tap) stores only *user intent*: pantry contents, checked items,
eaten meals, swaps, preferences, and the chosen cuisine + budget. **The plan
itself is never persisted** — `buildCuisinePlan()` is deterministic, so the
plan is rebuilt from those persisted choices at boot. That keeps stored state
tiny, unforgeable, and impossible to desync from the recipe data.

One deliberate upgrade over the design prototype: the design pinned the week
to "13–19 July" with Tuesday hardcoded as today. `dates.js` derives the
Monday-start week from the real clock, so "Today" is always today and the
plan's day labels carry real dates. (During verification the container's
clock rolled past midnight and the "Today" pill moved from Thu to Fri on its
own — the feature demonstrating itself.)

Day-keyed state is **week-scoped**: persistence carries the week's identity
(`weekKey`, the Monday's date), and on load any `eaten`/`overrides`/
`checked`/`nudgeDone` saved under a different week is discarded rather than
misapplied to the new week's meals. Long-lived sessions recheck the clock on
`visibilitychange`/`focus`, so an installed PWA left open overnight rolls
"Today" forward (and resets cleanly at the week boundary) without a reload.
Persisted swaps are validated against the recipe table at read time, so a
deploy that renames a recipe id can't crash a returning client.

## Mobile strategy: same DOM, different physics

One DOM, one HTML payload, two ergonomic profiles via a single `900px`
breakpoint:

- The desktop **sidebar** collapses; navigation moves to a fixed **bottom
  tab bar** (thumb-reachable, safe-area padded) plus a floating **"plan a new
  week" FAB**. The sidebar's week-at-a-glance stats reappear as a dark strip
  on the Today page.
- The recipe drawer (right-hand panel on desktop) becomes a **bottom sheet**
  with a grab handle; the generator modal does the same. Cook mode was born
  full-screen and needs no adaptation beyond type scale.
- The 7-day grid becomes a **horizontal scroll-snap carousel** (~2 columns
  per viewport); agenda rows stack their date header above the meals.
- Touch details: `100dvh` layout (no URL-bar jump), `viewport-fit=cover` +
  `env(safe-area-inset-*)` for notched phones, `touch-action: manipulation`
  (no 300 ms tap delay), tap-highlight suppressed, swap/checkbox targets
  enlarged under `(pointer: coarse)`, `overscroll-behavior` containment on
  sheets, and `prefers-reduced-motion` disables all animation.

## Performance budget (measured, not aspirational)

| Asset | Size (gz) | When |
|---|---|---|
| index.html | 0.9 KB | render-critical |
| app.css | 7.8 KB | render-critical |
| JS (10 modules, incl. all recipe data) | 26 KB | modulepreloaded |
| Fonts (3 variable woff2, self-hosted, latin) | ~227 KB raw | preloaded ×2, `font-display: swap`, cached forever |
| Recipe imagery | **0 bytes** | emoji + CSS gradients |

- **No third-party requests at all.** Fonts are self-hosted variable woff2
  (the design's Google Fonts dependency inlined into the origin), so there's
  no extra DNS/TLS handshake on the critical path and no CDN privacy leak.
- **Images cost zero.** The design used drop-a-photo image slots; thumbnails
  here are slot-tinted gradients + the dish's emoji — instant at any DPR, no
  decode, no layout shift, and honestly rather charming.
- **Service worker** (`sw.js`) precaches the entire app cache-first: the
  second visit and every visit after loads from disk in milliseconds and
  works fully offline — it's an installable standalone PWA (manifest + SVG
  and maskable PNG icons).
- JS executes once at boot; there are no timers, observers, or polling loops
  alive between interactions (one toast timeout aside).

## Fidelity to the design source

`data.js` was extracted programmatically from the design file — all 62
recipes, the mixed week, per-cuisine pools, the KES/TZS/NGN/UGX/INR/EUR
currency table with PPP factors, and the ingredient→aisle map are byte-for-
byte the designer's data. `planner.js` ports the budget-fitting algorithm
(four candidate menus per cuisine, cheapest that fits the local-currency
budget) and the leftover/batch role template exactly. The visual system —
Newsreader + DM Sans, the cream/terracotta palette, slot accent colors,
badges, steam, shimmer, pulse — is the design's own values, restructured
from inline styles into ~50 CSS custom properties and classes (which is
itself a size win: class names compress far better than repeated inline
styles, and the CSS caches independently of markup).

## Backend: optional sync, local-first (`sync.js` + Supabase)

The app is **local-first** — fully functional offline and signed out, with
localStorage as the source of truth. Sync is an *optional* layer bolted on
top: sign in and your intent (pantry, plan choice, week progress) follows you
to any device. Nothing about the offline experience changes if you never sign
in, and the sync module is the only code that talks to the network.

**No SDK.** `sync.js` is ~3 KB of raw `fetch` against Supabase's GoTrue (auth)
and PostgREST (data) endpoints — the `@supabase/supabase-js` SDK is ~40 KB gz
and would have doubled the app's JS. Auth is **email OTP** (a six-digit code,
no password to store, no redirect URLs to configure). The access token is
kept in localStorage and silently refreshed 60 s before expiry.

**Schema** (two tables, namespaced `tfo_*`, in a shared Supabase project):

| table | grain | columns |
|---|---|---|
| `tfo_user_state` | one row per user | `have`, `prefs`, `plan_cuisine`, `plan_budget_local`, `hide_have`, `layout`, `updated_at` |
| `tfo_week_state` | one row per (user, week) | `eaten`, `overrides`, `checked`, `nudge_done`, `updated_at`, PK `(user_id, week_key)` |

The split mirrors the client's own week-scoping: profile-wide state lives in
one row, day-keyed state is partitioned by `week_key` (the Monday's date), so
a new week is a new row and old weeks never contaminate it — the same
invariant the client enforces locally, now enforced in the schema.

**Security is the database's job, not the client's.** Every table has
**row-level security** with a single policy — `auth.uid() = user_id` for all
operations — so the publishable key is safe to ship in `config.js`: a signed-in
user can read and write only their own rows, and anon can see nothing. This
was verified directly (two test users): each sees zero of the other's rows,
cross-user writes return `403`, and anon reads return `[]`. `updated_at` is
stamped by a `SECURITY INVOKER` trigger, so the server clock is authoritative
regardless of device time; the trigger function has its `EXECUTE` revoked so
it isn't callable over RPC.

**Conflict model: last-write-wins, per row.** Writes are debounced 1.5 s and
`upsert` the whole row (`Prefer: resolution=merge-duplicates`). Pulls happen
on sign-in, on `visibilitychange`, and on reconnect; a pull only applies when
the server's `updated_at` differs from the copy we already hold, and applying
a remote change suppresses the echo push. Row-level (not field-level) LWW is
the honest MVP choice — for a single user across their own devices, the
failure mode (edit the same week on two offline devices, last sync wins) is
acceptable and predictable. Field-level merge or CRDTs would be the upgrade if
this ever became multi-user-per-plan; the row split already narrows the blast
radius (a pantry edit and a meal-eaten tick are different rows).

The store grew exactly one seam for this: an `onPersist` hook that fires after
each local save. `sync.js` subscribes to it and nothing else in the app knows
sync exists — the same isolation the architecture predicted the backend would
need.

## When this architecture stops being true

Honesty clause. Revisit the no-framework call if any of these arrive:

1. **Multi-user-per-plan or field-level conflict needs.** The current
   row-level last-write-wins sync (see above) is right for one user across
   their own devices; shared plans would need field-level merge or CRDTs and a
   real-time channel.
2. **User-generated recipes at scale.** Thousands of recipes means moving
   data out of the JS bundle into fetched/IndexedDB-cached JSON and
   virtualizing long lists.
3. **Deeply stateful, composed widgets** (drag-to-reorder planning, rich
   text). String templates stop paying rent around the point where you're
   hand-writing identity preservation more than twice — that's the Preact
   (still 4 KB) migration trigger, and the view functions are already
   props-in/markup-out, so they'd port mechanically.

Until then, the fastest framework is the one you don't ship.

---

*Verified end-to-end in headless Chromium at 1360×850 and 390×844 (touch):
all four views, recipe sheet, 3-step cook flow, meal swap, shopping check-off,
pantry add/remove, cuisine + budget regeneration (KSh budget fitting), Escape
layering, focus restoration + overlay focus trap, and localStorage
persistence across reload — zero console errors. Backend verified directly
against Supabase: email/password auth, owner upserts, RLS isolation in both
directions, forbidden cross-user write (403), and the `updated_at` trigger.*
