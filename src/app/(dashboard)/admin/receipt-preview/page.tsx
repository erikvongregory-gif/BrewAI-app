import type { Metadata } from "next";
import { requireAdminPageAccess } from "@/lib/admin/auth";
import { StudioPageHeader } from "@/components/studio/ui";
import { AdminReceiptPreviewClient } from "@/components/admin/admin-receipt-preview-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "BrewAI · Receipt Preview" },
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default async function AdminReceiptPreviewPage() {
  await requireAdminPageAccess();

  return (
    <>
      <StudioPageHeader
        eyebrow="Administration"
        title="Beleg-Vorschau"
        subtitle="Visueller Test der Beleg-Animation ohne Stripe, Tokens oder DB-Mutationen"
      />
      <AdminReceiptPreviewClient />
    </>
  );
}
