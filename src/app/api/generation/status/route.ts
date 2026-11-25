import { NextResponse } from "next/server";
import { z } from "zod";
import { workspaceResourceUser } from "@/lib/dashboard/workspace";
import { finishGeneration, type GenerationJob } from "@/lib/billing/generationJobs";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { persistGeneratedMediaItems } from "@/lib/dashboard/persistGeneratedMedia";
import {
  createModelArkClient,
  getModelArkApiKey,
  isModelArkRequestId,
  type StatusResult,
} from "@/lib/generation";
import type { GenerationPlane } from "@/lib/generation/catalog/types";

const bodySchema = z.object({
  requestIds: z.array(z.string().min(1).max(120)).min(1).max(8),
});

async function requireUserId(): Promise<string | NextResponse> {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }
  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await hasPassedTwoFactor(user))) {
    return NextResponse.json(
      { error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" },
      { status: 403 },
    );
  }
  if (user) {
    try {
      user = await workspaceResourceUser(user, false);
    } catch {
      return NextResponse.json({ error: "Teamzugriff nicht erlaubt." }, { status: 403 });
    }
  }
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet.", code: "auth_required" }, { status: 401 });
  }
  return user.id;
}

async function findJobByRequestId(userId: string, requestId: string): Promise<GenerationJob | null> {
  const { data, error } = await createAdminClient()
    .from("generation_jobs")
    .select("id,user_id,amount,status,result,provider_task_id,created_at")
    .eq("user_id", userId)
    .eq("provider_task_id", requestId)
    .maybeSingle();
  if (error || !data) return null;
  return data as GenerationJob;
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
  }
  return "Generierung fehlgeschlagen.";
}

export async function POST(req: Request) {
  try {
    const rateError = await enforceRateLimitPersistent(req, {
      keyPrefix: "generation-status",
      limit: 300,
      windowMs: 60_000,
    });
    if (rateError) return rateError;
    // POST mit Seiteneffekten (Abrechnung, Mediathek): wie alle zustandsändernden Routen nur von der eigenen Origin.
    const originError = enforceSameOrigin(req);
    if (originError) return originError;

    const userId = await requireUserId();
    if (typeof userId !== "string") return userId;

    if (!getModelArkApiKey()) {
      return NextResponse.json({ error: "ARK_API_KEY fehlt." }, { status: 500 });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "requestIds ungültig." }, { status: 400 });
    }

    const client = createModelArkClient();
    const results: StatusResult[] = await Promise.all(
      parsed.data.requestIds.map(async (requestId): Promise<StatusResult> => {
        try {
          if (!isModelArkRequestId(requestId)) {
            return { requestId, error: "Kein ModelArk-Request." };
          }

          const job = await findJobByRequestId(userId, requestId);
          if (!job) return { requestId, error: "Auftrag nicht gefunden." };

          if (job.status === "completed" || job.status === "failed") {
            const result = (job.result ?? {}) as Record<string, unknown>;
            const videoUrl =
              typeof result.videoUrl === "string"
                ? result.videoUrl
                : typeof (result.video as { url?: string } | undefined)?.url === "string"
                  ? (result.video as { url: string }).url
                  : undefined;
            return {
              requestId,
              status: {
                status: job.status === "completed" ? "completed" : "failed",
                requestId,
                ...(videoUrl ? { video: { url: videoUrl } } : {}),
                ...(typeof result.error === "string" ? { error: result.error } : {}),
              },
            };
          }

          const status = await client.status(requestId);
          const plane = (job.result as { plane?: GenerationPlane } | null)?.plane;
          const tokenCost =
            typeof (job.result as { tokenCost?: number } | null)?.tokenCost === "number"
              ? (job.result as { tokenCost: number }).tokenCost
              : job.amount;

          if (status.status === "completed" && status.video?.url) {
            const aspectRatio =
              typeof plane?.settings.aspectRatio === "string" ? plane.settings.aspectRatio : "16:9";
            const prompt = plane?.prompt.text?.slice(0, 240) || "Video";
            // ponytail: Mediathek ist image-typed; videoUrl als imageUrl bis kind-Feld existiert
            const mediaItems = await persistGeneratedMediaItems({
              userId,
              jobId: job.id,
              images: [status.video.url],
              title: "Video",
              prompt,
              aspectRatio,
              resolution: "1K",
              outputFormat: "png",
            });

            await finishGeneration(job, tokenCost, {
              phase: "completed",
              provider: "modelark",
              plane,
              requestId,
              videoUrl: status.video.url,
              video: { url: status.video.url },
              mediaPersisted: mediaItems.length > 0,
            });

            return { requestId, status };
          }

          if (["failed", "nsfw", "canceled"].includes(status.status)) {
            await finishGeneration(job, 0, {
              phase: "failed",
              provider: "modelark",
              plane,
              requestId,
              error: errorMessage(status.error),
            });
          }

          return { requestId, status };
        } catch (caught) {
          return {
            requestId,
            error: caught instanceof Error ? caught.message : String(caught),
          };
        }
      }),
    );

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Statusabfrage fehlgeschlagen." }, { status: 500 });
  }
}
