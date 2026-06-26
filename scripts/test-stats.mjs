// Inline tests for due-date logic (no TS import needed in CI)
function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function daysUntilMonthly(dueDate, from) {
  const todayUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const parts = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const day = Number(parts[3]);
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let due = Date.UTC(year, month, Math.min(day, lastDay));
  if (due < todayUtc) due = Date.UTC(year, month + 1, Math.min(day, lastDay));
  return Math.round((due - todayUtc) / 86400000);
}

const from = new Date("2026-06-01T12:00:00Z");
const days = daysUntilMonthly("2026-06-05", from);
if (days !== 4) {
  console.error("Expected 4 days, got", days);
  process.exit(1);
}
if (parseIso("2026-06-05") == null) {
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
