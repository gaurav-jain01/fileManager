import mongoose from "mongoose";
import { validTaskDate } from "../lib/tasks.mjs";

const DailyTodoSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  day: { type: String, required: true, immutable: true, validate: validTaskDate },
  timeZone: { type: String, required: true, immutable: true },
  closesAt: { type: Date, required: true, immutable: true },
  done: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
}, { timestamps: true, collection: "daily_todos" });

// Deliberately no TTL: past days are retained for history and reports.
DailyTodoSchema.index({ day: 1, createdAt: 1 });
if (process.env.NODE_ENV === "development" && mongoose.models.DailyTodo) mongoose.deleteModel("DailyTodo");
export default mongoose.models.DailyTodo || mongoose.model("DailyTodo", DailyTodoSchema);
