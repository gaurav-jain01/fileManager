import { withAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import DailyTodo from "@/models/DailyTodo";
import { apiError, readJson } from "@/lib/api";
import { dailyWindow, reportBuckets, validateDailyTodo, validateHistoryDay, validateTimeZone } from "@/lib/daily-todos.mjs";

async function handleGET(request) {
  try {
    const params = new URL(request.url).searchParams;
    let timeZone, window, day;
    try {
      timeZone = validateTimeZone(params.get("timeZone") || "UTC");
      window = dailyWindow(timeZone);
      day = validateHistoryDay(params.get("day") || window.day, window.day);
    } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
    const mode = ["none", "weekly"].includes(params.get("mode")) ? params.get("mode") : "daily";
    const range = reportBuckets(day, mode);
    const requestedPage = Math.max(1, Math.min(Number(params.get("page")) || 1, 100000));
    await connectDB();
    const rows = await DailyTodo.aggregate([
        { $match: { day: mode === "none" ? day : { $gte: range[0].day, $lte: day } } },
        { $group: { _id: "$day", total: { $sum: 1 }, done: { $sum: { $cond: ["$done", 1, 0] } } } },
      ]);
    const summary = rows.find(row => row._id === day) || { total: 0, done: 0 };
    const total = summary.total;
    const pages = Math.max(1, Math.ceil(total / 50));
    const page = Math.min(Math.floor(requestedPage), pages);
    const todos = await DailyTodo.find({ day }).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * 50).limit(50).lean();
    return NextResponse.json({ todos, today: window.day, closesAt: window.closesAt, day, summary: { total: summary.total, done: summary.done }, buckets: mode === "none" ? [] : reportBuckets(day, mode, rows), pagination: { page, pages, total }, timeZone }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

async function handlePOST(request) {
  try {
    const body = await readJson(request);
    let data, timeZone, window;
    try {
      data = validateDailyTodo(body);
      timeZone = validateTimeZone(body.timeZone);
      window = dailyWindow(timeZone);
      if (body.day !== window.day) return NextResponse.json({ error: "A new day has started. Refresh your daily list before adding a task." }, { status: 409 });
    } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
    await connectDB();
    if (dailyWindow(timeZone).day !== window.day) return NextResponse.json({ error: "A new day has started. Refresh your daily list before adding a task." }, { status: 409 });
    const todo = await DailyTodo.create({ ...data, ...window, timeZone, completedAt: data.done ? new Date() : null });
    return NextResponse.json({ todo }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export const GET = withAuth(handleGET);
export const POST = withAuth(handlePOST);
