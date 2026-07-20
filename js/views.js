// Page + shell renderers. Each returns an HTML string; app.js swaps it into
// the DOM in one innerHTML write per dirty region.
import { state } from './store.js';
import { planTotals, fmtLocal, localVal } from './planner.js';
import { currency } from './data.js';
import { todayData, weekDays, fridgeData, radarChartData, nudgeData, shoppingData } from './derive.js';
import { esc, cap, thumb, cuisineChip, steam } from './ui.js';
import { auth } from './sync.js';
import { upcomingWeeks } from './dates.js';
import { CATEGORIES } from './tags.js';
import { brand, copy } from './content.js';

// Pill for the active dietary theme on the plan header, e.g. "🥗 Vegetarian week".
function dietBadge() {
  if (!state.planDiet) return '';
  const c = CATEGORIES.find(x => x.id === state.planDiet);
  if (!c) return '';
  return `<span class="plan-diet-pill">${c.emoji} ${esc(c.label)} week</span>`;
}

const NAV = [['Today', 'today'], ['Weekly plan', 'plan'], ['Shopping list', 'shopping'], ['Pantry', 'pantry']];

const NAV_ICONS = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.4"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>',
  shopping: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9.5h16l-1.6 9a2 2 0 0 1-2 1.7H7.6a2 2 0 0 1-2-1.7L4 9.5z"/><path d="M8.5 9.5 12 3.8l3.5 5.7"/></svg>',
  pantry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 8.5h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-10z"/><path d="M8.5 8.5V6a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 6v2.5M7 13h10"/></svg>',
};

function glanceHTML() {
  const { cost, prot, cuisines } = planTotals();
  const perMeal = (cost / 21).toFixed(2).replace(/0$/, '');
  const cur = state.planCuisine ? currency[state.planCuisine] : null;
  const local = cur ? fmtLocal(cost, state.planCuisine) : null;
  const hasTarget = !!(cur && state.planBudgetLocal);
  const within = hasTarget ? localVal(cost, cur) <= state.planBudgetLocal : true;
  const target = hasTarget ? cur.symbol + Math.round(state.planBudgetLocal).toLocaleString('en-US') + ' budget' : '';
  return `
    <div class="glance-row"><span class="glance-num c-gold">${Math.round(prot / 7)}g</span><span class="glance-sub">protein<br>per day, avg.</span></div>
    <div class="glance-row"><span class="glance-num c-sage">$${Math.round(cost)}</span><span class="glance-sub">for 21 meals<br>≈ $${perMeal} a plate${local ? `<br><b class="${within ? 'c-sage' : 'c-rust'}">≈ ${esc(local)}</b>${target ? `<span> / ${esc(target)}</span>` : ''}` : ''}</span></div>
    <div class="glance-row"><span class="glance-num c-clay">${cuisines.size}</span><span class="glance-sub">${cuisines.size === 1 ? 'cuisine' : 'cuisines'}<br>on the menu</span></div>`;
}

export function sidebar() {
  return `
    <div class="brand">
      <div class="brand-name">${esc(brand().name)}</div>
      <div class="brand-sub">${esc(brand().sub)}</div>
    </div>
    <nav class="side-nav" aria-label="Sections">
      ${NAV.map(([label, v]) => `<button class="nav-btn${state.view === v ? ' is-active' : ''}"${state.view === v ? ' aria-current="page"' : ''} data-act="view" data-view="${v}">${label}</button>`).join('')}
      <button class="nav-btn nav-search" data-act="openSearch">🔍 Search meals</button>
    </nav>
    <button class="new-plan" data-act="openGen">＋ Plan a new week</button>
    <button class="sync-row" data-act="openAccount">
      <span class="sync-dot${auth.user ? ' is-on' : ''}" aria-hidden="true"></span>
      ${auth.user ? `Syncing · ${esc(auth.user.email)}` : 'Sign in to sync'}
    </button>
    <div class="glance">
      <div class="glance-title">This week at a glance</div>
      ${glanceHTML()}
    </div>`;
}

const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>';

export function tabbar() {
  return NAV.map(([label, v]) => `
    <button class="tab${state.view === v ? ' is-active' : ''}"${state.view === v ? ' aria-current="page"' : ''} data-act="view" data-view="${v}" aria-label="${label}">
      ${NAV_ICONS[v]}<span>${label.replace('Weekly plan', 'Plan').replace('Shopping list', 'List')}</span>
    </button>`).join('')
    + `<button class="tab" data-act="openSearch" aria-label="Search meals">${SEARCH_ICON}<span>Search</span></button>`;
}

// ---------- Today ----------
function mealCard(m, i) {
  const r = m.recipe;
  return `
  <article class="meal-card slot-${m.slot}${m.isEaten ? ' is-eaten' : ''}" style="--d:${(0.08 + i * 0.06).toFixed(2)}s">
    <button class="meal-thumb" data-act="open" data-id="${m.rid}" aria-label="Open ${esc(r.name)}">
      ${thumb(m.rid, m.slot)}
      ${cuisineChip(r.cuisine)}
      ${m.showSteam ? steam : ''}
    </button>
    <div class="meal-body">
      <div class="slot-label">${cap(m.slot)}</div>
      <button class="meal-name as-link" data-act="open" data-id="${m.rid}">${esc(r.name)}</button>
      <div class="meal-meta"><span>${esc(m.timeLabel)}</span><span>·</span><span>${r.protein}g protein</span></div>
      <div class="meal-actions">
        <button class="eat-btn${m.isEaten ? ' is-on' : ''}" aria-pressed="${m.isEaten}" data-act="eat" data-key="${m.key}" data-id="${m.rid}">${m.isEaten ? 'Eaten ✓' : 'Mark eaten'}</button>
        ${m.canCook ? `<button class="cook-btn" data-act="cook" data-id="${m.rid}">Cook · ${r.timeMin} min →</button>` : ''}
      </div>
    </div>
  </article>`;
}

// A radial "use-it-up" chart: concentric rings = time horizon, each fresh
// ingredient a dot placed by how soon it's needed (centre = tonight) at a
// stable angle hashed from its name. Pure SVG so it rides the string render.
const RADAR_TONE = { today: '#bb4a2e', soon: '#8a6d3b', fresh: '#9db2c0' };
function radarChart(rc) {
  const C = 130, size = 260;
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  // Ring radius by horizon; "today" sits on a tight inner ring (not the exact
  // centre) so multiple same-day items spread out instead of stacking.
  const ringR = away => away === 0 ? 22 : away <= 2 ? 74 : 112;
  const rings = [22, 74, 112].map(r => `<circle cx="${C}" cy="${C}" r="${r}" class="radar-ring"/>`).join('');
  const spokes = [0, 45, 90, 135].map(deg => {
    const a = deg * Math.PI / 180, dx = 118 * Math.cos(a), dy = 118 * Math.sin(a);
    return `<line x1="${(C - dx).toFixed(1)}" y1="${(C - dy).toFixed(1)}" x2="${(C + dx).toFixed(1)}" y2="${(C + dy).toFixed(1)}" class="radar-spoke"/>`;
  }).join('');
  const dots = rc.items.map((it, i) => {
    const h = hash(it.name);
    const a = ((h % 360) + i * 9) * Math.PI / 180;
    const jitter = it.away === 0 ? (h % 9) - 4 : (h % 15) - 7;
    const rr = ringR(it.away) + jitter;
    return { x: C + rr * Math.cos(a), y: C + rr * Math.sin(a), c: RADAR_TONE[it.tone], urgent: it.away === 0 };
  });
  const dotEls = dots.map(d =>
    `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.urgent ? 5 : 4}" fill="${d.c}"/>`).join('');
  const aria = `Ingredient urgency radar — ${rc.total} fresh items, ${rc.soon} to use in the next day.`;
  return `
    <div class="radar-chart">
      <svg viewBox="0 0 ${size} ${size}" class="radar-svg" role="img" aria-label="${aria}">
        <circle cx="${C}" cy="${C}" r="40" class="radar-zone"/>
        ${rings}${spokes}
        ${dotEls}
        <circle cx="${C}" cy="${C}" r="2.5" class="radar-core"/>
      </svg>
      <div class="radar-legend">
        <span><i style="background:${RADAR_TONE.today}"></i>Use today</span>
        <span><i style="background:${RADAR_TONE.soon}"></i>Within 2 days</span>
        <span><i style="background:${RADAR_TONE.fresh}"></i>Later this week</span>
      </div>
    </div>`;
}

export function todayView() {
  const t = todayData();
  const n = nudgeData();
  const f = fridgeData();
  const rc = radarChartData();
  return `
  <div class="page page-narrow anim-in">
    <header class="page-head">
      <div>
        <div class="kicker">${esc(state.week.todayLabel)}</div>
        <h1 class="page-title">${esc(copy('todayTitle', 'Today’s table'))}</h1>
      </div>
      <div class="prot-box">
        <div class="prot-row"><b>${t.eatenProt}g of ${t.todayProt}g protein</b><span>${t.eatenCount}/3 meals</span></div>
        <div class="bar" role="progressbar" aria-label="Protein eaten today" aria-valuemin="0" aria-valuemax="${t.todayProt}" aria-valuenow="${t.eatenProt}"><div class="bar-fill fill-ochre" style="width:${t.pct}%"></div></div>
      </div>
    </header>

    <div class="glance-strip">${glanceHTML()}</div>

    <div class="nudge">
      <span class="nudge-ic${n.icon === '✓' ? ' is-done' : ''}">${n.icon}</span>
      <div class="nudge-text">${esc(n.text)}</div>
      ${n.btn ? `<button class="nudge-btn" data-act="nudgeDone" data-day="${esc(n.day)}">${esc(n.btn)}</button>` : ''}
    </div>

    <div class="today-cards">${t.meals.map(mealCard).join('')}</div>

    <div class="today-panels">
      <section class="panel panel-dark">
        <div class="panel-head"><h3>In your fridge</h3><span class="panel-tag">Leftover shelf</span></div>
        ${f.fridge.map(x => `
          <div class="fridge-row">
            <span class="fridge-n">×${x.portions}</span>
            <div class="fridge-info"><div class="fridge-name">${esc(x.name)}</div><div class="fridge-note">${esc(x.note)}</div></div>
            <span class="fridge-chip">in rotation</span>
          </div>`).join('')}
        <div class="freezer-row">
          <span class="freezer-ic">❄</span>
          <div class="freezer-note">Freezer stash: <b>${f.freezerCount} portions</b> — ${esc(f.freezerNote)}</div>
        </div>
      </section>
      <section class="panel panel-radar">
        <div class="panel-head"><h3>Use-it-up radar</h3><span class="panel-tag tag-sand">Zero waste</span></div>
        <div class="radar-layout">
          ${radarChart(rc)}
          <div class="radar-side">
            <div class="radar-stats">
              <div class="radar-stat"><span class="radar-stat-n">${rc.total}</span><span class="radar-stat-l">fresh items</span></div>
              <div class="radar-stat"><span class="radar-stat-n c-alert">${rc.soon}</span><span class="radar-stat-l">use soon</span></div>
              <div class="radar-stat"><span class="radar-stat-n">${rc.fresh}</span><span class="radar-stat-l">time to spare</span></div>
            </div>
            <div class="radar-foot">Dots nearer the centre need cooking sooner — shop so the perishables land in that order.</div>
          </div>
        </div>
      </section>
    </div>
  </div>`;
}

// ---------- Weekly plan ----------
function badges(m) {
  return `
    ${m.isLeftover ? `<span class="badge b-leftover">↺ ${m.leftoverFrom ? 'from ' + esc(m.leftoverFrom) : 'Leftover'}</span>` : ''}
    ${m.batch ? `<span class="badge b-batch">Batch ${m.batch}</span>` : ''}
    ${m.freezer ? '<span class="badge b-freezer">❄ +1 freezer</span>' : ''}
    ${m.quick ? '<span class="badge b-quick">Quick</span>' : ''}`;
}

function gridDay(d, di) {
  return `
  <div class="day-col anim-in" style="--d:${(di * 0.05).toFixed(2)}s">
    <div class="day-head${d.isToday ? ' is-today' : ''}">
      <div class="day-title"><span class="day-name">${d.name}</span>${d.isToday ? '<span class="today-pill">Today</span>' : ''}</div>
      <div class="day-sub">${esc(d.date)} · ${esc(d.timeLabel)}</div>
    </div>
    ${d.meals.map(m => `
      <div class="cell-wrap">
        <button class="day-cell slot-${m.slot}" data-act="open" data-id="${m.rid}">
          <span class="cell-thumb">${thumb(m.rid, m.slot)}${cuisineChip(m.recipe.cuisine, 'sm')}</span>
          <span class="cell-body">
            <span class="slot-label">${cap(m.slot)}</span>
            <span class="cell-name">${esc(m.recipe.name)}</span>
            <span class="cell-meta">${esc(m.timeLabel)} · ${m.recipe.protein}g protein</span>
            <span class="badge-row">${badges(m)}</span>
          </span>
        </button>
        ${m.swappable ? `<button class="swap-btn" title="Swap this meal" aria-label="Swap ${esc(m.recipe.name)}" data-act="swap" data-day="${m.dayName}" data-slot="${m.slot}">⇄</button>` : ''}
      </div>`).join('')}
  </div>`;
}

function agendaDay(d, di) {
  return `
  <div class="agenda-day${d.isToday ? ' is-today' : ''} anim-in" style="--d:${(di * 0.05).toFixed(2)}s">
    <div class="agenda-date">
      <div class="day-title"><span class="day-name">${d.name}</span>${d.isToday ? '<span class="today-dot"></span>' : ''}</div>
      <div class="day-sub">${esc(d.date)}</div>
      <div class="day-time">${esc(d.timeLabel)}</div>
    </div>
    <div class="agenda-meals">
      ${d.meals.map(m => `
        <button class="agenda-cell slot-${m.slot}" data-act="open" data-id="${m.rid}">
          <span class="agenda-thumb">${thumb(m.rid, m.slot)}</span>
          <span class="cell-body">
            <span class="slot-label">${cap(m.slot)}${m.recipe.cuisine ? `<i> · ${esc(m.recipe.cuisine)}</i>` : ''}</span>
            <span class="cell-name">${esc(m.recipe.name)}</span>
            <span class="cell-meta">${esc(m.timeLabel)} · ${m.recipe.protein}g</span>
            <span class="badge-row">${badges(m)}</span>
          </span>
        </button>`).join('')}
    </div>
  </div>`;
}

export function planView() {
  const days = weekDays();
  const blurb = state.planCuisine
    ? `Seven days of ${state.planCuisine} cooking, all sized for one — batch-cooked mains roll into next-day lunches, so good food never goes to waste. No other cuisine sneaks in this week.`
    : 'Seven days that travel the world — Kenyan, Swahili, Nigerian, Ugandan, Indian and Italian dishes, all sized for one. Big-batch dinners roll into next-day lunches, so good food never goes to waste.';
  const weeks = upcomingWeeks(6);
  return `
  <div class="page page-wide anim-in">
    <header class="page-head">
      <div class="page-head-main">
        <div class="kicker-row"><span class="kicker">Your meal plan</span>${dietBadge()}</div>
        <div class="week-picker">
          <select class="week-select" data-act="selectWeek" aria-label="Choose week">
            ${weeks.map(w => `<option value="${w.offset}"${w.offset === state.weekOffset ? ' selected' : ''}>${esc(w.label)}</option>`).join('')}
          </select>
        </div>
        <p class="page-blurb">${esc(blurb)}</p>
      </div>
      <div class="head-tools">
        <button class="tool-btn" data-act="openSearch" aria-label="Search meals">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>
        </button>
        <div class="seg" role="group" aria-label="Layout">
          <button class="seg-btn${state.layout === 'grid' ? ' is-on' : ''}" aria-pressed="${state.layout === 'grid'}" data-act="layout" data-layout="grid">Grid</button>
          <button class="seg-btn${state.layout === 'agenda' ? ' is-on' : ''}" aria-pressed="${state.layout === 'agenda'}" data-act="layout" data-layout="agenda">Agenda</button>
        </div>
      </div>
    </header>
    ${state.layout === 'grid'
      ? `<div class="plan-grid">${days.map(gridDay).join('')}</div>`
      : `<div class="plan-agenda">${days.map(agendaDay).join('')}</div>`}
  </div>`;
}

// ---------- Shopping ----------
export function shoppingView() {
  const s = shoppingData();
  return `
  <div class="page page-slim anim-in">
    <div class="kicker">Auto-generated from your week</div>
    <h1 class="page-title">Shopping list</h1>
    <p class="page-blurb">${s.totalNeed} items to buy · ${s.gotten} in the cart · pantry staples are already crossed off.</p>
    <div class="bar bar-lg" role="progressbar" aria-label="Shopping progress" aria-valuemin="0" aria-valuemax="${s.totalNeed}" aria-valuenow="${s.gotten}"><div class="bar-fill fill-olive shimmer" style="width:${s.pct}%"></div></div>
    <button class="link-btn" data-act="hideHave">${state.hideHave ? 'Show pantry items' : 'Hide items I already have'}</button>
    ${s.groups.map(g => `
      <section class="shop-group">
        <div class="shop-group-head"><h3>${esc(g.cat)}</h3><span>${esc(g.needLabel)}</span></div>
        ${g.items.map(it => `
          <button class="shop-row${it.checked ? ' is-checked' : ''}" role="checkbox" aria-checked="${it.checked}" data-act="check" data-item="${esc(it.name)}" ${it.have ? 'disabled' : ''}>
            <span class="checkbox" aria-hidden="true">${it.checked ? '✓' : ''}</span>
            <span class="shop-name">${esc(it.name)}</span>
            ${it.multi ? `<span class="shop-count">for ${it.count} meals</span>` : ''}
            ${it.have ? '<span class="shop-have">✓ in pantry</span>' : ''}
          </button>`).join('')}
      </section>`).join('')}
  </div>`;
}

// ---------- Pantry ----------
export function pantryView(pantrySuggestions) {
  const have = [...state.have].sort();
  return `
  <div class="page page-slim anim-in">
    <div class="kicker">What you already have</div>
    <h1 class="page-title">Your pantry</h1>
    <p class="page-blurb">Tell us what’s in the cupboard and we’ll keep it off your shopping list — so you only buy what’s missing.</p>
    <div class="pantry-label">In your pantry</div>
    <div class="chip-row">
      ${have.map(n => `<button class="pantry-chip" data-act="pantryRemove" data-item="${esc(n)}">${esc(n)}<span class="x">×</span></button>`).join('')}
    </div>
    <div class="pantry-label">Add something you have</div>
    <div class="chip-row">
      ${pantrySuggestions.map(n => `<button class="pantry-chip is-add" data-act="pantryAdd" data-item="${esc(n)}">＋ ${esc(n)}</button>`).join('')}
    </div>
    <div class="pantry-label account-label">Account</div>
    <button class="sync-row on-page" data-act="openAccount">
      <span class="sync-dot${auth.user ? ' is-on' : ''}" aria-hidden="true"></span>
      ${auth.user ? `Syncing · ${esc(auth.user.email)}` : 'Sign in to sync across devices'}
    </button>
  </div>`;
}
