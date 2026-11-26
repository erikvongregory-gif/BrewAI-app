import { NextResponse } from "next/server";
import { z } from "zod";
import { workspaceResourceUser, workspaceErrorResponse } from "@/lib/dashboard/workspace";
import {
  reserveGeneration,
  finishGeneration,
  linkProviderTask,
  saveGenerationProgress,
} from "@/lib/billing/generationJobs";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { classifyProviderError } from "@/lib/ai/providerErrors";
import { logProviderFailure, providerErrorResponse } from "@/lib/ai/providerRequest";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ensureBillingRow, getEffectiveBillingRow } from "@/lib/billing/store";
import { requireActiveSubscription } from "@/lib/billing/access";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { calculateSeedanceVideoTokenCost } from "@/lib/billing/generationTokenCost";
import { getModel } from "@/lib/generation/catalog";
import { normalizePlane } from "@/lib/generation/plane";
import { createModelArkClient, getModelArkApiKey, ModelArkError } from "@/lib/generation";
import type { GenerationPlane } from "@/lib/generation/catalog/types";

const mediaItemSchema = z.object({
  id: z.string().min(1).max(120),
  url: z.string().url().max(2000),
  role: z.enum(["start", "end", "reference", "video", "audio"]),
});

const planeSchema = z.object({
  model: z.string().min(1).max(80),
  prompt: z.object({ text: z.string().trim().min(3).max(20_000) }),
  media: z
    .object({
      start: z.array(mediaItemSchema).max(40).optional(),
      end: z.array(mediaItemSchema).max(40).optional(),
      reference: z.array(mediaItemSchema).max(40).optional(),
      video: z.array(mediaItemSchema).max(40).optional(),
      audio: z.array(mediaItemSchema).max(40).optional(),
    })
    .optional()
    .default({}),
  settings: z.record(z.string(), z.unknown()).optional().default({}),
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
      user = await workspaceResourceUser(user, true);
    } catch (e) {
      return workspaceErrorResponse(e);
    }
  }
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet.", code: "auth_required" }, { status: 401 });
  }
  return user.id;
}

export async function POST(req: Request) {
  try {
    const rateError = await enforceRateLimitPersistent(req, {
      keyPrefix: "generation-submit",
      limit: 6,
      windowMs: 60_000,
    });
    if (rateError) return rateError;
    const originError = enforceSameOrigin(req);
    if (originError) return originError;

    const userId = await requireUserId();
    if (typeof userId !== "string") return userId;

    if (!getModelArkApiKey()) {
      return NextResponse.json({ error: "ARK_API_KEY fehlt." }, { status: 500 });
    }

    const parsed = planeSchema.safeParse(await req.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const detail = first ? `${first.path.join(".")}: ${first.message}` : "Payload ungültig.";
      return NextResponse.json({ error: `Ungültige Anfrage. ${detail}` }, { status: 400 });
    }

    let model;
    try {
      model = getModel(parsed.data.model);
    } catch {
      return NextResponse.json({ error: "Unbekanntes Modell." }, { status: 400 });
    }

    if (model.provider !== "modelark") {
      return NextResponse.json(
        { error: "Dieses Modell läuft nicht über ModelArk." },
        { status: 400 },
      );
    }

    let plane: GenerationPlane;
    try {
      plane = normalizePlane(model, {
        model: parsed.data.model,
        prompt: parsed.data.prompt,
        media: parsed.data.media as GenerationPlane["media"],
        settings: parsed.data.settings,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Einstellungen ungültig." },
        { status: 400 },
      );
    }

    const subscriptionError = await requireActiveSubscription(userId);
    if (subscriptionError) return subscriptionError;

    await ensureBillingRow(userId);
    const currentState = await getEffectiveBillingRow(userId);

    const resolutionRaw = String(plane.settings.resolution ?? "720p");
    const resolution = (
      resolutionRaw === "4k" || resolutionRaw === "1080p"
        ? "1080p"
        : resolutionRaw === "480p"
          ? "480p"
          : "720p"
    ) as "480p" | "720p" | "1080p";
    const duration =
      typeof plane.settings.duration === "number" ? plane.settings.duration : 5;
    const generateAudio = Boolean(plane.settings.generateAudio ?? true);
    const tokenCost = calculateSeedanceVideoTokenCost({
      resolution,
      duration: Math.min(15, duration),
      generateAudio,
      modelId: plane.model,
    });
    const remainingTokens = Math.max(
      (currentState?.monthly_tokens ?? 0) - (currentState?.used_tokens ?? 0),
      0,
    );
    if (remainingTokens < tokenCost) {
      return NextResponse.json(
        { error: `Nicht genug Tokens. Benötigt: ${tokenCost}, verfügbar: ${remainingTokens}.` },
        { status: 402 },
      );
    }

    const job = await reserveGeneration(req, userId, tokenCost, plane);
    if (job instanceof NextResponse) return job;

    try {
      const queued = await createModelArkClient().submit(plane);
      await linkProviderTask(job, queued.requestId);
      await saveGenerationProgress(job, {
        phase: "queued",
        provider: "modelark",
        plane,
        requestId: queued.requestId,
        tokenCost,
      });

      return NextResponse.json({
        jobId: job.id,
        requestId: queued.requestId,
        model: plane.model,
        billing: {
          plan: currentState?.plan ?? null,
          monthlyTokens: currentState?.monthly_tokens ?? 0,
          usedTokens: currentState?.used_tokens ?? 0,
          remainingTokens,
          reserved: tokenCost,
        },
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      const status = caught instanceof ModelArkError ? caught.status : 502;
      const classified = classifyProviderError({
        provider: "kie",
        status,
        message,
      });
      logProviderFailure(classified, { label: "modelark-submit", userId });
      await finishGeneration(job, 0, {
        error: classified.userMessage,
        phase: "failed",
        plane,
      });
      return providerErrorResponse(classified);
    }
  } catch {
    return NextResponse.json({ error: "Generierung konnte nicht gestartet werden." }, { status: 500 });
  }
}
