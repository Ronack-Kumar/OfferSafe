import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminDashboard from "@/components/admin/admin-dashboard";
import SignOutButton from "@/components/admin/sign-out-button";
import { ACCESS_COOKIE, checkAdminToken } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin | OfferSafe", robots: { index: false, follow: false } };

export default async function AdminOfferSafePage() {
  // Server-side gate: no admin session, no dashboard (and no report data in the HTML).
  const check = await checkAdminToken(cookies().get(ACCESS_COOKIE)?.value);
  if (!check.ok && check.status === 401) redirect("/admin-offersafe/login");

  if (!check.ok) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10">
        <h1 className="text-2xl">{check.status === 403 ? "No admin access" : "Admin unavailable"}</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {check.error}
        </p>
        <SignOutButton />
      </div>
    );
  }

  return <AdminDashboard email={check.session.email} />;
}
