// All user interactions, keyed by data-act. One delegated listener in app.js
// dispatches here — no per-element handlers, so re-rendering a region never
// re-binds anything.
import { state, set, goToWeek } from './store.js';
import { recipes, currency } from './data.js';
import { effId, swapCandidate, actualPlanCost, fmtLocal, localVal, currentPlan } from './planner.js';
import { weekByOffset } from './dates.js';
import { toast } from './ui.js';
import { sendCode, verifyCode, signOut, resetPending, auth } from './sync.js';
import { toggle as timerToggle, reset as timerReset } from './timer.js';

export const actions = {
  view(d) { set({ view: d.view }); },
  layout(d) { set({ layout: d.layout }); },
  selectWeek(d, e, el) {
    const offset = Number(el ? el.value : d.offset);
    if (offset === state.weekOffset) return;
    goToWeek(weekByOffset(offset), offset);
    set({ plan: currentPlan() });
  },

  open(d) { set({ selId: d.id, servings: 1, showSearch: false }); },
  closeRecipe() { set({ selId: null }); },

  openSearch() { set({ showSearch: true, searchQuery: '' }); },
  closeSearch() { set({ showSearch: false }); },
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
  // Timer buttons paint themselves — no state render (which would replay the step).
  cookTimer() { timerToggle(); },
  cookTimerReset() { timerReset(); },
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

  openAccount() { set({ showAccount: true }); },
  closeAccount() { set({ showAccount: false }); },
  syncBack() { resetPending(); },
  async syncSend() {
    const email = document.getElementById('sync-email')?.value.trim();
    if (!email || !email.includes('@')) { toast('Enter a valid email address'); return; }
    await sendCode(email);
  },
  async syncVerify() {
    const code = document.getElementById('sync-code')?.value.trim();
    if (!code) { toast('Enter the 6-digit code from your email'); return; }
    await verifyCode(code);
    if (auth.user) { set({ showAccount: false }); toast('Signed in — your table follows you now'); }
  },
  async syncOut() {
    await signOut();
    set({ showAccount: false });
    toast('Signed out — this device keeps its local copy');
  },
  pref(d) {
    const patch = { ...state.prefs, [d.key]: d.val };
    if (d.key === 'cuisines') { patch.budgetLocal = null; patch.region = 'All regions'; }
    set({ prefs: patch });
  },

  regenerate() {
    const cz = state.prefs.cuisines;
    if (cz === 'A mix of all') {
      set({ planCuisine: null, planBudgetLocal: null, planRegion: null, showGen: false, view: 'plan', overrides: {}, eaten: {}, nudgeDone: false });
      set({ plan: currentPlan() });
      toast('Your fresh world tour is ready');
      return;
    }
    const cur = currency[cz];
    const budgetLocal = state.prefs.budgetLocal ?? cur.budgetDefault;
    const region = state.prefs.region && state.prefs.region !== 'All regions' ? state.prefs.region : null;
    // Set the choice first, then derive the plan the same way a reload will
    // (seeded by the week key) so what you see now is what persists.
    set({ planCuisine: cz, planBudgetLocal: budgetLocal, planRegion: region, showGen: false, view: 'plan', overrides: {}, eaten: {}, nudgeDone: false });
    const plan = currentPlan();
    const actualCost = actualPlanCost(plan);
    const actualLocal = fmtLocal(actualCost, cz);
    const targetLocal = cur.symbol + Math.round(budgetLocal).toLocaleString('en-US');
    const ratio = localVal(actualCost, cur) / budgetLocal;
    set({ plan });
    const who = region ? `${region} (${cz})` : `all-${cz}`;
    toast(ratio <= 1
      ? `Your ${who} week is ready — ${actualLocal} of your ${targetLocal} budget.`
      : ratio <= 1.2
        ? `Closest ${who} week: ${actualLocal} — a touch over your ${targetLocal} target.`
        : `The cheapest ${who} week costs ${actualLocal} — well over your ${targetLocal} target.`);
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
  else if (state.showAccount) set({ showAccount: false });
  else if (state.selId) set({ selId: null });
  else if (state.showSearch) set({ showSearch: false });
  else if (state.showGen) set({ showGen: false });
}
