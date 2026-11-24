import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "@/components/admin/login-form";
import { ACCESS_COOKIE, checkAdminToken } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin sign in | OfferSafe", robots: { index: false, follow: false } };

export default async function AdminLoginPage() {
  const token = cookies().get(ACCESS_COOKIE)?.value;
  if (token && (await checkAdminToken(token)).ok) redirect("/admin-offersafe");

  return (
    <div className="mx-auto max-w-sm space-y-6 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl">Admin sign in</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          For OfferSafe moderators only.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
