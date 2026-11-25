import type { ExtraReference, StudioDraft, StudioMode } from "./studio-config";
import { sanitizeProduktKategorie } from "@/lib/dashboard/metadata";

const DRAFT_KEY = "brewai-create-draft";
const REFS_KEY = "brewai-create-draft-refs";
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

type StoredDraft = Omit<StudioDraft, "extraReferences"> & {
  extraReferences?: ExtraReference[];
  savedAt: number;
};

type StoredRefs = {
  extraReferences: ExtraReference[];
  savedAt: number;
};

export function defaultStudioDraft(partial?: Partial<StudioDraft>): StudioDraft {
  const merged = {
    mode: "produktfoto" as const,
    postZiel: "community_engagement" as const,
    headline: "",
    subline: "",
    ctaText: "",
    selectedBeerId: null,
    selectedCharacterId: null,
    produktKategorie: "bier" as const,
    beerOverrides: {},
    keepLabel: true,
    applyBrandLook: true,
    labelFidelity: "hoch" as const,
    userPrompt: "",
    extraReferences: [] as ExtraReference[],
    aspectRatio: "4:5" as const,
    variantCount: 1 as const,
    photoStyle: "reportage" as const,
    hyperreal: false,
    behaelter: "B" as const,
    szene: "biergarten_sommer" as const,
    tageszeit: "tageslicht" as const,
    personenModus: "A" as const,
    gruppenAnzahl: "3" as const,
    gruppenTyp: "gemischt" as const,
    gruppenDynamik: "E2" as const,
    stimmungTrend: "nachhaltig" as const,
    shotType: "A" as const,
    extras: [] as string[],
    presetNote: "",
    presetId: null,
    revision: 0,
    ...partial,
  };
  return { ...merged, produktKategorie: sanitizeProduktKategorie(merged.produktKategorie) };
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function validRefs(value: unknown): ExtraReference[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item?.dataUrl?.startsWith("data:")).slice(0, 3);
}

export function readStudioDraft(): StudioDraft | null {
  if (typeof window === "undefined") return null;
  const parsed = readJson<StoredDraft>(DRAFT_KEY);
  if (!parsed || typeof parsed.savedAt !== "number") return null;
  if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
    window.localStorage.removeItem(DRAFT_KEY);
    window.localStorage.removeItem(REFS_KEY);
    return null;
  }
  const storedRefs = readJson<StoredRefs>(REFS_KEY);
  const extraReferences = storedRefs && Date.now() - storedRefs.savedAt <= MAX_AGE_MS
      ? validRefs(storedRefs.extraReferences)
      : validRefs(parsed.extraReferences);
  return defaultStudioDraft({ ...parsed, extraReferences });
}

function draftWithoutRefs(draft: StudioDraft): StoredDraft {
  return { ...draft, extraReferences: undefined, savedAt: Date.now() };
}

/** Text/Einstellungen ohne Bilddaten. */
export function writeStudioDraftMeta(draft: StudioDraft): boolean {
  return writeJson(DRAFT_KEY, draftWithoutRefs(draft));
}

/** Referenzbilder nur bei Änderung. Vorherigen Stand bei Quota nicht löschen. */
export function writeStudioDraftRefs(refs: ExtraReference[]): boolean {
  if (typeof window === "undefined") return false;
  const payload: StoredRefs = { extraReferences: refs.slice(0, 3), savedAt: Date.now() };
  if (writeJson(REFS_KEY, payload)) return true;
  if (refs.length === 0) {
    try {
      window.localStorage.removeItem(REFS_KEY);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function writeStudioDraft(draft: StudioDraft): void {
  writeStudioDraftMeta(draft);
  writeStudioDraftRefs(draft.extraReferences);
}

export function clearStudioDraft(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DRAFT_KEY);
  window.localStorage.removeItem(REFS_KEY);
}

export function isSocialMode(mode: StudioMode): boolean {
  return mode === "social";
}
