import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Task from "@/models/Task";
import { apiError, readJson } from "@/lib/api";
import { validateTask } from "@/lib/tasks.mjs";

const validId = id => /^[a-f\d]{24}$/i.test(id);
const missing = () => NextResponse.json({ error: "Task not found." }, { status: 404 });

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!validId(id)) return missing();
    await connectDB();
    const task = await Task.findById(id).lean();
    return task ? NextResponse.json({ task }) : missing();
  } catch (error) { return apiError(error); }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    if (!validId(id)) return missing();
    const body = await readJson(request);
    let data;
    try { data = validateTask(body, true); } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
    await connectDB();
    const task = await Task.findByIdAndUpdate(id, { $set: data }, { returnDocument: "after", runValidators: true }).lean();
    return task ? NextResponse.json({ task }) : missing();
  } catch (error) { return apiError(error); }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    if (!validId(id)) return missing();
    await connectDB();
    const task = await Task.findByIdAndDelete(id).lean();
    return task ? NextResponse.json({ message: "Task deleted." }) : missing();
  } catch (error) { return apiError(error); }
}
