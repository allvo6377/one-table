// Tiny view helpers. Views are template-literal functions returning HTML
// strings; esc() is used on every interpolated data value.
import { emojiOf } from './data.js';

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Emoji "photography": a soft slot-tinted gradient + the dish's emoji.
// Free to ship, instant to paint, and readable at 70px on a phone.
export function thumb(rid, slot, extra = '') {
  return `<span class="thumb thumb-${slot}" aria-hidden="true">${emojiOf[rid] || '🍽'}${extra}</span>`;
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
