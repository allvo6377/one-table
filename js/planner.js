// Plan construction + money math. The design's fixed week is now generated:
// unique meals across the week (breakfasts especially), seeded per week so
// each week differs but is stable.
import { recipes, cuisineMains, cuisineBreakfasts, neutralBreakfasts, currency, SLOTS } from './data.js';
import { state } from './store.js';

// ---- seeded shuffle (mulberry32) ----
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, seed) {
  const a = arr.slice(), rand = rng(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function seedOf(key) { let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0; return Math.abs(h) || 1; }

const allBreakfasts = () => [...neutralBreakfasts, ...Object.values(cuisineBreakfasts).flat()];
const allMains = () => Object.values(cuisineMains).flat();

export function effId(day, slot) {
  // Ignore persisted swaps that point at recipe ids this build doesn't know
  // (e.g. a swap saved before a deploy that renamed a recipe).
  const o = state.overrides[day.name + '-' + slot];
  return (o && recipes[o]) ? o : day[slot].id;
}

export function fmtLocal(usd, cuisine) {
  const c = currency[cuisine];
  if (!c) return null;
  const val = usd * c.rate * (c.ppp || 1);
  return c.symbol + val.toLocaleString('en-US', { minimumFractionDigits: c.dec, maximumFractionDigits: c.dec });
}

export function localVal(usd, cur) { return usd * cur.rate * (cur.ppp || 1); }

// Cost of a candidate week: 6 mains (2 batch-3x/leftover pairs …) + 2 breakfasts,
// weighted by how often each appears in the role template below.
function planCost(mains, bfs) {
  const r = recipes, [A, B, C, D, E, F] = mains, [X, Y] = bfs;
  return 3 * (r[A].cost + r[B].cost) + 2 * (r[C].cost + r[D].cost + r[E].cost + r[F].cost) + 4 * r[X].cost + 3 * r[Y].cost;
}

// Leftover/batch template: distinct cooked mains (M0..M9) + 7 breakfast slots.
// Leftovers deliberately reuse a cooked dish (batch-cook → next-day lunch);
// no dish is *freshly cooked* twice, and every breakfast is unique.
function assemble(days, bf, M) {
  const roles = [
    { b: bf[0], l: { id: M[0], batch: 2 }, d: { id: M[1], batch: 2 } },
    { b: bf[1], l: { id: M[0], leftover: 'Mon' }, d: { id: M[2] } },
    { b: bf[2], l: { id: M[3], batch: 2 }, d: { id: M[4], batch: 2, freezer: 1 } },
    { b: bf[3], l: { id: M[3], leftover: 'Wed' }, d: { id: M[5] } },
    { b: bf[4], l: { id: M[6], batch: 2 }, d: { id: M[1], leftover: 'Mon' } },
    { b: bf[5], l: { id: M[6], leftover: 'Fri' }, d: { id: M[7] } },
    { b: bf[6], l: { id: M[8] }, d: { id: M[9] } },
  ];
  return days.map(({ name, date }, i) => ({ name, date, breakfast: { id: roles[i].b }, lunch: roles[i].l, dinner: roles[i].d }));
}

// Fill a length-n sequence from a pool, cycling only when the pool runs out.
function sequence(pool, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length]);
  return out;
}

// "A mix of all" — 7 unique breakfasts and 10 distinct mains from the world.
export function buildMixedPlan(seed) {
  const bf = shuffle(allBreakfasts(), seed).slice(0, 7);
  const M = shuffle(allMains(), seed ^ 0x9e3779b9).slice(0, 10);
  return assemble(state.week.days, bf, M);
}

export function buildCuisinePlan(cuisine, budgetLocal, seed = 1) {
  const cur = currency[cuisine];
  const byCost = a => a.slice().sort((x, y) => recipes[x].cost - recipes[y].cost);
  const ms = byCost(cuisineMains[cuisine]);
  const bfIds = byCost(cuisineBreakfasts[cuisine]).slice(0, 2);
  const n = ms.length;
  const cheap6 = ms.slice(0, 6);
  const ultra = [ms[0], ms[1], ms[2], ms[3], ms[0], ms[1]];
  const sets = [ms.slice(n - 6), byCost([...ms.slice(0, 4), ...ms.slice(n - 2)]), cheap6, ultra];
  let mainIds = sets[0];
  if (budgetLocal) {
    mainIds = ultra;
    for (const set of sets) {
      if (localVal(planCost(set, bfIds), cur) <= budgetLocal) { mainIds = set; break; }
    }
  }
  // Pad the 6 budget mains up to 10 template slots with the cheapest extras,
  // so leftovers reuse but fresh cooks stay distinct where the cuisine allows.
  const M = [...mainIds];
  for (const id of ms) { if (M.length >= 10) break; if (!M.includes(id)) M.push(id); }
  while (M.length < 10) M.push(mainIds[M.length % mainIds.length]);
  // Breakfasts: cycle through *all* the cuisine's breakfasts (seeded) so a
  // single-cuisine week repeats them as little as the menu allows.
  const bf = sequence(shuffle(cuisineBreakfasts[cuisine], seed), 7);
  return assemble(state.week.days, bf, M);
}

// The plan is derived, never persisted: rebuilt deterministically from the
// week key + the persisted cuisine/budget choice.
export function currentPlan() {
  const seed = seedOf(state.week.key || 'w');
  if (state.planCuisine) return buildCuisinePlan(state.planCuisine, state.planBudgetLocal, seed);
  return buildMixedPlan(seed);
}

export function planTotals() {
  let cost = 0, prot = 0;
  const cuisines = new Set();
  state.plan.forEach(d => SLOTS.forEach(slot => {
    const e = d[slot], r = recipes[effId(d, slot)];
    prot += r.protein;
    if (r.cuisine) cuisines.add(r.cuisine);
    if (!e.leftover) cost += r.cost * (e.batch || 1);
  }));
  return { cost, prot, cuisines };
}

export function actualPlanCost(plan) {
  let cost = 0;
  plan.forEach(d => SLOTS.forEach(slot => {
    const e = d[slot];
    if (!e.leftover) cost += recipes[e.id].cost * (e.batch || 1);
  }));
  return cost;
}

// First unused dish for this slot, honouring a locked single-cuisine week.
export function swapCandidate(day, slot) {
  const cur = effId(day, slot);
  const used = new Set();
  state.plan.forEach(d => SLOTS.forEach(sl => used.add(effId(d, sl))));
  const pc = state.planCuisine;
  const allMains = Object.values(cuisineMains).flat();
  const pool = pc
    ? (slot === 'breakfast' ? cuisineBreakfasts[pc] : cuisineMains[pc])
    : (slot === 'breakfast' ? [...neutralBreakfasts, ...Object.values(cuisineBreakfasts).flat()] : allMains);
  return pool.find(id => id !== cur && !used.has(id)) || null;
}
