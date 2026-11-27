import { buildFreeformImagePromptV3 } from "@/lib/inhalte-erstellen/image-prompt-v3";
import { workspaceResourceUser, workspaceErrorResponse } from "@/lib/dashboard/workspace";
import { reserveGeneration, finishGeneration, linkProviderTask } from "@/lib/billing/generationJobs";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyProviderError, classifyProviderResponse } from "@/lib/ai/providerErrors";
import { logProviderFailure, providerErrorResponse } from "@/lib/ai/providerRequest";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ensureBillingRow, getEffectiveBillingRow } from "@/lib/billing/store";
import { calculatePerVariantTokenCost } from "@/lib/billing/generationTokenCost";
import { requireActiveSubscription } from "@/lib/billing/access";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import {
  buildBrandProfilePromptContext,
  canUseCampaignWithTextProfile,
  getBrandProfileFromMetadata,
  isBrandProfileComplete,
} from "@/lib/dashboard/brandProfile";
import { mapAspectRatioForGptImage2, normalizeResolutionForGptImage2 } from "@/lib/kie/gptImage2TaskInput";
import {
  type ContentCreationPreset,
  MAX_REFERENCE_UPLOADS,
  validateImageTypePolicy,
} from "@/lib/image-types/policy";

type CreateTaskBody = {
  prompt: string;
  imageType?: ContentCreationPreset;
  aspectRatio?: string;
  resolution?: "1K" | "2K" | "4K";
  outputFormat?: "png" | "jpg";
  referenceImageUrls?: string[];
  strictLabelMode?: boolean;
};

const KIE_MODEL_TEXT_TO_IMAGE = (process.env.KIE_NANOBANANA_TEXT_MODEL?.trim() ||
  process.env.NANOBANANA_IMAGE_MODEL?.trim() ||
  process.env.KIE_IMAGE_MODEL?.trim()) as string;
const KIE_MODEL_IMAGE_TO_IMAGE = (process.env.KIE_NANOBANANA_IMAGE_MODEL?.trim() ||
  process.env.NANOBANANA_IMAGE_TO_IMAGE_MODEL?.trim() ||
  process.env.KIE_IMAGE_TO_IMAGE_MODEL?.trim()) as string;

function isUsableKieModelName(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^paste_/i.test(trimmed)) return false;
  if (/placeholder/i.test(trimmed)) return false;
  return true;
}

const createTaskSchema = z.object({
  prompt: z.string().trim().min(1).max(40000),
  imageType: z.enum(["hyperreal", "product_cutout", "product_studio", "campaign_social"]),
  aspectRatio: z
    .enum(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "auto"])
    .optional(),
  resolution: z.enum(["1K", "2K", "4K"]).optional(),
  outputFormat: z.enum(["png", "jpg"]).optional(),
  referenceImageUrls: z.array(z.string().max(12_000_000)).max(MAX_REFERENCE_UPLOADS).optional(),
  strictLabelMode: z.boolean().optional(),
});


function extractTaskId(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const direct =
    (record.taskId as string | undefined) ||
    (record.recordId as string | undefined) ||
    (record.id as string | undefined);
  if (direct && typeof direct === "string") return direct;
  for (const value of Object.values(record)) {
    const nested = extractTaskId(value);
    if (nested) return nested;
  }
  return null;
}

function extractUploadedFileUrl(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const directCandidates = [record.fileUrl, record.url, record.downloadUrl, record.path];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }
  for (const value of Object.values(record)) {
    const nested = extractUploadedFileUrl(value);
    if (nested) return nested;
  }
  return null;
}

async function uploadReferenceImagesToKie(apiKey: string, referenceImageUrls?: string[]) {
  if (!referenceImageUrls?.length) return undefined;
  const uploadBase = "https://kieai.redpandaai.co";
  const uploadedUrls: string[] = [];

  for (const [index, base64Data] of referenceImageUrls.entries()) {
    const uploadRes = await fetch(`${uploadBase}/api/file-base64-upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        base64Data,
        uploadPath: "evglab/reference-images",
        fileName: `reference-${Date.now()}-${index + 1}.png`,
      }),
    });

    const uploadData = (await uploadRes.json()) as Record<string, unknown>;
    if (!uploadRes.ok) {
      throw new Error(
        ((uploadData.msg as string) || (uploadData.error as string) || "Kie Upload fehlgeschlagen.").trim(),
      );
    }

    const code = uploadData.code as number | undefined;
    if (typeof code === "number" && code !== 200) {
      throw new Error(((uploadData.msg as string) || "Kie Upload wurde abgelehnt.").trim());
    }

    const fileUrl = extractUploadedFileUrl(uploadData);
    if (!fileUrl) {
      const topLevelKeys = Object.keys(uploadData).join(", ");
      throw new Error(`Kie Upload liefert keine verwendbare Datei-URL (keys: ${topLevelKeys || "none"}).`);
    }
    uploadedUrls.push(fileUrl);
  }

  return uploadedUrls;
}

export async function POST(req: Request) {
  try {
    const rateError = await enforceRateLimitPersistent(req, {
      keyPrefix: "kie-create-task",
      limit: 12,
      windowMs: 60_000,
    });
    if (rateError) return rateError;
    const originError = enforceSameOrigin(req);
    if (originError) return originError;

    let userId: string | null = null;
    let bodyBrandProfileContext = "";
    let resolvedBrandProfile: ReturnType<typeof getBrandProfileFromMetadata> | null = null;
    if (isSupabaseConfigured()) {
      const supabase = await createClient();
      let {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { try { user = await workspaceResourceUser(user, true); } catch (e) { return workspaceErrorResponse(e); } }
      if (!user) {
        return NextResponse.json({ error: "Nicht angemeldet.", code: "auth_required" }, { status: 401 });
      }
      userId = user.id;
      resolvedBrandProfile = getBrandProfileFromMetadata(user.user_metadata);
      if (!isBrandProfileComplete(resolvedBrandProfile)) {
        return NextResponse.json(
          {
            error:
              "Bitte lege zuerst dein Markenprofil an: Öffne im Dashboard den Bereich „Markenprofil“ und gib deine Website ein — oder wähle dort „Ohne Markenprofil“.",
            code: "brand_profile_incomplete",
          },
          { status: 400 },
        );
      }
      bodyBrandProfileContext = buildBrandProfilePromptContext(resolvedBrandProfile);
    }

    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "KIE_API_KEY fehlt." }, { status: 500 });
    }

    const baseUrl = process.env.KIE_API_BASE_URL || "https://api.kie.ai";
    const parseResult = createTaskSchema.safeParse(await req.json());
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      const detail = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Payload konnte nicht validiert werden.";
      return NextResponse.json({ error: `Ungültige Anfrage. ${detail}` }, { status: 400 });
    }
    const body = parseResult.data as CreateTaskBody;
    if (body.imageType === "campaign_social" && resolvedBrandProfile && !canUseCampaignWithTextProfile(resolvedBrandProfile)) {
      return NextResponse.json(
        {
          error:
            "Kampagnenbild mit Text ist nur mit aktivem Markenprofil möglich. Lege es im Dashboard unter „Markenprofil“ an — ein Website-Link genügt.",
          code: "campaign_requires_guided_brand_profile",
        },
        { status: 400 },
      );
    }
    const violation = validateImageTypePolicy({
      preset: body.imageType ?? "hyperreal",
      engine: "nano_banana",
      referenceImageCount: body.referenceImageUrls?.length ?? 0,
      campaignMode: false,
    });
    if (violation) {
      return NextResponse.json({ error: violation.message, code: violation.code }, { status: 400 });
    }

    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: "Prompt fehlt." }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: "Nicht angemeldet.", code: "auth_required" }, { status: 401 });
    }

    const subscriptionError = await requireActiveSubscription(userId);
    if (subscriptionError) return subscriptionError;

    await ensureBillingRow(userId);
    const currentState = await getEffectiveBillingRow(userId);

    const hasReferenceImages = Boolean(body.referenceImageUrls?.length);
    if (!isUsableKieModelName(KIE_MODEL_TEXT_TO_IMAGE) || !isUsableKieModelName(KIE_MODEL_IMAGE_TO_IMAGE)) {
      return NextResponse.json(
        {
          error:
            "NanoBanana Modelle sind in der Env nicht gueltig konfiguriert. Bitte KIE_NANOBANANA_TEXT_MODEL und KIE_NANOBANANA_IMAGE_MODEL mit echten, von Kie unterstuetzten Modellnamen setzen (keine PASTE_* Platzhalter).",
        },
        { status: 500 },
      );
    }
    const kieModel = hasReferenceImages ? KIE_MODEL_IMAGE_TO_IMAGE : KIE_MODEL_TEXT_TO_IMAGE;

    const mappedAspect = mapAspectRatioForGptImage2(body.aspectRatio);
    const effectiveResolution = normalizeResolutionForGptImage2(body.resolution, mappedAspect);
    const tokenCost = calculatePerVariantTokenCost({
      resolution: effectiveResolution,
      hasReferenceImage: hasReferenceImages,
      strictLabelMode: body.strictLabelMode,
    });
    const remainingTokens = Math.max((currentState?.monthly_tokens ?? 0) - (currentState?.used_tokens ?? 0), 0);
    if (remainingTokens < tokenCost) {
      return NextResponse.json(
        { error: `Nicht genug Tokens. Benötigt: ${tokenCost}, verfügbar: ${remainingTokens}.` },
        { status: 402 },
      );
    }

    const promptWithBrandContext = buildFreeformImagePromptV3({ scene: body.prompt.trim(), imageType: body.imageType ?? "hyperreal", aspectRatio: body.aspectRatio, referenceCount: body.referenceImageUrls?.length, brandContext: bodyBrandProfileContext, strictLabel: body.strictLabelMode });

    const uploadedReferenceUrls = hasReferenceImages
      ? await uploadReferenceImagesToKie(apiKey, body.referenceImageUrls)
      : undefined;
    if (hasReferenceImages && (!uploadedReferenceUrls || uploadedReferenceUrls.length === 0)) {
      return NextResponse.json({ error: "Referenzbilder konnten nicht zu Kie hochgeladen werden." }, { status: 502 });
    }

    const resolutionForKie = effectiveResolution;
    const nsfwFalse = { nsfw_checker: false as const };

    const kieInput = hasReferenceImages
      ? {
          prompt: promptWithBrandContext,
          input_urls: uploadedReferenceUrls,
          aspect_ratio: mappedAspect,
          resolution: resolutionForKie,
          ...nsfwFalse,
        }
      : {
          prompt: promptWithBrandContext,
          aspect_ratio: mappedAspect,
          resolution: resolutionForKie,
          ...nsfwFalse,
        };

    const job = await reserveGeneration(req, userId, tokenCost, body);
    if (job instanceof NextResponse) return job;
    const upstream = await fetch(`${baseUrl}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: kieModel,
        input: kieInput,
      }),
    });

    const data = (await upstream.json()) as Record<string, unknown>;
    if (!upstream.ok) {
      // Kein Token-Abzug: die Buchung erfolgt erst nach erfolgreicher Task-Anlage.
      const classified = classifyProviderResponse("kie", upstream, data);
      logProviderFailure(classified, { label: "kie-nano-banana-create-task", userId });
      await finishGeneration(job, 0, { error: classified.userMessage });
      return providerErrorResponse(classified);
    }

    const code = data.code as number | undefined;
    if (typeof code === "number" && code !== 200) {
      // Kie liefert Geschaeftsfehler mit HTTP 200 und eigenem `code` (z. B. 402
      // bei leerem Guthaben) — deshalb den Body-Code als Status klassifizieren.
      const upstreamMessage =
        (data.msg as string | undefined) ||
        (data.error as string | undefined) ||
        ((data.data as Record<string, unknown> | undefined)?.msg as string | undefined);
      const classified = classifyProviderError({ provider: "kie", status: code, message: upstreamMessage });
      logProviderFailure(classified, { label: "kie-nano-banana-create-task", userId });
      await finishGeneration(job, 0, { error: classified.userMessage });
      return providerErrorResponse(classified);
    }

    const taskId = extractTaskId(data);
    if (!taskId) {
      return NextResponse.json(
        {
          error: "Kein taskId von Kie erhalten.",
        },
        { status: 502 },
      );
    }

    await linkProviderTask(job, taskId);
    const consumeResult = { state: (await getEffectiveBillingRow(userId))! };
    const response = NextResponse.json({
      taskId,
      usedModel: kieModel,
      billing: {
        plan: consumeResult.state.plan,
        monthlyTokens: consumeResult.state.monthly_tokens,
        usedTokens: consumeResult.state.used_tokens,
        remainingTokens: Math.max(consumeResult.state.monthly_tokens - consumeResult.state.used_tokens, 0),
        consumed: tokenCost,
      },
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Kie createTask fehlgeschlagen." }, { status: 500 });
  }
}
