import { finishGeneration, type GenerationJob } from "@/lib/billing/generationJobs";
import { EMPTY_SUCCESS_GRACE_MS, isJobOlderThan, isStaleProviderJob, staleJobCharge, staleJobResult } from "@/lib/generation/staleJob";
import { extractTaskMedia } from "./taskResponse";
import { parseUpstreamProgress } from "./generationProgress";

const FAILED_STATES = ["failed", "error", "cancelled", "canceled"];
const SUCCESS_STATES = ["success", "succeeded", "completed", "done"];

async function settleStaleJob(job: GenerationJob, extra: Record<string, unknown>) {
  const charged = staleJobCharge(job);
  const result = staleJobResult(job, extra, charged);
  await finishGeneration(job, charged, result);
  return result;
}

export async function reconcileKieJob(job: GenerationJob & { provider_task_id: string }, now = Date.now()) {
  const apiKey=process.env.KIE_API_KEY;
  if(!apiKey)throw new Error("Kie ist nicht konfiguriert.");
  const stale = isStaleProviderJob(job, now);
  let upstream: Response;
  try {
    upstream=await fetch(`${process.env.KIE_API_BASE_URL||"https://api.kie.ai"}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(job.provider_task_id)}`,{
      headers:{Authorization:`Bearer ${apiKey}`},cache:"no-store",signal:AbortSignal.timeout(15000),
    });
  } catch (error) {
    // Nach 24 h nicht mehr auf den Anbieter warten (abgelaufene Tasks, Netzfehler).
    if (stale) return settleStaleJob(job, { state: "unreachable" });
    throw error;
  }
  if(!upstream.ok) {
    if (stale) return settleStaleJob(job, { state: `http_${upstream.status}` });
    throw new Error("Providerstatus derzeit nicht verfügbar.");
  }
  const data=await upstream.json() as Record<string,unknown>;
  const payload=(data.data??{}) as Record<string,unknown>;
  const state=String(data.state||data.status||payload.state||payload.status||"unknown").toLowerCase();
  const media=extractTaskMedia(payload,data);
  const result={state,...media,progress:parseUpstreamProgress(payload,state)??(media.mediaUrl?100:null)};
  if(FAILED_STATES.includes(state))await finishGeneration(job,0,result);
  else if(SUCCESS_STATES.includes(state)) {
    // Erfolg ohne Medien: nach einer Karenzzeit abschließen (nur bereits gelieferte
    // Studio-Varianten werden berechnet), statt den Job bei jedem Lauf erneut zu prüfen.
    const hasMedia = Boolean(media.mediaUrl||media.imageUrl||media.videoUrl);
    if (hasMedia) await finishGeneration(job, job.amount, result);
    else if (isJobOlderThan(job, EMPTY_SUCCESS_GRACE_MS, now)) {
      const charged = staleJobCharge(job);
      await finishGeneration(job, charged, staleJobResult(job, { ...result, error: charged ? undefined : "Anbieter lieferte kein Ergebnis." }, charged));
    }
  }
  else if (stale) return settleStaleJob(job, result);
  return result;
}
