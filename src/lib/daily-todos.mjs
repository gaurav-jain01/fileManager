import { validTaskDate } from "./tasks.mjs";

export function validateTimeZone(value) {
  if (typeof value !== "string" || value.length > 100) throw new Error("Choose a valid time zone.");
  try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; }
  catch { throw new Error("Choose a valid time zone."); }
}

export function dateInZone(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = type => parts.find(value => value.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Find the actual next day boundary, including 23/25-hour daylight-saving days.
export function dailyWindow(timeZone, now = new Date()) {
  const day = dateInZone(timeZone, now);
  let low = now.getTime(), high = low + 36 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (dateInZone(timeZone, new Date(middle)) === day) low = middle;
    else high = middle;
  }
  return { day, closesAt: new Date(high) };
}

export function shiftDay(day, amount) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function weekStart(day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}

export function reportBuckets(day, mode, rows = []) {
  const weekly = mode === "weekly";
  const end = weekly ? weekStart(day) : day;
  const buckets = Array.from({ length: weekly ? 8 : 7 }, (_, i) => {
    const start = shiftDay(end, (i - (weekly ? 7 : 6)) * (weekly ? 7 : 1));
    return { day: start, end: weekly ? shiftDay(start, 6) : start, total: 0, done: 0 };
  });
  for (const row of rows) {
    const key = weekly ? weekStart(row._id) : row._id;
    const bucket = buckets.find(value => value.day === key);
    if (bucket) { bucket.total += row.total; bucket.done += row.done; }
  }
  return buckets.map(bucket => ({ ...bucket, remaining: bucket.total - bucket.done }));
}

export function validateDailyTodo(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Enter a valid to-do.");
  const data = {};
  if (!partial || body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 200) throw new Error("Enter a title with 1–200 characters.");
    data.title = body.title.trim();
  }
  if (body.done !== undefined) {
    if (typeof body.done !== "boolean") throw new Error("Completion must be true or false.");
    data.done = body.done;
  }
  if (partial && !Object.keys(data).length) throw new Error("No editable fields provided.");
  return data;
}

export function validateHistoryDay(day, today) {
  if (!validTaskDate(day) || day < "1900-01-01" || day > today) throw new Error("Choose today or a previous date (from 1900 onwards).");
  return day;
}
