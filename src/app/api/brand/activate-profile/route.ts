import { workspaceResourceUser } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createRouteHandlerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { clampBrandSettingsFields } from "@/lib/dashboard/settingsPayload";
import {
  persistBrandProfileForUser,
  prepareMetadataForSave,
  resolveBrandReferenceImageUrls,
  type PersistBrandProfileResult,
} from "@/lib/brand/save-brand-profile";
import { MAX_MY_BEERS } from "@/lib/dashboard/metadata";
import { parseBrandFieldStatus } from "@/lib/dashboard/brandProfile";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  breweryName: z.string().min(1).max(120),
  brandTone: z.string().min(1).max(300),
  brandColors: z.string().min(1).max(300),
  brandDos: z.string().min(1).max(600),
  brandDonts: z.string().min(1).max(600),
  brandInstagramUrl: z.string().max(1200).optional().default(""),
  brandWebsiteUrl: z.string().max(1200).optional().default(""),
  brandProfileSource: z.enum(["url", "instagram", "manual"]),
  brandReferenceImageUrls: z.array(z.string().max(1200)).max(10).optional().default([]),
  brandLabelReferenceUrl: z.string().max(1200).optional().default(""),
  brandHeadlineFontName: z.string().max(80).optional().default(""),
  brandFontFileUrl: z.string().max(1200).optional().default(""),
  referenceImagePayloads: z
    .array(
      z.object({
        base64: z.string().min(32).max(600_000),
        mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
      }),
    )
    .max(5)
    .optional(),
  suggestedBeers: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        produktKategorie: z.enum(["bier", "limonade", "tafelwasser", "mineralwasser"]).optional(),
        bierstil: z.string().min(1).max(60),
        flaschenTyp: z.string().min(1).max(60),
        flaschenfarbe: z.enum(["braun", "gruen", "klar"]),
        glasTyp: z.string().min(1).max(40),
        filtrierung: z.enum(["filtriert", "unfiltriert"]).optional(),
        etikettUrl: z.string().max(1200).optional().default(""),
      }),
    )
    .max(MAX_MY_BEERS)
    .optional(),
  // Tolerant: ungültige Werte werden verworfen statt die Aktivierung abzulehnen (alte/neue Clients).
  brandFieldStatus: z
    .unknown()
    .optional()
    .transform((value) => parseBrandFieldStatus(value)),
});

export async function POST(req: Request) {
  try {
    const rateError = await enforceRateLimitPersistent(req, {
      keyPrefix: "brand-activate-profile",
      limit: 15,
      windowMs: 60_000,
    });
    if (rateError) return rateError;
    const originError = enforceSameOrigin(req);
    if (originError) return originError;

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
    }

    const supabase = await createClient();
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { try { user = await workspaceResourceUser(user, true); } catch { return NextResponse.json({error:"Teamzugriff nicht erlaubt."},{status:403}); } }
    if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Ungueltige Anfrage." }, { status: 400 });
    }

    const clamped = clampBrandSettingsFields(
      typeof rawBody === "object" && rawBody !== null ? (rawBody as Record<string, unknown>) : {},
    );
    const parsed = bodySchema.safeParse(clamped);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const detail = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Validierung fehlgeschlagen";
      return NextResponse.json({ error: `Ungueltige Markenprofil-Daten (${detail}).` }, { status: 400 });
    }

    const input = parsed.data;
    let referenceImageUrls: string[] = [];
    try {
      referenceImageUrls = await resolveBrandReferenceImageUrls({
        referenceImageUrls: input.brandReferenceImageUrls,
        referenceImagePayloads: input.referenceImagePayloads,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Referenzbilder konnten nicht gespeichert werden.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const origin = new URL(req.url).origin;
    const latestMetadata = prepareMetadataForSave(user.user_metadata);

    let saved: PersistBrandProfileResult;
    try {
      saved = await persistBrandProfileForUser({
        userId: user.id,
        latestMetadata,
        origin,
        input,
        referenceImageUrls,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Markenprofil konnte nicht gespeichert werden.";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const response = NextResponse.json({
      ok: true,
      settings: saved.settings,
      referenceImageUrls: saved.referenceImageUrls,
      beersCreated: saved.myBeers?.length ?? 0,
      myBeers: saved.myBeers ?? [],
    });

    try {
      const routeClient = createRouteHandlerClient(req, response);
      await Promise.race([
        routeClient.auth.refreshSession(),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 8_000);
        }),
      ]);
    } catch (refreshError) {
      console.warn("[brand/activate-profile] refreshSession failed:", refreshError);
    }

    return response;
  } catch (error) {
    console.error("[brand/activate-profile]", error);
    const msg = error instanceof Error ? error.message : "Markenprofil konnte nicht gespeichert werden.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
