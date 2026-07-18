// Zero-dependency Supabase client: GoTrue (email OTP) + PostgREST over raw
// fetch. Local-first — the app works fully offline and signed out; signing in
// layers last-write-wins sync of user intent on top. ~3 KB instead of an SDK.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { state, set, onPersist, resetWeekScoped } from './store.js';
import { currentPlan } from './planner.js';

const SESSION_KEY = 'table-for-one:session';
const AUTH = SUPABASE_URL + '/auth/v1';
const REST = SUPABASE_URL + '/rest/v1';

let session = null;      // { access_token, refresh_token, expires_at, user:{id,email} }
let pendingEmail = null; // email an OTP was sent to (UI state machine)
let lastError = '';
let applying = false;    // true while applying a pull — suppresses echo pushes
let pushTimer = 0;
let lastSeen = { user: null, week: null }; // server updated_at we already hold

try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { /* fresh */ }

function saveSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* private mode */ }
}

export const auth = {
  get user() { return session?.user || null; },
  get pendingEmail() { return pendingEmail; },
  get error() { return lastError; },
};

async function api(base, path, opts = {}) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...opts.headers };
  if (session && base === REST) {
    if (session.expires_at * 1000 - Date.now() < 60_000) await refresh();
    headers.Authorization = 'Bearer ' + session.access_token;
  }
  const res = await fetch(base + path, { ...opts, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.msg || j.message || j.error_description || msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

async function refresh() {
  if (!session?.refresh_token) return;
  try {
    const s = await api(AUTH, '/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    saveSession({ ...s, user: s.user });
  } catch {
    saveSession(null); // refresh token expired/revoked — back to signed out
  }
}

// ---- auth flows ----
// One email supports both paths: the "Magic Link" template can show the
// 6-digit {{ .Token }} (typed into the code box, best on mobile) AND the
// {{ .ConfirmationURL }} link (tapped — redirects back here, handled on boot).
const appUrl = () => location.origin + location.pathname;

export async function sendCode(email) {
  lastError = '';
  try {
    await api(AUTH, '/otp?redirect_to=' + encodeURIComponent(appUrl()),
      { method: 'POST', body: JSON.stringify({ email, create_user: true }) });
    pendingEmail = email;
  } catch (e) { lastError = e.message; }
  set({}); // re-render account UI
}

export async function verifyCode(code) {
  lastError = '';
  const clean = String(code).replace(/\s+/g, ''); // tolerate "123 456" / pasted spaces
  try {
    const s = await api(AUTH, '/verify', {
      method: 'POST', body: JSON.stringify({ type: 'email', email: pendingEmail, token: clean }),
    });
    saveSession(s);
    pendingEmail = null;
    await pull({ firstSignIn: true });
  } catch (e) { lastError = e.message; set({}); }
}

// Magic-link return: Supabase redirects back with tokens (or an error) in the
// URL fragment. Adopt the session, strip the fragment, and sync.
async function handleAuthRedirect() {
  const h = location.hash;
  if (!h || (h.indexOf('access_token=') === -1 && h.indexOf('error') === -1)) return false;
  const params = new URLSearchParams(h.slice(1));
  const clean = () => history.replaceState(null, '', location.pathname + location.search);
  const token = params.get('access_token');
  if (!token) {
    lastError = (params.get('error_description') || params.get('error') || '').replace(/\+/g, ' ');
    clean();
    return false;
  }
  try {
    const user = await api(AUTH, '/user', { headers: { Authorization: 'Bearer ' + token } });
    saveSession({
      access_token: token,
      refresh_token: params.get('refresh_token'),
      expires_at: Math.floor(Date.now() / 1000) + Number(params.get('expires_in') || 3600),
      user,
    });
    pendingEmail = null;
    clean();
    set({}); // reflect signed-in state (sidebar/tabbar) even if the pull is a no-op
    await pull({ firstSignIn: true });
    return true;
  } catch (e) {
    lastError = e.message;
    clean();
    set({});
    return false;
  }
}

// Back out of code entry to the email form.
export function resetPending() {
  pendingEmail = null;
  lastError = '';
  set({});
}

// Test/debug hook: adopt a session obtained out-of-band (password grant).
export async function adoptSession(s) { saveSession(s); await pull({ firstSignIn: true }); }

export async function signOut() {
  try { await api(AUTH, '/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token } }); }
  catch { /* token may already be dead — sign out locally regardless */ }
  saveSession(null);
  lastSeen = { user: null, week: null };
  pendingEmail = null;
  set({});
}

// ---- sync ----
const USER_FIELDS = s => ({
  user_id: session.user.id,
  have: s.have, prefs: s.prefs,
  plan_cuisine: s.planCuisine, plan_budget_local: s.planBudgetLocal,
  hide_have: s.hideHave, layout: s.layout,
});
const WEEK_FIELDS = s => ({
  user_id: session.user.id, week_key: s.week.key,
  eaten: s.eaten, overrides: s.overrides, checked: s.checked, nudge_done: s.nudgeDone,
});

function applyRemote(u, w) {
  applying = true;
  const patch = {};
  if (u) {
    Object.assign(patch, {
      have: u.have, prefs: u.prefs, planCuisine: u.plan_cuisine,
      planBudgetLocal: u.plan_budget_local, hideHave: u.hide_have, layout: u.layout,
    });
    lastSeen.user = u.updated_at;
  }
  if (w) {
    Object.assign(patch, { eaten: w.eaten, overrides: w.overrides, checked: w.checked, nudgeDone: w.nudge_done });
    lastSeen.week = w.updated_at;
  }
  set(patch);
  // plan derives from planCuisine/budget — rebuild after applying them
  set({ plan: currentPlan() });
  applying = false;
}

export async function pull({ firstSignIn = false } = {}) {
  if (!session || !navigator.onLine) return;
  try {
    const [users, weeks] = await Promise.all([
      api(REST, '/tfo_user_state?select=*&limit=1'),
      api(REST, `/tfo_week_state?select=*&week_key=eq.${state.week.key}&limit=1`),
    ]);
    const u = users[0], w = weeks[0];
    if (!u && firstSignIn) { push(); return; } // brand-new account: seed it from this device
    const newer = (row, seen) => row && row.updated_at !== seen;
    if (newer(u, lastSeen.user) || newer(w, lastSeen.week)) applyRemote(newer(u, lastSeen.user) ? u : null, newer(w, lastSeen.week) ? w : null);
  } catch (e) { lastError = e.message; }
}

export async function push() {
  if (!session || !navigator.onLine) return;
  try {
    const prefer = { headers: { Prefer: 'resolution=merge-duplicates,return=representation' } };
    const [u] = await api(REST, '/tfo_user_state', { method: 'POST', body: JSON.stringify(USER_FIELDS(state)), ...prefer });
    const [w] = await api(REST, '/tfo_week_state?on_conflict=user_id,week_key', { method: 'POST', body: JSON.stringify(WEEK_FIELDS(state)), ...prefer });
    if (u) lastSeen.user = u.updated_at;
    if (w) lastSeen.week = w.updated_at;
    lastError = '';
  } catch (e) { lastError = e.message; }
}

function pushSoon() {
  if (!session || applying) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 1500);
}

// ---- wiring ----
export function initSync() {
  onPersist(pushSoon);                       // every persisted local change syncs up
  addEventListener('online', () => { push(); pull(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  // A magic-link return takes priority; otherwise catch up an existing session.
  handleAuthRedirect().then(handled => { if (!handled && session) pull(); });
}
