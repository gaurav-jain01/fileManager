import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DailyTodo from "@/models/DailyTodo";
import { apiError, readJson } from "@/lib/api";
import { validateDailyTodo } from "@/lib/daily-todos.mjs";

const missing = () => NextResponse.json({ error: "To-do not found, or its day has ended. Previous days are kept as history." }, { status: 409 });

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return missing();
    let data;
    try { data = validateDailyTodo(await readJson(request), true); }
    catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
    const now = new Date();
    if (data.done !== undefined) data.completedAt = data.done ? now : null;
    await connectDB();
    const todo = await DailyTodo.findOneAndUpdate({ _id: id, closesAt: { $gt: new Date() } }, { $set: data }, { returnDocument: "after", runValidators: true }).lean();
    return todo ? NextResponse.json({ todo }) : missing();
  } catch (error) { return apiError(error); }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    if (!/^[a-f\d]{24}$/i.test(id)) return missing();
    await connectDB();
    const todo = await DailyTodo.findOneAndDelete({ _id: id, closesAt: { $gt: new Date() } });
    return todo ? NextResponse.json({ message: "To-do removed." }) : missing();
  } catch (error) { return apiError(error); }
}
