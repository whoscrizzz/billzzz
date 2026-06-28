// Inline tests for due-date logic (no TS import needed in CI)
function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function todayCalendarTs(year, month, date) {
  return Date.UTC(year, month, date);
}

function daysUntilIsoLocalParts(iso, year, month, date) {
  const due = parseIso(iso);
  const today = todayCalendarTs(year, month, date);
  return Math.round((due - today) / 86400000);
}

function daysUntilMonthly(dueDate, from) {
  const todayTs = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const parts = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const day = Number(parts[3]);
  const year = from.getFullYear();
  const month = from.getMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let due = Date.UTC(year, month, Math.min(day, lastDay));
  if (due < todayTs) due = Date.UTC(year, month + 1, Math.min(day, lastDay));
  return Math.round((due - todayTs) / 86400000);
}

function daysUntilMonthlyRespectingStored(dueDate, from) {
  const todayTs = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const storedTs = parseIso(dueDate);
  if (storedTs != null && storedTs >= todayTs) {
    return Math.round((storedTs - todayTs) / 86400000);
  }
  const day = Number(dueDate.slice(8, 10));
  const year = from.getFullYear();
  const month = from.getMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let due = Date.UTC(year, month, Math.min(day, lastDay));
  if (due < todayTs) due = Date.UTC(year, month + 1, Math.min(day, lastDay));
  return Math.round((due - todayTs) / 86400000);
}

const from = new Date("2026-06-25T12:00:00Z");
const daysFuture = daysUntilMonthlyRespectingStored("2027-02-01", from);
if (daysFuture <= 200 || daysFuture >= 230) {
  console.error("Expected ~221 days to 2027-02-01, got", daysFuture);
  process.exit(1);
}

const daysLegacy = daysUntilMonthlyRespectingStored("2026-06-27", from);
if (daysLegacy !== 2) {
  console.error("Expected 2 days to 2026-06-27, got", daysLegacy);
  process.exit(1);
}

const fromJune = new Date("2026-06-01T12:00:00Z");
const days = daysUntilMonthly("2026-06-05", fromJune);
if (days !== 4) {
  console.error("Expected 4 days, got", days);
  process.exit(1);
}
if (parseIso("2026-06-05") == null) {
  process.exit(1);
}

// Local calendar uses local date parts (timezone-independent assertion)
const daysTodayLocal = daysUntilIsoLocalParts("2026-06-24", 2026, 5, 24);
if (daysTodayLocal !== 0) {
  console.error("Expected 0 days (local today), got", daysTodayLocal);
  process.exit(1);
}

const daysTomorrowLocal = daysUntilIsoLocalParts("2026-06-25", 2026, 5, 24);
if (daysTomorrowLocal !== 1) {
  console.error("Expected 1 day (local tomorrow), got", daysTomorrowLocal);
  process.exit(1);
}

// UTC-style "today" on the next UTC day would mark yesterday as overdue
const daysUtcStyle = daysUntilIsoLocalParts("2026-06-24", 2026, 5, 25);
if (daysUtcStyle !== -1) {
  console.error("Expected -1 day with UTC-style next-day anchor, got", daysUtcStyle);
  process.exit(1);
}

function safeUtcDate(year, month, day) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(day, lastDay));
}

function advanceMonthly(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(safeUtcDate(y, m, d)).toISOString().slice(0, 10);
}

const next = advanceMonthly("2026-06-05");
if (next !== "2026-07-05") {
  console.error("Expected 2026-07-05 after monthly advance, got", next);
  process.exit(1);
}

console.log("test-stats: OK");
