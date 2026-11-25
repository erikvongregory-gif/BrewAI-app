import { NextResponse } from "next/server";
import { z } from "zod";
import { requireImageGenerationUser } from "@/app/(dashboard)/inhalte-erstellen/lib/api-guards";
import { getGenerationJobForUser } from "@/lib/billing/generationJobs";
import { composeSocialTextOverlay, parsePrimaryBrandColor } from "@/lib/social/text-overlay";
import { getBrandProfileFromMetadata } from "@/lib/dashboard/brandProfile";
import { publicFetch } from "@/lib/security/public-fetch";
import { uploadGeneratedImageWithThumb } from "@/lib/supabase/storage";
import { applyAiWatermark } from "@/lib/openai/aiWatermark";
import { persistGeneratedMediaItems } from "@/lib/dashboard/persistGeneratedMedia";
import { hydratePrivateAssets } from "@/lib/supabase/privateAssets";
import { aspectRatioToOutputDimensions } from "@/lib/openai/imageAspectRatio";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  jobId: z.string().min(8).max(80),
  headline: z.string().trim().min(1).max(60),
  subline: z.string().trim().max(120).optional(),
  ctaText: z.string().trim().max(30).optional(),
});

export async function POST(req: Request) {
  const guard = await requireImageGenerationUser(req, "inhalte-erstellen-social-relayout");
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Headline und Auftrag fehlen." }, { status: 400 });
  }

  const job = await getGenerationJobForUser(guard.userId, parsed.data.jobId);
  if (!job?.result) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  if (!["completed", "failed"].includes(job.status) && job.status !== "reserved") {
    return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  }

  const result = (await hydratePrivateAssets(job.result, guard.userId)) as Record<string, unknown>;
  const backgrounds = Array.isArray(result.backgroundImages)
    ? result.backgroundImages
        .map((item) => (item && typeof item === "object" && "imageUrl" in item ? String(item.imageUrl) : ""))
        .filter(Boolean)
    : [];
  if (!backgrounds.length) {
    return NextResponse.json(
      { error: "Für diesen Auftrag gibt es kein getrenntes Hintergrundmotiv. Textänderung braucht eine neue Erstellung." },
      { status: 409 },
    );
  }

  const snapshot = result.snapshot && typeof result.snapshot === "object" ? (result.snapshot as { aspectRatio?: string }) : {};
  const aspectRatio = typeof snapshot.aspectRatio === "string" ? snapshot.aspectRatio : "4:5";
  const outputDimensions = aspectRatioToOutputDimensions(aspectRatio);
  const brandAccent = parsePrimaryBrandColor(getBrandProfileFromMetadata(guard.userMetadata).brandColors);
  const images: string[] = [];
  const thumbs: Array<string | undefined> = [];

  for (const backgroundUrl of backgrounds) {
    const downloaded = await publicFetch(backgroundUrl, { maxBytes: 25 * 1024 * 1024 });
    if (downloaded.status !== 200 || downloaded.body.byteLength < 32) {
      return NextResponse.json({ error: "Hintergrundmotiv konnte nicht geladen werden." }, { status: 502 });
    }
    const composited = await composeSocialTextOverlay({
      imageBuffer: downloaded.body,
      overlay: {
        width: outputDimensions.width,
        height: outputDimensions.height,
        headline: parsed.data.headline,
        subline: parsed.data.subline,
        ctaText: parsed.data.ctaText,
        textColor: "#FFFFFF",
        ctaBackground: brandAccent,
      },
    });
    const uploaded = await uploadGeneratedImageWithThumb({
      userId: guard.userId,
      buffer: await applyAiWatermark(composited, "png"),
      outputFormat: "png",
    });
    images.push(uploaded.imageUrl);
    thumbs.push(uploaded.thumbUrl);
  }

  const nextResult = {
    ...result,
    images: images.map((imageUrl) => ({ imageUrl })),
    overlay: {
      headline: parsed.data.headline,
      subline: parsed.data.subline,
      ctaText: parsed.data.ctaText,
    },
    mediaPersisted: true,
  };
  const { error } = await createAdminClient()
    .from("generation_jobs")
    .update({ result: nextResult })
    .eq("id", job.id)
    .eq("user_id", guard.userId);
  if (error) return NextResponse.json({ error: "Neuer Text konnte nicht gespeichert werden." }, { status: 500 });

  await persistGeneratedMediaItems({
    userId: guard.userId,
    jobId: job.id,
    images,
    thumbs,
    title: parsed.data.headline.slice(0, 120),
    prompt: parsed.data.headline.slice(0, 240),
    aspectRatio,
    resolution: typeof result.resolution === "string" && result.resolution === "2K" ? "2K" : "1K",
    outputFormat: "png",
  });

  return NextResponse.json({
    jobId: job.id,
    images: images.map((imageUrl) => ({ imageUrl })),
    overlay: nextResult.overlay,
    aspectRatio,
    charged: 0,
  });
}
