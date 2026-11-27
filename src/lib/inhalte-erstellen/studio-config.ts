// Nur Typen: ein Wert-Import zieht zod (~105 KB) in das Client-Bundle von /inhalte-erstellen.
import type { HyperrealisticInput, SocialPostInput } from "@/app/(dashboard)/inhalte-erstellen/lib/schemas";
import { hasUsableBeerEtikett, sanitizeProduktKategorie, type DashboardBeer, type DashboardCharacter, type ProduktKategorie } from "@/lib/dashboard/metadata";
import { aspectRatioToOutputDimensions } from "@/lib/openai/imageAspectRatio";

export const ASPECT_OPTIONS = ["1:1", "4:5", "3:4", "9:16", "4:3", "16:9"] as const;
export const CHARACTER_ASPECTS = ["4:5", "3:4", "9:16"] as const;
export const VARIANT_OPTIONS = [1, 2, 3] as const;
export const MAX_EXTRA_REFS = 3;
export const MAX_MODEL_REFS = 4;

export type Aspect = (typeof ASPECT_OPTIONS)[number];
export type VariantCount = (typeof VARIANT_OPTIONS)[number];
export type StudioMode = "produktfoto" | "social";
export type ReferenceRole = "product" | "person" | "scene" | "look";
export type LabelFidelity = "normal" | "hoch";

export type ExtraReference = {
  name: string;
  dataUrl: string;
  role: "scene" | "look";
};

export type BeerOverrides = {
  bierstil?: string;
  flaschenTyp?: HyperrealisticInput["flaschenTyp"];
  flaschenfarbe?: HyperrealisticInput["flaschenfarbe"];
  glasTyp?: HyperrealisticInput["glasTyp"];
};

export type StudioDraft = {
  mode: StudioMode;
  postZiel?: SocialPostInput["postZiel"];
  headline?: string;
  subline?: string;
  ctaText?: string;
  produktKategorie: ProduktKategorie;
  selectedBeerId: string | null;
  selectedCharacterId: string | null;
  beerOverrides: BeerOverrides;
  keepLabel: boolean;
  applyBrandLook: boolean;
  labelFidelity: LabelFidelity;
  userPrompt: string;
  extraReferences: ExtraReference[];
  aspectRatio: Aspect;
  variantCount: VariantCount;
  photoStyle: NonNullable<HyperrealisticInput["photoStyle"]>;
  hyperreal: boolean;
  behaelter: NonNullable<HyperrealisticInput["behaelter"]>;
  szene: HyperrealisticInput["szene"];
  tageszeit: HyperrealisticInput["tageszeit"];
  personenModus: NonNullable<HyperrealisticInput["personenModus"]>;
  gruppenAnzahl: HyperrealisticInput["gruppenAnzahl"];
  gruppenTyp: HyperrealisticInput["gruppenTyp"];
  gruppenDynamik: HyperrealisticInput["gruppenDynamik"];
  stimmungTrend: NonNullable<HyperrealisticInput["stimmungTrend"]>;
  shotType: NonNullable<HyperrealisticInput["shotType"]>;
  extras: string[];
  presetNote: string;
  presetId: string | null;
  revision: number;
};

export type StudioWorkspace = {
  beers: DashboardBeer[];
  characters: DashboardCharacter[];
  brandLabelUrl: string;
  breweryName: string;
  profileMode: "undecided" | "guided" | "skip";
  profileComplete: boolean;
};

export type StudioIssue = { code: string; message: string };

export type GenerationSnapshot = {
  mode: StudioMode;
  payload: HyperrealisticInput | SocialPostInput;
  keepLabel: boolean;
  applyBrandLook: boolean;
  aspectRatio: Aspect;
  outputDimensions: { width: number; height: number };
  variantCount: VariantCount;
  beerId: string | null;
  characterId: string | null;
  referenceRoles: Array<{ role: ReferenceRole; label: string }>;
  createdAt: string;
};

export function beersRevision(
  beers: Array<{
    id: string;
    name: string;
    produktKategorie?: string;
    bierstil: string;
    flaschenTyp: string;
    flaschenfarbe: string;
  }>,
): string {
  const body = beers
    .map((beer) => `${beer.id}\t${beer.name}\t${beer.produktKategorie ?? "bier"}\t${beer.bierstil}\t${beer.flaschenTyp}\t${beer.flaschenfarbe}`)
    .sort()
    .join("\n");
  let hash = 2166136261;
  for (let i = 0; i < body.length; i += 1) {
    hash ^= body.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `v${beers.length}-${(hash >>> 0).toString(16)}`;
}

export function effectiveAspectRatio(aspectRatio: Aspect, hasCharacter: boolean): Aspect {
  if (!hasCharacter) return aspectRatio;
  return (CHARACTER_ASPECTS as readonly string[]).includes(aspectRatio) ? aspectRatio : "4:5";
}

export function extraRefCapacity(characterRefCount: number, hasProductRef: boolean): number {
  const identity = Math.max(0, characterRefCount) + (hasProductRef ? 1 : 0);
  return Math.max(0, Math.min(MAX_EXTRA_REFS, MAX_MODEL_REFS - identity));
}

export function selectedBeerFromId(
  beers: DashboardBeer[],
  selectedBeerId: string | null,
): DashboardBeer | null {
  if (!selectedBeerId) return null;
  return beers.find((beer) => beer.id === selectedBeerId) ?? null;
}

export function selectedCharacterFromId(
  characters: DashboardCharacter[],
  selectedCharacterId: string | null,
): DashboardCharacter | null {
  if (!selectedCharacterId) return null;
  return characters.find((character) => character.id === selectedCharacterId) ?? null;
}

export function derivedBeerFields(
  beer: DashboardBeer | null,
  overrides: BeerOverrides,
  fallback: {
    produktKategorie?: ProduktKategorie;
    bierstil: string;
    flaschenTyp: HyperrealisticInput["flaschenTyp"];
    flaschenfarbe: HyperrealisticInput["flaschenfarbe"];
    glasTyp?: HyperrealisticInput["glasTyp"];
  },
) {
  const produktKategorie = sanitizeProduktKategorie(beer?.produktKategorie ?? fallback.produktKategorie);
  const defaultStil = produktKategorie === "bier" ? "helles" : produktKategorie;
  return {
    produktKategorie,
    bierstil: overrides.bierstil || beer?.bierstil || fallback.bierstil || defaultStil,
    flaschenTyp: (overrides.flaschenTyp ||
      (beer?.flaschenTyp as HyperrealisticInput["flaschenTyp"] | undefined) ||
      fallback.flaschenTyp) as HyperrealisticInput["flaschenTyp"],
    flaschenfarbe: (overrides.flaschenfarbe || beer?.flaschenfarbe || fallback.flaschenfarbe) as HyperrealisticInput["flaschenfarbe"],
    glasTyp: (overrides.glasTyp ||
      (beer?.glasTyp as HyperrealisticInput["glasTyp"] | undefined) ||
      fallback.glasTyp) as HyperrealisticInput["glasTyp"] | undefined,
  };
}

export function productImageUrl(beer: DashboardBeer | null, brandLabelUrl: string): string {
  if (beer) return beer.etikettUrl?.trim() || "";
  return brandLabelUrl.trim();
}

export function characterImageUrls(character: DashboardCharacter | null): string[] {
  return (character?.referenceImageUrls ?? []).filter((url) => hasUsableBeerEtikett(url)).slice(0, 3);
}

export function resolveLabelIntent(input: {
  keepLabel?: boolean;
  applyBrandLook?: boolean;
  stiltreue?: "frei" | "normal" | "hoch";
  etikettModus?: "marke" | "generisch";
}): {
  keepLabel: boolean;
  applyBrandLook: boolean;
  etikettModus: "marke" | "generisch";
  stiltreue: "frei" | "normal" | "hoch";
} {
  const keepLabel =
    input.keepLabel ??
    (input.etikettModus ? input.etikettModus === "marke" : input.stiltreue !== "frei");
  const applyBrandLook = input.applyBrandLook ?? true;
  const etikettModus = keepLabel ? "marke" : "generisch";
  const stiltreue = keepLabel ? (input.stiltreue === "normal" ? "normal" : "hoch") : "frei";
  return { keepLabel, applyBrandLook, etikettModus, stiltreue };
}

export function validateStudioRequest(input: {
  mode: StudioMode;
  draft: Pick<
    StudioDraft,
    | "keepLabel"
    | "applyBrandLook"
    | "labelFidelity"
    | "selectedBeerId"
    | "selectedCharacterId"
    | "extraReferences"
    | "aspectRatio"
    | "headline"
    | "userPrompt"
    | "presetId"
  >;
  workspace: Pick<StudioWorkspace, "beers" | "characters" | "brandLabelUrl" | "profileMode" | "profileComplete">;
  productImageReady: boolean;
}): { ok: true } | { ok: false; issues: StudioIssue[] } {
  const issues: StudioIssue[] = [];
  const beer = selectedBeerFromId(input.workspace.beers, input.draft.selectedBeerId);
  const character = selectedCharacterFromId(input.workspace.characters, input.draft.selectedCharacterId);
  const keepLabel = input.workspace.profileMode === "skip" ? false : input.draft.keepLabel;
  const productUrl = productImageUrl(beer, input.workspace.brandLabelUrl);
  const characterRefs = characterImageUrls(character);
  const hasProduct = keepLabel && Boolean(productUrl) && input.productImageReady;
  const room = extraRefCapacity(characterRefs.length, hasProduct);

  if (keepLabel && !hasProduct) {
    issues.push({
      code: "product_required",
      message: beer
        ? `Für „${beer.name}“ fehlt ein ladbares Flaschenfoto.`
        : "Bitte eine Sorte mit Flaschenfoto wählen oder das Markenfoto laden.",
    });
  }

  if (character) {
    if (characterRefs.length === 0) {
      issues.push({
        code: "character_refs",
        message: `Für „${character.name}“ fehlen ladbare Personenfotos. Bitte unter Markenprofil ersetzen.`,
      });
    }
    if (!hasProduct) {
      issues.push({
        code: "character_needs_product",
        message: "Ein Charakter braucht ein Produktfoto. „Etikett erhalten“ eingeschaltet lassen und eine Sorte mit Foto wählen.",
      });
    }
  }

  if (input.draft.extraReferences.length > room) {
    issues.push({
      code: "extra_refs_overflow",
      message:
        room === 0
          ? "Mit dieser Produkt- und Personenauswahl passen keine zusätzlichen Referenzbilder."
          : `Es passen nur noch ${room} Zusatzbild${room === 1 ? "" : "er"} — bitte überzählige entfernen.`,
    });
  }

  if (input.mode === "social") {
    if (input.workspace.profileMode !== "guided" || !input.workspace.profileComplete) {
      issues.push({
        code: "brand_required",
        message: "Social-Posts mit Text brauchen ein aktives Markenprofil.",
      });
    }
    if (!input.draft.headline?.trim()) {
      issues.push({
        code: "headline_required",
        message: "Bitte eine Headline eingeben oder einen Textvorschlag übernehmen.",
      });
    }
  } else if (!input.draft.userPrompt.trim() && !input.draft.presetId) {
    issues.push({
      code: "prompt_required",
      message: "Bitte eine Motivbeschreibung schreiben oder eine Vorlage wählen.",
    });
  }

  if (character && !(CHARACTER_ASPECTS as readonly string[]).includes(input.draft.aspectRatio)) {
    issues.push({
      code: "character_aspect",
      message: "Mit Charakter sind nur die Hochformate 4:5, 3:4 und 9:16 möglich.",
    });
  }

  return issues.length ? { ok: false, issues } : { ok: true };
}

export function stiltreueFromDraft(draft: Pick<StudioDraft, "keepLabel" | "labelFidelity" | "applyBrandLook">): {
  stiltreue: "frei" | "normal" | "hoch";
  etikettModus: "marke" | "generisch";
  keepLabel: boolean;
  applyBrandLook: boolean;
} {
  return {
    keepLabel: draft.keepLabel,
    applyBrandLook: draft.applyBrandLook,
    etikettModus: draft.keepLabel ? "marke" : "generisch",
    stiltreue: draft.keepLabel ? draft.labelFidelity : "frei",
  };
}

export function snapshotFromPayload(input: {
  mode: StudioMode;
  payload: HyperrealisticInput | SocialPostInput;
  beerId: string | null;
  characterId: string | null;
  extraRoles: Array<{ role: "scene" | "look"; label: string }>;
  beerName?: string;
  characterName?: string;
}): GenerationSnapshot {
  const resolved = resolveLabelIntent(input.payload);
  const aspectRatio = effectiveAspectRatio(input.payload.aspectRatio, Boolean(input.payload.characterName));
  const referenceRoles: GenerationSnapshot["referenceRoles"] = [];
  if (resolved.keepLabel) {
    referenceRoles.push({ role: "product", label: input.beerName?.trim() || "Produkt" });
  }
  if (input.characterName?.trim()) {
    referenceRoles.push({ role: "person", label: input.characterName.trim() });
  }
  for (const extra of input.extraRoles) referenceRoles.push(extra);
  return {
    mode: input.mode,
    payload: { ...input.payload, aspectRatio, ...resolved },
    keepLabel: resolved.keepLabel,
    applyBrandLook: resolved.applyBrandLook,
    aspectRatio,
    outputDimensions: aspectRatioToOutputDimensions(aspectRatio),
    variantCount: (input.payload.variantCount ?? 1) as VariantCount,
    beerId: input.beerId,
    characterId: input.characterId,
    referenceRoles,
    createdAt: new Date().toISOString(),
  };
}

export function suggestionIsCurrent(requestEpoch: number, currentEpoch: number): boolean {
  return requestEpoch === currentEpoch;
}
