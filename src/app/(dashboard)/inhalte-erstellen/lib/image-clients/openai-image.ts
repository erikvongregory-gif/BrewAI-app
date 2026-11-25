import { publicFetch } from "@/lib/security/public-fetch";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import sharp from "sharp";
import { requireOpenAiImageApiKey } from "@/lib/openai/imageApiKey";

const MODEL = "gpt-image-2.5-sunburst";

function createOpenAiClient(): OpenAI {
  // Bildaufrufe sind kostenpflichtig und nicht idempotent: keine stillen SDK-Retries
  // (Default 2) nach Timeout/5xx, und kein 10-Minuten-Default-Timeout.
  return new OpenAI({ apiKey: requireOpenAiImageApiKey(), maxRetries: 0, timeout: 170_000 });
}

export type ImageSize = "1024x1024" | "1024x1280" | "1024x1536" | "1024x1792" | "1792x1024" | "1280x1024";
export type Quality = "low" | "medium" | "high";

/** Studio `ultra` (4K) → OpenAI API nur low/medium/high. */
export function toOpenAiApiQuality(quality: "low" | "medium" | "high" | "ultra" | undefined): Quality {
  if (quality === "low") return "low";
  if (quality === "high" || quality === "ultra") return "high";
  return "medium";
}
type ImageApiData = Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;

export type ReferenceUrlResolver = (url: string, index?: number) => Promise<Buffer | null | undefined>;

interface GenerateParams {
  prompt: string;
  referenceImageUrls?: string[];
  size: ImageSize;
  quality: Quality;
  n?: number;
  resolveReferenceUrl?: ReferenceUrlResolver;
}

export function aspectRatioToImageSize(
  aspectRatio: "1:1" | "2:3" | "3:4" | "4:3" | "4:5" | "9:16" | "16:9",
): ImageSize {
  const sizes = {
    "1:1": "1024x1024",
    "2:3": "1024x1536",
    "3:4": "1024x1536",
    "4:5": "1024x1280",
    "9:16": "1024x1792",
    "16:9": "1792x1024",
    "4:3": "1280x1024",
  } as const;
  return sizes[aspectRatio];
}

async function fetchReferenceBuffer(
  url: string,
  index: number,
  resolveReferenceUrl?: ReferenceUrlResolver,
): Promise<Buffer> {
  const resolved = resolveReferenceUrl ? await resolveReferenceUrl(url, index) : null;
  if (resolved && resolved.byteLength > 0) return resolved;

  const res = await publicFetch(url,{maxBytes:20*1024*1024});
  if (res.status !== 200) {
    throw new Error(
      `Reference image fetch failed: ${url}. Bitte Markenprofil neu scannen, falls das Bild aelter ist.`,
    );
  }
  return res.body;
}

async function urlsToFiles(urls: string[], resolveReferenceUrl?: ReferenceUrlResolver) {
  return Promise.all(
    urls.map(async (url, index) => {
      const original = await fetchReferenceBuffer(url, index, resolveReferenceUrl);
      const normalized = await sharp(original)
        .rotate()
        .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      return toFile(normalized, `ref_${index}.png`, { type: "image/png" });
    }),
  );
}

export async function generateImage(params: GenerateParams) {
  const hasRefs = Boolean(params.referenceImageUrls?.length);
  const baseParams = {
    model: MODEL,
    prompt: params.prompt,
    size: params.size,
    quality: params.quality,
    n: params.n ?? 2,
  };

  if (hasRefs) {
    const files = await urlsToFiles(params.referenceImageUrls ?? [], params.resolveReferenceUrl);
    const client = createOpenAiClient();
    const editParams = {
      ...baseParams,
      image: files.length === 1 ? files[0] : files,
    } as unknown as Parameters<typeof client.images.edit>[0];
    const result = (await client.images.edit(editParams)) as { data: ImageApiData };
    return result.data;
  }

  const client = createOpenAiClient();
  const generateParams = baseParams as unknown as Parameters<typeof client.images.generate>[0];
  const result = (await client.images.generate(generateParams)) as { data: ImageApiData };
  return result.data;
}

export const generateHyperrealistic = (p: {
  prompt: string;
  etikettUrl: string;
  size: ImageSize;
  quality?: Quality;
  resolveReferenceUrl?: ReferenceUrlResolver;
}) =>
  generateImage({
    prompt: p.prompt,
    referenceImageUrls: [p.etikettUrl],
    size: p.size,
    quality: p.quality ?? "high",
    n: 2,
    resolveReferenceUrl: p.resolveReferenceUrl,
  });

export const generateProductStudio = (p: {
  prompt: string;
  referenzBildUrl: string;
  size: ImageSize;
  quality?: Quality;
  resolveReferenceUrl?: ReferenceUrlResolver;
}) =>
  generateImage({
    prompt: p.prompt,
    referenceImageUrls: [p.referenzBildUrl],
    size: p.size,
    quality: p.quality ?? "high",
    n: 2,
    resolveReferenceUrl: p.resolveReferenceUrl,
  });

export const generateCampaignImage = (p: {
  prompt: string;
  feedReferenzen: string[];
  size: ImageSize;
  quality?: Quality;
  resolveReferenceUrl?: ReferenceUrlResolver;
}) =>
  generateImage({
    prompt: p.prompt,
    referenceImageUrls: p.feedReferenzen,
    size: p.size,
    quality: p.quality ?? "high",
    n: 2,
    resolveReferenceUrl: p.resolveReferenceUrl,
  });
