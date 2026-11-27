import { workspaceResourceUser, workspaceErrorResponse } from "@/lib/dashboard/workspace";
import { finishGeneration, type GenerationJob } from "@/lib/billing/generationJobs";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseUpstreamProgress } from "@/lib/kie/generationProgress";
import { extractTaskMedia } from "@/lib/kie/taskResponse";
import { enforceRateLimitPersistent, sanitizeTaskId } from "@/lib/security/requestGuards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const KIE_STATUS_TIMEOUT_MS = 15_000;

function findFirstUrl(input: unknown): string | null {
  if (typeof input === "string" && /^https?:\/\//i.test(input)) return input;
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findFirstUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (input && typeof input === "object") {
    for (const value of Object.values(input)) {
      const found = findFirstUrl(value);
      if (found) return found;
    }
  }
  return null;
}

export async function GET(req: Request) {
  try {
    // Polling-Endpoint: pro User max 4 parallele Varianten × ein Poll alle ~2.5s
    // = bis zu ~96 Requests/Minute im Worst-Case. Großzügig dimensionieren, damit
    // länger laufende Kie-Tasks nicht ins Rate-Limit laufen.
    const rateError = await enforceRateLimitPersistent(req, {
      keyPrefix: "kie-task-status",
      limit: 300,
      windowMs: 60_000,
    });
    if (rateError) return rateError;

    let userId: string | null = null;
    if (isSupabaseConfigured()) {
      const supabase = await createClient();
      let {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { try { user = await workspaceResourceUser(user, false); } catch (e) { return workspaceErrorResponse(e); } }
      if (!user) {
        return NextResponse.json({ error: "Nicht angemeldet.", code: "auth_required" }, { status: 401 });
      }
      userId = user.id;
    }

    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "KIE_API_KEY fehlt." }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const taskIdRaw = searchParams.get("taskId");
    const taskIdParsed = z.string().trim().min(1).max(120).safeParse(taskIdRaw);
    if (!taskIdParsed.success) {
      return NextResponse.json({ error: "taskId fehlt." }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(taskIdParsed.data)) {
      return NextResponse.json({ error: "taskId ist ungültig." }, { status: 400 });
    }
    const taskId = sanitizeTaskId(taskIdParsed.data);
    if (taskId !== taskIdParsed.data) {
      return NextResponse.json({ error: "taskId ist ungültig." }, { status: 400 });
    }

    if (!userId) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    const lookup = await createAdminClient().from("generation_jobs").select("*").eq("user_id", userId).eq("provider_task_id", taskId).maybeSingle();
    if (lookup.error) throw new Error(lookup.error.message);
    if (!lookup.data) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
    const job = lookup.data as GenerationJob;
    const baseUrl = process.env.KIE_API_BASE_URL || "https://api.kie.ai";
    const timeoutController = new AbortController();
    const timeoutId = globalThis.setTimeout(() => timeoutController.abort(), KIE_STATUS_TIMEOUT_MS);
    let upstream: Response;
    try {
      upstream = await fetch(`${baseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
        signal: timeoutController.signal,
      });
    } finally {
      globalThis.clearTimeout(timeoutId);
    }

    const data = (await upstream.json()) as Record<string, unknown>;
    if (!upstream.ok) {
      const retryAfter = upstream.headers.get("Retry-After");
      const statusText =
        typeof data?.message === "string"
          ? data.message
          : typeof data?.error === "string"
            ? data.error
            : "Kie task-status fehlgeschlagen.";
      return NextResponse.json(
        { error: statusText },
        {
          status: upstream.status,
          headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
        },
      );
    }

    const payload = (data.data as Record<string, unknown> | undefined) ?? {};
    const rawState =
      (data.state as string | undefined) ||
      (data.status as string | undefined) ||
      (payload.state as string | undefined) ||
      (payload.status as string | undefined) ||
      "unknown";
    const state = rawState.toLowerCase();
    const upstreamProgress = parseUpstreamProgress(payload, state);
    const media = extractTaskMedia(payload, data);
    const imageUrl = media.imageUrl ?? findFirstUrl(data);
    const videoUrl = media.videoUrl;
    const mediaUrl = media.mediaUrl ?? imageUrl ?? videoUrl;

    const result = { state, imageUrl, videoUrl, mediaUrl, mediaKind: media.mediaKind, progress: upstreamProgress ?? (mediaUrl ? 100 : null) };
    if (["failed", "error", "cancelled", "canceled"].includes(state)) await finishGeneration(job, 0, result);
    else if (["success", "succeeded", "completed", "done"].includes(state) && mediaUrl) await finishGeneration(job, job.amount, result);

    return NextResponse.json({
      state,
      imageUrl,
      videoUrl,
      mediaUrl,
      mediaKind: media.mediaKind,
      progress: upstreamProgress ?? (mediaUrl ? 100 : null),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Kie Statusabfrage dauert zu lange. Bitte erneut versuchen." },
        { status: 504 },
      );
    }
    return NextResponse.json({ error: "Kie task-status fehlgeschlagen." }, { status: 500 });
  }
}
