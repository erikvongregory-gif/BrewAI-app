import { createAdminClient } from "@/lib/supabase/admin";
import { buildPrunedAuthUserData, pruneBloatedAuthMetadata } from "@/lib/auth/pruneAuthMetadata";
import {
  clampBrandSettingsFields,
  sanitizeDashboardSettings,
} from "@/lib/dashboard/settingsPayload";
import {
  persistSuggestedBeerLabels,
  replaceSuggestedBeers,
  type SuggestedBeerVariety,
} from "@/lib/brand/beer-catalog-intake";
import { getFreshUserMetadata } from "@/lib/dashboard/freshMetadata";
import { readDashboardBeers, replaceDashboardBeers } from "@/lib/dashboard/beer-store";
import {
  getDashboardMetadata,
  mergeDashboardMetadata,
  type DashboardBeer,
  type DashboardSettings,
} from "@/lib/dashboard/metadata";
import { storeBrandReferenceImagesAsUrls } from "@/lib/brand/persist-reference-urls";
import { parseBrandReferenceIdFromUrl, repairBrandReferenceImageUrls } from "@/lib/brand/reference-image-store";
import { normalizeWebsiteUrl } from "@/lib/brand/url-intake";
import type { BrandFieldStatusMap } from "@/lib/dashboard/brandProfile";

/** Sortiment gehört zur aktiven Marke — Domain, sonst Brauereiname. */
export function brandCatalogKey(input: { brandWebsiteUrl?: string; breweryName?: string }): string {
  const normalized = normalizeWebsiteUrl(input.brandWebsiteUrl ?? "");
  if (normalized) {
    try {
      return new URL(normalized).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      /* fall through */
    }
  }
  return (input.breweryName ?? "").trim().toLowerCase();
}

export type BrandReferencePayload = {
  base64: string;
  mime: "image/jpeg" | "image/png" | "image/webp";
};

export type SaveBrandProfileInput = {
  breweryName: string;
  brandTone: string;
  brandColors: string;
  brandDos: string;
  brandDonts: string;
  brandInstagramUrl?: string;
  brandWebsiteUrl?: string;
  brandProfileSource: "url" | "instagram" | "manual";
  brandReferenceImageUrls?: string[];
  /** Bester Packshot (Etikett-Traeger) aus der Analyse — Quelle fuer Etikett-Treue. */
  brandLabelReferenceUrl?: string;
  brandHeadlineFontName?: string;
  brandFontFileUrl?: string;
  referenceImagePayloads?: BrandReferencePayload[];
  suggestedBeers?: SuggestedBeerVariety[];
  /**
   * Belegstatus je Feld aus dem Prüfschritt (Scan-Beleg bzw. „bestaetigt“ für vom Nutzer geänderte Felder).
   * Fehlt er (manuell, Instagram, alte Clients), gilt das bisherige Verhalten. Wird erst gespeichert,
   * wenn sanitizeDashboardSettings das Feld übernimmt (Änderungswunsch F1, Audit 03).
   */
  brandFieldStatus?: BrandFieldStatusMap;
};

function filterHttpUrls(urls: string[] | undefined): string[] {
  if (!urls?.length) return [];
  const out: string[] = [];
  for (const raw of urls) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      out.push(parsed.toString());
      if (out.length >= 10) break;
    } catch {
      /* skip */
    }
  }
  return out;
}

function normalizeOptionalUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  return normalizeWebsiteUrl(trimmed) ?? "";
}

function normalizeHttpUrlOrEmpty(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export async function resolveBrandReferenceImageUrls(input: {
  referenceImageUrls?: string[];
  referenceImagePayloads?: BrandReferencePayload[];
}): Promise<string[]> {
  const existing = filterHttpUrls(input.referenceImageUrls);
  if (existing.length > 0) return existing.slice(0, 5);

  if (!input.referenceImagePayloads?.length) return [];

  const uploaded = await storeBrandReferenceImagesAsUrls(
    input.referenceImagePayloads.map((image) => ({
      base64: image.base64,
      mime: image.mime,
    })),
  );
  return uploaded.slice(0, 5);
}

export async function loadLatestUserMetadata(userId: string, fallback: unknown): Promise<unknown> {
  void userId;
  return prepareMetadataForSave(fallback);
}

export function prepareMetadataForSave(userMetadata: unknown): unknown {
  const pruned = buildPrunedAuthUserData(userMetadata);
  if (pruned) return pruned;
  const partial = pruneBloatedAuthMetadata(userMetadata);
  if (partial) return partial;
  return userMetadata;
}

export function buildActivatedBrandSettings(params: {
  latestMetadata: unknown;
  origin: string;
  input: SaveBrandProfileInput;
  referenceImageUrls: string[];
  analyzedAt?: string;
}): DashboardSettings {
  const existing = sanitizeDashboardSettings(getDashboardMetadata(params.latestMetadata).settings);
  const mergedInput = clampBrandSettingsFields({
    ...existing,
    brandProfileMode: "guided",
    breweryName: params.input.breweryName,
    brandTone: params.input.brandTone,
    brandColors: params.input.brandColors,
    brandDos: params.input.brandDos,
    brandDonts: params.input.brandDonts,
    brandInstagramUrl: normalizeOptionalUrl(params.input.brandInstagramUrl),
    brandWebsiteUrl: normalizeOptionalUrl(params.input.brandWebsiteUrl),
    brandProfileSource: params.input.brandProfileSource,
    brandReferenceImageUrls: params.referenceImageUrls,
    brandLabelReferenceUrl: normalizeHttpUrlOrEmpty(params.input.brandLabelReferenceUrl),
    brandHeadlineFontName: params.input.brandHeadlineFontName?.trim() || existing.brandHeadlineFontName || "",
    brandFontFileUrl: normalizeHttpUrlOrEmpty(params.input.brandFontFileUrl) || existing.brandFontFileUrl || "",
    brandAnalyzedAt: params.analyzedAt ?? existing.brandAnalyzedAt ?? new Date().toISOString(),
    // Immer setzen (auch undefined): ein alter Belegstatus darf nicht an neuen Profilwerten hängen bleiben.
    brandFieldStatus: params.input.brandFieldStatus,
  });

  const sanitized = sanitizeDashboardSettings(mergedInput);
  const repairedRefs = repairBrandReferenceImageUrls(
    params.latestMetadata,
    params.origin,
    sanitized.brandReferenceImageUrls,
  );

  return {
    ...sanitized,
    brandReferenceImageUrls: repairedRefs.urls,
  };
}

export function buildUserMetadataForBrandSave(params: {
  latestMetadata: unknown;
  settings: DashboardSettings;
  myBeers?: DashboardBeer[];
}): Record<string, unknown> {
  void params.myBeers;
  const merged = mergeDashboardMetadata(params.latestMetadata, {
    settings: params.settings,
  });
  const dashboard = (merged as { dashboard?: Record<string, unknown> }).dashboard;
  const keepsInternalReferenceStore = params.settings.brandReferenceImageUrls.some(
    (url) => parseBrandReferenceIdFromUrl(url) !== null,
  );

  if (dashboard && typeof dashboard === "object") {
    // Sortiment liegt in dashboard_beers — nie wieder in Auth-Cookies.
    if ("myBeers" in dashboard) delete dashboard.myBeers;
    if (!keepsInternalReferenceStore && "brandReferenceImages" in dashboard) {
      delete dashboard.brandReferenceImages;
    }
  }

  return {
    ...merged,
    brewery: params.settings.breweryName || null,
  };
}

export type PersistBrandProfileResult = {
  settings: DashboardSettings;
  referenceImageUrls: string[];
  myBeers?: DashboardBeer[];
};

export async function persistBrandProfileForUser(params: {
  userId: string;
  latestMetadata: unknown;
  origin: string;
  input: SaveBrandProfileInput;
  referenceImageUrls: string[];
}): Promise<PersistBrandProfileResult> {
  const settings = buildActivatedBrandSettings({
    latestMetadata: params.latestMetadata,
    origin: params.origin,
    input: params.input,
    referenceImageUrls: params.referenceImageUrls,
  });

  const freshMetadata = await getFreshUserMetadata(params.userId, params.latestMetadata);
  const previousSettings = sanitizeDashboardSettings(getDashboardMetadata(freshMetadata).settings);
  const previousCatalogKey = brandCatalogKey(previousSettings);
  const nextCatalogKey = brandCatalogKey({
    brandWebsiteUrl: params.input.brandWebsiteUrl,
    breweryName: params.input.breweryName,
  });
  const brandChanged = Boolean(nextCatalogKey) && previousCatalogKey !== nextCatalogKey;

  let existingBeers: DashboardBeer[] = [];
  try {
    existingBeers = await readDashboardBeers(params.userId);
  } catch {
    existingBeers = getDashboardMetadata(freshMetadata).myBeers ?? [];
  }
  let myBeers: DashboardBeer[] | undefined;
  if (params.input.suggestedBeers && params.input.suggestedBeers.length > 0) {
    const withLabels = await persistSuggestedBeerLabels(params.userId, params.input.suggestedBeers);
    // Beim Aktivieren ist der Scan die Quelle der Wahrheit — fremde Sorten fliegen raus.
    // Ausnahme bei derselben Marke: vom Nutzer angelegte/bearbeitete Sorten bleiben samt Korrekturen.
    myBeers = replaceSuggestedBeers(existingBeers, withLabels, { keepUserConfirmed: !brandChanged });
  } else if (brandChanged) {
    // Neue Marke ohne Scan-Treffer: altes Sortiment der vorherigen Marke nicht stehen lassen.
    // Gleiche Marke ohne Treffer (z. B. Sorten im Review entfernt/Scan leer): Sortiment behalten.
    myBeers = [];
  }

  const admin = createAdminClient();
  let userMetadata = buildUserMetadataForBrandSave({
    latestMetadata: freshMetadata,
    settings,
    myBeers,
  });

  let { error } = await admin.auth.admin.updateUserById(params.userId, {
    user_metadata: userMetadata,
  });

  if (error) {
    const prunedBase = buildPrunedAuthUserData(freshMetadata) ?? buildPrunedAuthUserData(params.latestMetadata);
    if (prunedBase) {
      userMetadata = buildUserMetadataForBrandSave({
        latestMetadata: prunedBase,
        settings,
        myBeers,
      });
      ({ error } = await admin.auth.admin.updateUserById(params.userId, {
        user_metadata: userMetadata,
      }));
    }
  }

  if (error) {
    throw new Error(error.message || "Markenprofil konnte nicht gespeichert werden.");
  }

  if (myBeers) await replaceDashboardBeers(params.userId, myBeers, { force: true });

  return {
    settings,
    referenceImageUrls: settings.brandReferenceImageUrls,
    myBeers,
  };
}
