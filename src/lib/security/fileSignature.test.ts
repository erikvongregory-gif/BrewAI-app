import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchesDeclaredMime, matchesFontExtension } from "@/lib/security/fileSignature";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);
function withAscii(prefix: number[], offset: number, value: string, total = 16) {
  const out = new Uint8Array(total);
  out.set(prefix, 0);
  out.set(text(value), offset);
  return out;
}

describe("matchesDeclaredMime", () => {
  it("erkennt echte Bild-, Video- und Audiosignaturen", () => {
    expect(matchesDeclaredMime("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesDeclaredMime("image/jpg", bytes(0xff, 0xd8, 0xff, 0xdb))).toBe(true);
    expect(matchesDeclaredMime("image/png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(true);
    expect(matchesDeclaredMime("image/gif", text("GIF89a...."))).toBe(true);
    expect(matchesDeclaredMime("image/webp", withAscii([...text("RIFF"), 1, 2, 3, 4], 8, "WEBP"))).toBe(true);
    expect(matchesDeclaredMime("video/mp4", withAscii([0, 0, 0, 0x18], 4, "ftypisom"))).toBe(true);
    expect(matchesDeclaredMime("video/quicktime", withAscii([0, 0, 0, 0x14], 4, "ftypqt  "))).toBe(true);
    expect(matchesDeclaredMime("video/webm", bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f))).toBe(true);
    expect(matchesDeclaredMime("audio/mpeg", text("ID3\u0004"))).toBe(true);
    expect(matchesDeclaredMime("audio/mpeg", bytes(0xff, 0xfb, 0x90, 0x64))).toBe(true);
    expect(matchesDeclaredMime("audio/wav", withAscii([...text("RIFF"), 1, 2, 3, 4], 8, "WAVE"))).toBe(true);
    expect(matchesDeclaredMime("audio/ogg", text("OggS\u0000"))).toBe(true);
  });

  it("lehnt HTML, SVG und vertauschte Typen ab", () => {
    const html = text("<!doctype html><script>alert(1)</script>");
    const svg = text('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    for (const mime of ["image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "audio/mpeg"]) {
      expect(matchesDeclaredMime(mime, html), mime).toBe(false);
      expect(matchesDeclaredMime(mime, svg), mime).toBe(false);
    }
    expect(matchesDeclaredMime("image/png", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(false);
    expect(matchesDeclaredMime("audio/wav", withAscii([...text("RIFF"), 1, 2, 3, 4], 8, "WEBP"))).toBe(false);
    expect(matchesDeclaredMime("image/svg+xml", svg)).toBe(false);
    expect(matchesDeclaredMime("image/png", new Uint8Array())).toBe(false);
  });
});

describe("matchesFontExtension", () => {
  it("erkennt WOFF2, WOFF, TrueType und OpenType", () => {
    expect(matchesFontExtension("woff2", text("wOF2\u0000\u0001"))).toBe(true);
    expect(matchesFontExtension("woff", text("wOFF\u0000\u0001"))).toBe(true);
    expect(matchesFontExtension("ttf", bytes(0x00, 0x01, 0x00, 0x00, 0x00))).toBe(true);
    expect(matchesFontExtension("otf", text("OTTO\u0000"))).toBe(true);
  });

  it("lehnt umbenannte Nicht-Schriften ab", () => {
    expect(matchesFontExtension("woff2", text("<html>"))).toBe(false);
    expect(matchesFontExtension("ttf", text("MZ\u0090\u0000"))).toBe(false);
    expect(matchesFontExtension("svg", text("<svg/>"))).toBe(false);
  });
});

// --- Route: /api/generation/upload ---------------------------------------------------------
const routeMocks = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner-1", app_metadata: {}, user_metadata: {} } } }) },
  }),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/auth/twoFactorSession", () => ({ hasPassedTwoFactor: async () => true }));
vi.mock("@/lib/dashboard/workspace", () => ({ workspaceResourceUser: async (user: unknown) => user }));
vi.mock("@/lib/security/requestGuards", () => ({
  enforceRateLimitPersistent: async () => null,
  enforceSameOrigin: () => null,
}));
vi.mock("@/lib/supabase/storage", () => ({ uploadUserImageToStorage: routeMocks.upload }));

import { POST as uploadRoute } from "@/app/api/generation/upload/route";

function uploadRequest(content: Uint8Array, type: string, name: string) {
  const form = new FormData();
  // Kopie mit eigenem ArrayBuffer (BlobPart verlangt ArrayBuffer, keinen SharedArrayBuffer).
  form.append("file", new File([new Uint8Array(content)], name, { type }));
  return new Request("https://app.brewai.de/api/generation/upload", { method: "POST", body: form });
}

describe("POST /api/generation/upload", () => {
  beforeEach(() => {
    routeMocks.upload.mockReset();
    routeMocks.upload.mockResolvedValue("https://auth.brewai.de/storage/v1/object/sign/generated-images/x");
  });

  it("speichert kein HTML, das sich als PNG ausgibt", async () => {
    const response = await uploadRoute(uploadRequest(text("<html><script>alert(1)</script></html>"), "image/png", "x.png"));
    expect(response.status).toBe(400);
    expect(routeMocks.upload).not.toHaveBeenCalled();
  });

  it("nimmt echte PNG-Dateien weiterhin an", async () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d);
    const response = await uploadRoute(uploadRequest(png, "image/png", "ok.png"));
    expect(response.status).toBe(200);
    expect(routeMocks.upload).toHaveBeenCalledOnce();
  });
});
