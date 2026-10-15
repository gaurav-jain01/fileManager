import { withAuth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import File from "@/models/File";
import { NextResponse } from "next/server";
import { fileQuery, validateFile } from "@/lib/files.mjs";
import { apiError, readJson } from "@/lib/api";

async function handleGET(request) {
  try {
    await connectDB();
    const params = new URL(request.url).searchParams;
    const { query, sort, page: requestedPage, limit } = fileQuery(params);
    const includeMeta = params.get("meta") !== "0";
    const [total, counts, categoryCounts, tags] = await Promise.all([
      File.countDocuments(query),
      includeMeta ? File.aggregate([{ $group: { _id: null, total: { $sum: 1 }, favorites: { $sum: { $cond: ["$favorite", 1, 0] } }, notes: { $sum: { $cond: [{ $eq: ["$kind", "note"] }, 1, 0] } }, uploads: { $sum: { $cond: [{ $eq: ["$kind", "upload"] }, 1, 0] } } } }]) : [],
      includeMeta ? File.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }, { $sort: { _id: 1 } }]) : [],
      includeMeta ? File.distinct("tags") : [],
    ]);
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, pages);
    const ordering = { [sort.replace(/^-/, "")]: sort.startsWith("-") ? -1 : 1, _id: 1 };
    const files = params.get("summary") === "1"
      ? await File.aggregate([{ $match: query }, { $sort: ordering }, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: { title: 1, kind: 1, type: 1, category: 1, tags: 1, favorite: 1, url: 1, filename: 1, size: 1, createdAt: 1, updatedAt: 1, description: { $substrCP: [{ $ifNull: ["$description", ""] }, 0, 220] }, preview: { $substrCP: [{ $ifNull: ["$notes", ""] }, 0, 220] } } }])
      : await File.find(query).sort(ordering).skip((page - 1) * limit).limit(limit).lean();
    return NextResponse.json({ files, pagination: { page, limit, total, pages }, ...(includeMeta ? { meta: { total: counts[0]?.total || 0, favorites: counts[0]?.favorites || 0, notes: counts[0]?.notes || 0, uploads: counts[0]?.uploads || 0, categories: categoryCounts.map(c => ({ name: c._id || "General", count: c.count })), tags: tags.sort() } } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

async function handlePOST(request) {
  try {
    const body = await readJson(request);
    let data;
    try {
      if (body?.kind === "upload") throw new Error("Use the file upload endpoint to upload a file.");
      data = validateFile(body);
    } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
    await connectDB();
    const file = await File.create(data);
    return NextResponse.json({ file }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export const GET = withAuth(handleGET);
export const POST = withAuth(handlePOST);
