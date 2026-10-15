import { authJson, deleteSession } from "@/lib/auth";
import { sameOriginMutation } from "@/lib/auth-crypto.mjs";

export async function POST(request) {
  if (!sameOriginMutation(request)) return authJson({ error: "This request must come from your FileVault app." }, 403);
  try {
    await deleteSession();
    return authJson({ ok: true });
  } catch {
    return authJson({ error: "Could not sign out. Please try again." }, 503);
  }
}
