import { buildFreeformImagePromptV3 } from "@/lib/inhalte-erstellen/image-prompt-v3";
import { uploadGeneratedImageToStorage } from "@/lib/supabase/storage";
import { applyAiWatermark } from "@/lib/openai/aiWatermark";
import { workspaceResourceUser } from "@/lib/dashboard/workspace";
import { reserveGeneration, finishGeneration } from "@/lib/billing/generationJobs";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyProviderResponse } from "@/lib/ai/providerErrors";
import { logProviderFailure, providerErrorResponse } from "@/lib/ai/providerRequest";
import { ensureBillingRow, getEffectiveBillingRow } from "@/lib/billing/store";
import { calculatePerVariantTokenCost } from "@/lib/billing/generationTokenCost";
import { requireActiveSubscription } from "@/lib/billing/access";
import {
  buildBrandProfilePromptContext,
  canUseCampaignWithTextProfile,
  getBrandProfileFromMetadata,
  isBrandProfileComplete,
} from "@/lib/dashboard/brandProfile";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  buildCampaignCreativeFromReferencesPrompt,
  buildCampaignCreativePrompt,
} from "@/lib/kie/campaignImagePrompt";
import {
  type ContentCreationPreset,
  MAX_REFERENCE_UPLOADS,
  validateImageTypePolicy,
} from "@/lib/image-types/policy";
import { requireOpenAiImageApiKey } from "@/lib/openai/imageApiKey";

type GenerateImageBody = {
  prompt: string;
  imageType?: ContentCreationPreset;
  aspectRatio?: string;
  resolution?: "1K" | "2K" | "4K";
  outputFormat?: "png" | "jpg";
  referenceImageUrls?: string[];
  strictLabelMode?: boolean;
  plattform?: string;
  textImLabel?: string;
  campaignMode?: boolean;
  subline?: string;
  cta?: string;
};

const schema = z.object({
  prompt: z.string().trim().min(1).max(40000),
  imageType: z.enum(["hyperreal", "product_cutout", "product_studio", "campaign_social"]),
  aspectRatio: z
    .enum(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "auto"])
    .optional(),
  resolution: z.enum(["1K", "2K", "4K"]).optional(),
  outputFormat: z.enum(["png", "jpg"]).optional(),
  referenceImageUrls: z.array(z.string().max(12_000_000)).max(MAX_REFERENCE_UPLOADS).optional(),
  strictLabelMode: z.boolean().optional(),
  plattform: z.string().optional(),
  textImLabel: z.string().optional(),
  campaignMode: z.boolean().optional(),
  subline: z.string().trim().max(800).optional(),
  cta: z.string().trim().max(400).optional(),
});


function mapAspectRatioToOpenAiSize(aspectRatio: string | undefined): "1024x1024" | "1024x1536" | "1536x1024" {
  if (!aspectRatio) return "1024x1024";
  if (["9:16", "4:5", "3:4", "2:3"].includes(aspectRatio)) return "1024x1536";
  if (["16:9", "21:9", "4:3", "3:2", "5:4"].includes(aspectRatio)) return "1536x1024";
  return "1024x1024";
}

function toOpenAiOutputFormat(format: "png" | "jpg" | undefined): "png" | "jpeg" {
  return format === "jpg" ? "jpeg" : "png";
}

function parseOpenAiBase64(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const data = record.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (!first || typeof first !== "object") return null;
  const b64 = (first as Record<string, unknown>).b64_json;
  return typeof b64 === "string" && b64.length > 0 ? b64 : null;
}

function base64DataUrlToFile(dataUrl: string, fileName: string): File {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Referenzbild ist kein gueltiges Base64-Data-URL.");
  }
  const mimeType = match[1] || "image/png";
  const buffer = Buffer.from(match[2] || "", "base64");
  return new File([buffer], fileName, { type: mimeType });
}


export async function POST(req: Request) {
  try {
    const rateError = await enforceRateLimitPersistent(req, {
      keyPrefix: "openai-image2-generate",
      limit: 12,
      windowMs: 60_000,
    });
    if (rateError) return rateError;
    const originError = enforceSameOrigin(req);
    if (originError) return originError;

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const detail = firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Payload validation failed.";
      return NextResponse.json({ error: `Ungueltige Anfrage. ${detail}` }, { status: 400 });
    }
    const body = parsed.data as GenerateImageBody;

    const headline = (body.textImLabel ?? "").trim();
    const violation = validateImageTypePolicy({
      preset: body.imageType ?? "hyperreal",
      engine: "chatgpt_image2",
      referenceImageCount: body.referenceImageUrls?.length ?? 0,
      campaignMode: body.campaignMode,
    });
    if (violation) {
      return NextResponse.json({ error: violation.message, code: violation.code }, { status: 400 });
    }

    let openAiKey: string;
    try {
      openAiKey = requireOpenAiImageApiKey();
    } catch {
      return NextResponse.json({ error: "OPENAI_IMAGE_API_KEY fehlt." }, { status: 500 });
    }

    let userId: string | null = null;
    let brandContext = "";
    if (isSupabaseConfigured()) {
      const supabase = await createClient();
      let {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { try { user = await workspaceResourceUser(user, true); } catch { return NextResponse.json({error:"Teamzugriff nicht erlaubt."},{status:403}); } }
      if (!user) {
        return NextResponse.json({ error: "Nicht angemeldet.", code: "auth_required" }, { status: 401 });
      }
      userId = user.id;
      const profile = getBrandProfileFromMetadata(user.user_metadata);
      if (!isBrandProfileComplete(profile)) {
        return NextResponse.json(
          {
            error:
              "Bitte lege zuerst dein Markenprofil an: Öffne im Dashboard den Bereich „Markenprofil“ und gib deine Website ein — oder wähle dort „Ohne Markenprofil“.",
            code: "brand_profile_incomplete",
          },
          { status: 400 },
        );
      }
      if ((body.imageType === "campaign_social" || body.campaignMode) && !canUseCampaignWithTextProfile(profile)) {
        return NextResponse.json(
          {
            error:
              "Kampagnenbild mit Text ist nur mit aktivem Markenprofil möglich. Lege es im Dashboard unter „Markenprofil“ an — ein Website-Link genügt.",
            code: "campaign_requires_guided_brand_profile",
          },
          { status: 400 },
        );
      }
      brandContext = buildBrandProfilePromptContext(profile);
    }

    if (!userId) {
      return NextResponse.json({ error: "Nicht angemeldet.", code: "auth_required" }, { status: 401 });
    }

    const subscriptionError = await requireActiveSubscription(userId);
    if (subscriptionError) return subscriptionError;

    await ensureBillingRow(userId);
    const currentState = await getEffectiveBillingRow(userId);

    const hasReferenceImage = Boolean(body.referenceImageUrls?.length);
    const usedModelLabel = hasReferenceImage ? "gpt-image-2-image-to-image" : "gpt-image-2-text-to-image";
    const tokenCost = calculatePerVariantTokenCost({
      resolution: body.resolution === "4K" ? "4K" : body.resolution === "2K" ? "2K" : "1K",
      hasReferenceImage,
      strictLabelMode: body.strictLabelMode,
    });
    const remainingTokens = Math.max((currentState?.monthly_tokens ?? 0) - (currentState?.used_tokens ?? 0), 0);
    if (remainingTokens < tokenCost) {
      return NextResponse.json(
        { error: `Nicht genug Tokens. Benoetigt: ${tokenCost}, verfuegbar: ${remainingTokens}.` },
        { status: 402 },
      );
    }

    const model =
      process.env.KIE_CHATGPT_IMAGE2_TEXT_MODEL?.trim() ||
      process.env.OPENAI_IMAGE_MODEL?.trim() ||
      "gpt-image-2.5-sunburst";
    const scenePrompt = body.prompt.trim();
    const subTrim = (body.subline ?? "").trim();
    const ctaTrim = (body.cta ?? "").trim();
    const imageLedCampaign =
      body.campaignMode === true &&
      hasReferenceImage &&
      !headline &&
      !subTrim &&
      !ctaTrim;
    const creativeCore =
      body.campaignMode === true
        ? imageLedCampaign
          ? buildCampaignCreativeFromReferencesPrompt(scenePrompt)
          : buildCampaignCreativePrompt(scenePrompt, headline, subTrim, ctaTrim)
        : scenePrompt;
    const prompt = buildFreeformImagePromptV3({ scene: creativeCore, imageType: body.imageType ?? "hyperreal", aspectRatio: body.aspectRatio, referenceCount: body.referenceImageUrls?.length, brandContext, strictLabel: body.strictLabelMode });
    const job = await reserveGeneration(req, userId, tokenCost, body);
    if (job instanceof NextResponse) return job;
    const openAiRes = hasReferenceImage
      ? await (async () => {
          const firstReference = body.referenceImageUrls?.[0];
          if (!firstReference) {
            throw new Error("Referenzbild fehlt.");
          }
          const imageFile = base64DataUrlToFile(firstReference, "reference.png");
          const formData = new FormData();
          formData.append("model", model);
          formData.append("image", imageFile);
          formData.append("prompt", prompt);
          formData.append("size", mapAspectRatioToOpenAiSize(body.aspectRatio));
          formData.append("output_format", toOpenAiOutputFormat(body.outputFormat));
          formData.append("response_format", "b64_json");
          return fetch("https://api.openai.com/v1/images/edits", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openAiKey}`,
            },
            body: formData,
          });
        })()
      : await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openAiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt,
            size: mapAspectRatioToOpenAiSize(body.aspectRatio),
            output_format: toOpenAiOutputFormat(body.outputFormat),
            response_format: "b64_json",
          }),
        });
    const openAiPayload = (await openAiRes.json()) as Record<string, unknown>;
    if (!openAiRes.ok) {
      const classified = classifyProviderResponse("openai", openAiRes, openAiPayload);
      logProviderFailure(classified, { label: "openai-image2-generate", userId });
      await finishGeneration(job, 0, { error: classified.userMessage });
      return providerErrorResponse(classified);
    }
    const base64Image = parseOpenAiBase64(openAiPayload);
    if (!base64Image) {
      await finishGeneration(job, 0, { error: "OpenAI lieferte kein Bild." });
      return NextResponse.json({ error: "OpenAI lieferte kein Bild." }, { status: 502 });
    }

    const outputFormat = body.outputFormat ?? "png";
    const imageUrl = await uploadGeneratedImageToStorage({userId,buffer:await applyAiWatermark(Buffer.from(base64Image,"base64"),outputFormat),outputFormat});

    const consumeResult = await finishGeneration(job, tokenCost, { imageUrl, usedModel: usedModelLabel });

    return NextResponse.json({
      generationId: `openai-${randomUUID()}`,
      imageUrl,
      usedModel: usedModelLabel,
      billing: {
        plan: consumeResult.state.plan,
        monthlyTokens: consumeResult.state.monthly_tokens,
        usedTokens: consumeResult.state.used_tokens,
        remainingTokens: Math.max(consumeResult.state.monthly_tokens - consumeResult.state.used_tokens, 0),
        consumed: tokenCost,
      },
    });
  } catch {
    return NextResponse.json({ error: "ChatGPT Image 2 Generierung fehlgeschlagen." }, { status: 500 });
  }
}
