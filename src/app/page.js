import { requirePageSession } from "@/lib/auth";
import VaultPage from "@/components/VaultPage";

export default async function Page({ searchParams }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry);
  }
  await requirePageSession("/" + (params.size ? `?${params}` : ""));
  return <VaultPage />;
}
