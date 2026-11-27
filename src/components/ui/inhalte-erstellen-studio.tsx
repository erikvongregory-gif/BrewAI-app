"use client";

/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BrandProfileSetupModal, type BrandScanSuggestion } from "@/components/dashboard/BrandProfileSetupModal";
import {
  BeerCreatePanel,
  type BeerCreateDraft,
} from "@/components/studio/beers/beer-create-panel";
import { StudioIcon } from "@/components/studio/icons";
import { useStudioShell } from "@/components/studio/studio-workspace-shell";
import { STUDIO_PAD_X, useStudioPalette } from "@/components/ui/dashboard-studio-shell";
import type { HyperrealisticInput } from "@/app/(dashboard)/inhalte-erstellen/lib/schemas";
import { FLASCHEN_TYPEN, GLAS_TYPEN } from "@/app/(dashboard)/inhalte-erstellen/lib/brewing-knowledge";
import { BEER_STYLE_OPTIONS, findBeerStyle, beerStyleLabel } from "@/app/(dashboard)/inhalte-erstellen/lib/beer-styles";
import {
  OCCASION_TEMPLATES,
  sortTemplatesForDate,
  seasonBadgeLabel,
  type OccasionTemplate,
} from "@/app/(dashboard)/inhalte-erstellen/lib/occasion-templates";
import { estimateStudioImageTokenCost } from "@/lib/billing/generationTokenCost";
import { buildStudioMediaTitle } from "@/lib/inhalte-erstellen/media-title";
import { hyperrealisticSchema, socialPostSchema } from "@/app/(dashboard)/inhalte-erstellen/lib/schemas";
import type { SocialPostInput } from "@/app/(dashboard)/inhalte-erstellen/lib/schemas";
import { hasUsableBeerEtikett, MAX_MY_BEERS, type DashboardBeer } from "@/lib/dashboard/metadata";
import { readAndCompressImage, splitDataUrl } from "@/lib/images/compress-image";
import { ImageGeneration } from "@/components/ui/ai-chat-image-generation-1";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { aspectRatioToOutputDimensions } from "@/lib/openai/imageAspectRatio";

type ImageResponse = { b64_json?: string; url?: string };
type ContentTab = "produktfoto" | "kampagne" | "social";
type MobileCreatePanel = "brief" | "preview" | "settings";
type Stiltreue = "frei" | "normal" | "hoch";
type VariantCount = 1 | 2 | 3;
type Aspect = HyperrealisticInput["aspectRatio"];
type PhotoStyle = NonNullable<HyperrealisticInput["photoStyle"]>;

const WO_OPTIONS: Array<{ label: string; szene: HyperrealisticInput["szene"] }> = [
  { label: "Biergarten", szene: "biergarten_sommer" },
  { label: "Wirtshaus innen", szene: "wirtshaus_innen" },
  { label: "Rustikaler Holztisch", szene: "kueche_zuhause" },
  { label: "Wiese & Picknick", szene: "wiese_picknick" },
  { label: "Strand · Sonnenuntergang", szene: "strand_sonnenuntergang" },
  { label: "Alpenpanorama", szene: "alpenpanorama" },
  { label: "Stadtbalkon abends", szene: "stadtbalkon_abend" },
  { label: "Brauereihof", szene: "brauereihof" },
  { label: "Public Viewing", szene: "fussball_public_viewing" },
];

const ASPECT_OPTIONS: Aspect[] = ["1:1", "4:5", "3:4", "9:16", "4:3", "16:9"];
const VARIANT_OPTIONS: VariantCount[] = [1, 2, 3];
const PHOTO_STYLE_OPTIONS: Array<{ id: PhotoStyle; label: string; hint: string }> = [
  {
    id: "reportage",
    label: "Reportage",
    hint: "Candid und roh: direkter Blitz (auch tagsüber), unperfekter Crop, Flasche nebenbei — wie ein echter Schnappschuss vom Stammtisch, Fest oder Biergarten.",
  },
  {
    id: "premium",
    label: "Premium-Fotografie",
    hint: "Professionelles Fotoshooting wie für die eigene Imagekampagne: Menschen in Tracht oder im Biergarten posieren natürlich für den Fotografen, Porträtlook mit weichem Hintergrund, echte Farben. Das Etikett bleibt erkennbar.",
  },
  {
    id: "campaign",
    label: "Kampagnenmotiv",
    hint: "Inszeniertes Key Visual: Produkt dominiert den Frame, Hände reichen oder stoßen an, Untersicht oder Himmel. Im Feed bleibt oben Platz für die Headline.",
  },
];

const POST_ZIEL_OPTIONS: Array<{ id: SocialPostInput["postZiel"]; label: string }> = [
  { id: "community_engagement", label: "Community" },
  { id: "produkt_launch", label: "Launch" },
  { id: "saisonal", label: "Saisonal" },
  { id: "event_ankuendigung", label: "Event" },
  { id: "sale_aktion", label: "Aktion" },
  { id: "behind_the_scenes", label: "Behind the Scenes" },
  { id: "rezept_pairing", label: "Food Pairing" },
  { id: "edukativ_bierwissen", label: "Bierwissen" },
];

function formatDeNumber(n: number) {
  return new Intl.NumberFormat("de-DE").format(n);
}

function beerInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function imageSrc(img: ImageResponse): string {
  if (img.url) return img.url;
  if (img.b64_json) return `data:image/png;base64,${img.b64_json}`;
  return "";
}

function pixelLabel(aspect: Aspect): string {
  const { width, height } = aspectRatioToOutputDimensions(aspect);
  return `${width} × ${height} px`;
}

export function InhalteErstellenStudio({
  initialBreweryName,
  brandProfileComplete = true,
  brandProfileActive = false,
  brandProfileMode = "skip",
}: {
  userEmail?: string;
  initialProfileName?: string;
  initialBreweryName?: string;
  brandProfileComplete?: boolean;
  brandProfileActive?: boolean;
  brandProfileMode?: "undecided" | "guided" | "skip";
}) {
  const P = useStudioPalette();
  const router = useRouter();
  const { setBrandProfileActive, setContentPadding } = useStudioShell();

  const [brandProfileSetupOpen, setBrandProfileSetupOpen] = useState(false);
  const [profileComplete, setProfileComplete] = useState(brandProfileComplete);
  const [profileMode, setProfileMode] = useState(brandProfileMode);

  const [contentTab, setContentTab] = useState<ContentTab>("produktfoto");
  const [mobilePanel, setMobilePanel] = useState<MobileCreatePanel>("brief");
  const [postZiel, setPostZiel] = useState<SocialPostInput["postZiel"]>("community_engagement");
  const [headline, setHeadline] = useState("");
  const [subline, setSubline] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [suggestingCopy, setSuggestingCopy] = useState(false);
  const [userPrompt, setUserPrompt] = useState("");
  const [improving, setImproving] = useState(false);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<OccasionTemplate | null>(null);
  const [stiltreue, setStiltreue] = useState<Stiltreue>("hoch");
  const [aspectRatio, setAspectRatio] = useState<Aspect>("4:5");
  const [variantCount, setVariantCount] = useState<VariantCount>(1);
  const [requestQuality, setRequestQuality] = useState<"medium" | "high" | "ultra">("medium");
  const [photoStyle, setPhotoStyle] = useState<PhotoStyle>("reportage");

  const [was, setWas] = useState(BEER_STYLE_OPTIONS[0]);
  const [wo, setWo] = useState(WO_OPTIONS[0]);
  const [wie, setWie] = useState<HyperrealisticInput["tageszeit"]>("tageslicht");
  const [behaelter, setBehaelter] = useState<NonNullable<HyperrealisticInput["behaelter"]>>("B");
  const [flaschenTyp, setFlaschenTyp] = useState<HyperrealisticInput["flaschenTyp"]>("nrw_500");
  const [flaschenfarbe, setFlaschenfarbe] = useState<HyperrealisticInput["flaschenfarbe"]>("braun");
  const [personenModus, setPersonenModus] = useState<NonNullable<HyperrealisticInput["personenModus"]>>("A");
  const [gruppenAnzahl, setGruppenAnzahl] = useState<HyperrealisticInput["gruppenAnzahl"]>("3");
  const [gruppenTyp, setGruppenTyp] = useState<HyperrealisticInput["gruppenTyp"]>("gemischt");
  const [gruppenDynamik, setGruppenDynamik] = useState<HyperrealisticInput["gruppenDynamik"]>("E2");
  const [stimmungTrend, setStimmungTrend] =
    useState<NonNullable<HyperrealisticInput["stimmungTrend"]>>("nachhaltig");
  const [shotType, setShotType] = useState<NonNullable<HyperrealisticInput["shotType"]>>("A");
  const [extras, setExtras] = useState<string[]>([]);
  const [presetNote, setPresetNote] = useState("");

  const [breweryName, setBreweryName] = useState(initialBreweryName?.trim() || "");
  const [etikettUrl, setEtikettUrl] = useState("");
  const [beers, setBeers] = useState<DashboardBeer[]>([]);
  const [selectedBeer, setSelectedBeer] = useState<DashboardBeer | null>(null);
  const [failedBeerImages, setFailedBeerImages] = useState<Set<string>>(() => new Set());
  const [loadedBeerImages, setLoadedBeerImages] = useState<Set<string>>(() => new Set());
  const [beerImageError, setBeerImageError] = useState("");

  const [extraReferences, setExtraReferences] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [beerPickerOpen, setBeerPickerOpen] = useState(false);
  const refreshBeerImages = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/my-beers", { cache: "no-store", credentials: "include" });
      if (!response.ok) throw new Error("Sortenbilder konnten nicht neu geladen werden.");
      const data = await response.json() as { beers: DashboardBeer[] };
      setBeers(data.beers);
      setSelectedBeer((current) => {
        if (!current) return current;
        const fresh = data.beers.find((beer) => beer.id === current.id);
        return fresh ? { ...current, etikettUrl: fresh.etikettUrl } : current;
      });
      setBeerImageError("");
    } catch {
      setBeerImageError("Sortenbilder konnten nicht neu geladen werden. Bitte erneut versuchen.");
    }
  }, []);

  const beerImageFailed = (url: string) => setFailedBeerImages((current) => new Set(current).add(url));
  const beerImageLoaded = (url: string) => setLoadedBeerImages((current) => new Set(current).add(url));
  const beerPhotoStatus = (url: string) => !url ? "ohne Foto"
    : failedBeerImages.has(url) ? "Foto nicht ladbar"
      : loadedBeerImages.has(url) ? "Foto bereit" : "Foto wird geladen …";
  const [beerCreateOpen, setBeerCreateOpen] = useState(false);
  const [beerCreateError, setBeerCreateError] = useState("");
  const extraFileRef = useRef<HTMLInputElement>(null);
  const beerPickerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [variantProgress, setVariantProgress] = useState<number[]>([]);
  const [generationStep, setGenerationStep] = useState("");
  const [tokensRemaining, setTokensRemaining] = useState<number | null>(null);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [bootstrapError, setBootstrapError] = useState("");
  const [bootstrapNonce, setBootstrapNonce] = useState(0);

  useEffect(() => {
    setProfileComplete(brandProfileComplete);
    setProfileMode(brandProfileMode);
    if (brandProfileMode === "skip") setStiltreue("frei");
  }, [brandProfileComplete, brandProfileMode]);

  useEffect(() => {
    setContentPadding(`28px ${STUDIO_PAD_X}px 72px`);
    return () => setContentPadding(undefined);
  }, [setContentPadding]);

  useEffect(() => {
    if (!beerPickerOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!beerPickerRef.current?.contains(event.target as Node)) {
        setBeerPickerOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBeerPickerOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [beerPickerOpen]);

  useEffect(() => {
    setBrandProfileActive(brandProfileSetupOpen);
  }, [brandProfileSetupOpen, setBrandProfileActive]);

  const loadingRef = useRef(false);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const applyBeer = useCallback(
    (beer: DashboardBeer | null) => {
      setSelectedBeer(beer);
      if (!beer) return;
      const style = findBeerStyle(beer.bierstil);
      const glassFromBeer =
        beer.glasTyp && beer.glasTyp in GLAS_TYPEN
          ? (beer.glasTyp as NonNullable<HyperrealisticInput["glasTyp"]>)
          : style?.glasTyp ?? "willibecher";
      setWas(
        style
          ? { ...style, glasTyp: glassFromBeer }
          : { label: beerStyleLabel(beer.bierstil), bierstil: beer.bierstil, glasTyp: glassFromBeer },
      );
      if (beer.flaschenTyp in FLASCHEN_TYPEN) {
        setFlaschenTyp(beer.flaschenTyp as HyperrealisticInput["flaschenTyp"]);
      }
      setFlaschenfarbe(beer.flaschenfarbe);
      if (beer.etikettUrl && profileMode !== "skip") setStiltreue("hoch");
    },
    [profileMode],
  );

  useEffect(() => {
    let ignore = false;
    (async () => {
      setBootstrapError("");
      // Route warm halten — sonst bricht der erste Generate-Call beim Compile ab.
      void fetch("/api/inhalte-erstellen/create-task", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }).catch(() => undefined);
      void fetch("/api/inhalte-erstellen/social-post", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }).catch(() => undefined);

      const settled = await Promise.allSettled([
        fetch("/api/dashboard/settings", { cache: "no-store", credentials: "include" }),
        fetch("/api/dashboard/summary", { cache: "no-store", credentials: "include" }),
        fetch("/api/dashboard/my-beers", { cache: "no-store", credentials: "include" }),
      ]);
      if (ignore) return;

      const [settingsOutcome, summaryOutcome, beersOutcome] = settled;
      let failed = 0;

      if (settingsOutcome.status === "fulfilled" && settingsOutcome.value.ok) {
        const json = (await settingsOutcome.value.json()) as {
          settings?: {
            breweryName?: string;
            brandProfileMode?: "undecided" | "guided" | "skip";
            brandReferenceImageUrls?: string[];
            brandLabelReferenceUrl?: string;
          };
        };
        if (json.settings?.breweryName?.trim()) setBreweryName(json.settings.breweryName.trim());
        const settingsMode = json.settings?.brandProfileMode;
        if (settingsMode === "guided" || settingsMode === "skip" || settingsMode === "undecided") {
          setProfileMode(settingsMode);
        }
        if (settingsMode === "skip") {
          setStiltreue("frei");
          setEtikettUrl("");
        } else {
          const labelRef = json.settings?.brandLabelReferenceUrl?.trim();
          const refs = json.settings?.brandReferenceImageUrls;
          setEtikettUrl(labelRef || (Array.isArray(refs) ? refs[0] : "") || "");
        }
      } else {
        failed += 1;
      }

      if (summaryOutcome.status === "fulfilled" && summaryOutcome.value.ok) {
        const json = (await summaryOutcome.value.json()) as {
          summary?: { tokens?: { remaining?: number }; plan?: string | null; billingStatus?: string };
        };
        if (typeof json.summary?.tokens?.remaining === "number") {
          setTokensRemaining(json.summary.tokens.remaining);
        }
        const status = json.summary?.billingStatus ?? "none";
        const remaining = json.summary?.tokens?.remaining ?? 0;
        const paid =
          Boolean(json.summary?.plan) && status !== "none" && status !== "canceled";
        setHasActiveSubscription(paid || remaining > 0);
      } else {
        failed += 1;
      }

      if (beersOutcome.status === "fulfilled" && beersOutcome.value.ok) {
        const json = (await beersOutcome.value.json()) as { beers?: DashboardBeer[] };
        const list = Array.isArray(json.beers) ? json.beers : [];
        setBeers(list);
        if (list[0] && !loadingRef.current) applyBeer(list[0]);
      } else {
        failed += 1;
      }

      if (failed === 3) {
        setBootstrapError("Studio-Daten konnten nicht geladen werden. Bitte erneut versuchen.");
      } else if (failed > 0) {
        setBootstrapError("Einige Studio-Daten konnten nicht geladen werden. Du kannst es erneut versuchen.");
      }
    })().catch(() => {
      if (!ignore) setBootstrapError("Studio-Daten konnten nicht geladen werden. Bitte erneut versuchen.");
    });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / retry bootstrap only
  }, [bootstrapNonce]);

  const persistBeers = useCallback(
    async (next: Array<DashboardBeer & { etikettPayload?: { base64: string; mime: string } }>) => {
      const res = await fetch("/api/dashboard/my-beers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ beers: next }),
      });
      const json = (await res.json().catch(() => null)) as
        | { error?: string; beers?: DashboardBeer[] }
        | null;
      if (!res.ok) throw new Error(json?.error ?? "Speichern fehlgeschlagen.");
      return Array.isArray(json?.beers) ? json.beers : [];
    },
    [],
  );

  const handleCreateBeer = useCallback(
    async (draft: BeerCreateDraft) => {
      setBeerCreateError("");
      const payload = draft.etikettDataUrl ? splitDataUrl(draft.etikettDataUrl) : null;
      const etikettPayload =
        payload &&
        (payload.mime === "image/jpeg" || payload.mime === "image/png" || payload.mime === "image/webp")
          ? { base64: payload.base64, mime: payload.mime as "image/jpeg" | "image/png" | "image/webp" }
          : undefined;
      const newBeer = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `beer-${Date.now()}`,
        name: draft.name,
        bierstil: draft.bierstil,
        flaschenTyp: draft.flaschenTyp,
        flaschenfarbe: draft.flaschenfarbe,
        glasTyp: draft.glasTyp,
        etikettUrl: "",
        createdAt: new Date().toISOString(),
        ...(etikettPayload ? { etikettPayload } : {}),
      };
      try {
        const saved = await persistBeers([...beers, newBeer]);
        setBeers(saved);
        const created = saved.find((b) => b.id === newBeer.id) ?? saved[saved.length - 1] ?? null;
        if (created) applyBeer(created);
        setBeerCreateOpen(false);
        setBeerCreateError("");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Speichern fehlgeschlagen.";
        setBeerCreateError(message);
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [applyBeer, beers, persistBeers],
  );

  const openBeerCreate = useCallback(() => {
    setBeerPickerOpen(false);
    setBeerCreateError("");
    setBeerCreateOpen(true);
  }, []);

  const applyTemplate = useCallback((template: OccasionTemplate) => {
    const p = template.preset;
    setActivePreset(template);
    setBehaelter(p.behaelter ?? "B");
    const woMatch = WO_OPTIONS.find((o) => o.szene === p.szene);
    if (woMatch) setWo(woMatch);
    setWie(p.tageszeit);
    setAspectRatio(p.aspectRatio);
    setStimmungTrend(p.stimmungTrend);
    setPersonenModus(p.personenModus);
    if (p.personenModus === "E") {
      setGruppenAnzahl(p.gruppenAnzahl ?? "3");
      setGruppenTyp(p.gruppenTyp ?? "gemischt");
      setGruppenDynamik(p.gruppenDynamik ?? "E2");
    } else {
      setGruppenAnzahl("3");
      setGruppenTyp("gemischt");
      setGruppenDynamik("E2");
    }
    setShotType(p.shotType);
    setExtras(p.extras);
    setPresetNote(p.promptNote);
    // Vorlage ersetzt die Motivbeschreibung vollständig — kein Vermischen alter Texte.
    setUserPrompt(template.motifLine);
    setPresetModalOpen(false);
  }, []);

  const clearPreset = useCallback(() => {
    setActivePreset(null);
    setPresetNote("");
    setExtras([]);
    setPersonenModus("A");
    setGruppenAnzahl("3");
    setGruppenTyp("gemischt");
    setGruppenDynamik("E2");
    setShotType("A");
    setStimmungTrend("nachhaltig");
    setBehaelter("B");
    setWo(WO_OPTIONS[0]);
    setWie("tageslicht");
    setAspectRatio("4:5");
  }, []);

  async function handleExtraReferenceUpload(files: FileList | File[]) {
    setUploadError("");
    setUploading(true);
    try {
      const prepared: Array<{ name: string; dataUrl: string }> = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) throw new Error("Bitte Bilder auswählen (PNG, JPG, WEBP).");
        if (file.size > 12 * 1024 * 1024) throw new Error("Datei zu groß — bitte unter 12 MB.");
        prepared.push({ name: file.name, dataUrl: await readAndCompressImage(file) });
      }
      setExtraReferences((prev) => {
        const room = Math.max(0, 3 - prev.length);
        if (room === 0) return prev;
        return [...prev, ...prepared.slice(0, room)];
      });
      if (extraReferences.length + prepared.length > 3) {
        setUploadError("Maximal 3 Zusatz-Referenzen — überschüssige Dateien ignoriert.");
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  }

  const etikettModus: NonNullable<HyperrealisticInput["etikettModus"]> =
    profileMode === "skip" || stiltreue === "frei" ? "generisch" : "marke";

  const beerEtikettUrl = selectedBeer?.etikettUrl?.trim() || "";
  // Biersorte: nur deren Foto. Hauptmarke (keine Sorte): Marken-Etikett.
  const profileEtikettUrl = selectedBeer ? beerEtikettUrl : etikettUrl;
  const productImageFailed = failedBeerImages.has(profileEtikettUrl);
  const productImageLoading = Boolean(profileEtikettUrl) && !productImageFailed && !loadedBeerImages.has(profileEtikettUrl);
  const hasProductImage = Boolean(profileEtikettUrl) && !productImageFailed && !productImageLoading;

  // Request-Qualität für Vorschau und Payload — Server rechnet damit (nicht Compiler-Qualität).
  const studioRequestQuality = requestQuality;

  const generationTokenCost = useMemo(() => {
    const glassOnly = behaelter === "G";
    const usesProductPhoto = Boolean(profileEtikettUrl) && !glassOnly && etikettModus === "marke";
    const bottle = FLASCHEN_TYPEN[flaschenTyp];
    const hasShapeReference = !glassOnly && !usesProductPhoto && Boolean(bottle?.hasShapeReference);
    return estimateStudioImageTokenCost({
      usesProductPhoto,
      extraReferenceCount: extraReferences.length,
      hasShapeReference,
      etikettModus,
      variantCount,
      requestedQuality: studioRequestQuality,
    });
  }, [behaelter, etikettModus, extraReferences.length, flaschenTyp, profileEtikettUrl, requestQuality, variantCount]);

  const sortedPresets = useMemo(() => sortTemplatesForDate(OCCASION_TEMPLATES, new Date()), []);

  const previewSrc = imageSrc(images[previewIndex] ?? {});
  const brandLabel = breweryName || initialBreweryName?.trim() || "Brauerei";

  const isSocialMode = contentTab === "kampagne" || contentTab === "social";

  async function suggestCopy() {
    if (suggestingCopy) return;
    setSuggestingCopy(true);
    setError("");
    try {
      const res = await fetch("/api/inhalte-erstellen/suggest-copy", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postZiel,
          breweryName: brandLabel,
          beerName: selectedBeer?.name?.trim() || undefined,
          userBrief: userPrompt.trim() || activePreset?.title || undefined,
        }),
      });
      const json = (await res.json()) as {
        headline?: string;
        subline?: string;
        ctaText?: string;
        error?: string;
      };
      if (!res.ok || !json.headline?.trim()) {
        throw new Error(json.error || "Copy-Vorschlag fehlgeschlagen.");
      }
      setHeadline(json.headline.trim());
      setSubline(json.subline?.trim() || "");
      setCtaText(json.ctaText?.trim() || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy-Vorschlag fehlgeschlagen.");
    } finally {
      setSuggestingCopy(false);
    }
  }

  async function improvePrompt() {
    const draft = userPrompt.trim();
    if (!draft || improving) return;
    setImproving(true);
    setError("");
    try {
      const res = await fetch("/api/claude/improve-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft, breweryName: brandLabel }),
      });
      const json = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !json.text?.trim()) throw new Error(json.error || "Verbesserung fehlgeschlagen.");
      setUserPrompt(json.text.trim().slice(0, 800));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verbesserung fehlgeschlagen.");
    } finally {
      setImproving(false);
    }
  }

  async function persistMediaItem(item: {
    id: string;
    imageUrl: string;
    title: string;
    prompt: string;
    createdAt: string;
    aspectRatio: string;
    resolution: "1K" | "2K" | "4K";
    outputFormat: "png" | "jpg";
  }) {
    const res = await fetch("/api/dashboard/media", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...item,
        title: item.title.trim().slice(0, 120),
        prompt: item.prompt.trim().slice(0, 240),
      }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(json?.error || "Mediathek konnte nicht gespeichert werden.");
    }
  }

  async function waitForInProgressJob(jobId: string): Promise<{
    images?: { imageUrl: string }[];
    error?: string;
    billing?: { remainingTokens?: number };
    outputFormat?: "png" | "jpg";
    partial?: boolean;
    expectedVariants?: number;
    partialErrors?: string[];
    mediaPersisted?: boolean;
  }> {
    const deadline = Date.now() + 4 * 60_000;
    let attempt = 0;
    while (Date.now() < deadline) {
      attempt += 1;
      setGenerationStep(`Auftrag läuft noch — warte auf Ergebnis … (${attempt})`);
      await new Promise((r) => window.setTimeout(r, Math.min(2500 + attempt * 500, 8000)));
      const res = await fetch(`/api/dashboard/jobs?id=${encodeURIComponent(jobId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        job?: { status?: string; result?: Record<string, unknown> | null };
      };
      const status = json.job?.status;
      const result = json.job?.result;
      if (status === "completed" && result) {
        return result as {
          images?: { imageUrl: string }[];
          billing?: { remainingTokens?: number };
          outputFormat?: "png" | "jpg";
          partial?: boolean;
          expectedVariants?: number;
          partialErrors?: string[];
          mediaPersisted?: boolean;
        };
      }
      if (status === "failed") {
        const err =
          result && typeof result.error === "string"
            ? result.error
            : "Auftrag fehlgeschlagen.";
        return { error: err };
      }
    }
    throw new Error(
      "Der vorherige Auftrag läuft noch. Bitte kurz warten und nicht erneut starten — sonst entstehen doppelte Kosten.",
    );
  }

  async function generateSocialPost() {
    const previousImages = images;
    const previousPreviewIndex = previewIndex;
    setLoading(true);
    setError("");
    setImages(Array.from({ length: variantCount }, () => ({} as ImageResponse)));
    setVariantProgress(Array.from({ length: variantCount }, () => 5));
    setPreviewIndex(0);
    setGenerationStep("Motiv wird vorbereitet — Text wird separat gesetzt …");
    try {
      if (profileMode !== "guided" || !profileComplete) {
        throw new Error("Social-Posts mit Text brauchen ein aktives Markenprofil.");
      }
      if (!headline.trim()) {
        throw new Error("Bitte eine Headline eingeben oder „Copy vorschlagen“ nutzen.");
      }
      if (etikettModus === "marke" && !hasProductImage) {
        throw new Error("Biersorte mit Flaschenfoto wählen — das Sortenfoto ist die Produkt-Referenz.");
      }

      const effectiveEtikett = profileEtikettUrl || "https://example.com/placeholder.png";
      const intentParts = [userPrompt.trim(), presetNote.trim(), ...extras].filter(Boolean);
      const zusatzWunsch = intentParts.length ? intentParts.join(". ").slice(0, 800) : undefined;

      const payload = {
        etikettBild: effectiveEtikett,
        flaschenTyp,
        flaschenfarbe,
        bierstil: was.bierstil,
        glasTyp: behaelter === "F" ? undefined : was.glasTyp,
        filtrierung:
          selectedBeer?.filtrierung === "unfiltriert" || selectedBeer?.filtrierung === "filtriert"
            ? selectedBeer.filtrierung
            : undefined,
        szene: wo.szene,
        // Ohne Vorlage entscheidet der Server aus dem Motivtext, ob ein Glas ins Bild gehört.
        behaelter: activePreset ? behaelter : undefined,
        personImBild: personenModus === "D" || personenModus === "E",
        personenModus,
        gruppenAnzahl: personenModus === "E" ? gruppenAnzahl : undefined,
        gruppenTyp: personenModus === "E" ? gruppenTyp : undefined,
        gruppenDynamik: personenModus === "E" ? gruppenDynamik : undefined,
        tageszeit: wie,
        stimmungTrend,
        stimmung: "gesellig" as const,
        shotType,
        kiPlattform: "gpt_image_2" as const,
        etikettModus,
        stiltreue,
        contentPreset: "campaign_social" as const,
        photoStyle,
        beerName: selectedBeer?.name?.trim() || undefined,
        zusatzWunsch,
        extraReferenceImages: extraReferences.map((r) => r.dataUrl).slice(0, 3),
        aspectRatio,
        quality: studioRequestQuality,
        variantCount,
        headline: headline.trim(),
        subline: subline.trim() || undefined,
        ctaText: ctaText.trim() || undefined,
        postZiel,
      };
      const parsedResult = socialPostSchema.safeParse(payload);
      if (!parsedResult.success) {
        const issue = parsedResult.error.issues[0];
        throw new Error(
          issue ? `Eingabe ungültig (${issue.path.join(".")}: ${issue.message})` : "Eingabe ungültig.",
        );
      }

      if (hasActiveSubscription && tokensRemaining !== null && tokensRemaining < generationTokenCost) {
        throw new Error(
          `Nicht genug Tokens. Benötigt: ${generationTokenCost}, verfügbar: ${tokensRemaining}.`,
        );
      }

      setGenerationStep("Motiv wird generiert, Text wird lesbar darübergelegt …");
      const socialKey = crypto.randomUUID();
      const res = await fetch("/api/inhalte-erstellen/social-post", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": socialKey },
        body: JSON.stringify(parsedResult.data),
      });
      let data = (await res.json()) as {
        error?: string;
        code?: string;
        jobId?: string;
        mediaPersisted?: boolean;
        images?: { imageUrl: string }[];
        partial?: boolean;
        expectedVariants?: number;
        partialErrors?: string[];
        billing?: { remainingTokens?: number };
      };
      if (
        res.status === 409 &&
        (data.code === "job_in_progress" || /bereits verarbeitet/i.test(data.error ?? "")) &&
        data.jobId
      ) {
        const waited = await waitForInProgressJob(data.jobId);
        if (waited.error) throw new Error(waited.error);
        data = {
          ...waited,
          jobId: data.jobId,
          mediaPersisted: waited.mediaPersisted === true,
        };
      } else if (!res.ok) {
        throw new Error(data.error ?? "Social-Post-Generierung fehlgeschlagen.");
      }

      const resultImages = Array.isArray(data.images) ? data.images : [];
      if (resultImages.length === 0) throw new Error(data.error ?? "Keine Variante konnte generiert werden.");

      if (typeof data.billing?.remainingTokens === "number") {
        setTokensRemaining(data.billing.remainingTokens);
        window.dispatchEvent(new CustomEvent("evglab-billing-updated"));
      }

      setImages(resultImages.map((img) => ({ url: img.imageUrl })));
      setVariantProgress(resultImages.map(() => 100));
      setPreviewIndex(0);

      const mediaPromptLabel = [headline.trim(), subline.trim()].filter(Boolean).join(" · ").slice(0, 120);
      if (!data.mediaPersisted) {
        try {
          const mediaTitle = buildStudioMediaTitle({
            mode: "social",
            beerName: selectedBeer?.name,
            bierstil: selectedBeer?.bierstil || was.bierstil,
            headline: headline.trim(),
            breweryName: brandLabel,
          });
          for (const [index, img] of resultImages.entries()) {
            await persistMediaItem({
              id: data.jobId ? `gen-${data.jobId}-${index}` : crypto.randomUUID(),
              imageUrl: img.imageUrl,
              title: mediaTitle,
              prompt: mediaPromptLabel,
              createdAt: new Date().toISOString(),
              aspectRatio,
              resolution: "2K",
              outputFormat: "png",
            });
          }
        } catch (mediaErr) {
          setError(
            mediaErr instanceof Error
              ? `Bilder erzeugt, aber Mediathek-Speicherung fehlgeschlagen: ${mediaErr.message}`
              : "Bilder erzeugt, aber Mediathek-Speicherung fehlgeschlagen.",
          );
        }
      }
      window.dispatchEvent(new CustomEvent("evglab-media-updated"));

      if (data.partial && data.partialErrors?.length) {
        setError(
          `${resultImages.length} von ${data.expectedVariants ?? variantCount} Variante(n) erstellt. Nur erstellte Bilder werden berechnet. ${data.partialErrors[0]}`,
        );
      }
      setGenerationStep("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Social-Post-Generierung fehlgeschlagen.");
      setGenerationStep("");
      setImages(previousImages);
      setPreviewIndex(previousPreviewIndex);
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    setMobilePanel("preview");
    if (isSocialMode) {
      await generateSocialPost();
      return;
    }
    const previousImages = images;
    const previousPreviewIndex = previewIndex;
    setLoading(true);
    setError("");
    setImages(Array.from({ length: variantCount }, () => ({} as ImageResponse)));
    setVariantProgress(Array.from({ length: variantCount }, () => 5));
    setPreviewIndex(0);
    setGenerationStep("Brief wird strukturiert und geprüft …");
    try {
      const beerLabel = selectedBeer?.etikettUrl?.trim() || "";
      const effectiveEtikett = profileEtikettUrl || "https://example.com/placeholder.png";

      if (etikettModus === "marke" && !hasProductImage) {
        throw new Error(
          selectedBeer
            ? `Für „${selectedBeer.name}“ fehlt das Flaschenfoto. Bitte unter Meine Biere ein Foto mit Etikett hinterlegen.`
            : "Bitte eine Biersorte mit hinterlegtem Flaschenfoto wählen (oder Hauptmarke mit Markenfoto).",
        );
      }
      if (selectedBeer && etikettModus === "marke" && !hasUsableBeerEtikett(beerLabel)) {
        throw new Error(
          `Für „${selectedBeer.name}“ fehlt das Flaschenfoto. Bitte unter Meine Biere ein Foto mit Etikett hinterlegen.`,
        );
      }

      const intentParts = [userPrompt.trim(), presetNote.trim(), ...extras].filter(Boolean);
      const zusatzWunsch = intentParts.length ? intentParts.join(". ").slice(0, 800) : undefined;

      const payload = {
        etikettBild: effectiveEtikett,
        flaschenTyp,
        flaschenfarbe,
        bierstil: was.bierstil,
        glasTyp: behaelter === "F" ? undefined : was.glasTyp,
        filtrierung:
          selectedBeer?.filtrierung === "unfiltriert" || selectedBeer?.filtrierung === "filtriert"
            ? selectedBeer.filtrierung
            : undefined,
        szene: wo.szene,
        behaelter: activePreset ? behaelter : undefined,
        personImBild: personenModus === "D" || personenModus === "E",
        personenModus,
        gruppenAnzahl: personenModus === "E" ? gruppenAnzahl : undefined,
        gruppenTyp: personenModus === "E" ? gruppenTyp : undefined,
        gruppenDynamik: personenModus === "E" ? gruppenDynamik : undefined,
        tageszeit: wie,
        stimmungTrend,
        stimmung: "gesellig" as const,
        shotType,
        kiPlattform: "gpt_image_2" as const,
        etikettModus,
        stiltreue,
        photoStyle,
        beerName: selectedBeer?.name?.trim() || undefined,
        zusatzWunsch,
        extraReferenceImages: extraReferences.map((r) => r.dataUrl).slice(0, 3),
        aspectRatio,
        quality: studioRequestQuality,
        variantCount,
      };
      const parsedResult = hyperrealisticSchema.safeParse(payload);
      if (!parsedResult.success) {
        const issue = parsedResult.error.issues[0];
        throw new Error(
          issue ? `Eingabe ungültig (${issue.path.join(".")}: ${issue.message})` : "Eingabe ungültig.",
        );
      }
      const parsed = parsedResult.data;

      if (hasActiveSubscription && tokensRemaining !== null && tokensRemaining < generationTokenCost) {
        throw new Error(
          `Nicht genug Tokens. Benötigt: ${generationTokenCost}, verfügbar: ${tokensRemaining}.`,
        );
      }

      setGenerationStep(`BrewAI generiert ${variantCount} Variante(n) …`);
      const startedAt = Date.now();
      const progressTimer = window.setInterval(() => {
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
        setVariantProgress((prev) => {
          const base = prev.length ? prev : Array.from({ length: variantCount }, () => 5);
          return base.map((p) => (p >= 96 ? p : p + Math.max(0.4, (96 - p) * 0.05)));
        });
        setGenerationStep(
          elapsedSec < 90
            ? `BrewAI generiert ${variantCount} Variante(n) … (~${elapsedSec}s)`
            : `Dauert etwas länger — bitte Fenster offen lassen … (~${elapsedSec}s)`,
        );
      }, 1000);

      type CreateTaskResponse = {
        error?: string;
        code?: string;
        jobId?: string;
        mediaPersisted?: boolean;
        blocking_issues?: string[];
        missing_information?: string[];
        images?: { imageUrl: string }[];
        partial?: boolean;
        expectedVariants?: number;
        partialErrors?: string[];
        outputFormat?: "png" | "jpg";
        billing?: { remainingTokens?: number };
      };

      const requestKey = crypto.randomUUID();
      const postCreateTask = async (): Promise<{ res: Response; data: CreateTaskResponse }> => {
        const res = await fetch("/api/inhalte-erstellen/create-task", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
          body: JSON.stringify(parsed),
        });
        const raw = await res.text();
        let data: CreateTaskResponse;
        try {
          data = JSON.parse(raw) as CreateTaskResponse;
        } catch {
          throw new Error(
            res.ok
              ? "Ungültige Server-Antwort."
              : `Bildgenerierung fehlgeschlagen (HTTP ${res.status}).`,
          );
        }
        return { res, data };
      };

      const isTransientNetwork = (err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return true;
        const msg = err instanceof Error ? err.message : String(err);
        return /failed to fetch|networkerror|load failed|fetch failed|econnreset|socket/i.test(msg);
      };

      const networkFailMessage =
        "Verbindung zum Server unterbrochen (Dev-Server kompiliert oder Hot-Reload). Bitte 5 Sekunden warten und erneut erzeugen — Seite nicht neu laden.";

      let data: CreateTaskResponse | undefined;
      try {
        // Route vor dem langen OpenAI-Call anwärmen (vermeidet Compile-Abbruch).
        await fetch("/api/inhalte-erstellen/create-task", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }).catch(() => undefined);

        let lastErr: unknown;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            if (attempt > 1) {
              setGenerationStep(`Server startet noch — Versuch ${attempt}/3 …`);
              await new Promise((r) => window.setTimeout(r, 2000 * attempt));
            }
            const result = await postCreateTask();
            if (
              result.res.status === 409 &&
              (result.data.code === "job_in_progress" || /bereits verarbeitet/i.test(result.data.error ?? "")) &&
              result.data.jobId
            ) {
              const waited = await waitForInProgressJob(result.data.jobId);
              if (waited.error) throw new Error(waited.error);
              data = {
                ...waited,
                jobId: result.data.jobId,
                mediaPersisted: waited.mediaPersisted === true,
              };
              lastErr = undefined;
              break;
            }
            if (!result.res.ok && result.res.status >= 500 && attempt < 3) {
              lastErr = new Error(result.data.error ?? `HTTP ${result.res.status}`);
              continue;
            }
            data = result.data;
            if (!result.res.ok) {
              const issues = Array.isArray(data.blocking_issues) ? data.blocking_issues.filter(Boolean) : [];
              throw new Error(
                issues.length > 0
                  ? issues.join(" ")
                  : data.error ?? `Bildgenerierung fehlgeschlagen (HTTP ${result.res.status}).`,
              );
            }
            lastErr = undefined;
            break;
          } catch (err) {
            lastErr = err;
            if (!isTransientNetwork(err) || attempt === 3) {
              throw isTransientNetwork(err) ? new Error(networkFailMessage) : err;
            }
          }
        }
        if (!data) {
          throw isTransientNetwork(lastErr)
            ? new Error(networkFailMessage)
            : lastErr instanceof Error
              ? lastErr
              : new Error("Bildgenerierung fehlgeschlagen.");
        }
      } finally {
        window.clearInterval(progressTimer);
      }

      const resultImages = Array.isArray(data.images) ? data.images : [];
      if (resultImages.length === 0) throw new Error(data.error ?? "Keine Variante konnte generiert werden.");

      if (typeof data.billing?.remainingTokens === "number") {
        setTokensRemaining(data.billing.remainingTokens);
        window.dispatchEvent(new CustomEvent("evglab-billing-updated"));
      }

      setImages(resultImages.map((img) => ({ url: img.imageUrl })));
      setVariantProgress(resultImages.map(() => 100));
      setPreviewIndex(0);

      const mediaPromptLabel = (userPrompt.trim() || activePreset?.title || was.label).slice(0, 800);
      if (!data.mediaPersisted) {
        try {
          const mediaTitle = buildStudioMediaTitle({
            mode: "produktfoto",
            beerName: selectedBeer?.name,
            bierstil: was.bierstil,
            szene: wo.szene,
            glasTyp: behaelter === "F" ? undefined : was.glasTyp,
            behaelter,
            flaschenTyp,
            breweryName: brandLabel,
            zusatzWunsch: userPrompt.trim() || activePreset?.title || undefined,
          });
          for (const [index, img] of resultImages.entries()) {
            await persistMediaItem({
              id: data.jobId ? `gen-${data.jobId}-${index}` : `openai-${Date.now()}-${index}`,
              imageUrl: img.imageUrl,
              title: mediaTitle,
              prompt: mediaPromptLabel,
              createdAt: new Date().toISOString(),
              aspectRatio: parsed.aspectRatio,
              resolution: "2K",
              outputFormat: data.outputFormat ?? "png",
            });
          }
        } catch (mediaErr) {
          setError(
            mediaErr instanceof Error
              ? `Bilder erzeugt, aber Mediathek-Speicherung fehlgeschlagen: ${mediaErr.message}`
              : "Bilder erzeugt, aber Mediathek-Speicherung fehlgeschlagen.",
          );
        }
      }
      window.dispatchEvent(new CustomEvent("evglab-media-updated"));

      if (data.partial && data.partialErrors?.length) {
        setError(
          `${resultImages.length} von ${data.expectedVariants ?? variantCount} Variante(n) erstellt. Nur erstellte Bilder werden berechnet. ${data.partialErrors[0]}`,
        );
      }
      setGenerationStep("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generierung fehlgeschlagen.");
      setGenerationStep("");
      setImages(previousImages);
      setPreviewIndex(previousPreviewIndex);
    } finally {
      setLoading(false);
    }
  }

  const canGenerate = isSocialMode
    ? !loading &&
      profileMode === "guided" &&
      profileComplete &&
      Boolean(headline.trim()) &&
      (etikettModus === "generisch" || hasProductImage)
    : !loading &&
      Boolean(userPrompt.trim() || activePreset) &&
      (etikettModus === "generisch" || hasProductImage);
  const generateBlockReason = etikettModus === "marke" && productImageFailed
    ? "Das Produktfoto ist nicht ladbar. Sortenbilder erneut laden oder das Foto unter Meine Biere ersetzen."
    : etikettModus === "marke" && productImageLoading
      ? "Das Produktfoto wird noch geladen."
    : isSocialMode
    ? profileMode !== "guided" || !profileComplete
      ? "Aktives Markenprofil nötig."
      : etikettModus === "marke" && !hasProductImage
        ? "Biersorte mit Flaschenfoto wählen — das Sortenfoto ist die Produkt-Referenz."
        : !headline.trim()
          ? "Headline fehlt — eingeben oder „Copy vorschlagen“."
          : ""
    : etikettModus === "marke" && !hasProductImage
      ? "Biersorte mit Flaschenfoto wählen — das Sortenfoto ist die Produkt-Referenz."
      : !userPrompt.trim() && !activePreset
        ? "Bitte Freitext oder Vorlage angeben."
        : "";

  return (
    <div className="studio-create-page studio-create-studio">
      {bootstrapError ? (
        <div className="studio-create-banner studio-create-banner--brand" role="alert">
          <div>
            <div className="studio-create-banner__title">Laden unvollständig</div>
            <div className="studio-create-banner__text">{bootstrapError}</div>
          </div>
          <button
            type="button"
            className="studio-create-banner__btn studio-create-banner__btn--primary"
            onClick={() => setBootstrapNonce((n) => n + 1)}
          >
            Erneut laden
          </button>
        </div>
      ) : null}
      {!profileComplete && profileMode !== "skip" ? (
        <div className="studio-create-banner studio-create-banner--brand">
          <div>
            <div className="studio-create-banner__title">Markenprofil empfohlen</div>
            <div className="studio-create-banner__text">
              Website eingeben — Tonality, Farben und Bildregeln für konsistente Motive.
            </div>
          </div>
          <button
            type="button"
            className="studio-create-banner__btn studio-create-banner__btn--primary"
            onClick={() => setBrandProfileSetupOpen(true)}
          >
            Markenprofil anlegen
          </button>
        </div>
      ) : null}

      <header className="studio-create-page-head">
        <div className="studio-create-page-head__main">
          <h1>Bilder erstellen</h1>
          <p>Vom Produktfoto zum markenkonformen Motiv</p>
        </div>
        <div className="studio-create-page-head__actions">
          <div className="studio-create-style-chips" aria-label="Fotostil">
            {PHOTO_STYLE_OPTIONS.map((option) => (
              <span key={option.id} className="studio-create-style-chip-wrap">
                <button
                  type="button"
                  className={`studio-create-chip studio-create-chip--photo-style${photoStyle === option.id ? " is-active" : ""}`}
                  aria-pressed={photoStyle === option.id}
                  title={option.label}
                  onClick={() => setPhotoStyle(option.id)}
                >
                  {option.label}
                </button>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="studio-create-style-info"
                      aria-label={`${option.label}: Infos`}
                    >
                      !
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="center" className="w-64 p-3 text-xs leading-relaxed text-muted-foreground">
                    <div className="mb-1 font-semibold text-foreground">{option.label}</div>
                    {option.hint}
                  </PopoverContent>
                </Popover>
              </span>
            ))}
          </div>
          <div className="studio-create-page-head__cost">
            Verfügbar <strong>{tokensRemaining !== null ? formatDeNumber(tokensRemaining) : "—"} Tokens</strong>
          </div>
        </div>
      </header>

      <div className="studio-create-mobile-nav" role="group" aria-label="Bereich der Bilderstellung">
        {(
          [
            ["brief", "Motiv"],
            ["preview", "Vorschau"],
            ["settings", "Ausgabe"],
          ] as const
        ).map(([id, label], index) => (
          <button
            key={id}
            id={`studio-create-tab-${id}`}
            type="button"
            aria-pressed={mobilePanel === id}
            aria-controls={`studio-create-panel-${id}`}
            className={mobilePanel === id ? "is-active" : undefined}
            onClick={() => setMobilePanel(id)}
          >
            <span aria-hidden="true">{index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      <div className="studio-create-studio-grid">
        {/* Left */}
        <aside
          id="studio-create-panel-brief"
          role="region"
          aria-labelledby="studio-create-tab-brief"
          className="studio-create-studio-col studio-create-studio-col--left"
          data-mobile-active={mobilePanel === "brief" ? "true" : undefined}
        >
          <div className="studio-create-tabs" role="tablist">
            {(
              [
                ["produktfoto", "Produktfoto"],
                ["kampagne", "Kampagne · Feed"],
                ["social", "Social · Story"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={contentTab === id}
                className={`studio-create-tabs__btn${contentTab === id ? " is-active" : ""}`}
                onClick={() => {
                  setContentTab(id);
                  if (id === "social") setAspectRatio("9:16");
                  if (id === "kampagne" && aspectRatio === "9:16") setAspectRatio("4:5");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {isSocialMode ? (
            <p className="studio-create-field__hint">
              {contentTab === "kampagne"
                ? "Für Feed-Posts und Anzeigen; startet im Format 4:5."
                : "Für Stories und Reels; startet im Hochformat 9:16."}
            </p>
          ) : null}

          {isSocialMode ? (
            <div className="studio-create-field studio-create-social-copy">
              <span className="studio-create-field__label">
                Post-Text <em className="studio-create-field__req">Pflicht</em>
              </span>
              <select
                className="studio-create-select"
                value={postZiel}
                onChange={(e) => setPostZiel(e.target.value as SocialPostInput["postZiel"])}
              >
                {POST_ZIEL_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                className="studio-create-copy-input"
                type="text"
                maxLength={60}
                placeholder="Headline, z. B. Frisch gezapft"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
              />
              <input
                className="studio-create-copy-input"
                type="text"
                maxLength={120}
                placeholder="Subline (optional)"
                value={subline}
                onChange={(e) => setSubline(e.target.value)}
              />
              <input
                className="studio-create-copy-input"
                type="text"
                maxLength={30}
                placeholder="CTA (optional), z. B. Jetzt probieren"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
              />
              <button
                type="button"
                className="studio-create-link studio-create-link--accent"
                onClick={() => void suggestCopy()}
                disabled={suggestingCopy}
              >
                {suggestingCopy ? "Copy wird geschrieben …" : "Copy vorschlagen"}
              </button>
              <span className="studio-create-field__hint">
                Text wird serverseitig in Work Sans gesetzt — nicht vom Bildmodell geraten.
              </span>
            </div>
          ) : null}

          <div className="studio-create-field">
            <span className="studio-create-field__label">
              Biersorte <em className="studio-create-field__req">Pflicht</em>
            </span>

            <div className="studio-create-beer-picker" ref={beerPickerRef}>
              <button
                type="button"
                className={`studio-create-beer-picker__trigger${beerPickerOpen ? " is-open" : ""}`}
                aria-haspopup="listbox"
                aria-expanded={beerPickerOpen}
                onClick={() => {
                  if (!beerPickerOpen) void refreshBeerImages();
                  setBeerPickerOpen((open) => !open);
                }}
              >
                <span className="studio-create-beer-picker__thumb">
                  {profileEtikettUrl && !failedBeerImages.has(profileEtikettUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileEtikettUrl} alt="" onLoad={() => beerImageLoaded(profileEtikettUrl)} onError={() => beerImageFailed(profileEtikettUrl)} />
                  ) : (
                    <span className="studio-create-beer-picker__initials">
                      {beerInitials(selectedBeer?.name || brandLabel)}
                    </span>
                  )}
                </span>
                <span className="studio-create-beer-picker__meta">
                  <strong>{selectedBeer?.name || `${brandLabel} · Hauptmarke`}</strong>
                  <small>
                    {selectedBeer
                      ? `${beerStyleLabel(selectedBeer.bierstil)} · ${beerPhotoStatus(profileEtikettUrl)}`
                      : `Markenprofil · ${beerPhotoStatus(profileEtikettUrl)}`}
                  </small>
                </span>
                <span
                  className={`studio-create-beer-picker__chevron${beerPickerOpen ? " is-open" : ""}`}
                  aria-hidden="true"
                />
              </button>

              <AnimatePresence initial={false}>
                {beerPickerOpen ? (
                  <motion.div
                    key="beer-picker-panel"
                    className="studio-create-beer-picker__panel"
                    role="listbox"
                    aria-label="Biersorte wählen"
                    initial={
                      reduceMotion
                        ? { opacity: 1 }
                        : { opacity: 0, y: -8, scale: 0.98 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={
                      reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: -6, scale: 0.98 }
                    }
                    transition={{
                      duration: reduceMotion ? 0.01 : 0.22,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={!selectedBeer}
                      className={`studio-create-beer-picker__option${!selectedBeer ? " is-active" : ""}`}
                      onClick={() => {
                        applyBeer(null);
                        setBeerPickerOpen(false);
                      }}
                    >
                      <span className="studio-create-beer-picker__thumb">
                        {etikettUrl && !failedBeerImages.has(etikettUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={etikettUrl} alt="" onLoad={() => beerImageLoaded(etikettUrl)} onError={() => beerImageFailed(etikettUrl)} />
                        ) : (
                          <span className="studio-create-beer-picker__initials">
                            {beerInitials(brandLabel)}
                          </span>
                        )}
                      </span>
                      <span className="studio-create-beer-picker__meta">
                        <strong>{brandLabel} · Hauptmarke</strong>
                        <small>{etikettUrl ? beerPhotoStatus(etikettUrl) : "Kein Markenfoto"}</small>
                      </span>
                      {!selectedBeer ? (
                        <span className="studio-create-beer-picker__check" aria-hidden="true">
                          <StudioIcon name="check" size={14} />
                        </span>
                      ) : null}
                    </button>

                    {beers.map((beer) => {
                      const active = selectedBeer?.id === beer.id;
                      const thumb = beer.etikettUrl?.trim() || "";
                      return (
                        <button
                          key={beer.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={`studio-create-beer-picker__option${active ? " is-active" : ""}`}
                          onClick={() => {
                            applyBeer(beer);
                            setBeerPickerOpen(false);
                          }}
                        >
                          <span className="studio-create-beer-picker__thumb">
                            {thumb && !failedBeerImages.has(thumb) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={thumb} alt="" onLoad={() => beerImageLoaded(thumb)} onError={() => beerImageFailed(thumb)} />
                            ) : (
                              <span className="studio-create-beer-picker__initials">
                                {beerInitials(beer.name)}
                              </span>
                            )}
                          </span>
                          <span className="studio-create-beer-picker__meta">
                            <strong>{beer.name}</strong>
                            <small>
                              {beerStyleLabel(beer.bierstil)}
                              {` · ${beerPhotoStatus(thumb)}`}
                            </small>
                          </span>
                          {active ? (
                            <span className="studio-create-beer-picker__check" aria-hidden="true">
                              <StudioIcon name="check" size={14} />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      className="studio-create-beer-picker__add"
                      disabled={beers.length >= MAX_MY_BEERS}
                      onClick={openBeerCreate}
                    >
                      <StudioIcon name="plus" size={14} />
                      {beers.length === 0 ? "Erste Sorte anlegen" : "Neue Sorte anlegen"}
                      {beers.length >= MAX_MY_BEERS ? (
                        <span className="studio-create-beer-picker__add-cap">Max. {MAX_MY_BEERS}</span>
                      ) : null}
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {beers.length === 0 ? (
              <button type="button" className="studio-create-link studio-create-link--accent" onClick={openBeerCreate}>
                Erste Biersorte anlegen
              </button>
            ) : null}

            <span className="studio-create-field__hint">
              Das Sortenfoto ist die Produkt-Referenz (Flasche + Etikett) — nicht die Szene.
            </span>
            {beerImageError || productImageFailed || beers.some((beer) => failedBeerImages.has(beer.etikettUrl)) ? (
              <div className="studio-create-field__hint" role="status">
                {beerImageError || "Ein Sortenfoto konnte nicht geladen werden."}
                <button type="button" className="studio-create-link" onClick={() => {
                  setFailedBeerImages(new Set());
                  setLoadedBeerImages(new Set());
                  void refreshBeerImages();
                }}>Sortenbilder erneut laden</button>
              </div>
            ) : null}
          </div>

          <div className="studio-create-field">
            <span className="studio-create-field__label">Zusätzliche Referenzen</span>
            <button
              type="button"
              className="studio-create-upload"
              onClick={() => extraFileRef.current?.click()}
              disabled={uploading || extraReferences.length >= 3}
            >
              <span className="studio-create-upload__placeholder">
                <strong>{uploading ? "Lädt …" : "Bilder hinzufügen"}</strong>
                <small>z. B. Kiste, Location, Stimmung · max. 3</small>
              </span>
            </button>
            <input
              ref={extraFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(e) => {
                const files = e.target.files;
                e.target.value = "";
                if (files?.length) void handleExtraReferenceUpload(files);
              }}
            />
            {extraReferences.length > 0 ? (
              <ul className="studio-create-extra-refs">
                {extraReferences.map((ref, index) => (
                  <li key={`${ref.name}-${index}`} className="studio-create-extra-refs__item">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ref.dataUrl} alt="" className="studio-create-extra-refs__thumb" />
                    <span className="studio-create-extra-refs__name">{ref.name}</span>
                    <button
                      type="button"
                      className="studio-create-link"
                      onClick={() =>
                        setExtraReferences((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      Entfernen
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {uploadError ? <p className="studio-create-error">{uploadError}</p> : null}
            <span className="studio-create-field__hint">
              Nur Kontext — Logos/Texte daraus werden nicht auf die Flasche übernommen.
            </span>
          </div>

          <label className="studio-create-field">
            <span className="studio-create-field__label">Was soll entstehen?</span>
            <textarea
              className="studio-create-textarea"
              rows={5}
              maxLength={800}
              placeholder={
                isSocialMode
                  ? "Sommerliches Motiv mit Flasche im Biergarten — Text wird separat und gut lesbar gesetzt."
                  : "Helles Produktfoto unseres Pale Ale auf einer Holztischplatte. Natürliches Abendlicht, Kondenswasser auf der Flasche, ruhiger Hintergrund."
              }
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
            />
            <span className="studio-create-field__hint">
              Erwachsene ohne konkrete Altersangabe werden ab 25 Jahren dargestellt. Motiv, Kleidung und Stimmung bleiben Teil deiner Beschreibung.
            </span>
            <button
              type="button"
              className="studio-create-link studio-create-link--accent"
              onClick={() => void improvePrompt()}
              disabled={!userPrompt.trim() || improving}
            >
              {improving ? "Wird verbessert …" : "Mit BrewAI verbessern"}
            </button>
          </label>

          <div className="studio-create-preset-row">
            {activePreset ? (
              <button type="button" className="studio-create-chip" onClick={clearPreset}>
                {activePreset.title} <span aria-hidden>×</span>
              </button>
            ) : (
              <button type="button" className="studio-create-chip studio-create-chip--ghost" onClick={() => setPresetModalOpen(true)}>
                Vorlage wählen
              </button>
            )}
            {activePreset ? (
              <button type="button" className="studio-create-link" onClick={() => setPresetModalOpen(true)}>
                Anderes Preset
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="studio-create-mobile-next"
            onClick={() => setMobilePanel("preview")}
          >
            Vorschau prüfen
            <span aria-hidden="true">→</span>
          </button>
        </aside>

        {/* Center */}
        <section
          id="studio-create-panel-preview"
          role="region"
          aria-labelledby="studio-create-tab-preview"
          className="studio-create-studio-col studio-create-studio-col--center"
          data-mobile-active={mobilePanel === "preview" ? "true" : undefined}
        >
          <div className="studio-create-preview-card">
            <div className="studio-create-preview-card__bar">
              <span
                className={`studio-create-status${
                  loading ? " is-busy" : previewSrc ? " is-ready" : ""
                }`}
              >
                {loading
                  ? generationStep || "Generiert …"
                  : previewSrc
                    ? "Vorschau bereit"
                    : "Bereit zum Generieren"}
              </span>
              {loading ? (
                <span className="studio-create-preview-card__pct" aria-live="polite">
                  {Math.max(8, Math.round(variantProgress[previewIndex] ?? variantProgress[0] ?? 8))} %
                </span>
              ) : null}
            </div>
            {loading || previewSrc ? (
              <ImageGeneration
                className="studio-create-image-gen"
                isLoading={loading}
                imageSrc={previewSrc}
                aspectRatio={aspectRatio}
                hideStatus
                progress={
                  loading
                    ? Math.max(8, variantProgress[previewIndex] ?? variantProgress[0] ?? 8)
                    : 100
                }
                onPreviewClick={(src) => window.open(src, "_blank", "noopener,noreferrer")}
              />
            ) : (
              <div className="studio-create-preview-stage" data-aspect={aspectRatio}>
                <div className="studio-create-preview-placeholder">
                  <span className="studio-create-preview-placeholder__frame" aria-hidden="true" />
                  <strong className="studio-create-preview-placeholder__title">
                    Dein Motiv erscheint hier
                  </strong>
                  <p>
                    {selectedBeer?.name || brandLabel}
                    {" · "}
                    {aspectRatio}
                  </p>
                </div>
              </div>
            )}
            <div className="studio-create-preview-card__foot">
              <span>
                {aspectRatio} · {pixelLabel(aspectRatio)}
              </span>
              {images.length > 1 ? (
                <div className="studio-create-variant-dots">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`studio-create-variant-dots__btn${previewIndex === i ? " is-active" : ""}`}
                      onClick={() => setPreviewIndex(i)}
                      disabled={!imageSrc(img)}
                      aria-label={`Variante ${i + 1}`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          {error ? <p className="studio-create-error">{error}</p> : null}
          <div className="studio-create-mobile-panel-actions">
            <button type="button" onClick={() => setMobilePanel("brief")}>
              Motiv ändern
            </button>
            <button type="button" className="is-primary" onClick={() => setMobilePanel("settings")}>
              Ausgabe einstellen
            </button>
          </div>
        </section>

        {/* Right */}
        <aside
          id="studio-create-panel-settings"
          role="region"
          aria-labelledby="studio-create-tab-settings"
          className="studio-create-studio-col studio-create-studio-col--right"
          data-mobile-active={mobilePanel === "settings" ? "true" : undefined}
        >
          <div className="studio-create-field">
            <span className="studio-create-field__label">Format</span>
            <div className="studio-create-segment studio-create-segment--formats" role="radiogroup" aria-label="Bildformat">
              {ASPECT_OPTIONS.map((ar) => (
                <button
                  key={ar}
                  type="button"
                  role="radio"
                  aria-checked={aspectRatio === ar}
                  className={`studio-create-segment__btn${aspectRatio === ar ? " is-active" : ""}`}
                  onClick={() => setAspectRatio(ar)}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>

          <div className="studio-create-field">
            <span className="studio-create-field__label">Qualität</span>
            <div className="studio-create-segment" role="radiogroup" aria-label="Bildqualität">
              {(
                [
                  ["medium", "1K"],
                  ["high", "2K"],
                  ["ultra", "4K"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={requestQuality === id}
                  className={`studio-create-segment__btn${requestQuality === id ? " is-active" : ""}`}
                  onClick={() => setRequestQuality(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="studio-create-field">
            <span className="studio-create-field__label">Varianten</span>
            <div className="studio-create-segment studio-create-segment--variants" role="radiogroup" aria-label="Anzahl Varianten">
              {VARIANT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={variantCount === n}
                  className={`studio-create-segment__btn studio-create-segment__btn--stack${variantCount === n ? " is-active" : ""}`}
                  onClick={() => setVariantCount(n)}
                >
                  <strong>{n}</strong>
                  <small>{n === 1 ? "Motiv" : "Motive"}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="studio-create-field">
            <span className="studio-create-field__label">Stiltreue</span>
            <div className="studio-create-segment">
              {(
                [
                  ["frei", "Frei"],
                  ["normal", "Normal"],
                  ["hoch", "Hoch"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`studio-create-segment__btn${stiltreue === id ? " is-active" : ""}`}
                  onClick={() => setStiltreue(id)}
                  disabled={profileMode === "skip" && id !== "frei"}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="studio-create-field">
            <span className="studio-create-field__label">Fotostil</span>
            <div className="studio-create-segment studio-create-segment--photo-style" role="radiogroup" aria-label="Fotostil">
              {PHOTO_STYLE_OPTIONS.map((option) => (
                <span key={option.id} className="studio-create-style-chip-wrap studio-create-style-chip-wrap--segment">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={photoStyle === option.id}
                    className={`studio-create-segment__btn${photoStyle === option.id ? " is-active" : ""}`}
                    onClick={() => setPhotoStyle(option.id)}
                  >
                    {option.label}
                  </button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="studio-create-style-info"
                        aria-label={`${option.label}: Infos`}
                      >
                        !
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="center" className="w-64 p-3 text-xs leading-relaxed text-muted-foreground">
                      <div className="mb-1 font-semibold text-foreground">{option.label}</div>
                      {option.hint}
                    </PopoverContent>
                  </Popover>
                </span>
              ))}
            </div>
          </div>

          <div className="studio-create-summary">
            <div>
              {variantCount} Variante{variantCount === 1 ? "" : "n"}
            </div>
            <div>
              Format {aspectRatio} · Markenprofil {etikettModus === "marke" ? "aktiv" : "frei"}
              {` · ${PHOTO_STYLE_OPTIONS.find((option) => option.id === photoStyle)?.label ?? "Reportage"}`}
              {" · AI-Label"}
            </div>
            <div className="studio-create-summary__cost">
              Geschätzter Verbrauch: <strong>{formatDeNumber(generationTokenCost)} Tokens</strong>
            </div>
          </div>

          <button
            type="button"
            className="studio-create-generate"
            style={{ background: P.accent }}
            disabled={!canGenerate}
            onClick={() => void generate()}
            title={generateBlockReason || undefined}
          >
            {loading
              ? "Generiert …"
              : isSocialMode
                ? contentTab === "kampagne"
                  ? `${variantCount} Kampagnenmotiv${variantCount === 1 ? "" : "e"} generieren`
                  : `${variantCount} Social-Story${variantCount === 1 ? "" : "s"} generieren`
                : `${variantCount} Motiv${variantCount === 1 ? "" : "e"} generieren`}
          </button>
          {generateBlockReason && !loading ? (
            <p className="studio-create-field__hint" role="status">
              {generateBlockReason}
            </p>
          ) : null}
        </aside>
      </div>

      {beerCreateOpen ? (
        <div
          className="studio-create-modal studio-create-modal--beer"
          role="dialog"
          aria-modal="true"
          aria-label="Neue Sorte anlegen"
        >
          <button
            type="button"
            className="studio-create-modal__backdrop"
            aria-label="Schließen"
            onClick={() => {
              setBeerCreateOpen(false);
              setBeerCreateError("");
            }}
          />
          <div className="studio-create-modal__panel studio-create-modal__panel--beer">
            <BeerCreatePanel
              error={beerCreateError}
              reducedMotion={Boolean(reduceMotion)}
              onSave={handleCreateBeer}
              onCancel={() => {
                setBeerCreateOpen(false);
                setBeerCreateError("");
              }}
            />
          </div>
        </div>
      ) : null}

      {presetModalOpen ? (
        <div className="studio-create-modal" role="dialog" aria-modal="true" aria-label="Vorlage wählen">
          <button type="button" className="studio-create-modal__backdrop" aria-label="Schließen" onClick={() => setPresetModalOpen(false)} />
          <div className="studio-create-modal__panel">
            <div className="studio-create-modal__head">
              <h2>Vorlagen</h2>
              <button type="button" className="studio-create-modal__close" onClick={() => setPresetModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="studio-create-modal__grid">
              {sortedPresets.map(({ template, status }) => {
                const badge = seasonBadgeLabel(status);
                return (
                  <button
                    key={template.id}
                    type="button"
                    className="studio-create-preset-card"
                    style={{ borderColor: template.accent }}
                    onClick={() => applyTemplate(template)}
                  >
                    <span className="studio-create-preset-card__accent" style={{ background: template.accent }} />
                    <strong>{template.title}</strong>
                    <span>{template.subtitle}</span>
                    <small>{template.motifLine}</small>
                    {badge ? <em className="studio-create-preset-card__badge">{badge}</em> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <BrandProfileSetupModal
        open={brandProfileSetupOpen}
        onOpenChange={setBrandProfileSetupOpen}
        title="Marke einlesen"
        onSaved={async (suggestion: BrandScanSuggestion) => {
          setProfileComplete(true);
          setProfileMode("guided");
          setBreweryName(suggestion.breweryName);
          window.setTimeout(() => router.refresh(), 300);
        }}
      />
    </div>
  );
}

/** Gemeinsame Eingabeleiste für Einstieg und Mediathek-Arbeitsbereich. */
export function StudioCreateComposer(
  props: Parameters<typeof InhalteErstellenStudio>[0] & { variant?: "landing" | "dock" },
) {
  const { variant: _variant, ...rest } = props;
  return <InhalteErstellenStudio {...rest} />;
}
