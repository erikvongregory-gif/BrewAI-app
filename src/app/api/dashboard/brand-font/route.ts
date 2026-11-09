import { workspaceResourceUser } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { uploadBrandFontToStorage } from "@/lib/supabase/storage";
import { matchesFontExtension } from "@/lib/security/fileSignature";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_FONT_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXT = new Set(["woff2", "woff", "ttf", "otf"]);

function extFromName(name: string): string | null {
  const match = name.toLowerCase().match(/\.(woff2|woff|ttf|otf)$/);
  return match?.[1] ?? null;
}

export async function POST(req: Request) {
  const rateError = await enforceRateLimitPersistent(req, {
    keyPrefix: "dashboard-brand-font",
    limit: 10,
    windowMs: 60_000,
  });
  if (rateError) return rateError;
  const originError = enforceSameOrigin(req);
  if (originError) return originError;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }

  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { try { user = await workspaceResourceUser(user, true); } catch { return NextResponse.json({error:"Teamzugriff nicht erlaubt."},{status:403}); } }
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Schriftdatei fehlt." }, { status: 400 });
  }

  const ext = extFromName(file.name);
  if (!ext || !ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: "Nur .woff2, .woff, .ttf oder .otf erlaubt." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_FONT_BYTES) {
    return NextResponse.json({ error: "Schriftdatei ist leer oder zu groß (max. 2 MB)." }, { status: 400 });
  }
  // Dateiendung ist frei wählbar: Inhalt per Signatur gegenprüfen (wOF2, wOFF, TrueType, OTTO).
  if (!matchesFontExtension(ext, buffer)) {
    return NextResponse.json({ error: "Die Datei ist keine gültige Schriftdatei." }, { status: 400 });
  }

  const fontNameRaw = formData.get("fontName");
  const fontName =
    typeof fontNameRaw === "string" && fontNameRaw.trim()
      ? fontNameRaw.trim().slice(0, 80)
      : file.name.replace(/\.[^.]+$/, "").slice(0, 80);

  try {
    const url = await uploadBrandFontToStorage({
      userId: user.id,
      buffer,
      ext: ext as "woff2" | "woff" | "ttf" | "otf",
    });
    return NextResponse.json({ ok: true, url, fontName });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Schrift-Upload fehlgeschlagen." },
      { status: 500 },
    );
  }
}
