import test from "node:test";
import assert from "node:assert/strict";
import { taskQuery, validateTask, validTaskDate, localDate } from "../src/lib/tasks.mjs";
import Task from "../src/models/Task.js";

test("task writes validate fields and cannot inject database operators", () => {
  assert.deepEqual(validateTask({ title: " Plan ", description: " Details ", dueDate: "", _id: "spoofed", $set: { status: "done" } }), { title: "Plan", description: "Details", dueDate: null });
  for (const body of [null, [], { title: " " }, { title: "a".repeat(201) }, { title: "Plan", status: "constructor" }, { title: "Plan", priority: { $ne: "low" } }]) assert.throws(() => validateTask(body));
  assert.throws(() => validateTask({ $unset: { title: 1 } }, true));
  assert.deepEqual(validateTask({ status: "done", updatedAt: "forged" }, true), { status: "done" });
  assert.deepEqual(validateTask({ dueDate: null }, true), { dueDate: null });
});

test("deadlines are valid calendar dates and remain date-only", () => {
  assert.equal(validTaskDate("2028-02-29"), true);
  for (const date of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "0000-01-01", "2026-10-06T12:00:00Z", 123]) {
    assert.equal(validTaskDate(date), false);
    assert.throws(() => validateTask({ dueDate: date }, true));
  }
  assert.equal(localDate(new Date(2026, 9, 6, 0, 30)), "2026-10-06");
});

test("task search is literal, filters are allowlisted and pagination is bounded", () => {
  const result = taskQuery(new URLSearchParams({ search: "[plan].*", status: "done", priority: "high", page: "-1", limit: "9999", sort: "$where" }));
  assert.equal(result.page, 1); assert.equal(result.limit, 100); assert.equal(result.sort, "-updatedAt");
  assert.equal(result.query.status, "done"); assert.equal(result.query.priority, "high");
  const expression = new RegExp(result.query.$or[0].title.$regex);
  assert.ok(expression.test("[plan].*")); assert.ok(!expression.test("plan anything"));
  assert.deepEqual(taskQuery(new URLSearchParams({ status: "$ne", priority: "__proto__" })).query, {});
  assert.deepEqual(taskQuery(new URLSearchParams({ status: "active" })).query, { status: { $in: ["todo", "in_progress"] } });
});

test("tasks use their own collection, defaults and schema validation", async () => {
  assert.equal(Task.collection.collectionName, "tasks");
  const task = new Task(validateTask({ title: "Next step" }));
  await assert.doesNotReject(task.validate());
  assert.equal(task.status, "todo"); assert.equal(task.priority, "medium"); assert.equal(task.dueDate, null);
  for (const fields of [{ title: "" }, { status: "invalid" }, { priority: "urgent" }, { dueDate: "2026-02-30" }]) {
    await assert.rejects(new Task({ title: "Next step", ...fields }).validate());
  }
});
