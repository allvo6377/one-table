// Live week, Monday-start. The design prototype pinned 13–19 July; the real
// app derives the week from the clock so "Today" is always today.
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const FULL_DAY = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

// A week `offset` weeks from the one containing `now`. offset 0 = this week.
export function weekByOffset(offset = 0, now = new Date()) {
  const dow = (now.getDay() + 6) % 7; // Mon = 0
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + offset * 7);
  const days = DAY_NAMES.map((name, i) => {
    const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
    return { name, date: MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate() };
  });
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const label = mon.getMonth() === sun.getMonth()
    ? `${mon.getDate()} – ${sun.getDate()} ${MONTHS_FULL[mon.getMonth()]}`
    : `${mon.getDate()} ${MONTHS_FULL[mon.getMonth()]} – ${sun.getDate()} ${MONTHS_FULL[sun.getMonth()]}`;
  const todayIdx = offset === 0 ? dow : -1; // only the current week has a "today"
  const todayLabel = offset === 0
    ? `${FULL_DAY[DAY_NAMES[dow]]}, ${now.getDate()} ${MONTHS_FULL[now.getMonth()]}`
    : `Week of ${mon.getDate()} ${MONTHS_SHORT[mon.getMonth()]}`;
  // Stable identity (the Monday's date) — keys this week's saved state.
  const key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
  return { days, todayIdx, label, todayLabel, key, offset };
}

export function currentWeek(now = new Date()) { return weekByOffset(0, now); }

// This week + the next `count-1` weeks, for the plan-week picker.
export function upcomingWeeks(count = 6, now = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const w = weekByOffset(i, now);
    return { offset: i, key: w.key, label: i === 0 ? `This week · ${w.label}` : i === 1 ? `Next week · ${w.label}` : `${w.label}` };
  });
}
