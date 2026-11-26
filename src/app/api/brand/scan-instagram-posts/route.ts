import { workspaceResourceUser, workspaceErrorResponse } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { analyzeInstagramPosts } from "@/lib/brand/brand-analysis";
import { storeBrandReferenceImagesAsUrls } from "@/lib/brand/persist-reference-urls";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function anthropicMediaType(mime: string): "image/jpeg" | "image/png" | "image/webp" {
  if (mime === "image/png") return "image/png";
  if (mime === "image/webp") return "image/webp";
  return "image/jpeg";
}

export async function POST(req: Request) {
  try {
    const rateError = await enforceRateLimitPersistent(req, {
      keyPrefix: "brand-scan-instagram-posts",
      limit: 12,
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
  if (user) { try { user = await workspaceResourceUser(user, true); } catch (e) { return workspaceErrorResponse(e); } }
    if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Ungueltiges Formular." }, { status: 400 });
    }

    const filesRaw = formData.getAll("image");
    const files = filesRaw.filter((item): item is File => item instanceof File);
    if (files.length < 1 || files.length > 5) {
      return NextResponse.json({ error: "Bitte 1 bis 5 Bilder hochladen (Screenshots deiner Instagram-Posts)." }, { status: 400 });
    }

    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: "Nur JPEG-, PNG- oder WebP-Bilder sind erlaubt." }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "Jede Datei darf hoechstens 4 MB gross sein." }, { status: 400 });
      }
    }

    const optionalInstagram = formData.get("instagramUrl");
    const instagramUrl =
      typeof optionalInstagram === "string" && optionalInstagram.trim().startsWith("http")
        ? optionalInstagram.trim().slice(0, 1200)
        : "";

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY fehlt." }, { status: 500 });
    }

    const imagesForAnalysis: Array<{ base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp"; mime: string }> = [];

    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const base64 = buf.toString("base64");
      const mediaType = anthropicMediaType(file.type);
      imagesForAnalysis.push({ base64, mediaType, mime: file.type });
    }

    let scan;
    try {
      scan = await analyzeInstagramPosts({
        apiKey,
        images: imagesForAnalysis,
        instagramUrl: instagramUrl || undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Vision-Analyse fehlgeschlagen.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    let referenceImageUrls: string[] = [];
    try {
      referenceImageUrls = await storeBrandReferenceImagesAsUrls(
        imagesForAnalysis.map((image) => ({ base64: image.base64, mime: image.mime })),
      );
    } catch (persistError) {
      console.warn("[brand/scan-instagram-posts] reference URL storage failed:", persistError);
    }

    return NextResponse.json({
      ok: true,
      suggestion: {
        ...scan,
        referenceImageUrls,
        brandInstagramUrl: instagramUrl,
        brandWebsiteUrl: "",
        brandProfileSource: "manual" as const,
      },
    });
  } catch (e) {
    console.error("[brand/scan-instagram-posts]", e);
    const msg = e instanceof Error ? e.message : "Auswertung fehlgeschlagen.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
