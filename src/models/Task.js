import mongoose from "mongoose";
import { TASK_STATUSES, TASK_PRIORITIES, validTaskDate } from "../lib/tasks.mjs";

const TaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: "", trim: true, maxlength: 4000 },
  status: { type: String, enum: Object.keys(TASK_STATUSES), default: "todo", required: true },
  priority: { type: String, enum: Object.keys(TASK_PRIORITIES), default: "medium", required: true },
  dueDate: { type: String, default: null, validate: { validator: value => value === null || validTaskDate(value), message: "Invalid due date." } },
}, { timestamps: true, collection: "tasks" });

TaskSchema.index({ status: 1, updatedAt: -1 });
TaskSchema.index({ dueDate: 1 });

if (process.env.NODE_ENV === "development" && mongoose.models.Task) mongoose.deleteModel("Task");
export default mongoose.models.Task || mongoose.model("Task", TaskSchema);
