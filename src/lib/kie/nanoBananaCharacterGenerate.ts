import { publicFetch } from "@/lib/security/public-fetch";
import { extractTaskId, extractTaskMedia, findFirstUrl } from "@/lib/kie/taskResponse";
import { mapAspectRatioForGptImage2, normalizeResolutionForGptImage2 } from "@/lib/kie/gptImage2TaskInput";
import type { OpenAiReferenceImage } from "@/lib/openai/generateImage";
import sharp from "sharp";

function isUsableKieModelName(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed || /^paste_/i.test(trimmed) || /placeholder/i.test(trimmed)) return false;
  return true;
}

function nanoBananaImageModel(): string {
  return (
    process.env.KIE_NANOBANANA_IMAGE_MODEL?.trim() ||
    process.env.NANOBANANA_IMAGE_TO_IMAGE_MODEL?.trim() ||
    process.env.KIE_IMAGE_TO_IMAGE_MODEL?.trim() ||
    ""
  );
}

function extractUploadedFileUrl(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  for (const candidate of [record.fileUrl, record.url, record.downloadUrl, record.path]) {
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) return candidate;
  }
  for (const value of Object.values(record)) {
    const nested = extractUploadedFileUrl(value);
    if (nested) return nested;
  }
  return null;
}

async function uploadRefsToKie(apiKey: string, refs: OpenAiReferenceImage[]): Promise<string[]> {
  const uploadBase = "https://kieai.redpandaai.co";
  const uploaded: string[] = [];
  for (const [index, ref] of refs.entries()) {
    const mime = ref.mime.toLowerCase().includes("jpeg")
      ? "image/jpeg"
      : ref.mime.toLowerCase().includes("webp")
        ? "image/webp"
        : "image/png";
    const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
    const base64Data = `data:${mime};base64,${ref.base64}`;
    const uploadRes = await fetch(`${uploadBase}/api/file-base64-upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        base64Data,
        uploadPath: "brewai/character-refs",
        fileName: `character-ref-${Date.now()}-${index + 1}.${ext}`,
      }),
      // Ohne Limit blockiert ein toter Socket die ganze Serverfunktion.
      signal: AbortSignal.timeout(30_000),
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
    if (!fileUrl) throw new Error("Kie Upload liefert keine Datei-URL.");
    uploaded.push(fileUrl);
  }
  return uploaded;
}

const KIE_POLL_MAX_MS = 180_000;

async function pollKieImageUrl(apiKey: string, baseUrl: string, taskId: string, maxWaitMs = KIE_POLL_MAX_MS): Promise<string> {
  const deadline = Date.now() + Math.min(Math.max(maxWaitMs, 5_000), KIE_POLL_MAX_MS);
  let lastState = "unknown";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    const upstream = await fetch(
      `${baseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) },
    );
    if (!upstream.ok) continue;
    const data = (await upstream.json()) as Record<string, unknown>;
    const payload = (data.data ?? {}) as Record<string, unknown>;
    lastState = String(data.state || data.status || payload.state || payload.status || "unknown").toLowerCase();
    if (["failed", "error", "cancelled", "canceled"].includes(lastState)) {
      const msg =
        (payload.failMsg as string) ||
        (payload.error as string) ||
        (data.msg as string) ||
        "Nano Banana Generierung fehlgeschlagen.";
      throw new Error(msg);
    }
    if (["success", "succeeded", "completed", "done"].includes(lastState)) {
      const media = extractTaskMedia(payload, data);
      const url = media.imageUrl || media.mediaUrl || findFirstUrl(payload) || findFirstUrl(data);
      if (url) return url;
    }
  }
  throw new Error(`Nano Banana Timeout (letzter Status: ${lastState}).`);
}

/**
 * Face-safe Crop anhand echter Pixelmasse (nicht OpenAI-Native-Annahme).
 * Top-weighted: Kopf/Gesicht bleiben im Frame.
 */
export async function cropBufferFaceSafe(
  buffer: Buffer,
  aspectRatio: string,
  outputFormat: "png" | "jpg" = "png",
): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (!srcW || !srcH) return buffer;

  const [aw, ah] = aspectRatio.split(":").map(Number);
  const target = aw && ah ? aw / ah : srcW / srcH;
  const srcRatio = srcW / srcH;
  if (Math.abs(srcRatio - target) < 0.02) {
    return outputFormat === "jpg" ? sharp(buffer).jpeg({ quality: 92 }).toBuffer() : buffer;
  }

  let width: number;
  let height: number;
  let left: number;
  let top: number;
  if (srcRatio > target) {
    // zu breit → Seiten abschneiden, vertikal zentriert leicht oben
    height = srcH;
    width = Math.round(height * target);
    left = Math.max(0, Math.round((srcW - width) / 2));
    top = 0;
  } else {
    // zu hoch → unten abschneiden (Gesicht oben behalten)
    width = srcW;
    height = Math.round(width / target);
    left = 0;
    top = 0; // north / face-safe
  }

  const pipeline = sharp(buffer).extract({
    left,
    top: Math.min(top, Math.max(0, srcH - height)),
    width: Math.min(width, srcW),
    height: Math.min(height, srcH),
  });
  return outputFormat === "jpg" ? pipeline.jpeg({ quality: 92 }).toBuffer() : pipeline.png().toBuffer();
}

/**
 * Higgsfield-Elements-Parallel: Charakter zuerst, Produkt danach an Nano Banana.
 */
export async function generateCharacterIdentityImage(args: {
  prompt: string;
  /** Image 1..N = Charakter, danach Produkt, optional Szene/Look. */
  references: OpenAiReferenceImage[];
  aspectRatio: string;
  resolution?: "1K" | "2K" | "4K";
  onTaskId?: (taskId: string) => void | Promise<void>;
  /** Restbudget der Serverfunktion; begrenzt das Warten auf das Ergebnis (max. 180 s). */
  budgetMs?: number;
}): Promise<Buffer> {
  const apiKey = process.env.KIE_API_KEY?.trim();
  if (!apiKey) throw new Error("KIE_API_KEY fehlt — Charakter-Identität braucht Nano Banana.");
  const model = nanoBananaImageModel();
  if (!isUsableKieModelName(model)) {
    throw new Error("Nano Banana Modell ist nicht konfiguriert (KIE_NANOBANANA_IMAGE_MODEL).");
  }
  if (args.references.length < 2) {
    throw new Error("Charakter-Generierung braucht Produktfoto und mindestens ein Charakter-Foto.");
  }

  const baseUrl = process.env.KIE_API_BASE_URL?.trim() || "https://api.kie.ai";
  const mappedAspect = mapAspectRatioForGptImage2(args.aspectRatio);
  const resolution = normalizeResolutionForGptImage2(args.resolution ?? "2K", mappedAspect);
  const inputUrls = await uploadRefsToKie(apiKey, args.references.slice(0, 4));

  const upstream = await fetch(`${baseUrl}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: {
        prompt: args.prompt.slice(0, 12_000),
        input_urls: inputUrls,
        aspect_ratio: mappedAspect,
        resolution,
        nsfw_checker: false,
      },
    }),
    // Nur das Anlegen des Tasks; das Ergebnis kommt per Polling mit eigenem Limit.
    signal: AbortSignal.timeout(45_000),
  });
  const data = (await upstream.json()) as Record<string, unknown>;
  if (!upstream.ok) {
    throw new Error(((data.msg as string) || (data.error as string) || "Nano Banana createTask fehlgeschlagen.").trim());
  }
  const code = data.code as number | undefined;
  if (typeof code === "number" && code !== 200) {
    throw new Error(((data.msg as string) || "Nano Banana hat die Anfrage abgelehnt.").trim());
  }
  const taskId = extractTaskId(data);
  if (!taskId) throw new Error("Kein taskId von Nano Banana erhalten.");
  await args.onTaskId?.(taskId);

  const resultUrl = await pollKieImageUrl(apiKey, baseUrl, taskId, args.budgetMs);
  const downloaded = await publicFetch(resultUrl, { maxBytes: 25 * 1024 * 1024 });
  if (downloaded.status !== 200 || downloaded.body.byteLength < 32) {
    throw new Error("Nano Banana Ergebnisbild konnte nicht geladen werden.");
  }
  return downloaded.body;
}

export function assembleGenerationReferences(input: {
  useCharacterIdentity: boolean;
  characterRefs: OpenAiReferenceImage[];
  visionReference: OpenAiReferenceImage | null;
  extraRefs: OpenAiReferenceImage[];
  extraRefRoles?: Array<"scene" | "look">;
  campaignRefs?: OpenAiReferenceImage[];
  shapeReference: OpenAiReferenceImage | null;
  glassReference?: OpenAiReferenceImage | null;
  liquidReference?: OpenAiReferenceImage | null;
}): {
  references: OpenAiReferenceImage[];
  extraRefCount: number;
  campaignRefCount: number;
  roles: Array<{
    index: number;
    role: "character" | "product" | "shape" | "glass" | "liquid" | "scene" | "look";
  }>;
} {
  if (!input.useCharacterIdentity) {
    const ordered = [
      input.visionReference ? { image: input.visionReference, role: "product" as const } : null,
      input.shapeReference ? { image: input.shapeReference, role: "shape" as const } : null,
      input.glassReference ? { image: input.glassReference, role: "glass" as const } : null,
      input.liquidReference ? { image: input.liquidReference, role: "liquid" as const } : null,
      // Style-Looks vor User-Extras — Kampagnen-Grammatik hat Vorrang vor Szene-Uploads.
      ...(input.campaignRefs ?? []).map((image) => ({ image, role: "look" as const })),
      ...input.extraRefs.map((image, index) => ({
        image,
        role: input.extraRefRoles?.[index] === "look" ? ("look" as const) : ("scene" as const),
      })),
    ].filter(Boolean) as Array<{
      image: OpenAiReferenceImage;
      role: "product" | "shape" | "glass" | "liquid" | "scene" | "look";
    }>;
    return {
      references: ordered.map(({ image }) => image),
      extraRefCount: input.extraRefs.length,
      campaignRefCount: input.campaignRefs?.length ?? 0,
      roles: ordered.map(({ role }, index) => ({ index: index + 1, role })),
    };
  }
  const identity = [...input.characterRefs, input.visionReference].filter(Boolean) as OpenAiReferenceImage[];
  // Naturtrüb-Liquid-Ref vor Extras/Looks — Klarheit schlägt Szene-Upload.
  const liquidSlot = input.liquidReference ? 1 : 0;
  const extras = input.extraRefs.slice(0, Math.max(0, 4 - identity.length - liquidSlot));
  const afterExtras = identity.length + extras.length + liquidSlot;
  const campaigns = (input.campaignRefs ?? []).slice(0, Math.max(0, 4 - afterExtras));
  const roles = [
    ...input.characterRefs.map(() => "character" as const),
    ...(input.visionReference ? (["product"] as const) : []),
    ...(input.liquidReference ? (["liquid"] as const) : []),
    ...extras.map((_, index) =>
      input.extraRefRoles?.[index] === "look" ? ("look" as const) : ("scene" as const),
    ),
    ...campaigns.map(() => "look" as const),
  ].map((role, index) => ({ index: index + 1, role }));
  const liquidRefs = input.liquidReference ? [input.liquidReference] : [];
  return {
    references: [...identity, ...liquidRefs, ...extras, ...campaigns],
    extraRefCount: extras.length,
    campaignRefCount: campaigns.length,
    roles,
  };
}

const SCENE_LINES: Record<string, string> = {
  biergarten_sommer: "traditional German Biergarten with wooden tables and chestnut shade",
  wirtshaus_innen: "cozy Bavarian Wirtshaus interior, warm wood and tungsten light",
  kueche_zuhause: "modern home kitchen with soft window light",
  wiese_picknick: "summer meadow picnic",
  strand_sonnenuntergang: "beach at golden sunset",
  alpenpanorama: "alpine hut terrace with mountain peaks",
  stadtbalkon_abend: "urban balcony at dusk",
  brauereihof: "brewery courtyard with copper kettles in the background",
  fussball_public_viewing: "outdoor football public viewing party with LED screen glow",
};

/**
 * Eigenständiger Character+Product Prompt (kein Product-Placement-Anhang).
 * Charakter-Refs = Image 1..N, Produkt = letztes Image.
 */
export function buildCharacterIdentityPrompt(args: {
  szene?: string;
  zusatzWunsch?: string;
  characterName?: string;
  characterRole?: string;
  appearanceLock?: string;
  characterRefCount: number;
  extraRefCount?: number;
  brandContext?: string;
}): string {
  const label = [args.characterName?.trim(), args.characterRole?.trim()].filter(Boolean).join(", ");
  const lock = args.appearanceLock?.trim();
  const scene = SCENE_LINES[args.szene ?? ""] || args.szene || "authentic German brewery lifestyle setting";
  const charEnd = args.characterRefCount <= 1 ? "1" : `1–${args.characterRefCount}`;
  const productIdx = args.characterRefCount + 1;
  const extraCount = Math.max(0, args.extraRefCount ?? 0);
  const extraLine =
    extraCount > 0
      ? `Images ${productIdx + 1}–${productIdx + extraCount} are scene or style references only — do not copy logos or text from them onto the product.`
      : "";

  const parts = [
    `Photoreal lifestyle photo. The HERO is the adult person from reference Image ${charEnd} — same face, hair, age, skin, likeness.`,
    lock ? `Appearance lock: ${lock}.` : label ? `Person: ${label}.` : "",
    `Image ${productIdx} is ONLY the beer product (bottle/can/label). Reconstruct that product faithfully in their hand or on the table beside them.`,
    extraLine,
    "FRAMING (MANDATORY): medium shot, waist-up or chest-up, face fully visible and sharp, eyes readable, chin and forehead in frame, generous headroom, person fills most of the frame. Never extreme crop, never face cut off, never tiny background figure, never product-only packshot.",
    `Setting: ${scene}.`,
    args.zusatzWunsch?.trim() ? `User scene: ${args.zusatzWunsch.trim()}.` : "",
    "Natural authentic body language, real hands holding or near the beer, candid brewery lifestyle, unretouched skin texture.",
    "Forbidden: cropped face, cut-off forehead/chin, product collage, beauty filter, celebrity look, different person than the references.",
    args.brandContext?.trim() ? args.brandContext.trim().replace(/\n+/g, " ") : "",
  ];

  return parts.filter(Boolean).join(" ").slice(0, 12_000);
}
