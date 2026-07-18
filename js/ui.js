// Tiny view helpers. Views are template-literal functions returning HTML
// strings; esc() is used on every interpolated data value.
import { emojiOf, recipes } from './data.js';

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---- real food photography, with the emoji as an offline fallback ----
const STOP = new Set(['and', 'with', 'the', 'in', 'of', 'a', 'na', 'ya', 'wa', 'da', 'e', 'al', 'no', '&']);
// A few dishes whose local names aren't good photo search terms.
const PHOTO_OVERRIDE = {
  githeri: 'kenyan,beans,maize', 'nyama-choma': 'grilled,beef,steak', ugali: 'ugali,cornmeal',
  'sukuma-ugali': 'collard,greens,ugali', matoke: 'plantain,stew', 'omena-ugali': 'sardines,ugali',
  muthokoi: 'maize,beans,stew', 'tuwo-kuka': 'rice,soup', 'amala-ewedu': 'yam,soup',
  'eshabwe-kalo': 'millet,bread', malakwang: 'greens,peanut,stew', 'nduma-eggs': 'arrowroot,eggs',
  poha: 'poha,flattened,rice', 'viazi-karai': 'fried,potato,indian',
};

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

function photoQuery(r) {
  if (PHOTO_OVERRIDE[r.id]) return PHOTO_OVERRIDE[r.id];
  const words = r.name.replace(/\(.*?\)/g, ' ').replace(/[^a-zA-Z\s]/g, ' ').toLowerCase()
    .split(/\s+/).filter(w => w && !STOP.has(w)).slice(0, 3);
  if (r.cuisine) words.push(r.cuisine.toLowerCase());
  words.push('food');
  return words.join(',');
}

// Keyword-matched real photo, stable per dish via `lock`. Free, no API key.
export function photoUrl(rid, w = 600, h = 400) {
  const r = recipes[rid];
  if (!r) return '';
  return `https://loremflickr.com/${w}/${h}/${photoQuery(r)}?lock=${hash(rid) % 10000}`;
}

// A real photo layered over the slot-tinted emoji. If the photo can't load
// (offline, blocked, 404) onerror strips the <img> and the emoji shows.
export function thumb(rid, slot, extra = '', size) {
  const emoji = emojiOf[rid] || '🍽';
  const src = size ? photoUrl(rid, size[0], size[1]) : photoUrl(rid);
  return `<span class="thumb thumb-${slot}" aria-hidden="true"><span class="thumb-emoji">${emoji}</span><img class="thumb-img" loading="lazy" decoding="async" alt="" src="${src}" onerror="this.remove()">${extra}</span>`;
}

export function cuisineChip(cuisine, extraClass = '') {
  return cuisine ? `<span class="cuisine-chip ${extraClass}">${esc(cuisine)}</span>` : '';
}

export const steam = `
  <span class="steam s1" aria-hidden="true"></span>
  <span class="steam s2" aria-hidden="true"></span>
  <span class="steam s3" aria-hidden="true"></span>`;

let toastTimer = 0;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('show');
  void el.offsetWidth; // restart the pop-in animation
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
