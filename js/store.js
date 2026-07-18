// Single mutable state object + one render subscriber. No proxies, no
// diffing machinery — set() batches a re-render on the next animation frame.
import { currentWeek } from './dates.js';

const STORAGE_KEY = 'table-for-one:v1';
// Profile-wide persisted keys. Day-keyed state lives per-week in `weekStore`.
const PROFILE = ['have', 'prefs', 'planCuisine', 'planBudgetLocal', 'hideHave', 'layout'];
const DEFAULT_PREFS = { cuisines: 'A mix of all', time: 'Balanced', budget: '$$', batch: 'Some', budgetLocal: null };

export const state = {
  week: currentWeek(),
  weekOffset: 0,      // which week the Plan view is showing (0 = current)
  weekStore: {},      // weekKey -> { eaten, overrides, checked, nudgeDone }
  plan: [],           // set at boot by planner.currentPlan()
  view: 'today',      // today | plan | shopping | pantry
  layout: 'grid',     // grid | agenda
  selId: null,        // recipe sheet
  servings: 1,
  cooking: null,      // recipe id in cook mode
  cookStep: 0,
  showGen: false,
  showAccount: false,
  showSearch: false,
  searchQuery: '',
  hideHave: false,
  nudgeDone: false,
  have: ['Olive oil', 'Eggs', 'Honey', 'Rolled oats', 'Rice', 'Chia seeds', 'Cumin', 'Garam masala'],
  checked: [],
  eaten: {},          // 'Thu-dinner' -> true   (active week's working copy)
  overrides: {},      // 'Thu-dinner' -> recipeId (swaps)
  prefs: { ...DEFAULT_PREFS },
  planCuisine: null,
  planBudgetLocal: null,
};

// The active week's day-keyed state, snapshotted for storage.
function scopedSnapshot() {
  return { eaten: state.eaten, overrides: state.overrides, checked: state.checked, nudgeDone: state.nudgeDone };
}
function hydrateScoped(key) {
  const s = state.weekStore[key] || {};
  state.eaten = s.eaten || {};
  state.overrides = s.overrides || {};
  state.checked = s.checked || [];
  state.nudgeDone = s.nudgeDone || false;
}

// Switch the active/plan week: stash the current week's state, load the target.
export function goToWeek(weekObj, offset) {
  state.weekStore[state.week.key] = scopedSnapshot();
  state.week = weekObj;
  state.weekOffset = offset;
  hydrateScoped(weekObj.key);
}

let notify = null;
export function onChange(fn) { notify = fn; }

// Fires after each persisted write — the sync layer's "something changed" hook.
let persistNotify = null;
export function onPersist(fn) { persistNotify = fn; }

let saveQueued = false;
function queueSave() {
  if (saveQueued) return;
  saveQueued = true;
  const write = () => {
    saveQueued = false;
    try {
      // Fold the active week's working copy back into the store before saving.
      state.weekStore[state.week.key] = scopedSnapshot();
      const out = { weekStore: state.weekStore };
      for (const k of PROFILE) out[k] = state[k];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    } catch { /* storage full / private mode — app still works in-memory */ }
    if (persistNotify) persistNotify();
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
    for (const k of PROFILE) if (saved[k] !== undefined) state[k] = saved[k];
    state.weekStore = saved.weekStore || {};
    // Migrate v1 flat format: top-level eaten/overrides/checked keyed by weekKey.
    if (!saved.weekStore && saved.weekKey) {
      state.weekStore[saved.weekKey] = {
        eaten: saved.eaten || {}, overrides: saved.overrides || {},
        checked: saved.checked || [], nudgeDone: saved.nudgeDone || false,
      };
    }
    state.prefs = { ...DEFAULT_PREFS, ...state.prefs };
    hydrateScoped(state.week.key); // start on the current week
  } catch { /* corrupt storage — start fresh */ }
}
