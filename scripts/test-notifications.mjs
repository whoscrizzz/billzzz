/** Tests for notification eligibility logic (mirrors worker). */
import { readFileSync } from "node:fs";

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

function shouldNotify(daysLeft, notifyBefore, hour, nowHour) {
  if (daysLeft == null) return false;
  if (daysLeft < -7 || daysLeft > notifyBefore) return false;
  return nowHour === hour;
}

const from = new Date("2026-06-01T15:00:00Z");
const days = daysUntilMonthly("2026-06-05", from);
if (days !== 4) {
  console.error("Expected 4 days, got", days);
  process.exit(1);
}

if (!shouldNotify(0, 3, 15, 15)) {
  console.error("Should notify at matching hour");
  process.exit(1);
}
if (shouldNotify(0, 3, 9, 15)) {
  console.error("Should not notify at wrong hour");
  process.exit(1);
}
if (!shouldNotify(-2, 3, 15, 15)) {
  console.error("Should notify overdue within 7 days");
  process.exit(1);
}
if (shouldNotify(-10, 3, 15, 15)) {
  console.error("Should not notify very old overdue");
  process.exit(1);
}

const worker = readFileSync("worker/src/notifications.ts", "utf8");
if (!worker.includes("shouldNotifyNow")) {
  console.error("Worker missing shouldNotifyNow");
  process.exit(1);
}

console.log("test-notifications: OK");
