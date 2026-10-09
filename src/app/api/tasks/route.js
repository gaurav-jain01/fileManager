import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Task from "@/models/Task";
import { apiError, readJson } from "@/lib/api";
import { taskQuery, validateTask } from "@/lib/tasks.mjs";

export async function GET(request) {
  try {
    const { query, sort, page: requestedPage, limit } = taskQuery(new URL(request.url).searchParams);
    await connectDB();
    const [total, counts] = await Promise.all([
      Task.countDocuments(query),
      Task.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, pages);
    const tasks = await Task.find(query).sort({ [sort.replace(/^-/, "")]: sort.startsWith("-") ? -1 : 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean();
    const meta = { total: 0, todo: 0, in_progress: 0, done: 0 };
    for (const row of counts) { meta[row._id] = row.count; meta.total += row.count; }
    return NextResponse.json({ tasks, pagination: { page, pages, limit, total }, meta });
  } catch (error) { return apiError(error); }
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    let data;
    try { data = validateTask(body); } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
    await connectDB();
    const task = await Task.create(data);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) { return apiError(error); }
}
