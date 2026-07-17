// Single mutable state object + one render subscriber. No proxies, no
// diffing machinery — set() batches a re-render on the next animation frame.
import { currentWeek } from './dates.js';

const STORAGE_KEY = 'table-for-one:v1';
const PERSISTED = ['have', 'checked', 'eaten', 'overrides', 'prefs', 'planCuisine', 'planBudgetLocal', 'hideHave', 'layout', 'nudgeDone', 'weekKey'];
// Day-name-keyed state is only meaningful within the week it was written.
const WEEK_SCOPED = ['checked', 'eaten', 'overrides', 'nudgeDone'];

export const state = {
  week: currentWeek(),
  plan: [],           // set at boot by planner.currentPlan()
  view: 'today',      // today | plan | shopping | pantry
  layout: 'grid',     // grid | agenda
  selId: null,        // recipe sheet
  servings: 1,
  cooking: null,      // recipe id in cook mode
  cookStep: 0,
  showGen: false,
  hideHave: false,
  nudgeDone: false,
  have: ['Olive oil', 'Eggs', 'Honey', 'Rolled oats', 'Rice', 'Chia seeds', 'Cumin', 'Garam masala'],
  checked: [],
  eaten: {},          // 'Thu-dinner' -> true
  overrides: {},      // 'Thu-dinner' -> recipeId (swaps)
  prefs: { cuisines: 'A mix of all', time: 'Balanced', budget: '$$', batch: 'Some', budgetLocal: null },
  planCuisine: null,
  planBudgetLocal: null,
  weekKey: currentWeek().key,
};

export function resetWeekScoped() {
  return { checked: [], eaten: {}, overrides: {}, nudgeDone: false, weekKey: state.week.key };
}

let notify = null;
export function onChange(fn) { notify = fn; }

let saveQueued = false;
function queueSave() {
  if (saveQueued) return;
  saveQueued = true;
  // Persist off the interaction path.
  const write = () => {
    saveQueued = false;
    try {
      const out = {};
      for (const k of PERSISTED) out[k] = state[k];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    } catch { /* storage full / private mode — app still works in-memory */ }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(write, { timeout: 800 });
  else setTimeout(write, 120);
}

export function set(patch, { silent = false } = {}) {
  Object.assign(state, patch);
  queueSave();
  if (!silent && notify) notify();
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    // State saved during a previous week must not leak onto this week's
    // meals — 'Thu-dinner' means a different dish now.
    const sameWeek = saved.weekKey === state.week.key;
    for (const k of PERSISTED) {
      if (saved[k] === undefined) continue;
      if (!sameWeek && WEEK_SCOPED.includes(k)) continue;
      state[k] = saved[k];
    }
    state.weekKey = state.week.key;
    state.prefs = { cuisines: 'A mix of all', time: 'Balanced', budget: '$$', batch: 'Some', budgetLocal: null, ...state.prefs };
  } catch { /* corrupt storage — start fresh */ }
}
