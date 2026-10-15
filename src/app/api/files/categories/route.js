import { withAuth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import File from "@/models/File";
import { apiError } from "@/lib/api";
async function handleGET() {
  try { await connectDB(); return Response.json({ categories: (await File.distinct("category")).sort() }); }
  catch (error) { return apiError(error); }
}

export const GET = withAuth(handleGET);
