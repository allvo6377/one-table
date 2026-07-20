// CMS content layer. Fetches the published override document (public read),
// caches it for instant paint, and deep-merges it over the built-in defaults so
// every visitor sees the owner's edits. Admin writes are gated server-side by
// row-level security; this module just calls the endpoint. Everything is wrapped
// so a malformed document can never break the app for visitors.
import { api, REST, accessToken } from './sync.js';
import { recipes, emojiOf, photoMap, neutralBreakfasts, cuisineMains, cuisineBreakfasts } from './data.js';

const CACHE_KEY = 'table-for-one:content';

// Font pairings offered in the theme editor (all render offline, no new files).
export const FONT_PAIRS = {
  editorial: { label: 'Editorial — Playfair + Inter', serif: "'Playfair Display', Georgia, serif", sans: "'Inter', system-ui, -apple-system, sans-serif" },
  classic:   { label: 'Classic — Georgia',            serif: "Georgia, 'Times New Roman', serif",   sans: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  clean:     { label: 'Clean — all Inter',            serif: "'Inter', system-ui, sans-serif",       sans: "'Inter', system-ui, -apple-system, sans-serif" },
  warm:      { label: 'Warm — Playfair + Georgia',    serif: "'Playfair Display', serif",            sans: "Georgia, 'Iowan Old Style', serif" },
};

// Theme tokens surfaced in the editor, with friendly labels.
export const THEME_FIELDS = [
  { key: '--bg',   label: 'Page background' },
  { key: '--card', label: 'Card background' },
  { key: '--ink',  label: 'Main text' },
  { key: '--dark', label: 'Sidebar' },
  { key: '--rust', label: 'Primary / buttons' },
  { key: '--sand', label: 'Wood accent (Mark eaten)' },
  { key: '--bf',   label: 'Breakfast accent' },
  { key: '--ln',   label: 'Lunch accent' },
  { key: '--dn',   label: 'Dinner accent' },
  { key: '--gold', label: 'Highlight numbers' },
];

let doc = {};
let isAdmin = false;

export function contentDoc() { return doc; }
export function isAdminUser() { return isAdmin; }

// ---- getters used by the views for editable branding/copy ----
export function brand() {
  const b = doc.branding || {};
  return {
    name: b.siteName || 'Table for One',
    sub: b.brandSub || 'Party of one · eat the world',
  };
}
export function copy(key, fallback) {
  const c = doc.copy || {};
  return (typeof c[key] === 'string' && c[key] !== '') ? c[key] : fallback;
}

// ---- apply a document over in-memory data + theme (defensive throughout) ----
export function applyContent(next) {
  doc = (next && typeof next === 'object') ? next : {};
  try { applyTheme(doc.theme); } catch { /* never break paint */ }
  try { applyRecipes(doc); } catch { /* ignore malformed recipe data */ }
}

function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  if (theme.tokens) {
    for (const [k, v] of Object.entries(theme.tokens)) {
      if (/^--[\w-]+$/.test(k) && typeof v === 'string' && v.length <= 64) root.style.setProperty(k, v);
    }
    if (theme.tokens['--rust']) root.style.setProperty('--rust-deep', shade(theme.tokens['--rust'], -18));
  }
  const pair = FONT_PAIRS[theme.fontPair];
  if (pair) { root.style.setProperty('--serif', pair.serif); root.style.setProperty('--sans', pair.sans); }
}

function applyRecipes(d) {
  if (d.recipes) for (const [id, ov] of Object.entries(d.recipes)) {
    const r = recipes[id]; if (!r || !ov || typeof ov !== 'object') continue;
    for (const f of ['name', 'tagline', 'note', 'cuisine', 'region', 'storage']) if (typeof ov[f] === 'string') r[f] = ov[f];
    for (const f of ['protein', 'cost', 'timeMin', 'prep']) if (typeof ov[f] === 'number') r[f] = ov[f];
    if (Array.isArray(ov.ingredients)) r.ingredients = ov.ingredients;
    if (Array.isArray(ov.steps)) r.steps = ov.steps;
    if (Array.isArray(ov.tips)) r.tips = ov.tips;
    if (typeof ov.emoji === 'string') emojiOf[id] = ov.emoji;
    if (typeof ov.photo === 'string') photoMap[id] = ov.photo;
  }
  if (d.added) for (const [id, r] of Object.entries(d.added)) {
    if (!r || typeof r !== 'object') continue;
    recipes[id] = { ...r, id };
    if (r.emoji) emojiOf[id] = r.emoji;
    if (r.photo) photoMap[id] = r.photo;
    addToPool(id, r);
  }
  if (Array.isArray(d.removed)) for (const id of d.removed) removeFromPools(id);
}

function addToPool(id, r) {
  const isBf = r.pool === 'breakfast';
  if (!r.cuisine) {
    if (isBf && !neutralBreakfasts.includes(id)) neutralBreakfasts.push(id);
  } else {
    const map = isBf ? cuisineBreakfasts : cuisineMains;
    map[r.cuisine] = map[r.cuisine] || [];
    if (!map[r.cuisine].includes(id)) map[r.cuisine].push(id);
  }
}
function removeFromPools(id) {
  const pull = arr => { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); };
  pull(neutralBreakfasts);
  for (const m of [cuisineMains, cuisineBreakfasts]) for (const k of Object.keys(m)) pull(m[k]);
  delete recipes[id];
}

// Lighten/darken a #rrggbb by a percentage (for primary hover states).
function shade(hex, pct) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
  const n = parseInt(m[1], 16);
  const adj = c => Math.max(0, Math.min(255, Math.round(c + (pct / 100) * 255)));
  const r = adj((n >> 16) & 255), g = adj((n >> 8) & 255), b = adj(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// ---- load / fetch / publish ----
export function loadCachedContent() {
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY)); if (c && c.doc) applyContent(c.doc); }
  catch { /* no cache */ }
}

export async function fetchContent() {
  try {
    const rows = await api(REST, '/tfo_content?select=doc&id=eq.published&limit=1');
    const fresh = (rows && rows[0] && rows[0].doc) ? rows[0].doc : {};
    const changed = JSON.stringify(fresh) !== JSON.stringify(doc);
    applyContent(fresh);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ doc: fresh, at: Date.now() })); } catch { /* private mode */ }
    return changed;
  } catch { return false; }
}

// A signed-in admin can read tfo_admins (RLS blocks everyone else), so any rows
// back means the current user is an admin.
export async function refreshAdmin() {
  if (!accessToken()) { isAdmin = false; return false; }
  try { const rows = await api(REST, '/tfo_admins?select=email'); isAdmin = Array.isArray(rows) && rows.length > 0; }
  catch { isAdmin = false; }
  return isAdmin;
}

export async function publishContent(next) {
  await api(REST, '/tfo_content?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ id: 'published', doc: next, updated_at: new Date().toISOString() }),
  });
  applyContent(next);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ doc: next, at: Date.now() })); } catch { /* private mode */ }
}
