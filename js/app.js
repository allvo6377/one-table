// Boot + render loop. One rAF-batched render per state change; four dirty
// regions (sidebar, tabbar, view, overlays) each rewritten in a single
// innerHTML assignment.
import { state, set, load, onChange } from './store.js';
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

function render() {
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
  if (key && key === lastOverlayKey && state.cooking && ovEl.querySelector('.cook')) {
    patchCookStep(ovEl);
  } else {
    setEntering(ovEl, key !== lastOverlayKey);
    ovEl.innerHTML = overlays();
  }
  lastOverlayKey = key;
  document.documentElement.classList.toggle('locked', !!key);
  $('fab').hidden = !!key;
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
  if (e.key === 'Escape') closeTopLayer();
});

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
