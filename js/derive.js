// Pure selectors: state -> plain data for the views. Ported from the design's
// renderVals() and split by concern so each view pulls only what it shows.
import { recipes, catOf, CATEGORY_ORDER, SLOTS } from './data.js';
import { state } from './store.js';
import { effId } from './planner.js';
import { FULL_DAY } from './dates.js';

// Future weeks have no real "today" (todayIdx === -1) — focus on Monday.
const focusIdx = () => (state.week.todayIdx >= 0 ? state.week.todayIdx : 0);

// ---- Shopping ----
export function shoppingData() {
  const need = {};
  state.plan.forEach(d => SLOTS.forEach(slot => {
    const e = d[slot];
    if (e.leftover) return;
    const r = recipes[effId(d, slot)];
    r.ingredients.forEach(ing => {
      if (!need[ing.item]) need[ing.item] = { item: ing.item, count: 0, cat: catOf[ing.item] || 'Pantry' };
      need[ing.item].count++;
    });
  }));
  const allItems = Object.values(need);
  let totalNeed = 0, gotten = 0;
  allItems.forEach(i => {
    if (!state.have.includes(i.item)) {
      totalNeed++;
      if (state.checked.includes(i.item)) gotten++;
    }
  });
  const groups = CATEGORY_ORDER.map(cat => {
    let items = allItems.filter(i => i.cat === cat);
    if (state.hideHave) items = items.filter(i => !state.have.includes(i.item));
    const rows = items.map(i => {
      const have = state.have.includes(i.item);
      return { name: i.item, count: i.count, multi: i.count > 1, have, checked: have || state.checked.includes(i.item) };
    });
    return { cat, items: rows, needLabel: rows.filter(i => !i.have).length + ' to buy' };
  }).filter(g => g.items.length);
  return { groups, totalNeed, gotten, pct: totalNeed ? Math.round(gotten / totalNeed * 100) : 0 };
}

// ---- Fridge (leftover shelf) + freezer ----
export function fridgeData() {
  const map = {};
  state.plan.forEach(d => ['lunch', 'dinner'].forEach(slot => {
    const e = d[slot];
    if (!e.leftover) return;
    const rid = effId(d, slot), key = e.leftover + '|' + rid;
    if (!map[key]) map[key] = { rid, cookedOn: e.leftover, portions: 0, lastDay: d.name };
    map[key].portions++;
    map[key].lastDay = d.name;
  }));
  const fridge = Object.values(map).map(f => ({
    portions: f.portions,
    name: recipes[f.rid].name,
    note: 'cooked ' + f.cookedOn + ' — reserved through ' + f.lastDay,
  }));
  let freezerAdd = 0, freezerDish = '', freezerDay = '';
  state.plan.forEach(d => ['lunch', 'dinner'].forEach(slot => {
    const e = d[slot];
    if (e.freezer) { freezerAdd += e.freezer; freezerDish = recipes[effId(d, slot)].name; freezerDay = d.name; }
  }));
  const freezerNote = freezerDish
    ? (FULL_DAY[freezerDay] || freezerDay) + '’s ' + freezerDish + ' adds ' + freezerAdd + ' more.'
    : 'Nothing new banked this week.';
  return { fridge, freezerCount: 1 + freezerAdd, freezerNote };
}

// ---- Use-it-up radar ----
export function radarData() {
  const perishCats = new Set(['Produce', 'Protein']);
  const uses = {};
  state.plan.forEach((d, di) => SLOTS.forEach(slot => {
    const e = d[slot];
    if (e.leftover) return;
    const r = recipes[effId(d, slot)];
    r.ingredients.forEach(ing => {
      const cat = catOf[ing.item] || 'Pantry';
      if (!perishCats.has(cat)) return;
      (uses[ing.item] = uses[ing.item] || []).push({ idx: di, day: d.name, recipe: r.name });
    });
  }));
  return Object.entries(uses).map(([item, u]) => {
    u.sort((a, b) => a.idx - b.idx);
    const last = u[u.length - 1], daysAway = last.idx - focusIdx();
    let status, tone;
    if (daysAway === 0) { status = 'use today'; tone = 'amber'; }
    else if (daysAway <= 2) { status = 'use by ' + last.day; tone = 'green'; }
    else { status = 'wilts by ' + last.day; tone = 'red'; }
    const plan = u.length > 1
      ? 'Used in ' + u.length + ' meals through ' + last.day + '’s ' + last.recipe + '.'
      : (daysAway === 0
        ? 'Today’s ' + last.recipe + ' uses it fresh.'
        : last.day + '’s ' + last.recipe + ' needs it — plan to shop close to then.');
    return { name: item, status, plan, tone, daysAway };
  }).filter(r => r.daysAway >= 0).sort((a, b) => a.daysAway - b.daysAway).slice(0, 3);
}

// ---- Tonight's head-start nudge ----
export function nudgeData() {
  const tomorrow = state.plan[(focusIdx() + 1) % 7];
  if (tomorrow.dinner.leftover) {
    return { icon: '◷', text: 'Tomorrow’s lunch is already sorted — tonight’s leftovers carry straight through.', btn: '' };
  }
  const tr = recipes[effId(tomorrow, 'dinner')];
  const hasProtein = tr.ingredients.some(ing => catOf[ing.item] === 'Protein');
  if (hasProtein && !state.nudgeDone) {
    return {
      icon: '◷',
      text: 'Tonight’s 2-minute head start: get a jump on tomorrow’s ' + tr.name + ' by marinating the protein now — deeper flavour, zero effort tomorrow.',
      btn: 'Done — prepped',
      day: tomorrow.name,
    };
  }
  if (hasProtein && state.nudgeDone) {
    return { icon: '✓', text: 'Prepped and in the fridge. Tomorrow’s ' + tr.name + ' will taste like it simmered all day.', btn: '' };
  }
  return { icon: '◷', text: 'Nothing needs prepping tonight — tomorrow’s ' + tr.name + ' comes together quickly as it is.', btn: '' };
}

// ---- Today's meals ----
export function todayData() {
  const td = state.plan[focusIdx()];
  let eatenProt = 0, todayProt = 0, eatenCount = 0;
  const meals = SLOTS.map(slot => {
    const e = td[slot], rid = effId(td, slot), r = recipes[rid];
    const key = td.name + '-' + slot, isEaten = !!state.eaten[key], lo = !!e.leftover;
    todayProt += r.protein;
    if (isEaten) { eatenProt += r.protein; eatenCount++; }
    return {
      slot, rid, recipe: r, key, isEaten,
      timeLabel: lo ? 'reheat · 2 min' : r.timeMin + ' min',
      showSteam: slot === 'dinner' && !isEaten,
      canCook: slot === 'dinner' && !isEaten,
    };
  });
  return { day: td, meals, eatenProt, todayProt, eatenCount, pct: todayProt ? Math.round(eatenProt / todayProt * 100) : 0 };
}

// ---- Week grid/agenda rows ----
export function weekDays() {
  return state.plan.map((d, di) => {
    let t = 0;
    const meals = SLOTS.map(slot => {
      const e = d[slot], rid = effId(d, slot), r = recipes[rid];
      const lo = !!e.leftover;
      t += lo ? 2 : r.timeMin;
      return {
        slot, rid, recipe: r,
        timeLabel: lo ? 'reheat 2 min' : r.timeMin + ' min',
        isLeftover: lo,
        leftoverFrom: e.leftover || '',
        batch: e.batch ? '×' + e.batch : '',
        freezer: e.freezer || 0,
        quick: !lo && r.timeMin <= 15,
        swappable: !e.batch && !lo,
        dayName: d.name,
      };
    });
    return { name: d.name, date: d.date, meals, isToday: di === state.week.todayIdx, timeLabel: t + ' min cooking' };
  });
}
