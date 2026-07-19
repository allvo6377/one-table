// Overlay renderers: recipe sheet (drawer / bottom sheet), cook mode,
// week generator. Rendered into #overlays; empty string when closed.
import { state } from './store.js';
import { recipes, currency, emojiOf } from './data.js';
import { fmtLocal, regionsForCuisine } from './planner.js';
import { esc, photoUrl, thumb } from './ui.js';
import { auth } from './sync.js';

const slotForTag = t => /breakfast/i.test(t) ? 'breakfast' : /lunch/i.test(t) ? 'lunch' : 'dinner';

// Results list, regenerated on its own as the query changes (keeps input focus).
export function searchResultsHTML() {
  const q = (state.searchQuery || '').trim().toLowerCase();
  let list = Object.values(recipes);
  if (q) list = list.filter(r => (r.name + ' ' + r.cuisine + ' ' + (r.region || '') + ' ' + r.tagline).toLowerCase().includes(q));
  list = list.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
  if (!list.length) return `<div class="search-empty">No meals match “${esc(state.searchQuery)}”. Try a cuisine or ingredient.</div>`;
  return list.map(r => `
    <button class="search-row" data-act="open" data-id="${r.id}">
      <span class="search-thumb">${thumb(r.id, slotForTag(r.tagline), '', [140, 140])}</span>
      <span class="search-info">
        <span class="search-name">${esc(r.name)}</span>
        <span class="search-meta">${r.region && r.region !== 'Nationwide' && r.region !== 'Coastal' ? esc(r.region) + ' · ' : ''}${r.cuisine ? esc(r.cuisine) + ' · ' : ''}${r.timeMin} min · ${r.protein}g · $${r.cost}</span>
      </span>
      <span class="search-go" aria-hidden="true">View →</span>
    </button>`).join('');
}

function searchModal() {
  return `
  <div class="scrim" data-act="closeSearch"></div>
  <div class="modal modal-search" role="dialog" aria-modal="true" aria-label="Search meals">
    <div class="search-head">
      <input id="search-input" class="sync-input search-input" type="search" inputmode="search" autocomplete="off"
             placeholder="Search ${Object.keys(recipes).length}+ meals — name, cuisine, ingredient…" data-act="search" value="${esc(state.searchQuery)}">
      <button class="btn-ghost search-close" data-act="closeSearch">Close</button>
    </div>
    <div id="search-results" class="search-results">${searchResultsHTML()}</div>
    <div class="search-foot">Tap a meal to see the recipe and add its ingredients to your shopping list.</div>
  </div>`;
}

const CUISINE_OPTS = ['A mix of all', 'Kenyan', 'Swahili', 'Nigerian', 'Ugandan', 'Indian', 'Italian'];

function recipeSheet() {
  const r = recipes[state.selId];
  if (!r) return '';
  const local = fmtLocal(r.cost, r.cuisine);
  const sv = state.servings;
  return `
  <div class="scrim" data-act="closeRecipe"></div>
  <aside class="sheet" role="dialog" aria-modal="true" aria-label="${esc(r.name)}">
    <div class="sheet-hero">
      <span class="hero-emoji" aria-hidden="true">${emojiOf[r.id] || '🍽'}</span>
      <img class="hero-img" alt="" decoding="async" src="${photoUrl(r.id, 900, 500)}" onerror="this.remove()">
      <button class="hero-close" data-act="closeRecipe" aria-label="Close">×</button>
      ${r.cuisine ? `<span class="cuisine-chip hero-chip">${esc(r.cuisine)}</span>` : ''}
      <div class="sheet-grab" aria-hidden="true"></div>
    </div>
    <div class="sheet-body">
      <div class="sheet-kicker">${esc(r.tagline)}</div>
      <h2 class="sheet-title">${esc(r.name)}</h2>
      ${r.cuisine ? `<div class="sheet-origin">${r.region && r.region !== 'Nationwide' && r.region !== 'Coastal' ? `<b>${esc(r.region)}</b> · ` : ''}${esc(r.cuisine)}</div>` : ''}
      <div class="meta-chips">
        <span class="meta-chip">⏱ ${r.timeMin} min</span>
        <span class="meta-chip">💪 ${r.protein}g protein</span>
        <span class="meta-chip">＄${r.cost}${local ? ` · ${esc(local)}` : ''} / serving</span>
      </div>
      <div class="servings">
        <div class="servings-info">
          <div class="servings-title">Servings to cook</div>
          <div class="servings-hint">${sv > 1 ? `Cook once, eat ${sv}×. Stash the rest for lunch — nothing wasted.` : 'Just enough for tonight. Bump it up to batch-cook.'}</div>
        </div>
        <div class="stepper">
          <button class="step-btn" data-act="servings" data-dir="-1" aria-label="Fewer servings">−</button>
          <span class="step-n">${sv}</span>
          <button class="step-btn" data-act="servings" data-dir="1" aria-label="More servings">＋</button>
        </div>
      </div>
      <p class="sheet-note">${esc(r.note)}</p>
      <h3 class="sheet-h3">Ingredients</h3>
      ${r.ingredients.map(ing => `
        <div class="ing-row">
          <span class="ing-name">${esc(ing.item)}${state.have.includes(ing.item) ? '<i class="ing-have">· have it</i>' : ''}</span>
          <span class="ing-qty">${esc(ing.qty)}</span>
        </div>`).join('')}
      <h3 class="sheet-h3">Method</h3>
      ${r.steps.map((t, i) => `
        <div class="step-row">
          <span class="step-num">${i + 1}</span>
          <span class="step-text">${esc(t)}</span>
        </div>`).join('')}
      <div class="sheet-actions">
        <button class="btn-ghost" data-act="addList" data-id="${r.id}">＋ Shopping list</button>
        <button class="btn-dark" data-act="cook" data-id="${r.id}">Start cooking →</button>
      </div>
    </div>
  </aside>`;
}

// Shared between the full render and app.js's surgical step patch.
export function cookFoot() {
  const total = recipes[state.cooking].steps.length;
  const isLast = state.cookStep + 1 === total;
  return `
      <button class="btn-outline-dark${state.cookStep === 0 ? ' is-dim' : ''}" data-act="cookBack">← Back</button>
      ${isLast
        ? '<button class="btn-plate" data-act="cookFinish">Plate up ✓</button>'
        : '<button class="btn-next" data-act="cookNext">Next step →</button>'}`;
}

function cookMode() {
  const r = recipes[state.cooking];
  if (!r) return '';
  const total = r.steps.length, n = state.cookStep + 1;
  return `
  <div class="cook" role="dialog" aria-modal="true" aria-label="Cooking ${esc(r.name)}">
    <div class="cook-track" role="progressbar" aria-label="Recipe progress" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${n}"><div class="cook-fill" style="width:${Math.round(n / total * 100)}%"></div></div>
    <div class="cook-head">
      <div>
        <div class="cook-kicker">Cooking now</div>
        <div class="cook-name">${esc(r.name)}</div>
      </div>
      <button class="cook-close" data-act="cookClose" aria-label="Stop cooking">×</button>
    </div>
    <div class="cook-stage">
      <div class="cook-steam" aria-hidden="true">
        <span class="steam s1"></span><span class="steam s2"></span><span class="steam s3"></span>
      </div>
      <div class="cook-count">Step ${n} of ${total}</div>
      <div class="cook-step anim-in" data-key="${n}">${esc(r.steps[state.cookStep])}</div>
    </div>
    <div class="cook-foot">${cookFoot()}</div>
  </div>`;
}

function chipGroup(group, key, opts, note) {
  return `
  <div class="pref-group">
    <div class="pref-title">${esc(group)}</div>
    <div class="chip-row">
      ${opts.map(label => {
        const on = state.prefs[key] === label;
        const sub = key === 'cuisines' && currency[label] ? currency[label].code : '';
        return `<button class="pref-chip${on ? ' is-on' : ''}" aria-pressed="${on}" data-act="pref" data-key="${key}" data-val="${esc(label)}">${esc(label)}${sub ? `<i>${sub}</i>` : ''}</button>`;
      }).join('')}
    </div>
    ${note ? `<div class="pref-note">${esc(note)}</div>` : ''}
  </div>`;
}

function generator() {
  const cz = state.prefs.cuisines;
  const cuisineNote = cz !== 'A mix of all'
    ? `Your whole week — breakfast, lunch and dinner — stays ${cz}. No mixing with other cuisines.` : '';
  const cur = currency[cz];
  let budget;
  if (cur) {
    const bval = state.prefs.budgetLocal ?? cur.budgetDefault;
    budget = `
    <div class="pref-group">
      <div class="pref-title">Weekly budget</div>
      <div class="slider-row">
        <input type="range" min="${cur.budgetMin}" max="${cur.budgetMax}" step="${cur.budgetStep}" value="${bval}" data-act="budget" aria-label="Weekly budget" aria-valuetext="${cur.symbol}${Math.round(bval).toLocaleString('en-US')}">
        <span class="slider-val" id="budget-val">${cur.symbol}${Math.round(bval).toLocaleString('en-US')}</span>
      </div>
      <div class="pref-note">Local market prices. Drag to set what you can spend — we’ll build the cheapest ${esc(cz)} week that fits.</div>
    </div>`;
  } else {
    budget = chipGroup('Weekly budget', 'budget', ['$', '$$', '$$$'], '');
  }
  // Tribe/region narrowing — only shown for a specific country cuisine.
  const regions = regionsForCuisine(cz);
  const regionGroup = regions.length
    ? chipGroup('Region / tribe', 'region', ['All regions', ...regions],
        state.prefs.region && state.prefs.region !== 'All regions'
          ? `Focusing on ${state.prefs.region} dishes, rounded out with everyday ${cz} favourites.` : '')
    : '';
  return `
  <div class="scrim" data-act="closeGen"></div>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Plan your week">
    <div class="sheet-kicker sand">Cooking for one</div>
    <h2 class="sheet-title">Plan your week</h2>
    <p class="modal-blurb">A few taps and we’ll build seven days of meals sized for one — spanning your favourite cuisines, with smart leftovers so nothing spoils.</p>
    ${chipGroup('Cuisines', 'cuisines', CUISINE_OPTS, cuisineNote)}
    ${regionGroup}
    ${chipGroup('Cook time', 'time', ['Quick ≤15m', 'Balanced', 'I like to cook'], '')}
    ${budget}
    ${chipGroup('Batch cooking', 'batch', ['Minimal', 'Some', 'Max leftovers'], '')}
    <div class="modal-actions">
      <button class="btn-ghost" data-act="closeGen">Cancel</button>
      <button class="btn-primary" data-act="regenerate">Generate my week →</button>
    </div>
  </div>`;
}

function accountModal() {
  const err = auth.error ? `<div class="pref-note sync-error" role="alert">${esc(auth.error)}</div>` : '';
  let body;
  if (auth.user) {
    body = `
      <p class="modal-blurb">Signed in as <b>${esc(auth.user.email)}</b>. Your pantry, plan choices and week progress sync to every device you sign in on.</p>
      ${err}
      <div class="modal-actions">
        <button class="btn-ghost" data-act="closeAccount">Close</button>
        <button class="btn-primary" data-act="syncOut">Sign out</button>
      </div>`;
  } else if (auth.pendingEmail) {
    body = `
      <p class="modal-blurb">We emailed <b>${esc(auth.pendingEmail)}</b>. Enter the code below — or just tap the link in the email on this device.</p>
      <div class="pref-group">
        <label class="pref-title" for="sync-code">Code</label>
        <input id="sync-code" class="sync-input" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="12345678">
      </div>
      ${err}
      <div class="modal-actions">
        <button class="btn-ghost" data-act="syncBack">Different email</button>
        <button class="btn-primary" data-act="syncVerify">Verify &amp; sign in</button>
      </div>`;
  } else {
    body = `
      <p class="modal-blurb">Sync is optional — the app works fully offline without it. Sign in with your email and your pantry, plan and progress follow you to any device.</p>
      <div class="pref-group">
        <label class="pref-title" for="sync-email">Email</label>
        <input id="sync-email" class="sync-input" type="email" autocomplete="email" placeholder="you@example.com">
      </div>
      ${err}
      <div class="modal-actions">
        <button class="btn-ghost" data-act="closeAccount">Cancel</button>
        <button class="btn-primary" data-act="syncSend">Email me a code</button>
      </div>`;
  }
  return `
  <div class="scrim" data-act="closeAccount"></div>
  <div class="modal modal-slim" role="dialog" aria-modal="true" aria-label="Account and sync">
    <div class="sheet-kicker sand">Account</div>
    <h2 class="sheet-title">Sync across devices</h2>
    ${body}
  </div>`;
}

// Cook > account > search > generator > recipe sheet.
export function overlays() {
  if (state.cooking) return cookMode();
  if (state.showAccount) return accountModal();
  if (state.showSearch) return searchModal();
  if (state.showGen) return generator();
  if (state.selId) return recipeSheet();
  return '';
}
