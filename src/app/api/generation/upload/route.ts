import { NextResponse } from "next/server";
import { workspaceResourceUser } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { uploadUserImageToStorage } from "@/lib/supabase/storage";
import { matchesDeclaredMime } from "@/lib/security/fileSignature";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 40 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
]);

export async function POST(req: Request) {
  const rateError = await enforceRateLimitPersistent(req, {
    keyPrefix: "generation-upload",
    limit: 30,
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

  if (user && !(await hasPassedTwoFactor(user))) {
    return NextResponse.json(
      { error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" },
      { status: 403 },
    );
  }
  if (user) {
    try {
      user = await workspaceResourceUser(user, true);
    } catch {
      return NextResponse.json({ error: "Teamzugriff nicht erlaubt." }, { status: 403 });
    }
  }
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Datei fehlt." }, { status: 400 });
  }

  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ error: "Dateityp nicht erlaubt." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Datei ist leer oder zu groß (max. 40 MB)." }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Datei ist leer oder zu groß (max. 40 MB)." }, { status: 400 });
  }
  // Der MIME-Typ kommt vom Client: Inhalt per Signatur (Magic Bytes) gegenprüfen.
  if (!matchesDeclaredMime(mime, buffer)) {
    return NextResponse.json({ error: "Dateiinhalt passt nicht zum Dateityp." }, { status: 400 });
  }

  try {
    const url = await uploadUserImageToStorage({
      userId: user.id,
      buffer,
      mime,
      folder: "generation-refs",
    });
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload fehlgeschlagen." },
      { status: 500 },
    );
  }
}
