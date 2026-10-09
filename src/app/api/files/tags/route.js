import connectDB from "@/lib/mongodb";
import File from "@/models/File";
import { apiError } from "@/lib/api";
export async function GET() {
  try { await connectDB(); return Response.json({ tags: (await File.distinct("tags")).sort() }); }
  catch (error) { return apiError(error); }
}
