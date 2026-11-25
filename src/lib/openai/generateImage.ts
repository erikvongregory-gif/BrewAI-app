import sharp from "sharp";
import { classifyProviderResponse } from "@/lib/ai/providerErrors";
import { ProviderError, withProviderRetry } from "@/lib/ai/providerRequest";
import {
  aspectRatioToCropRect,
  mapAspectRatioToOpenAiSize,
  type OpenAiImageSize,
} from "@/lib/openai/imageAspectRatio";

export type { OpenAiImageSize } from "@/lib/openai/imageAspectRatio";
export { aspectRatioToOutputDimensions, mapAspectRatioToOpenAiSize } from "@/lib/openai/imageAspectRatio";
export type OpenAiImageQuality = "low" | "medium" | "high" | "xhigh" | "max" | "auto";

export type OpenAiReferenceImage = { base64: string; mime: string };

/** Center-Crop auf das gewählte UI-Format (OpenAI liefert nur 1:1 / 2:3 / 3:2). */
export async function cropImageBufferToAspectRatio(
  buffer: Buffer,
  aspectRatio: string,
  outputFormat: "png" | "jpg" = "png",
  resolution: "1K" | "2K" | "4K" = "1K",
): Promise<Buffer> {
  const crop = aspectRatioToCropRect(aspectRatio, resolution);
  const source = mapAspectRatioToOpenAiSize(aspectRatio, resolution);
  const [nativeW, nativeH] = source.split("x").map(Number);
  if (crop.width === nativeW && crop.height === nativeH) return buffer;

  const pipeline = sharp(buffer).extract(crop);
  return outputFormat === "jpg" ? pipeline.jpeg({ quality: 92 }).toBuffer() : pipeline.png().toBuffer();
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

/**
 * OpenAI nennt bis zu 2 Minuten fuer komplexe Prompts; 4K/xhigh mit mehreren
 * Referenzen braucht Luft darueber. Ohne Limit haengt ein toter Socket bis zum
 * undici-Default (300 s) und damit bis zum harten Funktionsende.
 */
const DEFAULT_IMAGE_TIMEOUT_MS = 180_000;

export function resolveOpenAiImageTimeoutMs(raw = process.env.OPENAI_IMAGE_TIMEOUT_MS): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 10_000) return DEFAULT_IMAGE_TIMEOUT_MS;
  return Math.min(parsed, 290_000);
}

export type OpenAiImageUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  imageInputTokens: number | null;
  textInputTokens: number | null;
};

function readTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Liest das `usage`-Feld der Images API (GPT-Image-Modelle liefern Tokenzahlen mit). */
export function parseOpenAiImageUsage(payload: unknown): OpenAiImageUsage | null {
  if (!payload || typeof payload !== "object") return null;
  const usage = (payload as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return null;
  const record = usage as Record<string, unknown>;
  const details = (record.input_tokens_details ?? {}) as Record<string, unknown>;
  const parsed: OpenAiImageUsage = {
    inputTokens: readTokenCount(record.input_tokens),
    outputTokens: readTokenCount(record.output_tokens),
    imageInputTokens: readTokenCount(details.image_tokens),
    textInputTokens: readTokenCount(details.text_tokens),
  };
  return Object.values(parsed).some((value) => value !== null) ? parsed : null;
}

/**
 * Listenpreise GPT Image 2 / 2.5 (USD je 1 Mio. Tokens, Standard, nicht Batch),
 * Quelle: developers.openai.com/api/docs/pricing, abgerufen 2026-11-09.
 * Text-Input 5, Bild-Input 8, Bild-Output 30. Nur Schaetzwert fuer Logs.
 */
const USD_PER_TOKEN = { textInput: 5 / 1_000_000, imageInput: 8 / 1_000_000, imageOutput: 30 / 1_000_000 };

export function estimateOpenAiImageCostUsd(usage: OpenAiImageUsage): number | null {
  if (usage.outputTokens === null) return null;
  const imageIn = usage.imageInputTokens ?? 0;
  const textIn =
    usage.textInputTokens ?? Math.max((usage.inputTokens ?? 0) - imageIn, 0);
  const cost =
    textIn * USD_PER_TOKEN.textInput + imageIn * USD_PER_TOKEN.imageInput + usage.outputTokens * USD_PER_TOKEN.imageOutput;
  return Math.round(cost * 10_000) / 10_000;
}

/** Eine strukturierte Zeile je Bild, ohne Prompt und ohne Nutzerdaten. */
function logImageUsage(record: {
  model: string;
  size: string;
  quality?: string;
  referenceCount: number;
  durationMs: number;
  usage: OpenAiImageUsage | null;
}) {
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      domain: "ai-cost",
      provider: "openai",
      operation: record.referenceCount > 0 ? "images.edits" : "images.generations",
      model: record.model,
      size: record.size,
      quality: record.quality ?? "auto",
      referenceCount: record.referenceCount,
      durationMs: record.durationMs,
      ...(record.usage ?? {}),
      estimatedUsd: record.usage ? estimateOpenAiImageCostUsd(record.usage) : null,
    }),
  );
}

function referenceToFile(reference: OpenAiReferenceImage, index: number): File {
  const buffer = Buffer.from(reference.base64, "base64");
  const mime = reference.mime.toLowerCase().includes("jpeg") ? "image/jpeg" : reference.mime;
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  return new File([buffer], `reference-${index}.${ext}`, { type: mime });
}

/**
 * Erzeugt EIN Bild direkt ueber die OpenAI Images API (gpt-image-2.5-sunburst).
 * - Mit Referenzbild(ern) → `images/edits` (multipart, bis zu 16 Bilder) fuer
 *   Form-/Etikett-Treue (i2i). Reihenfolge der `referenceImages` ist relevant
 *   (z. B. Bild 1 = Flaschenform, Bild 2 = Etikett) und muss im Prompt erklaert
 *   werden.
 * - Ohne Referenz → `images/generations`.
 * WICHTIG: `response_format` wird NICHT gesendet — GPT-Image-Modelle lehnen es ab
 * und liefern immer base64. Gibt den Bild-Buffer zurueck.
 *
 * Kostenschutz: Jeder Aufruf ist kostenpflichtig und nicht idempotent. Daher
 * Retry-Policy `paid` (kein zweiter Lauf nach Timeout/Abbruch), Zeitlimit je
 * Versuch und optional ein Gesamtbudget (`budgetMs`), damit kein Versuch mehr
 * startet, den die Serverfunktion nicht mehr zu Ende bringen kann.
 */
export async function generateOpenAiImage(args: {
  apiKey: string;
  model: string;
  prompt: string;
  size: OpenAiImageSize;
  outputFormat: "png" | "jpg";
  quality?: OpenAiImageQuality;
  referenceImage?: OpenAiReferenceImage | null;
  referenceImages?: OpenAiReferenceImage[] | null;
  /** Zeitlimit je HTTP-Versuch; Standard 180 s bzw. OPENAI_IMAGE_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Verbleibendes Zeitbudget der Serverfunktion fuer diesen Aufruf. */
  budgetMs?: number;
  signal?: AbortSignal;
}): Promise<Buffer> {
  const { apiKey, model, prompt, size, outputFormat, quality, referenceImage, referenceImages } = args;
  const outputFmt = outputFormat === "jpg" ? "jpeg" : "png";

  const refs = (referenceImages ?? []).filter(Boolean);
  if (referenceImage) refs.unshift(referenceImage);

  // Jeder Versuch baut Request-Body und FormData neu auf — Streams sind nicht
  // wiederverwendbar.
  return withProviderRetry(
    "openai",
    async (signal) => {
      const startedAt = Date.now();
      let res: Response;
      if (refs.length > 0) {
        const form = new FormData();
        form.append("model", model);
        const imageField = refs.length > 1 ? "image[]" : "image";
        refs.forEach((ref, index) => form.append(imageField, referenceToFile(ref, index)));
        form.append("prompt", prompt);
        form.append("size", size);
        form.append("output_format", outputFmt);
        if (quality) form.append("quality", quality);
        res = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal,
        });
      } else {
        res = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt,
            size,
            output_format: outputFmt,
            ...(quality ? { quality } : {}),
          }),
          signal,
        });
      }

      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new ProviderError(classifyProviderResponse("openai", res, payload));
      }

      const base64 = parseOpenAiBase64(payload);
      if (!base64) {
        // 200 ohne Bild ist bereits berechnet: nicht als 5xx wiederholen.
        throw new ProviderError({
          ...classifyProviderResponse("openai", { status: 502 }, { error: { message: "OpenAI lieferte kein Bild." } }),
          code: "provider_unknown",
          providerStatus: res.status,
        });
      }
      logImageUsage({
        model,
        size,
        quality,
        referenceCount: refs.length,
        durationMs: Date.now() - startedAt,
        usage: parseOpenAiImageUsage(payload),
      });
      return Buffer.from(base64, "base64");
    },
    {
      label: `images:${model}`,
      policy: "paid",
      attemptTimeoutMs: args.timeoutMs ?? resolveOpenAiImageTimeoutMs(),
      budgetMs: args.budgetMs,
      signal: args.signal,
    },
  );
}
