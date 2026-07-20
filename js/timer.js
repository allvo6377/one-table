// Step timer for cook mode. Reads a duration out of the current step's text
// ("simmer 25–30 minutes" → 27:30) and counts it down. Runs on its own
// interval and paints the DOM directly, so a tick never routes through the
// state render (which would replay the step-change animation every second).
import { state } from './store.js';
import { recipes } from './data.js';

let remaining = 0, total = 0, running = false, iv = null, actx = null;

// First "N", "N–M", or "N to M" minutes mentioned in a step.
export function parseStepSeconds(text) {
  const m = text && text.match(/(\d+)\s*(?:[–-]|to)?\s*(\d+)?\s*(?:min|minute)/i);
  if (!m) return 0;
  const lo = +m[1], hi = m[2] ? +m[2] : lo;
  return Math.round((lo + hi) / 2) * 60;
}

const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

function paint() {
  const bar = document.querySelector('.cook-timer');
  if (!bar) return;
  bar.classList.toggle('is-empty', total === 0);
  bar.classList.toggle('is-running', running);
  bar.classList.toggle('is-done', total > 0 && remaining === 0);
  const label = bar.querySelector('.cook-timer-label');
  const time = bar.querySelector('.cook-timer-time');
  const fill = bar.querySelector('.cook-timer-fill');
  const toggle = bar.querySelector('.cook-timer-toggle');
  if (label) label.textContent = total === 0 ? 'No timer for this step'
    : remaining === 0 ? 'Time’s up' : running ? 'Timer running' : 'Step timer';
  if (time) time.textContent = total === 0 ? '' : fmt(remaining);
  if (fill) fill.style.width = total ? Math.max(0, remaining / total * 100) + '%' : '0%';
  if (toggle) {
    toggle.textContent = running ? '❚❚' : '▶';
    toggle.setAttribute('aria-label', running ? 'Pause timer' : 'Start timer');
  }
}

function clearIv() { if (iv) { clearInterval(iv); iv = null; } }

function tick() {
  if (remaining > 0) {
    remaining--;
    if (remaining === 0) { clearIv(); running = false; chime(); }
    paint();
  }
}

// Reset the timer to the current step's suggested duration (paused).
export function syncToStep() {
  clearIv();
  running = false;
  const r = recipes[state.cooking];
  total = remaining = r ? parseStepSeconds(r.steps[state.cookStep]) : 0;
  paint();
}

export function toggle() {
  if (!total) return;
  // The click that starts the timer is the user gesture that unlocks audio.
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ } }
  if (actx && actx.state === 'suspended') actx.resume();
  if (remaining === 0) remaining = total; // restart when finished
  running = !running;
  if (running) iv = setInterval(tick, 1000); else clearIv();
  paint();
}

export function reset() { clearIv(); running = false; remaining = total; paint(); }

// Called when cook mode closes.
export function stop() { clearIv(); running = false; }

function chime() {
  if (!actx) return;
  // Two soft sine pips.
  for (const t of [0, 0.35]) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.connect(g); g.connect(actx.destination);
    o.type = 'sine';
    o.frequency.value = 880;
    const at = actx.currentTime + t;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
    o.start(at); o.stop(at + 0.3);
  }
}
