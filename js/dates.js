// Live week, Monday-start. The design prototype pinned 13–19 July; the real
// app derives the week from the clock so "Today" is always today.
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const FULL_DAY = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

export function currentWeek(now = new Date()) {
  const dow = (now.getDay() + 6) % 7; // Mon = 0
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  const days = DAY_NAMES.map((name, i) => {
    const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
    return { name, date: MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate() };
  });
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const label = mon.getMonth() === sun.getMonth()
    ? `${mon.getDate()} – ${sun.getDate()} ${MONTHS_FULL[mon.getMonth()]}`
    : `${mon.getDate()} ${MONTHS_FULL[mon.getMonth()]} – ${sun.getDate()} ${MONTHS_FULL[sun.getMonth()]}`;
  const todayLabel = `${FULL_DAY[DAY_NAMES[dow]]}, ${now.getDate()} ${MONTHS_FULL[now.getMonth()]}`;
  return { days, todayIdx: dow, label, todayLabel };
}
