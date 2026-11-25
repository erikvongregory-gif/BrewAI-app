export type GenerationResolution = "1K" | "2K" | "4K";
export type SeedanceResolution = "480p" | "720p" | "1080p";

/** Token-Kosten pro einzelner Generierung (gleiche Logik wie Legacy-Kie/OpenAI-Routen). */
export function calculatePerVariantTokenCost(args: {
  resolution: GenerationResolution;
  hasReferenceImage?: boolean;
  strictLabelMode?: boolean;
}): number {
  // ~4–5× Provider-COGS (OpenAI medium/high); früher 10/20/35 +5/+10
  const base = args.resolution === "4K" ? 12 : args.resolution === "2K" ? 6 : 3;
  return base + (args.hasReferenceImage ? 2 : 0) + (args.strictLabelMode ? 3 : 0);
}

export function calculateGenerationTokenCost(args: {
  resolution: GenerationResolution;
  hasReferenceImage?: boolean;
  strictLabelMode?: boolean;
  variantCount?: number;
}): number {
  const count = Math.max(1, args.variantCount ?? 1);
  return calculatePerVariantTokenCost(args) * count;
}

/**
 * Qualitäts→Abrechnungs-Auflösung wie create-task / social-post.
 * Env überschreibt medium/high. User-Wahl inkl. ultra (4K) zählt sonst;
 * ohne Wahl: Produktfoto ⇒ 2K, sonst 1K.
 */
export function resolveImageBillingResolution(args: {
  hasProductPhoto: boolean;
  qualityEnv?: string | null;
  compiledOrRequestedQuality?: "low" | "medium" | "high" | "ultra" | null;
}): GenerationResolution {
  const env = args.qualityEnv?.trim().toLowerCase();
  if (env === "low" || env === "medium") return "1K";
  if (env === "high") return "2K";

  const requested = args.compiledOrRequestedQuality;
  if (requested === "ultra") return "4K";
  if (requested === "high") return "2K";
  if (requested === "medium" || requested === "low") return "1K";
  return args.hasProductPhoto ? "2K" : "1K";
}

/**
 * Client-Vorschau der create-task / social-post Kosten.
 * Für OPENAI_IMAGE_QUALITY die öffentliche Spiegel-Variable NEXT_PUBLIC_OPENAI_IMAGE_QUALITY setzen.
 */
export function estimateStudioImageTokenCost(args: {
  /** Produktfoto wird tatsächlich als Image-1-Referenz genutzt (Markenmodus). */
  usesProductPhoto: boolean;
  extraReferenceCount?: number;
  /** Form-Referenz ohne Produktfoto (Flaschen-Silhouette). */
  hasShapeReference?: boolean;
  etikettModus: "marke" | "generisch";
  variantCount?: number;
  /** Request-/Compiler-Qualität (ohne Env-Override). */
  requestedQuality?: "low" | "medium" | "high" | "ultra" | null;
  /** Optional explizites Env; sonst NEXT_PUBLIC_OPENAI_IMAGE_QUALITY. */
  qualityEnv?: string | null;
}): number {
  const qualityEnv =
    args.qualityEnv ??
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_OPENAI_IMAGE_QUALITY : undefined);
  const resolution = resolveImageBillingResolution({
    hasProductPhoto: args.usesProductPhoto,
    qualityEnv,
    compiledOrRequestedQuality: args.requestedQuality,
  });
  const hasReferenceImage =
    args.usesProductPhoto ||
    (args.extraReferenceCount ?? 0) > 0 ||
    Boolean(args.hasShapeReference);
  const strictLabelMode = args.etikettModus === "marke" && args.usesProductPhoto;
  return calculateGenerationTokenCost({
    resolution,
    hasReferenceImage,
    strictLabelMode,
    variantCount: args.variantCount,
  });
}

/**
 * Tokens/Sekunde · Seedance-2-Liste (~4,5× BytePlus-COGS bei ~0,04 €/Token).
 * 480p ≈ 8 · 720p ≈ 16 · 1080p ≈ 40
 */
const VIDEO_TOKENS_PER_SEC: Record<SeedanceResolution, number> = {
  "480p": 8,
  "720p": 16,
  "1080p": 40,
};

/** Modell-Aufschlag relativ zu Seedance 2 Standard. */
export function resolveVideoModelMultiplier(modelId?: string | null): number {
  const id = (modelId ?? "").toLowerCase();
  if (id.includes("mini")) return 0.55;
  if (id.includes("fast")) return 0.8;
  if (id.includes("2.5") || id.includes("2-5") || /\b25\b/.test(id)) return 1.5;
  return 1;
}

/**
 * Video-Tokenkosten: Dauer × Auflösung × Modell × Audio × Varianten.
 * Jede Variante / jeder Batch-Lauf kostet voll (kein Mengenrabatt).
 */
export function calculateSeedanceVideoTokenCost(args: {
  resolution?: SeedanceResolution;
  duration?: number;
  generateAudio?: boolean;
  modelId?: string | null;
  variantCount?: number;
}): number {
  const fromEnv = Number.parseInt(process.env.KIE_SEEDANCE_TOKEN_COST ?? "", 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv * Math.max(1, args.variantCount ?? 1);
  }

  const duration = Math.max(4, Math.min(15, Math.round(args.duration ?? 5)));
  const resolution = args.resolution ?? "720p";
  const perSec = VIDEO_TOKENS_PER_SEC[resolution] ?? VIDEO_TOKENS_PER_SEC["720p"];
  const model = resolveVideoModelMultiplier(args.modelId);
  const audio = args.generateAudio ? 1.25 : 1;
  const perClip = Math.max(1, Math.ceil(duration * perSec * model * audio));
  return perClip * Math.max(1, args.variantCount ?? 1);
}

export function formatPlanImageEstimate(monthlyTokens: number): string {
  const expensive = calculatePerVariantTokenCost({
    resolution: "4K",
    hasReferenceImage: true,
    strictLabelMode: true,
  });
  const cheap = calculatePerVariantTokenCost({ resolution: "1K" });
  const min = Math.max(1, Math.floor(monthlyTokens / expensive));
  const max = Math.max(min, Math.floor(monthlyTokens / cheap));
  return `ca. ${min.toLocaleString("de-DE")}–${max.toLocaleString("de-DE")} Bilder`;
}

/**
 * Spanne für die Tarifkarte (720p, mit Audio): Obergrenze = kurzer Clip (5 s) mit Seedance 2,
 * Untergrenze = langer Clip (12 s) mit dem beworbenen Seedance 2.5 (Faktor 1,5). So passt die
 * Angabe zur tatsächlichen Abrechnung in `calculateSeedanceVideoTokenCost`.
 */
export function formatPlanVideoEstimate(monthlyTokens: number): string {
  const standardCost = calculateSeedanceVideoTokenCost({
    resolution: "720p",
    duration: 5,
    generateAudio: true,
  });
  const longCost = calculateSeedanceVideoTokenCost({
    resolution: "720p",
    duration: 12,
    generateAudio: true,
    modelId: "seedance-2.5",
  });
  const maxVideos = Math.max(1, Math.floor(monthlyTokens / standardCost));
  const minVideos = Math.max(1, Math.floor(monthlyTokens / longCost));
  return `ca. ${minVideos.toLocaleString("de-DE")}–${maxVideos.toLocaleString("de-DE")} Videos`;
}
