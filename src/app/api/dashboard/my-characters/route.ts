import { workspaceResourceUser, workspaceErrorResponse } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { readDashboardCharacters, replaceDashboardCharacters } from "@/lib/dashboard/character-store";
import {
  MAX_CHARACTER_REFERENCE_IMAGES,
  MAX_MY_CHARACTERS,
  sanitizeDashboardCharacters,
  type DashboardCharacter,
} from "@/lib/dashboard/metadata";
import { uploadUserImageToStorage } from "@/lib/supabase/storage";
import { buildCharacterAppearanceLock } from "@/lib/dashboard/character-appearance";

export const runtime = "nodejs";
export const maxDuration = 90;

const imagePayloadSchema = z.object({
  base64: z.string().min(32).max(600_000),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const characterSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  role: z.string().max(60).optional().default(""),
  referenceImageUrls: z.array(z.string().max(2500)).max(MAX_CHARACTER_REFERENCE_IMAGES).optional().default([]),
  createdAt: z.string().max(40).optional().default(""),
  appearanceLock: z.string().max(600).optional().default(""),
  /** Neue Fotos — werden server-seitig als HTTPS-URLs persistiert. */
  referencePayloads: z.array(imagePayloadSchema).max(MAX_CHARACTER_REFERENCE_IMAGES).optional(),
});

const putSchema = z.object({
  characters: z.array(characterSchema).max(MAX_MY_CHARACTERS),
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

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }
  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await hasPassedTwoFactor(user))) {
    return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  }
  if (user) {
    try {
      user = await workspaceResourceUser(user, false);
    } catch (e) {
      return workspaceErrorResponse(e);
    }
  }
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  try {
    let characters = await readDashboardCharacters(user.id);
    // Einmalig Appearance-Lock nachziehen (Higgsfield Character-Sheet-Stil).
    const needsLock = characters.filter((c) => !c.appearanceLock.trim() && c.referenceImageUrls.length > 0);
    if (needsLock.length) {
      const upgraded = await Promise.all(
        characters.map(async (c) => {
          if (c.appearanceLock.trim() || !c.referenceImageUrls.length) return c;
          const appearanceLock = await buildCharacterAppearanceLock({
            name: c.name,
            role: c.role,
            imageUrls: c.referenceImageUrls,
          });
          return { ...c, appearanceLock };
        }),
      );
      characters = await replaceDashboardCharacters(user.id, upgraded);
    }
    return NextResponse.json({ characters });
  } catch {
    return NextResponse.json({ error: "Charaktere konnten nicht geladen werden." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const rateError = await enforceRateLimitPersistent(req, {
    keyPrefix: "dashboard-my-characters",
    limit: 20,
    windowMs: 60_000,
  });
  if (rateError) return rateError;
  const originError = enforceSameOrigin(req);
  if (originError) return originError;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }

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
    return NextResponse.json({ error: `Ungültige Charakter-Daten (${detail}).` }, { status: 400 });
  }

  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await hasPassedTwoFactor(user))) {
    return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  }
  if (user) {
    try {
      user = await workspaceResourceUser(user, true);
    } catch (e) {
      return workspaceErrorResponse(e);
    }
  }
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const characters: DashboardCharacter[] = [];
  for (const character of parsed.data.characters) {
    const existingUrls = (character.referenceImageUrls ?? [])
      .map(toHttpUrlOrEmpty)
      .filter(Boolean)
      .slice(0, MAX_CHARACTER_REFERENCE_IMAGES);
    const uploaded: string[] = [];
    for (const payload of character.referencePayloads ?? []) {
      if (existingUrls.length + uploaded.length >= MAX_CHARACTER_REFERENCE_IMAGES) break;
      try {
        const buffer = Buffer.from(payload.base64, "base64");
        if (buffer.byteLength < 32) {
          return NextResponse.json(
            { error: `Foto für „${character.name}“ ist leer oder beschädigt.` },
            { status: 400 },
          );
        }
        uploaded.push(
          await uploadUserImageToStorage({
            userId: user.id,
            buffer,
            mime: payload.mime,
            folder: "character-refs",
          }),
        );
      } catch (uploadError) {
        console.warn("[dashboard/my-characters] Foto-Upload fehlgeschlagen:", uploadError);
        return NextResponse.json(
          { error: `Foto für „${character.name}“ konnte nicht gespeichert werden. Bitte erneut versuchen.` },
          { status: 502 },
        );
      }
    }
    const referenceImageUrls = [...existingUrls, ...uploaded].slice(0, MAX_CHARACTER_REFERENCE_IMAGES);
    if (referenceImageUrls.length < 1) {
      return NextResponse.json(
        { error: `„${character.name}“ braucht mindestens ein Foto.` },
        { status: 400 },
      );
    }
    let appearanceLock = character.appearanceLock?.trim() ?? "";
    // Neu oder ohne Lock: Appearance aus Fotos (Higgsfield Character-Sheet-Stil).
    if (!appearanceLock || uploaded.length > 0) {
      appearanceLock = await buildCharacterAppearanceLock({
        name: character.name.trim(),
        role: character.role?.trim(),
        imageUrls: referenceImageUrls,
      });
    }
    characters.push({
      id: character.id,
      name: character.name.trim(),
      role: character.role?.trim() ?? "",
      referenceImageUrls,
      appearanceLock,
      createdAt: character.createdAt || new Date().toISOString(),
    });
  }

  const sanitized = sanitizeDashboardCharacters(characters);
  try {
    const saved = await replaceDashboardCharacters(user.id, sanitized);
    return NextResponse.json({ ok: true, characters: saved });
  } catch (saveError) {
    console.error("[dashboard/my-characters] save failed:", saveError);
    const detail = saveError instanceof Error ? saveError.message : "unbekannt";
    return NextResponse.json(
      { error: process.env.NODE_ENV === "development" ? detail : "Charaktere konnten nicht gespeichert werden." },
      { status: 500 },
    );
  }
}
