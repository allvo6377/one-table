// Admin content editor. Renders an admin-only overlay for editing the live
// site: theme (colors/fonts), branding/copy, and recipes (text/emoji/photo +
// image upload, add, delete). Edits accumulate in a working `draft`; nothing is
// persisted until Publish, which writes the whole document to Supabase (RLS
// enforces admin-only). Text inputs are uncontrolled and update the draft
// silently so typing never loses focus to a re-render.
import { contentDoc, publishContent, applyContent, THEME_FIELDS, FONT_PAIRS } from './content.js';
import { recipes, emojiOf, photoMap, neutralBreakfasts, cuisineMains, cuisineBreakfasts, CATEGORY_ORDER } from './data.js';
import { allCategories, CURATED_DEFAULTS } from './tags.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { api, REST, accessToken } from './sync.js';
import { state, set } from './store.js';
import { esc, cap } from './ui.js';
import { currentPlan } from './planner.js';

let draft = null;      // working copy of the content document
let status = '';       // status line under Publish
let busy = false;      // publish/upload in flight
let editId = null;     // recipe open in the editor
let editCat = null;    // category whose membership is being edited
let admins = [];       // loaded admin emails

const clone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

export function openAdmin() {
  draft = clone(contentDoc() || {});
  draft.theme = draft.theme || {}; draft.theme.tokens = draft.theme.tokens || {};
  draft.branding = draft.branding || {}; draft.copy = draft.copy || {};
  draft.recipes = draft.recipes || {}; draft.added = draft.added || {}; draft.removed = draft.removed || [];
  draft.categories = draft.categories || {};
  draft.categories.labels = draft.categories.labels || {}; draft.categories.emoji = draft.categories.emoji || {};
  draft.categories.hidden = draft.categories.hidden || []; draft.categories.members = draft.categories.members || {};
  status = ''; editId = null; editCat = null;
  loadAdmins();
}

// ---- effective-value helpers (base merged with draft) ----
const cssVar = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
const themeVal = k => (draft.theme.tokens[k] != null ? draft.theme.tokens[k] : cssVar(k)) || '#000000';
function recById(id) { return recipes[id] || draft.added[id] || null; }
function effRecipe(id) {
  const base = recById(id) || {};
  return { ...base, ...(draft.recipes[id] || {}), emoji: (draft.recipes[id]?.emoji ?? emojiOf[id] ?? ''), photo: (draft.recipes[id]?.photo ?? photoMap[id] ?? '') };
}

// ---- silent field edits (no re-render) ----
export function adminInput(el) {
  const { scope, key } = el.dataset;
  const v = el.value;
  if (scope === 'theme') {
    if (key === 'fontPair') { draft.theme.fontPair = v; const p = FONT_PAIRS[v]; if (p) { root('--serif', p.serif); root('--sans', p.sans); } }
    else { draft.theme.tokens[key] = v; root(key, v); if (key === '--rust') root('--rust-deep', v); }
  } else if (scope === 'brand') { draft.branding[key] = v; }
  else if (scope === 'copy') { draft.copy[key] = v; }
  else if (scope === 'cat') { const [bucket, id] = key.split(':'); (draft.categories[bucket] = draft.categories[bucket] || {})[id] = v; }
  else if (scope === 'recipe' && editId) {
    const o = (draft.recipes[editId] = draft.recipes[editId] || {});
    if (key === 'protein' || key === 'cost' || key === 'timeMin') o[key] = Number(v) || 0;
    else if (key === 'ingredients') o.ingredients = v.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [item, qty] = l.split('|'); return { item: (item || '').trim(), qty: (qty || '').trim() }; });
    else if (key === 'steps' || key === 'tips') o[key] = v.split('\n').map(l => l.trim()).filter(Boolean);
    else o[key] = v;
    // added recipes edit their own object directly too
    if (draft.added[editId]) Object.assign(draft.added[editId], o);
  }
}
const root = (k, v) => document.documentElement.style.setProperty(k, v);

// ---- structural actions (re-render) ----
export function adminAction(act, d) {
  if (act === 'adminTab') set({ adminTab: d.tab });
  else if (act === 'adminRecipeOpen') { editId = d.id; set({}); }
  else if (act === 'adminRecipeBack') { editId = null; set({}); }
  else if (act === 'adminRecipeDelete') { deleteRecipe(d.id); set({}); }
  else if (act === 'adminRecipeAdd') { addRecipe(); set({}); }
  else if (act === 'adminReset') { resetField(d.scope, d.key); set({}); }
  else if (act === 'adminPublish') publish();
  else if (act === 'adminPreview') { applyContent(clone(draft)); set({ plan: currentPlan() }); status = 'Previewing unsaved changes'; set({}); }
  else if (act === 'adminAddEmail') addAdminEmail(d);
  else if (act === 'adminRemoveEmail') removeAdminEmail(d.email);
  else if (act === 'adminCatOpen') { editCat = d.id; set({}); }
  else if (act === 'adminCatBack') { editCat = null; set({}); }
  else if (act === 'adminCatHide') { const h = draft.categories.hidden, i = h.indexOf(d.id); if (i >= 0) h.splice(i, 1); else h.push(d.id); set({}); }
}

// Toggle a recipe in/out of a curated category (checkbox change — no re-render).
export function adminCatMember(el) {
  if (!editCat || !draft) return;
  const cur = new Set(draft.categories.members[editCat] || CURATED_DEFAULTS[editCat] || []);
  if (el.checked) cur.add(el.dataset.id); else cur.delete(el.dataset.id);
  draft.categories.members[editCat] = [...cur];
}

function resetField(scope, key) {
  if (scope === 'theme') { delete draft.theme.tokens[key]; document.documentElement.style.removeProperty(key); }
  else if (scope === 'font') { delete draft.theme.fontPair; }
  else if (scope === 'brand') delete draft.branding[key];
  else if (scope === 'copy') delete draft.copy[key];
}

function slugify(s) { return (s || 'recipe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'recipe'; }
function addRecipe() {
  let id = slugify('new recipe ' + (Object.keys(draft.added).length + 1));
  while (recipes[id] || draft.added[id]) id += '-x';
  draft.added[id] = { id, name: 'New recipe', cuisine: '', pool: 'main', tagline: 'Dinner', cost: 3, protein: 20, timeMin: 25, ingredients: [], steps: [], note: '', emoji: '🍽️', photo: '' };
  editId = id;
}
function deleteRecipe(id) {
  if (draft.added[id]) { delete draft.added[id]; }
  else if (!draft.removed.includes(id)) draft.removed.push(id);
  delete draft.recipes[id];
  if (editId === id) editId = null;
}

// ---- image upload to Supabase Storage ----
export async function adminUpload(file) {
  if (!file || !editId) return;
  busy = true; status = 'Uploading image…'; set({});
  try {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${editId}-${Date.now()}.${ext}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/content-images/${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + accessToken(), 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'true' },
      body: file,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || res.statusText);
    const url = `${SUPABASE_URL}/storage/v1/object/public/content-images/${path}`;
    const o = (draft.recipes[editId] = draft.recipes[editId] || {}); o.photo = url;
    if (draft.added[editId]) draft.added[editId].photo = url;
    status = 'Image uploaded ✓';
  } catch (e) { status = 'Upload failed: ' + e.message; }
  busy = false; set({});
}

// ---- admins list ----
async function loadAdmins() { try { admins = (await api(REST, '/tfo_admins?select=email&order=email')).map(r => r.email); } catch { admins = []; } set({}); }
async function addAdminEmail(d) {
  const email = (d.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { status = 'Enter a valid email'; set({}); return; }
  try { await api(REST, '/tfo_admins', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ email }) }); status = 'Added ' + email; await loadAdmins(); }
  catch (e) { status = 'Could not add: ' + e.message; set({}); }
}
async function removeAdminEmail(email) {
  try { await api(REST, '/tfo_admins?email=eq.' + encodeURIComponent(email), { method: 'DELETE' }); status = 'Removed ' + email; await loadAdmins(); }
  catch (e) { status = 'Could not remove: ' + e.message; set({}); }
}

// ---- publish ----
async function publish() {
  if (busy) return;
  busy = true; status = 'Publishing…'; set({});
  try {
    if (draft.theme && draft.theme.tokens && !Object.keys(draft.theme.tokens).length) delete draft.theme.tokens;
    await publishContent(clone(draft));
    set({ plan: currentPlan() });
    status = 'Published — live for everyone ✓';
  } catch (e) { status = 'Publish failed: ' + e.message; }
  busy = false; set({});
}

// ---- render ----
export function adminPanel() {
  if (!draft) openAdmin();
  const tab = state.adminTab || 'theme';
  const tabs = [['theme', 'Theme'], ['branding', 'Branding'], ['recipes', 'Recipes'], ['categories', 'Categories'], ['admins', 'Admins']];
  return `
  <div class="scrim" data-act="closeAdmin"></div>
  <div class="modal modal-admin" role="dialog" aria-modal="true" aria-label="Edit site content">
    <div class="admin-head">
      <div><div class="sheet-kicker sand">Content editor</div><h2 class="admin-title">Edit your site</h2></div>
      <button class="btn-ghost" data-act="closeAdmin">Close</button>
    </div>
    <div class="admin-tabs" role="tablist">
      ${tabs.map(([id, label]) => `<button class="admin-tab${tab === id ? ' is-on' : ''}" role="tab" aria-selected="${tab === id}" data-act="adminTab" data-tab="${id}">${label}</button>`).join('')}
    </div>
    <div class="admin-body">${tab === 'theme' ? themeTab() : tab === 'branding' ? brandingTab() : tab === 'recipes' ? recipesTab() : tab === 'categories' ? categoriesTab() : adminsTab()}</div>
    <div class="admin-foot">
      <span class="admin-status${/failed|valid|not/i.test(status) ? ' is-err' : ''}">${esc(status)}</span>
      <div class="admin-foot-btns">
        <button class="btn-ghost" data-act="adminPreview">Preview</button>
        <button class="btn-primary" data-act="adminPublish"${busy ? ' disabled' : ''}>${busy ? 'Working…' : 'Publish live →'}</button>
      </div>
    </div>
  </div>`;
}

function field(label, input, resetAttrs) {
  return `<label class="admin-field"><span class="admin-flabel">${esc(label)}${resetAttrs ? `<button class="admin-reset" title="Reset to default" ${resetAttrs}>reset</button>` : ''}</span>${input}</label>`;
}

function themeTab() {
  const colors = THEME_FIELDS.map(f =>
    field(f.label,
      `<span class="admin-color"><input type="color" data-act="adminInput" data-scope="theme" data-key="${f.key}" value="${esc(toHex(themeVal(f.key)))}"><code>${esc(themeVal(f.key))}</code></span>`,
      `data-act="adminReset" data-scope="theme" data-key="${f.key}"`)).join('');
  const fonts = field('Font pairing',
    `<select data-act="adminInput" data-scope="theme" data-key="fontPair">
      <option value="">— keep current —</option>
      ${Object.entries(FONT_PAIRS).map(([id, p]) => `<option value="${id}"${draft.theme.fontPair === id ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}
     </select>`);
  return `<p class="admin-note">Tap a swatch to recolour the whole site. Changes preview instantly; press Publish to make them live.</p>${fonts}<div class="admin-grid">${colors}</div>`;
}

function brandingTab() {
  const b = draft.branding, c = draft.copy;
  return `<p class="admin-note">The words shown around the app.</p>
    ${field('Site name', `<input type="text" data-act="adminInput" data-scope="brand" data-key="siteName" value="${esc(b.siteName ?? '')}" placeholder="Table for One">`, 'data-act="adminReset" data-scope="brand" data-key="siteName"')}
    ${field('Site tagline', `<input type="text" data-act="adminInput" data-scope="brand" data-key="brandSub" value="${esc(b.brandSub ?? '')}" placeholder="Party of one · eat the world">`, 'data-act="adminReset" data-scope="brand" data-key="brandSub"')}
    ${field('“Today” heading', `<input type="text" data-act="adminInput" data-scope="copy" data-key="todayTitle" value="${esc(c.todayTitle ?? '')}" placeholder="Today’s table">`, 'data-act="adminReset" data-scope="copy" data-key="todayTitle"')}`;
}

function recipesTab() {
  if (editId) return recipeEditor(editId);
  return `
    <div class="admin-recipes-top">
      <input type="search" class="sync-input" placeholder="Search recipes to edit…" data-act="adminSearch" value="${esc(state.searchQuery)}">
      <button class="btn-dark" data-act="adminRecipeAdd">＋ New recipe</button>
    </div>
    <div class="admin-rlist">${adminListHTML()}</div>`;
}

// Just the recipe rows — patched in place on search so the input keeps focus.
export function adminListHTML() {
  if (!draft) return '';
  const q = (state.searchQuery || '').toLowerCase();
  const ids = [...Object.keys(recipes), ...Object.keys(draft.added)].filter((v, i, a) => a.indexOf(v) === i)
    .filter(id => !draft.removed.includes(id))
    .filter(id => !q || (recById(id)?.name || '').toLowerCase().includes(q))
    .sort((a, b) => (recById(a)?.name || '').localeCompare(recById(b)?.name || '')).slice(0, 60);
  return ids.map(id => { const r = effRecipe(id); return `
    <div class="admin-rrow">
      <button class="admin-rrow-main" data-act="adminRecipeOpen" data-id="${id}">
        <span class="admin-remoji">${esc(r.emoji || '🍽️')}</span>
        <span><span class="admin-rname">${esc(r.name || id)}</span><span class="admin-rmeta">${esc(r.cuisine || 'neutral')} · ${r.timeMin || '?'} min</span></span>
      </button>
      <button class="admin-rdel" title="Delete" data-act="adminRecipeDelete" data-id="${id}">🗑</button>
    </div>`; }).join('');
}

function recipeEditor(id) {
  const r = effRecipe(id);
  const ing = (r.ingredients || []).map(i => `${i.item}${i.qty ? ' | ' + i.qty : ''}`).join('\n');
  const steps = (r.steps || []).join('\n');
  return `
    <button class="admin-back" data-act="adminRecipeBack">← All recipes</button>
    <div class="admin-photo-row">
      <div class="admin-photo" style="${r.photo ? `background-image:url('${esc(r.photo)}')` : ''}">${r.photo ? '' : `<span>${esc(r.emoji || '🍽️')}</span>`}</div>
      <div class="admin-photo-ctl">
        <label class="btn-dark admin-upload">Upload image<input type="file" accept="image/*" data-act="adminUpload" hidden></label>
        ${field('…or paste an image URL', `<input type="url" data-act="adminInput" data-scope="recipe" data-key="photo" value="${esc(r.photo || '')}" placeholder="https://…">`)}
      </div>
    </div>
    ${field('Name', `<input type="text" data-act="adminInput" data-scope="recipe" data-key="name" value="${esc(r.name || '')}">`)}
    ${field('Emoji (fallback icon)', `<input type="text" maxlength="4" class="admin-emoji-in" data-act="adminInput" data-scope="recipe" data-key="emoji" value="${esc(r.emoji || '')}">`)}
    ${field('Tagline', `<input type="text" data-act="adminInput" data-scope="recipe" data-key="tagline" value="${esc(r.tagline || '')}">`)}
    <div class="admin-grid3">
      ${field('Protein (g)', `<input type="number" data-act="adminInput" data-scope="recipe" data-key="protein" value="${r.protein ?? ''}">`)}
      ${field('Cost ($)', `<input type="number" step="0.1" data-act="adminInput" data-scope="recipe" data-key="cost" value="${r.cost ?? ''}">`)}
      ${field('Time (min)', `<input type="number" data-act="adminInput" data-scope="recipe" data-key="timeMin" value="${r.timeMin ?? ''}">`)}
    </div>
    ${field('Description / note', `<textarea rows="2" data-act="adminInput" data-scope="recipe" data-key="note">${esc(r.note || '')}</textarea>`)}
    ${field('Ingredients (one per line — “item | quantity”)', `<textarea rows="5" data-act="adminInput" data-scope="recipe" data-key="ingredients">${esc(ing)}</textarea>`)}
    ${field('Method (one step per line)', `<textarea rows="6" data-act="adminInput" data-scope="recipe" data-key="steps">${esc(steps)}</textarea>`)}
    <button class="admin-rdel-lg" data-act="adminRecipeDelete" data-id="${id}">Delete this recipe</button>`;
}

function categoriesTab() {
  if (editCat) return categoryMembers(editCat);
  const cats = allCategories();
  return `<p class="admin-note">Rename a browse section, change its icon, hide it, or — for hand-picked sections — choose which meals appear. Sections with fewer than 3 meals hide themselves.</p>
    <div class="admin-clist">
      ${cats.map(c => `
        <div class="admin-crow${c.hidden ? ' is-hidden' : ''}">
          <input type="text" class="admin-cemoji" maxlength="4" data-act="adminInput" data-scope="cat" data-key="emoji:${c.id}" value="${esc(draft.categories.emoji[c.id] ?? c.emoji)}">
          <input type="text" class="admin-clabel" data-act="adminInput" data-scope="cat" data-key="labels:${c.id}" value="${esc(draft.categories.labels[c.id] ?? c.label)}">
          ${c.curated ? `<button class="btn-mini" data-act="adminCatOpen" data-id="${c.id}">Meals…</button>` : '<span class="admin-cauto" title="Worked out automatically from the recipes">auto</span>'}
          <button class="admin-chide" data-act="adminCatHide" data-id="${c.id}">${c.hidden ? 'Show' : 'Hide'}</button>
        </div>`).join('')}
    </div>`;
}

function categoryMembers(cat) {
  const c = allCategories().find(x => x.id === cat) || { label: cat, emoji: '' };
  return `
    <button class="admin-back" data-act="adminCatBack">← All sections</button>
    <p class="admin-note">Tick the meals that belong in <b>${esc(c.emoji)} ${esc(c.label)}</b>.</p>
    <input type="search" class="sync-input" placeholder="Search meals…" data-act="adminCatSearch" value="${esc(state.searchQuery)}">
    <div class="admin-mlist">${adminMemberListHTML()}</div>`;
}

// Checklist rows for the open curated category — patched in place on search.
export function adminMemberListHTML() {
  if (!draft || !editCat) return '';
  const set = new Set(draft.categories.members[editCat] || CURATED_DEFAULTS[editCat] || []);
  const q = (state.searchQuery || '').toLowerCase();
  const ids = [...Object.keys(recipes), ...Object.keys(draft.added)].filter((v, i, a) => a.indexOf(v) === i)
    .filter(id => !draft.removed.includes(id))
    .filter(id => !q || (recById(id)?.name || '').toLowerCase().includes(q))
    .sort((a, b) => (set.has(b) - set.has(a)) || (recById(a)?.name || '').localeCompare(recById(b)?.name || ''))
    .slice(0, 80);
  return ids.map(id => { const r = recById(id) || {}; return `
    <label class="admin-mrow">
      <input type="checkbox" data-act="adminCatMember" data-id="${id}"${set.has(id) ? ' checked' : ''}>
      <span class="admin-remoji">${esc(effRecipe(id).emoji || '🍽️')}</span>
      <span class="admin-rname">${esc(r.name || id)}</span>
    </label>`; }).join('');
}

function adminsTab() {
  return `<p class="admin-note">People who can edit this site. They sign in with their email (a code is sent), then get this editor.</p>
    <div class="admin-add-email">
      <input type="email" id="admin-new-email" class="sync-input" placeholder="name@example.com">
      <button class="btn-dark" data-act="adminAddEmail">Add admin</button>
    </div>
    <div class="admin-elist">
      ${admins.map(e => `<div class="admin-erow"><span>${esc(e)}</span><button class="admin-rdel" title="Remove" data-act="adminRemoveEmail" data-email="${esc(e)}">×</button></div>`).join('') || '<div class="admin-note">Loading…</div>'}
    </div>`;
}

// #rgb/computed → #rrggbb for <input type=color>
function toHex(c) {
  c = (c || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(c);
  if (m) return '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('');
  return '#888888';
}
