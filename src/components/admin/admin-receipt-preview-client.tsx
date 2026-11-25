"use client";

import { useState } from "react";
import {
  BillingReceiptPrinter,
  type BillingReceiptData,
} from "@/components/ui/billing-receipt-printer";

/** Feste Mock-Daten — kein `new Date()` auf Modul-Ebene (sonst SSR/Client-Hydration-Mismatch → White Screen). */
const PREVIEW_RECEIPT: BillingReceiptData = {
  kind: "subscription",
  productLabel: "BrewAI Growth",
  plan: "growth",
  remainingTokens: 1500,
  amountLabel: "79,00 €",
  sessionRef: "PREVIEW1",
  dateLabel: "30.08.2026, 12:00:00",
  preview: true,
};

export function AdminReceiptPreviewClient() {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
      <p style={{ margin: 0, color: "var(--t2)", fontSize: 14, lineHeight: 1.55 }}>
        Serverseitig nur für Admins. Diese Preview ruft weder Stripe noch Token-/Billing-Mutationen auf —
        nur Fake-Anzeigedaten für die Receipt-Animation.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          minHeight: 44,
          borderRadius: 11,
          border: "1px solid var(--ac-line)",
          background: "var(--ac-tint)",
          color: "var(--ac-2)",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Receipt-Preview starten
      </button>
      <BillingReceiptPrinter open={open} data={PREVIEW_RECEIPT} onClose={() => setOpen(false)} />
    </div>
  );
}
