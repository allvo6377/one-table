// Plan construction + money math, ported 1:1 from the design's Component.
import { recipes, mixedPlan, cuisineMains, cuisineBreakfasts, neutralBreakfasts, currency, SLOTS } from './data.js';
import { state } from './store.js';

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

export function buildCuisinePlan(cuisine, budgetLocal) {
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
  const [A, B, C, D, E, F] = mainIds;
  const [X, Y] = bfIds;
  const roles = [
    { b: X, l: { id: A, batch: 2 }, d: { id: B, batch: 3, freezer: 1 } },
    { b: Y, l: { id: A, leftover: 'Mon' }, d: { id: C, batch: 2 } },
    { b: X, l: { id: B, leftover: 'Mon' }, d: { id: D, batch: 2 } },
    { b: Y, l: { id: C, leftover: 'Tue' }, d: { id: E, batch: 2 } },
    { b: X, l: { id: D, leftover: 'Wed' }, d: { id: F, batch: 2 } },
    { b: Y, l: { id: E, leftover: 'Thu' }, d: { id: B, leftover: 'Mon' } },
    { b: X, l: { id: F, leftover: 'Fri' }, d: { id: A } },
  ];
  return state.week.days.map(({ name, date }, i) => ({ name, date, breakfast: { id: roles[i].b }, lunch: roles[i].l, dinner: roles[i].d }));
}

// The plan is derived, never persisted: rebuild it from the persisted
// cuisine + budget choice (deterministic), or fall back to the mixed week.
export function currentPlan() {
  if (state.planCuisine) return buildCuisinePlan(state.planCuisine, state.planBudgetLocal);
  return mixedPlan.map((d, i) => ({ ...d, name: state.week.days[i].name, date: state.week.days[i].date }));
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
