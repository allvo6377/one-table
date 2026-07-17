// Boot + render loop. One rAF-batched render per state change; four dirty
// regions (sidebar, tabbar, view, overlays) each rewritten in a single
// innerHTML assignment.
import { state, set, load, onChange, resetWeekScoped } from './store.js';
import { currentWeek } from './dates.js';
import { currentPlan } from './planner.js';
import { pantryPool, recipes } from './data.js';
import { sidebar, tabbar, todayView, planView, shoppingView, pantryView } from './views.js';
import { overlays, cookFoot } from './overlays.js';
import { actions, onBudgetInput, closeTopLayer } from './actions.js';

const $ = id => document.getElementById(id);
let lastView = null;
let lastOverlayKey = '';
let lastPlan = null;

// Entry animations only run on regions carrying [data-entering]; in-place
// re-renders drop the attribute first so nothing replays mid-interaction.
function setEntering(el, entering) {
  if (entering) el.setAttribute('data-entering', '');
  else el.removeAttribute('data-entering');
}

// Cook mode advances steps in place: the progress bar keeps its width
// transition and the steam never restarts — only the step text re-animates.
function patchCookStep(root) {
  const r = recipes[state.cooking];
  const total = r.steps.length, n = state.cookStep + 1;
  root.querySelector('.cook-fill').style.width = Math.round(n / total * 100) + '%';
  root.querySelector('.cook-count').textContent = `Step ${n} of ${total}`;
  const step = root.querySelector('.cook-step');
  step.textContent = r.steps[state.cookStep];
  step.classList.remove('anim-in');
  void step.offsetWidth;
  step.classList.add('anim-in');
  root.querySelector('.cook-foot').innerHTML = cookFoot();
}

// ---- focus management ----
// innerHTML re-renders destroy the focused node. We identify the focused
// control by its data-* signature and re-focus its replacement, so keyboard
// users don't get dumped back to <body> after every interaction.
let lastTrigger = null; // element that opened the current overlay

function focusSignature(el) {
  if (!el || el === document.body || !el.dataset) return null;
  const d = el.dataset;
  if (!d.act) return null;
  return { act: d.act, id: d.id, key: d.key, view: d.view, layout: d.layout, item: d.item, val: d.val, dir: d.dir, slot: d.slot, day: d.day };
}

function refocus(root, sig) {
  if (!sig) return false;
  for (const el of root.querySelectorAll(`[data-act="${sig.act}"]`)) {
    const d = el.dataset;
    if (['id', 'key', 'view', 'layout', 'item', 'val', 'dir', 'slot', 'day'].every(k => (d[k] ?? undefined) === sig[k])) {
      el.focus({ preventScroll: true });
      return true;
    }
  }
  return false;
}

const FOCUSABLE = 'button:not([disabled]), input, [href], [tabindex]:not([tabindex="-1"])';

function render() {
  const active = document.activeElement;
  const sig = focusSignature(active && active.closest ? active.closest('[data-act]') : null);
  const focusRegion = active ? active.closest('#view, #sidebar, #tabbar, #overlays') : null;

  $('sidebar').innerHTML = sidebar();
  $('tabbar').innerHTML = tabbar();

  const main = $('view');
  // Regenerating the week replaces the whole plan — treat it as a re-entry.
  const entering = state.view !== lastView || state.plan !== lastPlan;
  setEntering(main, entering);
  switch (state.view) {
    case 'plan': main.innerHTML = planView(); break;
    case 'shopping': main.innerHTML = shoppingView(); break;
    case 'pantry': main.innerHTML = pantryView(pantryPool.filter(n => !state.have.includes(n))); break;
    default: main.innerHTML = todayView();
  }
  if (entering) main.scrollTop = 0;
  lastView = state.view;
  lastPlan = state.plan;

  const ovEl = $('overlays');
  const key = state.cooking ? 'cook:' + state.cooking
    : state.showGen ? 'gen'
      : state.selId ? 'sheet:' + state.selId : '';
  const overlayChanged = key !== lastOverlayKey;
  if (key && !overlayChanged && state.cooking && ovEl.querySelector('.cook')) {
    patchCookStep(ovEl);
  } else {
    setEntering(ovEl, overlayChanged);
    ovEl.innerHTML = overlays();
  }
  document.documentElement.classList.toggle('locked', !!key);
  $('fab').hidden = !!key;

  // Restore or move focus.
  if (key && overlayChanged) {
    if (!lastOverlayKey) lastTrigger = sig; // remember what opened the stack
    const first = ovEl.querySelector(FOCUSABLE);
    if (first) first.focus({ preventScroll: true });
  } else if (!key && lastOverlayKey) {
    // Overlay closed: hand focus back to whatever opened it.
    if (!refocus(document, lastTrigger)) main.focus?.({ preventScroll: true });
    lastTrigger = null;
  } else if (focusRegion && sig) {
    refocus(key ? ovEl : focusRegion.id === 'view' ? main : document, sig);
  }
  lastOverlayKey = key;
}

let scheduled = false;
function invalidate() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; render(); });
}

// ---- events: one delegated listener per event type ----
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el.dataset, e, el);
});
document.addEventListener('input', e => {
  if (e.target.dataset.act === 'budget') onBudgetInput(e.target);
});
document.addEventListener('change', e => {
  if (e.target.dataset.act === 'budget') invalidate();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeTopLayer(); return; }
  // Focus trap: while an overlay is open, Tab cycles inside it.
  if (e.key === 'Tab' && lastOverlayKey) {
    const items = [...$('overlays').querySelectorAll(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const inside = $('overlays').contains(document.activeElement);
    if (!inside) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// A long-lived session (installed PWA left open) can cross midnight or even
// into a new week — recheck the clock whenever the app regains attention.
function refreshWeek() {
  const w = currentWeek();
  if (w.key !== state.week.key) {
    state.week = w;
    set({ week: w, ...resetWeekScoped(), plan: currentPlan() });
  } else if (w.todayIdx !== state.week.todayIdx) {
    // Same week, new day: today moves; yesterday's prep nudge is done with.
    set({ week: w, nudgeDone: false });
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshWeek(); });
addEventListener('focus', refreshWeek);

// ---- boot ----
load();
set({ plan: currentPlan() }, { silent: true });
onChange(invalidate);
render();

// Offline + instant repeat visits; registered after first paint so it never
// competes with the initial load.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* non-fatal */ });
  });
}
