import { escapeRegex } from "./files.mjs";

export const TASK_STATUSES = { todo: "To do", in_progress: "In progress", done: "Done" };
export const TASK_PRIORITIES = { low: "Low", medium: "Medium", high: "High" };

// Calendar dates stay date-only so deadlines do not shift across time zones.
export function validTaskDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function validateTask(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Enter a valid task.");
  const data = {};
  for (const [field, max] of Object.entries({ title: 200, description: 4000 })) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string" || body[field].length > max) throw new Error(`${field} must be text with at most ${max} characters.`);
      data[field] = body[field].trim();
    }
  }
  if ((!partial || "title" in data) && !data.title) throw new Error("A task title is required.");
  for (const [field, options] of [["status", TASK_STATUSES], ["priority", TASK_PRIORITIES]]) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string" || !Object.hasOwn(options, body[field])) throw new Error(`Choose a valid ${field}.`);
      data[field] = body[field];
    }
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate !== null && body.dueDate !== "" && !validTaskDate(body.dueDate)) throw new Error("Use a valid due date (YYYY-MM-DD).");
    data.dueDate = body.dueDate || null;
  }
  if (partial && !Object.keys(data).length) throw new Error("No editable fields provided.");
  return data;
}

export function taskQuery(params) {
  const query = {};
  const search = (params.get("search") || "").trim().slice(0, 200);
  if (search) query.$or = ["title", "description"].map(field => ({ [field]: { $regex: escapeRegex(search), $options: "i" } }));
  for (const [field, options] of [["status", TASK_STATUSES], ["priority", TASK_PRIORITIES]]) {
    if (Object.hasOwn(options, params.get(field))) query[field] = params.get(field);
  }
  if (params.get("status") === "active") query.status = { $in: ["todo", "in_progress"] };
  const positive = (value, fallback, max) => /^\d+$/.test(value || "") ? Math.max(1, Math.min(Number(value), max)) : fallback;
  const sort = ["-updatedAt", "-createdAt", "title", "dueDate"].includes(params.get("sort")) ? params.get("sort") : "-updatedAt";
  return { query, sort, page: positive(params.get("page"), 1, 100000), limit: positive(params.get("limit"), 12, 100) };
}
