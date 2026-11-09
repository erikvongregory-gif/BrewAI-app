import sharp from "sharp";
import { publicFetch } from "@/lib/security/public-fetch";

const PHOTOROOM_API_KEY = process.env.PHOTOROOM_API_KEY;
const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY;
/** generate-isolate läuft mit maxDuration = 30: 8 s Bildabruf + 20 s Freisteller. */
const PROVIDER_TIMEOUT_MS = 20_000;

export interface BgRemovalParams {
  imageUrl: string;
  bgColor?: "transparent" | "#FFFFFF" | "#000000" | string;
  keepShadow?: boolean;
}

async function imageUrlToBlob(imageUrl: string): Promise<Blob> {
  // Nutzer-URL (generate-isolate: inputBild): nur über den SSRF-Schutz laden,
  // nie direkt per fetch — sonst erreicht der Server interne Adressen.
  const imgRes = await publicFetch(imageUrl, { maxBytes: 20 * 1024 * 1024, timeoutMs: 8_000 });
  if (imgRes.status !== 200) throw new Error(`Bild konnte nicht geladen werden: ${imgRes.status}`);
  const imgBuf = imgRes.body;
  const normalized = await sharp(imgBuf)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  return new Blob([new Uint8Array(normalized)], { type: "image/png" });
}

async function removeWithPhotoroom(params: BgRemovalParams): Promise<Buffer> {
  if (!PHOTOROOM_API_KEY?.trim()) {
    throw new Error("PHOTOROOM_API_KEY fehlt.");
  }

  const form = new FormData();
  form.append("image_file", await imageUrlToBlob(params.imageUrl), "input.jpg");
  if (params.bgColor && params.bgColor !== "transparent") {
    form.append("bg_color", params.bgColor);
  }
  if (params.keepShadow) {
    form.append("shadow_mode", "ai_shadow");
  }

  const res = await fetch("https://sdk.photoroom.com/v1/segment", {
    method: "POST",
    headers: { "x-api-key": PHOTOROOM_API_KEY },
    body: form,
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Photoroom failed: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function removeWithRemoveBg(params: BgRemovalParams): Promise<Buffer> {
  if (!REMOVE_BG_API_KEY?.trim()) {
    throw new Error("REMOVE_BG_API_KEY fehlt.");
  }

  const form = new FormData();
  form.append("image_file", await imageUrlToBlob(params.imageUrl), "input.jpg");
  form.append("size", "auto");
  if (params.bgColor && params.bgColor !== "transparent") {
    form.append("bg_color", params.bgColor.replace("#", ""));
  }

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": REMOVE_BG_API_KEY },
    body: form,
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`remove.bg failed: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function removeBackground(params: BgRemovalParams): Promise<Buffer> {
  if (PHOTOROOM_API_KEY?.trim()) {
    return removeWithPhotoroom(params);
  }
  return removeWithRemoveBg(params);
}
