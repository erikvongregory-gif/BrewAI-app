import { createArkAssetClient } from "./ark-assets";
import type { GenerationPlane, MediaRole } from "./catalog/types";
import type { GenerationStatus, QueuedGeneration } from "./types";
import { ModelArkError } from "./types";

/** BytePlus ModelArk (ap-southeast-1) — Seedance. */
export const DEFAULT_ARK_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";

const ARK_MODEL_IDS: Record<string, string> = {
  "seedance-2": "dreamina-seedance-2-0-260128",
  "seedance-2-fast": "dreamina-seedance-2-0-fast-260128",
  "seedance-2-mini": "dreamina-seedance-2-0-mini-260615",
  "seedance-2.5": "dreamina-seedance-2-5-260628",
  "seedance-2.5-edit": "dreamina-seedance-2-5-260628",
  "seedance-2.5-extend": "dreamina-seedance-2-5-260628",
};

export function isSeedanceModel(modelId: string): boolean {
  return modelId.startsWith("seedance-");
}

export function isModelArkRequestId(requestId: string): boolean {
  return requestId.startsWith("cgt-");
}

export function getModelArkApiKey(): string | null {
  const key = process.env.ARK_API_KEY?.trim();
  return key || null;
}

const MODELARK_STATUS_TIMEOUT_MS = 20_000;
const MODELARK_SUBMIT_TIMEOUT_MS = 60_000;

export function createModelArkClient(options?: { apiKey?: string; baseUrl?: string; fetch?: typeof fetch }) {
  const apiKey = options?.apiKey ?? getModelArkApiKey();
  if (!apiKey) throw new ModelArkError(500, { detail: "ARK_API_KEY fehlt." });

  const baseUrl = (options?.baseUrl ?? process.env.ARK_API_BASE_URL ?? DEFAULT_ARK_BASE_URL).replace(
    /\/$/,
    "",
  );
  const fetchImpl = options?.fetch ?? fetch;
  const auth = `Bearer ${apiKey}`;

  async function send(method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
    const url = `${baseUrl}${path}`;
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: auth,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      // Statusabfragen laufen u. a. sequenziell im Reconcile-Cron: Ein hängender
      // Aufruf blockierte sonst alle folgenden Jobs und Kontolöschungen dieses Laufs.
      signal: AbortSignal.timeout(method === "GET" ? MODELARK_STATUS_TIMEOUT_MS : MODELARK_SUBMIT_TIMEOUT_MS),
    });
    const payload = await readJson(response);
    if (!response.ok) throw new ModelArkError(response.status, payload);
    return payload;
  }

  const assets = createArkAssetClient({
    apiKey,
    fetch: fetchImpl,
  });

  return {
    async submit(plane: GenerationPlane): Promise<QueuedGeneration> {
      const resolved = await resolvePlaneAssets(plane, assets);
      const body = toModelArkBody(resolved);
      const payload = asRecord(await send("POST", "/contents/generations/tasks", body));
      const requestId = stringField(payload, "id");
      if (!requestId) throw new ModelArkError(502, { detail: "ModelArk response missing id" });
      return {
        status: "queued",
        requestId,
        statusUrl: `${baseUrl}/contents/generations/tasks/${requestId}`,
      };
    },
    async status(requestId: string): Promise<GenerationStatus> {
      if (!requestId) throw new ModelArkError(400, { detail: "Missing request id" });
      const payload = asRecord(
        await send("GET", `/contents/generations/tasks/${encodeURIComponent(requestId)}`),
      );
      return mapModelArkStatus(payload);
    },
  };
}

export function toModelArkBody(plane: GenerationPlane): Record<string, unknown> {
  const arkModel = ARK_MODEL_IDS[plane.model];
  if (!arkModel) throw new Error(`No ModelArk map for ${plane.model}`);

  const start = roleUrls(plane, "start")[0];
  const end = roleUrls(plane, "end")[0];
  const refs = roleUrls(plane, "reference");
  const videos = roleUrls(plane, "video");
  const audios = roleUrls(plane, "audio");
  const content: Record<string, unknown>[] = [];

  const isEdit = plane.model === "seedance-2.5-edit";
  const isExtend = plane.model === "seedance-2.5-extend";

  if (start) {
    content.push({ type: "image_url", image_url: { url: start }, role: "first_frame" });
    if (end) content.push({ type: "image_url", image_url: { url: end }, role: "last_frame" });
  }
  for (const url of refs) {
    content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
  }
  for (const url of videos) {
    content.push({ type: "video_url", video_url: { url }, role: "reference_video" });
  }
  for (const url of audios) {
    content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" });
  }

  const prompt = annotatePrompt(plane.prompt.text, refs.length, videos.length, audios.length);
  content.unshift({ type: "text", text: prompt });

  const body: Record<string, unknown> = {
    model: arkModel,
    content,
    watermark: false,
    generate_audio: Boolean(plane.settings.generateAudio ?? true),
  };

  if (plane.settings.resolution) body.resolution = plane.settings.resolution;
  // ModelArk: with first_frame / last_frame, ratio is derived — sending it 400s.
  if (!start && plane.settings.aspectRatio) body.ratio = plane.settings.aspectRatio;
  if (typeof plane.settings.duration === "number" && !isEdit) body.duration = plane.settings.duration;
  if (plane.settings.outputFormat) body.output_format = plane.settings.outputFormat;
  if (isEdit) body.omni_reference_task_type = "video_edit";
  if (isExtend) body.omni_reference_task_type = "video_extend";

  return body;
}

function annotatePrompt(prompt: string, images: number, videos: number, audios: number): string {
  if (prompt.includes("@Image") || prompt.includes("@Video") || prompt.includes("@Audio")) {
    return prompt;
  }
  const tags = [
    ...Array.from({ length: images }, (_, i) => `@Image${i + 1}`),
    ...Array.from({ length: videos }, (_, i) => `@Video${i + 1}`),
    ...Array.from({ length: audios }, (_, i) => `@Audio${i + 1}`),
  ];
  if (!tags.length) return prompt;
  return `${prompt.trim()} Referring to ${tags.join(", ")}.`;
}

function mapModelArkStatus(payload: Record<string, unknown>): GenerationStatus {
  const requestId = stringField(payload, "id") ?? "";
  const raw = stringField(payload, "status") ?? "unknown";
  const status =
    raw === "succeeded"
      ? "completed"
      : raw === "cancelled" || raw === "canceled"
        ? "canceled"
        : raw === "expired"
          ? "failed"
          : raw;

  const videoUrl = asRecord(payload.content).video_url;
  const error = payload.error ?? asRecord(payload.error).message;

  return {
    status,
    requestId,
    ...(typeof videoUrl === "string" ? { video: { url: videoUrl } } : {}),
    ...(error !== undefined ? { error } : {}),
  };
}

function roleUrls(plane: GenerationPlane, role: MediaRole) {
  return (plane.media[role] ?? []).map((item) => item.url);
}

async function resolvePlaneAssets(
  plane: GenerationPlane,
  assets: ReturnType<typeof createArkAssetClient>,
): Promise<GenerationPlane> {
  const media: GenerationPlane["media"] = {};
  for (const role of ["start", "end", "reference", "video", "audio"] as const) {
    const items = plane.media[role];
    if (!items?.length) continue;
    const kind = role === "video" ? "Video" : role === "audio" ? "Audio" : "Image";
    media[role] = await Promise.all(
      items.map(async (item) => ({
        ...item,
        url: await assets.resolveUrl(item.url, kind),
      })),
    );
  }
  return { ...plane, media };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
