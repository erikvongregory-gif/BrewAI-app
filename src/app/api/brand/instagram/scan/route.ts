import { workspaceResourceUser, workspaceErrorResponse } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { analyzeInstagramPosts, computeAnalysisConfidence } from "@/lib/brand/brand-analysis";
import { storeBrandReferenceImagesAsUrls } from "@/lib/brand/persist-reference-urls";
import { isInstagramConnectionExpired } from "@/lib/brand/instagram-connection-store";
import { loadInstagramImagesForAnalysis } from "@/lib/brand/instagram-graph";
import { loadInstagramConnectionForUser } from "@/lib/brand/instagram-persist-connection";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const rateError = await enforceRateLimitPersistent(req, {
      keyPrefix: "brand-instagram-scan",
      limit: 8,
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

    const connection = await loadInstagramConnectionForUser({
      userId: user.id,
      userMetadata: user.user_metadata,
    });
    if (!connection) {
      return NextResponse.json({ error: "Instagram ist noch nicht verbunden." }, { status: 400 });
    }
    if (isInstagramConnectionExpired(connection)) {
      return NextResponse.json(
        { error: "Instagram-Verbindung abgelaufen. Bitte erneut verbinden.", code: "instagram_token_expired" },
        { status: 401 },
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY fehlt." }, { status: 500 });
    }

    const images = await loadInstagramImagesForAnalysis(connection, 5);
    const scan = await analyzeInstagramPosts({
      apiKey,
      images: images.map((image) => ({ base64: image.base64, mediaType: image.mediaType })),
      instagramUrl: connection.profileUrl,
    });

    let referenceImageUrls: string[] = [];
    try {
      referenceImageUrls = await storeBrandReferenceImagesAsUrls(
        images.map((image) => ({
          base64: image.base64,
          mime: image.mime,
          sourceUrl: image.sourceUrl,
        })),
        { preferSourceUrls: true },
      );
    } catch (persistError) {
      console.warn("[brand/instagram/scan] reference URL storage failed:", persistError);
      referenceImageUrls = images.map((image) => image.sourceUrl).slice(0, 5);
    }

    const confidence = computeAnalysisConfidence({
      textExcerpt: images.map((image, index) => `Post ${index + 1}`).join(", "),
      imageCount: images.length,
    });

    return NextResponse.json({
      ok: true,
      suggestion: {
        ...scan,
        referenceImageUrls,
        brandInstagramUrl: connection.profileUrl,
        brandWebsiteUrl: "",
        brandProfileSource: "instagram" as const,
      },
      sourceMeta: {
        pagesFetched: 0,
        imagesScanned: images.length,
        imagesAnalyzed: images.length,
        confidence,
        pageTitle: `@${connection.username} auf Instagram`,
        imageSelection: "instagram_connected",
      },
    });
  } catch (error) {
    console.error("[brand/instagram/scan]", error);
    const msg = error instanceof Error ? error.message : "Instagram-Analyse fehlgeschlagen.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
