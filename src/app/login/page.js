import { redirect } from "next/navigation";
import { getSession, ownerConfig } from "@/lib/auth";
import { safeReturnPath } from "@/lib/auth-crypto.mjs";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Sign in · FileVault", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }) {
  const next = safeReturnPath((await searchParams).next);
  if (await getSession()) redirect(next);
  return <LoginForm next={next} configured={Boolean(ownerConfig())} />;
}
