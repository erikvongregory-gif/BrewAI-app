import type { Metadata } from "next";
import { requireAdminPageAccess } from "@/lib/admin/auth";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { StudioPageHeader } from "@/components/studio/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: {
    absolute: "BrewAI · Admin-Bereich",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default async function AdminDashboardPage() {
  const admin = await requireAdminPageAccess();

  return (
    <>
      <StudioPageHeader
        eyebrow="Administration"
        title="Admin-Bereich"
        subtitle={`Angemeldet als ${admin.email ?? "Admin"} · Nutzer, Billing, Team und Inhalte verwalten`}
      />
      <AdminDashboard />
    </>
  );
}
