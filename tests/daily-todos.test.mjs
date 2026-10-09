import test from "node:test";
import assert from "node:assert/strict";
import { dailyWindow, dateInZone, reportBuckets, shiftDay, validateDailyTodo, validateHistoryDay, validateTimeZone, weekStart } from "../src/lib/daily-todos.mjs";
import DailyTodo from "../src/models/DailyTodo.js";

test("daily boundary uses local midnight and handles daylight saving transitions", () => {
  const india = dailyWindow("Asia/Kolkata", new Date("2026-10-07T18:29:59.999Z"));
  assert.equal(india.day, "2026-10-07");
  assert.equal(india.closesAt.toISOString(), "2026-10-07T18:30:00.000Z");
  assert.equal(dateInZone("Asia/Kolkata", india.closesAt), "2026-10-08");
  const spring = dailyWindow("America/New_York", new Date("2026-03-08T05:00:00Z"));
  assert.equal(spring.closesAt.toISOString(), "2026-03-09T04:00:00.000Z");
  const fall = dailyWindow("America/New_York", new Date("2026-11-01T04:00:00Z"));
  assert.equal(fall.closesAt.toISOString(), "2026-11-02T05:00:00.000Z");
});

test("reports include empty days and Monday-based weeks across year boundaries", () => {
  const rows = [{ _id: "2025-12-31", total: 3, done: 2 }, { _id: "2026-01-04", total: 2, done: 1 }, { _id: "2026-01-05", total: 4, done: 0 }];
  const daily = reportBuckets("2026-01-05", "daily", rows);
  assert.equal(daily.length, 7);
  assert.deepEqual(daily[0], { day: "2025-12-30", end: "2025-12-30", total: 0, done: 0, remaining: 0 });
  assert.equal(daily[1].done, 2);
  const weeks = reportBuckets("2026-01-05", "weekly", rows);
  assert.equal(weeks.length, 8);
  assert.deepEqual(weeks[6], { day: "2025-12-29", end: "2026-01-04", total: 5, done: 3, remaining: 2 });
  assert.equal(weeks[7].remaining, 4);
  assert.equal(weekStart("2026-01-04"), "2025-12-29");
  assert.equal(shiftDay("2028-03-01", -1), "2028-02-29");
});

test("daily writes allow only titles and boolean completion; history and timezone input is validated", () => {
  assert.deepEqual(validateDailyTodo({ title: " Focus ", day: "1990-01-01", closesAt: "forged", $set: { done: true } }), { title: "Focus" });
  assert.deepEqual(validateDailyTodo({ done: true, completedAt: "forged" }, true), { done: true });
  for (const body of [null, [], { title: " " }, { title: "a".repeat(201) }, { title: "Plan", done: "false" }]) assert.throws(() => validateDailyTodo(body));
  assert.throws(() => validateDailyTodo({ day: "2026-01-01" }, true));
  for (const day of ["2026-02-29", "2027-01-01", "1899-12-31", { $gt: "" }]) assert.throws(() => validateHistoryDay(day, "2026-10-07"));
  assert.equal(validateHistoryDay("2026-10-06", "2026-10-07"), "2026-10-06");
  assert.equal(validateTimeZone("UTC"), "UTC");
  assert.throws(() => validateTimeZone("Fake/Zone"));
});

test("daily to-dos keep history in their own collection without expiration", async () => {
  assert.equal(DailyTodo.collection.collectionName, "daily_todos");
  assert.ok(DailyTodo.schema.indexes().every(([, options]) => options.expireAfterSeconds === undefined));
  const todo = new DailyTodo({ title: "Read", timeZone: "UTC", ...dailyWindow("UTC") });
  await assert.doesNotReject(todo.validate());
  assert.equal(todo.done, false);
  assert.equal(todo.completedAt, null);
  await assert.rejects(new DailyTodo({ title: "Read", day: "2026-02-30", timeZone: "UTC", closesAt: new Date() }).validate());
});
