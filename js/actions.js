// All user interactions, keyed by data-act. One delegated listener in app.js
// dispatches here — no per-element handlers, so re-rendering a region never
// re-binds anything.
import { state, set } from './store.js';
import { recipes, currency } from './data.js';
import { effId, swapCandidate, buildCuisinePlan, actualPlanCost, fmtLocal, localVal, currentPlan } from './planner.js';
import { toast } from './ui.js';

export const actions = {
  view(d) { set({ view: d.view }); },
  layout(d) { set({ layout: d.layout }); },

  open(d) { set({ selId: d.id, servings: 1 }); },
  closeRecipe() { set({ selId: null }); },
  servings(d) {
    const next = Math.min(4, Math.max(1, state.servings + Number(d.dir)));
    if (next !== state.servings) set({ servings: next });
  },
  addList(d) { toast('Added ' + recipes[d.id].name + ' to your shopping list'); },

  eat(d) {
    const now = !state.eaten[d.key];
    set({ eaten: { ...state.eaten, [d.key]: now } });
    if (now) toast(recipes[d.id].protein + 'g protein logged — nicely done');
  },

  nudgeDone(d) {
    set({ nudgeDone: true });
    toast('Head start banked for ' + d.day);
  },

  swap(d) {
    const day = state.plan.find(x => x.name === d.day);
    const next = swapCandidate(day, d.slot);
    if (!next) {
      toast(state.planCuisine
        ? 'No other ' + state.planCuisine + ' dishes left for this slot'
        : 'No fresh alternatives left for this slot');
      return;
    }
    set({ overrides: { ...state.overrides, [d.day + '-' + d.slot]: next } });
    toast('Swapped in ' + recipes[next].name + ' — list updated');
  },

  cook(d) { set({ cooking: d.id, cookStep: 0, selId: null }); },
  cookNext() {
    const total = recipes[state.cooking].steps.length;
    set({ cookStep: Math.min(total - 1, state.cookStep + 1) });
  },
  cookBack() { set({ cookStep: Math.max(0, state.cookStep - 1) }); },
  cookClose() { set({ cooking: null }); },
  cookFinish() {
    const r = recipes[state.cooking];
    const td = state.plan[state.week.todayIdx];
    const isTonight = effId(td, 'dinner') === state.cooking;
    const eaten = isTonight ? { ...state.eaten, [td.name + '-dinner']: true } : state.eaten;
    set({ cooking: null, eaten });
    toast('Plated up — ' + r.protein + 'g protein logged. Enjoy.');
  },

  check(d) {
    const c = state.checked;
    set({ checked: c.includes(d.item) ? c.filter(x => x !== d.item) : [...c, d.item] });
  },
  hideHave() { set({ hideHave: !state.hideHave }); },
  pantryAdd(d) { set({ have: [...state.have, d.item] }); },
  pantryRemove(d) { set({ have: state.have.filter(x => x !== d.item) }); },

  openGen() { set({ showGen: true }); },
  closeGen() { set({ showGen: false }); },
  pref(d) {
    const patch = { ...state.prefs, [d.key]: d.val };
    if (d.key === 'cuisines') patch.budgetLocal = null;
    set({ prefs: patch });
  },

  regenerate() {
    const cz = state.prefs.cuisines;
    if (cz === 'A mix of all') {
      set({ planCuisine: null, planBudgetLocal: null, showGen: false, view: 'plan', overrides: {}, eaten: {}, nudgeDone: false });
      set({ plan: currentPlan() });
      toast('Your fresh world tour is ready');
      return;
    }
    const cur = currency[cz];
    const budgetLocal = state.prefs.budgetLocal ?? cur.budgetDefault;
    const plan = buildCuisinePlan(cz, budgetLocal);
    const actualCost = actualPlanCost(plan);
    const actualLocal = fmtLocal(actualCost, cz);
    const targetLocal = cur.symbol + Math.round(budgetLocal).toLocaleString('en-US');
    const ratio = localVal(actualCost, cur) / budgetLocal;
    set({ plan, planCuisine: cz, planBudgetLocal: budgetLocal, showGen: false, view: 'plan', overrides: {}, eaten: {}, nudgeDone: false });
    toast(ratio <= 1
      ? `Your all-${cz} week is ready — ${actualLocal} of your ${targetLocal} budget.`
      : ratio <= 1.2
        ? `Closest all-${cz} week: ${actualLocal} — a touch over your ${targetLocal} target.`
        : `The cheapest all-${cz} week costs ${actualLocal} — well over your ${targetLocal} target.`);
  },
};

// Range slider: patch the label live without a full re-render (a re-render
// mid-drag would recreate the input and drop the pointer capture).
export function onBudgetInput(input) {
  const v = Number(input.value);
  set({ prefs: { ...state.prefs, budgetLocal: v } }, { silent: true });
  const cur = currency[state.prefs.cuisines];
  if (!cur) return;
  const formatted = cur.symbol + Math.round(v).toLocaleString('en-US');
  const label = document.getElementById('budget-val');
  if (label) label.textContent = formatted;
  input.setAttribute('aria-valuetext', formatted);
}

// Escape closes the topmost layer only.
export function closeTopLayer() {
  if (state.cooking) set({ cooking: null });
  else if (state.showGen) set({ showGen: false });
  else if (state.selId) set({ selId: null });
}
