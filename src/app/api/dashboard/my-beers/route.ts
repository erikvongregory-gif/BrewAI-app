import { workspaceResourceUser } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import {
  AssortmentConflictError,
  beersRevision,
  readDashboardBeers,
  replaceDashboardBeers,
  upsertDashboardBeer,
} from "@/lib/dashboard/beer-store";
import {
  MAX_MY_BEERS,
  markUserEditedBeers,
  sanitizeProduktKategorie,
  type DashboardBeer,
} from "@/lib/dashboard/metadata";
import { uploadUserImageToStorage } from "@/lib/supabase/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

const beerSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  bierstil: z.string().min(1).max(60),
  produktKategorie: z.enum(["bier", "limonade", "tafelwasser", "mineralwasser"]).optional(),
  flaschenTyp: z.string().min(1).max(60),
  flaschenfarbe: z.enum(["braun", "gruen", "klar"]),
  glasTyp: z.string().min(1).max(40).optional(),
  filtrierung: z.enum(["filtriert", "unfiltriert"]).optional(),
  etikettUrl: z.string().max(1200).optional().default(""),
  createdAt: z.string().max(40).optional().default(""),
  /** Optionaler Etikett-Upload — wird server-seitig als kurze HTTPS-URL persistiert. */
  etikettPayload: z
    .object({
      base64: z.string().min(32).max(600_000),
      mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
    })
    .optional(),
});

const putSchema = z.object({
  beers: z.array(beerSchema).max(MAX_MY_BEERS),
  expectedRevision: z.string().min(1).max(80),
});

const postSchema = z.object({
  beer: beerSchema,
});

function toHttpUrlOrEmpty(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

async function requireBeerUser(req: Request, write: boolean) {
  const rateError = await enforceRateLimitPersistent(req, {
    keyPrefix: "dashboard-my-beers",
    limit: 20,
    windowMs: 60_000,
  });
  if (rateError) return { error: rateError as NextResponse };
  if (write) {
    const originError = enforceSameOrigin(req);
    if (originError) return { error: originError };
  }
  if (!isSupabaseConfigured()) {
    return { error: NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 }) };
  }
  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !(await hasPassedTwoFactor(user))) {
    return { error: NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 }) };
  }
  if (user) {
    try {
      user = await workspaceResourceUser(user, write);
    } catch {
      return { error: NextResponse.json({ error: "Teamzugriff nicht erlaubt." }, { status: 403 }) };
    }
  }
  if (!user) return { error: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }) };
  return { user };
}

async function beerFromParsed(
  userId: string,
  beer: z.infer<typeof beerSchema>,
): Promise<DashboardBeer | NextResponse> {
  let etikettUrl = toHttpUrlOrEmpty(beer.etikettUrl);
  if (beer.etikettPayload) {
    try {
      const buffer = Buffer.from(beer.etikettPayload.base64, "base64");
      if (buffer.byteLength < 32) {
        return NextResponse.json(
          { error: `Etikett für „${beer.name}“ ist leer oder beschädigt.` },
          { status: 400 },
        );
      }
      etikettUrl = await uploadUserImageToStorage({
        userId,
        buffer,
        mime: beer.etikettPayload.mime,
        folder: "beer-labels",
      });
    } catch (uploadError) {
      console.warn("[dashboard/my-beers] Etikett-Upload fehlgeschlagen:", uploadError);
      return NextResponse.json(
        { error: `Etikett für „${beer.name}“ konnte nicht gespeichert werden. Bitte erneut versuchen.` },
        { status: 502 },
      );
    }
  }
  return {
    id: beer.id,
    name: beer.name.trim(),
    produktKategorie: sanitizeProduktKategorie(beer.produktKategorie),
    bierstil: beer.bierstil,
    flaschenTyp: beer.flaschenTyp,
    flaschenfarbe: beer.flaschenfarbe,
    glasTyp: beer.glasTyp,
    filtrierung: beer.filtrierung,
    etikettUrl,
    createdAt: beer.createdAt || new Date().toISOString(),
  };
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }
  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { try { user = await workspaceResourceUser(user, false); } catch { return NextResponse.json({error:"Teamzugriff nicht erlaubt."},{status:403}); } }
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  try {
    const beers = await readDashboardBeers(user.id);
    return NextResponse.json({ beers, revision: beersRevision(beers) });
  } catch {
    return NextResponse.json({ error: "Sortiment konnte nicht geladen werden." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireBeerUser(req, true);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join(".")}: ${issue.message}` : "Validierung fehlgeschlagen.";
    return NextResponse.json({ error: `Ungültige Bier-Daten (${detail}).` }, { status: 400 });
  }

  const beer = await beerFromParsed(auth.user.id, parsed.data.beer);
  if (beer instanceof NextResponse) return beer;
  try {
    // Über die Sortimentsverwaltung angelegt bzw. bearbeitet: ein Neuscan derselben Marke überschreibt sie nicht.
    const saved = await upsertDashboardBeer(auth.user.id, { ...beer, nutzerBestaetigt: true });
    return NextResponse.json({ ok: true, beers: saved, revision: beersRevision(saved) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sortiment konnte nicht gespeichert werden.";
    const conflict = /maximal/i.test(message);
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 500 });
  }
}

export async function PUT(req: Request) {
  const auth = await requireBeerUser(req, true);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join(".")}: ${issue.message}` : "Validierung fehlgeschlagen.";
    return NextResponse.json({ error: `Ungültige Bier-Daten (${detail}).` }, { status: 400 });
  }

  const beers: DashboardBeer[] = [];
  for (const raw of parsed.data.beers) {
    const beer = await beerFromParsed(auth.user.id, raw);
    if (beer instanceof NextResponse) return beer;
    beers.push(beer);
  }

  let stored: DashboardBeer[] = [];
  try {
    stored = await readDashboardBeers(auth.user.id);
  } catch {
    return NextResponse.json({ error: "Sortiment konnte nicht geladen werden." }, { status: 500 });
  }
  // Scan-Belege bleiben erhalten; neue oder geänderte Sorten gelten als vom Nutzer bestätigt.
  const sanitized = markUserEditedBeers(beers, stored);
  try {
    const saved = await replaceDashboardBeers(auth.user.id, sanitized, {
      expectedRevision: parsed.data.expectedRevision,
    });
    return NextResponse.json({ ok: true, beers: saved, revision: beersRevision(saved) });
  } catch (error) {
    if (error instanceof AssortmentConflictError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    return NextResponse.json({ error: "Sortiment konnte nicht gespeichert werden." }, { status: 500 });
  }
}
