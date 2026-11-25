import { finishGeneration, type GenerationJob } from "@/lib/billing/generationJobs";
import { persistGeneratedMediaItems } from "@/lib/dashboard/persistGeneratedMedia";
import { createModelArkClient, isModelArkRequestId } from "@/lib/generation";
import type { GenerationPlane } from "@/lib/generation/catalog/types";
import { EMPTY_SUCCESS_GRACE_MS, STALE_JOB_ERROR, isJobOlderThan, isStaleProviderJob } from "@/lib/generation/staleJob";
import type { GenerationStatus } from "@/lib/generation/types";

export async function reconcileModelArkJob(
  job: GenerationJob & { provider_task_id: string },
  now = Date.now(),
): Promise<GenerationStatus | null> {
  if (!isModelArkRequestId(job.provider_task_id)) {
    throw new Error("Kein ModelArk-Request.");
  }
  const plane = (job.result as { plane?: GenerationPlane } | null)?.plane;
  const stale = isStaleProviderJob(job, now);
  const releaseReservation = (error: string) =>
    finishGeneration(job, 0, { phase: "failed", provider: "modelark", plane, requestId: job.provider_task_id, error });
  let status: GenerationStatus;
  try {
    status = await createModelArkClient().status(job.provider_task_id);
  } catch (error) {
    // Nach 24 h (abgelaufener Task, 404, Netzfehler) die Reservierung freigeben,
    // statt die Reconcile-Schlange dauerhaft zu blockieren.
    if (stale) {
      await releaseReservation(STALE_JOB_ERROR);
      return null;
    }
    throw error;
  }
  const tokenCost =
    typeof (job.result as { tokenCost?: number } | null)?.tokenCost === "number"
      ? (job.result as { tokenCost: number }).tokenCost
      : job.amount;

  if (status.status === "completed" && status.video?.url) {
    const mediaItems = await persistGeneratedMediaItems({
      userId: job.user_id,
      jobId: job.id,
      images: [status.video.url],
      title: "Video",
      prompt: plane?.prompt.text?.slice(0, 240) || "Video",
      aspectRatio:
        typeof plane?.settings.aspectRatio === "string" ? plane.settings.aspectRatio : "16:9",
      resolution: "1K",
      outputFormat: "png",
    });
    await finishGeneration(job, tokenCost, {
      phase: "completed",
      provider: "modelark",
      plane,
      requestId: job.provider_task_id,
      videoUrl: status.video.url,
      video: { url: status.video.url },
      mediaPersisted: mediaItems.length > 0,
    });
    return status;
  }

  if (["failed", "nsfw", "canceled"].includes(status.status)) {
    await finishGeneration(job, 0, {
      phase: "failed",
      provider: "modelark",
      plane,
      requestId: job.provider_task_id,
      error: typeof status.error === "string" ? status.error : "Generierung fehlgeschlagen.",
    });
    return status;
  }

  if (status.status === "completed" && isJobOlderThan(job, EMPTY_SUCCESS_GRACE_MS, now)) {
    // Fertig, aber ohne Video-URL: nichts lieferbar, nichts berechnen.
    await releaseReservation("Anbieter lieferte kein Ergebnis.");
    return status;
  }

  if (stale) await releaseReservation(STALE_JOB_ERROR);
  return status;
}
