// Tiny view helpers. Views are template-literal functions returning HTML
// strings; esc() is used on every interpolated data value.
import { emojiOf, photoMap } from './data.js';

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---- real food photography, with the emoji as the fallback ----
// Every dish has a curated, matched photo in photoMap (Wikipedia/Wikimedia).
// There is no keyword/random fallback — an unmapped dish simply shows its
// emoji, so no off-topic image can ever appear.
export function photoUrl(rid) {
  return photoMap[rid] || '';
}

// A real photo layered over the slot-tinted emoji. If the photo can't load
// (offline, blocked, 404) onerror strips the <img> and the emoji shows.
export function thumb(rid, slot, extra = '') {
  const emoji = emojiOf[rid] || '🍽';
  const src = photoUrl(rid);
  const img = src ? `<img class="thumb-img" loading="lazy" decoding="async" alt="" src="${src}" onerror="this.remove()">` : '';
  return `<span class="thumb thumb-${slot}" aria-hidden="true"><span class="thumb-emoji">${emoji}</span>${img}${extra}</span>`;
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
