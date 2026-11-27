import { hydratePrivateAssets } from "@/lib/supabase/privateAssets";
import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isOwnerUserId } from "@/lib/auth/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildOwnerBillingRow, type BillingRow } from "./store";

export type GenerationJob = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  result: Record<string, unknown> | null;
  owner?: boolean;
  provider_task_id?: string | null;
  created_at?: string;
};

export function generationRequestHash(req: Request, payload: unknown): string {
  return createHash("sha256")
    .update(new URL(req.url).pathname + JSON.stringify(payload))
    .digest("hex");
}

/**
 * Vor der Guthabenprüfung: bereits laufenden/fertigen Auftrag mit demselben
 * Idempotency-Key zurückgeben — sonst scheitert der Retry mit „Nicht genug Tokens“.
 * Abgleich von Route + Payload-Hash wie bei generation_reserve.
 */
export async function resumeGenerationIfPresent(
  req: Request,
  userId: string,
  payload: unknown,
): Promise<NextResponse | null> {
  const key = req.headers.get("idempotency-key")?.trim();
  if (!key || !/^[\w:-]{1,160}$/.test(key)) return null;

  const hash = generationRequestHash(req, payload);
  const { data, error } = await createAdminClient()
    .from("generation_jobs")
    .select("id,status,result,request_hash")
    .eq("user_id", userId)
    .eq("request_key", key)
    .maybeSingle();
  if (error || !data) return null;

  if (data.request_hash && data.request_hash !== hash) {
    return NextResponse.json(
      {
        error: "Auftragsschlüssel wurde mit anderem Inhalt oder einer anderen Route wiederverwendet.",
        code: "idempotency_key_mismatch",
      },
      { status: 409 },
    );
  }

  if (["completed", "failed"].includes(data.status) && data.result) {
    return NextResponse.json(await hydratePrivateAssets(data.result, userId));
  }
  if (data.status === "reserved") {
    return NextResponse.json(
      {
        error: "Dieser Auftrag wird bereits verarbeitet.",
        code: "job_in_progress",
        jobId: data.id,
        status: data.status,
      },
      { status: 409 },
    );
  }
  return null;
}

/**
 * Übersetzt Fehler von generation_reserve/billing_debit_lots in Nutzertexte.
 * „Nicht genug gekaufte Tokens.“ kommt erst mit dem Vorschlag in docs/audit/migrations-proposed.sql
 * (Abo-Credits bei inaktivem Abo gesperrt, gekaufte nutzbar); heute wirft die DB „Kein aktives Abo.“.
 */
export function reservationErrorResponse(rawMessage: string | null | undefined): NextResponse {
  const message = rawMessage?.toLowerCase() ?? "";
  if (message.includes("idempotency") || message.includes("mismatch")) {
    return NextResponse.json(
      {
        error: "Auftragsschlüssel wurde mit anderem Inhalt oder einer anderen Route wiederverwendet.",
        code: "idempotency_key_mismatch",
      },
      { status: 409 },
    );
  }
  if (message.includes("nicht genug gekaufte tokens")) {
    return NextResponse.json(
      {
        error:
          "Dein Abo ist nicht aktiv, deshalb kannst du nur gekaufte Credits nutzen. Die reichen für diesen Auftrag nicht. Verlängere dein Abo oder kauf Credits nach.",
        code: "subscription_inactive",
      },
      { status: 402 },
    );
  }
  if (message.includes("kein aktives abo")) {
    return NextResponse.json(
      { error: "Dein Abo ist nicht aktiv. Verlängere dein Abo, um weiter Inhalte zu erstellen.", code: "subscription_inactive" },
      { status: 402 },
    );
  }
  return NextResponse.json(
    { error: "Auftrag konnte nicht reserviert werden. Bitte Guthaben prüfen.", code: "reservation_failed" },
    { status: 409 },
  );
}

export async function reserveGeneration(
  req: Request,
  userId: string,
  amount: number,
  payload: unknown,
): Promise<GenerationJob | NextResponse> {
  const owner = await isOwnerUserId(userId);
  const key = req.headers.get("idempotency-key") ?? randomUUID();
  if (!/^[\w:-]{1,160}$/.test(key)) {
    return NextResponse.json({ error: "Ungültiger Auftragsschlüssel." }, { status: 400 });
  }
  const { data, error } = await createAdminClient().rpc("generation_reserve", {
    p_id: randomUUID(),
    p_user_id: userId,
    p_key: key,
    p_hash: generationRequestHash(req, payload),
    p_amount: owner ? 0 : amount,
  });
  if (error) return reservationErrorResponse(error.message);
  if (!data?.fresh) {
    if (["completed", "failed"].includes(data?.job?.status) && data?.job?.result) {
      return NextResponse.json(await hydratePrivateAssets(data.job.result, userId));
    }
    return NextResponse.json(
      {
        error: "Dieser Auftrag wird bereits verarbeitet.",
        code: "job_in_progress",
        jobId: data?.job?.id,
        status: data?.job?.status ?? "reserved",
      },
      { status: 409 },
    );
  }
  return { ...data.job, owner } as GenerationJob;
}

export async function getGenerationJobForUser(
  userId: string,
  jobId: string,
): Promise<GenerationJob | null> {
  const { data, error } = await createAdminClient()
    .from("generation_jobs")
    .select("id,user_id,amount,status,result,provider_task_id,created_at")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as GenerationJob;
}

/** Baut Billing aus dem von generation_finish atomar zurückgegebenen Kontostand. */
export function buildGenerationBillingSnapshot(input: {
  state: BillingRow | null | undefined;
  charged: number;
  perVariant: number;
  owner?: boolean;
}) {
  const state = input.state;
  return {
    freeTrial: false,
    consumed: input.owner ? 0 : input.charged,
    perVariant: input.perVariant,
    plan: state?.plan ?? null,
    monthlyTokens: state?.monthly_tokens ?? 0,
    usedTokens: state?.used_tokens ?? 0,
    remainingTokens: Math.max((state?.monthly_tokens ?? 0) - (state?.used_tokens ?? 0), 0),
  };
}

export async function finishGeneration(
  job: GenerationJob,
  charged: number,
  result: Record<string, unknown>,
): Promise<{ ok: true; state: BillingRow }> {
  const { data, error } = await createAdminClient().rpc("generation_finish", {
    p_id: job.id,
    p_user_id: job.user_id,
    p_charged: job.owner ? 0 : charged,
    p_result: result,
  });
  if (error || !data?.[0]) throw new Error("Auftragsabschluss ausstehend. Bitte den Auftrag nicht erneut starten.");
  return { ok: true, state: job.owner ? buildOwnerBillingRow(job.user_id) : (data[0] as BillingRow) };
}

export async function linkProviderTask(job: GenerationJob, taskId: string) {
  const { error } = await createAdminClient()
    .from("generation_jobs")
    .update({ provider_task_id: taskId })
    .eq("id", job.id)
    .eq("user_id", job.user_id)
    .eq("status", "reserved");
  if (error) throw new Error("Task-Zuordnung ausstehend; bitte Support kontaktieren.");
}

export async function saveGenerationProgress(
  job: GenerationJob,
  patch: Record<string, unknown>,
) {
  const current = await getGenerationJobForUser(job.user_id, job.id);
  const previous = current?.result && typeof current.result === "object" ? current.result : {};
  const { error } = await createAdminClient()
    .from("generation_jobs")
    .update({ result: { ...previous, ...patch } })
    .eq("id", job.id)
    .eq("user_id", job.user_id)
    .eq("status", "reserved");
  if (error) throw new Error("Zwischenergebnis konnte nicht gespeichert werden.");
}