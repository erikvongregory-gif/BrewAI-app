"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { GlowButton } from "@/components/ui/glow-button";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StudioIcon } from "@/components/studio/icons";
import { MagneticText } from "@/components/ui/morphing-cursor";
import { cn } from "@/lib/utils";
import { beerStyleLabel, resolveGlasTyp } from "@/app/(dashboard)/inhalte-erstellen/lib/beer-styles";
import { GLAS_TYPEN } from "@/app/(dashboard)/inhalte-erstellen/lib/brewing-knowledge";
import {
  OCCASION_TEMPLATES,
  sortTemplatesForDate,
  type OccasionTemplate,
} from "@/app/(dashboard)/inhalte-erstellen/lib/occasion-templates";
import {
  produktKategorieLabel,
  sanitizeProduktKategorie,
  type DashboardBeer,
  type DashboardCharacter,
} from "@/lib/dashboard/metadata";
import { estimateStudioImageTokenCost } from "@/lib/billing/generationTokenCost";
import { startStudioGeneration } from "@/lib/inhalte-erstellen/start-studio-generation";
import { clearActiveGeneration, readActiveGeneration } from "@/lib/inhalte-erstellen/active-generation";
import { pollGenerationJob } from "@/lib/inhalte-erstellen/poll-generation-job";
import { CreateResultStage, type CreateRun } from "@/components/ui/create-result-stage";
import {
  CHARACTER_ASPECTS,
  effectiveAspectRatio,
  type Aspect,
} from "@/lib/inhalte-erstellen/studio-config";

const PLACEHOLDER_ETIKETT = "https://example.com/placeholder.png";

const ASPECT_OPTIONS: { value: Aspect; hint: string }[] = [
  { value: "1:1", hint: "Quadrat" },
  { value: "4:5", hint: "Feed" },
  { value: "3:4", hint: "Portrait" },
  { value: "9:16", hint: "Story / Reel" },
  { value: "4:3", hint: "Quer" },
  { value: "16:9", hint: "Landscape" },
];

type RequestQuality = "medium" | "high" | "ultra";
type PhotoStyle = "reportage" | "premium" | "campaign";

const QUALITY_OPTIONS: { value: RequestQuality; label: string; hint: string }[] = [
  { value: "medium", label: "Standard", hint: "1K · weniger Tokens" },
  { value: "high", label: "Hoch", hint: "2K · schärfer" },
  { value: "ultra", label: "4K", hint: "Druck / Detail" },
];

const PHOTO_STYLE_OPTIONS: Array<{ value: PhotoStyle; label: string; fullLabel: string; hint: string }> = [
  {
    value: "reportage",
    label: "Reportage",
    fullLabel: "Reportage",
    hint: "Candid und roh: direkter Blitz (auch tagsüber), unperfekter Crop, Flasche nebenbei — wie ein echter Schnappschuss vom Stammtisch, Fest oder Biergarten.",
  },
  {
    value: "premium",
    label: "Premium",
    fullLabel: "Premium-Fotografie",
    hint: "Professionelles Fotoshooting wie für die eigene Imagekampagne: Menschen in Tracht oder im Biergarten posieren natürlich für den Fotografen, Porträtlook mit weichem Hintergrund, echte Farben. Das Etikett bleibt erkennbar.",
  },
  {
    value: "campaign",
    label: "Kampagne",
    fullLabel: "Kampagnenmotiv",
    hint: "Inszeniertes Key Visual: Produkt dominiert den Frame, Hände reichen oder stoßen an, Untersicht oder Himmel. Im Feed bleibt oben Platz für die Headline.",
  },
];

const VALID_SZENEN = new Set<string>([
  "biergarten_sommer",
  "wirtshaus_innen",
  "kueche_zuhause",
  "wiese_picknick",
  "strand_sonnenuntergang",
  "alpenpanorama",
  "stadtbalkon_abend",
  "brauereihof",
  "fussball_public_viewing",
]);

interface AutoResizeProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: AutoResizeProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Infinity),
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight],
  );

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = `${minHeight}px`;
  }, [minHeight]);

  return { textareaRef, adjustHeight };
}

function beerInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function beerMeta(beer: DashboardBeer) {
  const kategorie = sanitizeProduktKategorie(beer.produktKategorie);
  if (kategorie !== "bier") return produktKategorieLabel(kategorie);
  const stil = beerStyleLabel(beer.bierstil);
  const glasKey = resolveGlasTyp(beer.bierstil, beer.glasTyp);
  const glas = GLAS_TYPEN[glasKey]?.label;
  const filtr =
    beer.filtrierung === "unfiltriert"
      ? "unfiltriert"
      : beer.filtrierung === "filtriert"
        ? "filtriert"
        : null;
  return [stil, filtr, glas].filter(Boolean).join(" · ");
}

export default function RuixenMoonChat() {
  const [message, setMessage] = useState("");
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<Aspect>("4:5");
  const [formatPickerOpen, setFormatPickerOpen] = useState(false);
  const [requestQuality, setRequestQuality] = useState<RequestQuality>("medium");
  const [qualityPickerOpen, setQualityPickerOpen] = useState(false);
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);
  const [beers, setBeers] = useState<DashboardBeer[]>([]);
  const [selectedBeer, setSelectedBeer] = useState<DashboardBeer | null>(null);
  const [beerPickerOpen, setBeerPickerOpen] = useState(false);
  const [beersLoading, setBeersLoading] = useState(true);
  const [beersError, setBeersError] = useState<string | null>(null);
  const [characters, setCharacters] = useState<DashboardCharacter[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<DashboardCharacter | null>(null);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const [charactersLoading, setCharactersLoading] = useState(true);
  const [charactersError, setCharactersError] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [photoStyle, setPhotoStyle] = useState<PhotoStyle>("reportage");
  const [aiWatermark, setAiWatermark] = useState(false);
  const [runs, setRuns] = useState<CreateRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const runPayloads = useRef(new Map<string, unknown>());
  const pollers = useRef(new Map<string, AbortController>());
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 48,
    maxHeight: 150,
  });

  const quickPresets = sortTemplatesForDate(OCCASION_TEMPLATES, new Date()).map(
    ({ template }) => template,
  );

  const activePreset =
    OCCASION_TEMPLATES.find((template) => template.id === activePresetId) ?? null;

  const applyPreset = useCallback(
    (template: OccasionTemplate) => {
      setActivePresetId(template.id);
      setAspectRatio(
        effectiveAspectRatio(template.preset.aspectRatio, Boolean(selectedCharacter)),
      );
      setPresetPickerOpen(false);
    },
    [selectedCharacter],
  );

  const clearPreset = useCallback(() => {
    setActivePresetId(null);
  }, []);

  const selectCharacter = useCallback((character: DashboardCharacter | null) => {
    setSelectedCharacter(character);
    setCharacterPickerOpen(false);
    if (character) {
      setAspectRatio((prev) => effectiveAspectRatio(prev, true));
    }
  }, []);

  const selectAspect = useCallback(
    (next: Aspect) => {
      setAspectRatio(effectiveAspectRatio(next, Boolean(selectedCharacter)));
      setFormatPickerOpen(false);
    },
    [selectedCharacter],
  );

  useEffect(() => {
    let cancelled = false;
    const loadBeers = async () => {
      try {
        const response = await fetch("/api/dashboard/my-beers", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) throw new Error("beers");
        const json = (await response.json()) as { beers?: DashboardBeer[] };
        if (cancelled) return;
        const next = Array.isArray(json.beers) ? json.beers : [];
        setBeers(next);
        setSelectedBeer((current) => {
          if (!current) return current;
          return next.find((entry) => entry.id === current.id) ?? current;
        });
      } catch {
        /* keep current list */
      }
    };

    const onBeersUpdated = () => {
      void loadBeers();
    };
    window.addEventListener("evglab-beers-updated", onBeersUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("evglab-beers-updated", onBeersUpdated);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBeersLoading(true);
      setCharactersLoading(true);
      setBeersError(null);
      setCharactersError(null);

      const [beersOutcome, charactersOutcome] = await Promise.allSettled([
        fetch("/api/dashboard/my-beers", { cache: "no-store", credentials: "include" }).then(
          async (response) => {
            if (!response.ok) throw new Error("beers");
            return (await response.json()) as { beers?: DashboardBeer[] };
          },
        ),
        fetch("/api/dashboard/my-characters", {
          cache: "no-store",
          credentials: "include",
        }).then(async (response) => {
          if (!response.ok) throw new Error("characters");
          return (await response.json()) as { characters?: DashboardCharacter[] };
        }),
      ]);

      if (cancelled) return;

      if (beersOutcome.status === "fulfilled") {
        setBeers(Array.isArray(beersOutcome.value.beers) ? beersOutcome.value.beers : []);
      } else {
        setBeers([]);
        setBeersError("Sortiment konnte nicht geladen werden. Bitte lade die Seite neu.");
      }

      if (charactersOutcome.status === "fulfilled") {
        setCharacters(
          Array.isArray(charactersOutcome.value.characters)
            ? charactersOutcome.value.characters
            : [],
        );
      } else {
        setCharacters([]);
        setCharactersError("Charaktere konnten nicht geladen werden. Bitte lade die Seite neu.");
      }

      setBeersLoading(false);
      setCharactersLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedThumb = selectedBeer?.etikettUrl?.trim() || "";
  const selectedCharacterThumb = selectedCharacter?.referenceImageUrls?.[0]?.trim() || "";
  const characterRefCount =
    selectedCharacter?.referenceImageUrls?.filter((url) => url?.trim()).length ?? 0;
  const usesProductPhoto = Boolean(selectedThumb);
  const generationTokenCost = estimateStudioImageTokenCost({
    usesProductPhoto,
    extraReferenceCount: characterRefCount,
    etikettModus: usesProductPhoto ? "marke" : "generisch",
    variantCount: 1,
    requestedQuality: requestQuality,
  });

  const runInFlight = runs.some((run) => run.status === "starting" || run.status === "running");
  const canGenerate = (Boolean(message.trim()) || Boolean(activePreset)) && !genBusy && !runInFlight;

  const patchRun = useCallback((id: string, patch: Partial<CreateRun>) => {
    setRuns((current) => current.map((run) => (run.id === id ? { ...run, ...patch } : run)));
  }, []);

  /** Pollt den Job im Hintergrund; verlässt man die Seite, läuft er als Karte in der Mediathek weiter. */
  const trackJob = useCallback(
    (runId: string, jobId: string) => {
      pollers.current.get(runId)?.abort();
      const ac = new AbortController();
      pollers.current.set(runId, ac);
      void pollGenerationJob({ jobId, expectedVariants: 1, signal: ac.signal }).then((result) => {
        if (ac.signal.aborted) return;
        pollers.current.delete(runId);
        const imageUrl = result.images?.[0]?.imageUrl?.trim();
        if (imageUrl && !result.error) {
          patchRun(runId, { status: "done", imageUrl });
          clearActiveGeneration();
          window.dispatchEvent(new CustomEvent("brewai-media-added", { detail: { count: 1 } }));
          return;
        }
        if (result.pending) {
          patchRun(runId, { status: "slow" });
          return;
        }
        clearActiveGeneration();
        patchRun(runId, { status: "failed", error: result.error || "Generierung fehlgeschlagen." });
      });
    },
    [patchRun],
  );

  const launchRun = useCallback(
    async (payload: unknown, prompt: string, aspect: string, fresh: boolean) => {
      const id = crypto.randomUUID();
      runPayloads.current.set(id, payload);
      setRuns((current) => [{ id, prompt, aspectRatio: aspect, status: "starting", startedAt: Date.now() }, ...current]);
      setActiveRunId(id);
      // "Nochmal" mit identischem Entwurf braucht einen neuen Idempotency-Key, sonst kommt derselbe Job zurück.
      if (fresh) clearActiveGeneration();
      const outcome = await startStudioGeneration({ url: "/api/inhalte-erstellen/create-task", payload });
      if (outcome.action !== "open_media") {
        patchRun(id, { status: "failed", error: outcome.error });
        return;
      }
      patchRun(id, { status: "running", jobId: outcome.jobId });
      trackJob(id, outcome.jobId);
    },
    [patchRun, trackJob],
  );

  // Laufenden Auftrag nach Reload/Rückkehr wieder aufnehmen.
  useEffect(() => {
    const active = readActiveGeneration();
    const pollerMap = pollers.current;
    if (active?.jobId) {
      const id = crypto.randomUUID();
      const jobId = active.jobId;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- einmalige Wiederaufnahme aus sessionStorage
      setRuns([{ id, jobId, prompt: "", aspectRatio: active.aspectRatio || "4:5", status: "running", startedAt: active.startedAt }]);
      setActiveRunId(id);
      trackJob(id, jobId);
    }
    return () => {
      for (const ac of pollerMap.values()) ac.abort();
      pollerMap.clear();
    };
  }, [trackJob]);

  const regenerate = useCallback(
    (run: CreateRun) => {
      const payload = runPayloads.current.get(run.id);
      if (!payload || runInFlight) return;
      void launchRun(payload, run.prompt, run.aspectRatio, true);
    },
    [launchRun, runInFlight],
  );

  const resetStage = useCallback(() => {
    setRuns([]);
    setActiveRunId(null);
    textareaRef.current?.focus();
  }, [textareaRef]);

  const handleGenerate = useCallback(async () => {
    const prompt = message.trim() || activePreset?.motifLine || "";
    if (!prompt || genBusy || runInFlight) return;

    if (selectedCharacter && !selectedThumb) {
      setGenError("Für einen Charakter brauchst du eine Sorte mit Flaschenfoto. Fotos hinterlegst du im Markenprofil unter „Sortiment“.");
      return;
    }

    setGenError(null);
    setGenBusy(true);

    // Sorte frisch laden — sonst fehlen gerade geänderte Felder (Filtrierung, Glas).
    let beer = selectedBeer;
    try {
      const beersRes = await fetch("/api/dashboard/my-beers", {
        cache: "no-store",
        credentials: "include",
      });
      if (beersRes.ok) {
        const beersJson = (await beersRes.json()) as { beers?: DashboardBeer[] };
        const fresh = Array.isArray(beersJson.beers) ? beersJson.beers : [];
        setBeers(fresh);
        if (selectedBeer?.id) {
          beer = fresh.find((entry) => entry.id === selectedBeer.id) ?? selectedBeer;
          setSelectedBeer(beer);
        }
      }
    } catch {
      /* Cache-Fallback: weiter mit selectedBeer */
    }

    const preset = activePreset?.preset;
    const szeneRaw = preset?.szene ?? "biergarten_sommer";
    const szene = VALID_SZENEN.has(szeneRaw) ? szeneRaw : "biergarten_sommer";

    const intentParts = [prompt, preset?.promptNote].filter(Boolean);
    const bierstil = beer?.bierstil || "helles";
    const beerThumb = beer?.etikettUrl?.trim() || "";
    const payload = {
      etikettBild: beerThumb || selectedThumb || PLACEHOLDER_ETIKETT,
      flaschenTyp: beer?.flaschenTyp || "nrw_500",
      flaschenfarbe: beer?.flaschenfarbe || "braun",
      bierstil,
      glasTyp: resolveGlasTyp(bierstil, beer?.glasTyp),
      filtrierung:
        beer?.filtrierung === "unfiltriert" || beer?.filtrierung === "filtriert"
          ? beer.filtrierung
          : undefined,
      szene,
      tageszeit: preset?.tageszeit ?? "tageslicht",
      stimmungTrend: preset?.stimmungTrend,
      personenModus: preset?.personenModus,
      gruppenAnzahl: preset?.gruppenAnzahl,
      gruppenTyp: preset?.gruppenTyp,
      gruppenDynamik: preset?.gruppenDynamik,
      shotType: preset?.shotType,
      behaelter: preset?.behaelter,
      aspectRatio,
      etikettModus: usesProductPhoto ? ("marke" as const) : ("generisch" as const),
      stiltreue: usesProductPhoto ? ("hoch" as const) : ("frei" as const),
      keepLabel: usesProductPhoto,
      photoStyle,
      aiWatermark,
      beerName: beer?.name?.trim() || undefined,
      zusatzWunsch: intentParts.join(". ").slice(0, 800),
      characterName: selectedCharacter?.name?.trim() || undefined,
      characterRole: selectedCharacter?.role?.trim() || undefined,
      characterReferenceImages: selectedCharacter
        ? selectedCharacter.referenceImageUrls.filter((url) => url?.trim()).slice(0, 3)
        : undefined,
      quality: requestQuality,
      variantCount: 1,
    };

    // Ergebnis entsteht hier auf der Bühne; Prompt und Einstellungen bleiben zum Iterieren stehen.
    try {
      await launchRun(payload, prompt, aspectRatio, false);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generierung fehlgeschlagen.");
    } finally {
      setGenBusy(false);
    }
  }, [
    activePreset,
    aiWatermark,
    aspectRatio,
    genBusy,
    launchRun,
    message,
    photoStyle,
    requestQuality,
    runInFlight,
    selectedBeer,
    selectedCharacter,
    selectedThumb,
    usesProductPhoto,
  ]);

  return (
    <div className="relative isolate flex h-full min-h-0 w-full flex-1 flex-col items-center bg-white dark:bg-black">
      <div className="relative z-10 flex h-full min-h-0 w-full flex-1 flex-col items-center">
        {runs.length > 0 ? (
          <div className="flex min-h-0 w-full flex-1 flex-col items-center px-4 pt-4 pb-2 sm:pt-6">
            <CreateResultStage
              runs={runs}
              activeRunId={activeRunId}
              onSelectRun={setActiveRunId}
              onRegenerate={regenerate}
              onNew={resetStage}
            />
          </div>
        ) : (
        <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center px-4 py-6 sm:py-8">
          <div className="text-center">
            <h1 className="sr-only">BrewAI</h1>
            <MagneticText
              text="BrewAI"
              hoverText="BrewAI"
              textClassName="text-4xl font-semibold tracking-normal drop-shadow-sm 2xl:text-5xl"
            />
            <p className="mt-2 text-neutral-600 dark:text-neutral-200">
              Ideen brauen. Bilder zapfen.
            </p>
          </div>
        </div>
        )}

        <div className="mb-3 flex w-full max-w-3xl shrink-0 flex-col gap-3 px-4 md:mb-[clamp(1rem,5vh,3.5rem)] 2xl:max-w-4xl">
          {genError ? (
            <p className="text-center text-sm text-destructive" role="alert">
              {genError}
            </p>
          ) : null}

          <div
            className={cn(
              "brew-composer",
              genBusy && "is-busy",
            )}
          >
            <div className="brew-composer__glow" aria-hidden />
            <div className="brew-composer__ring" aria-hidden />
            <div
              className={cn(
                "brew-composer__surface rounded-2xl border",
                "border-border bg-background shadow-sm",
                "dark:border-sidebar-border dark:bg-sidebar",
              )}
            >
            <AnimatePresence initial={false} mode="popLayout">
              {activePreset ? (
                <motion.div
                  key={activePreset.id}
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.96 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="flex px-4 pt-3"
                >
                  <span
                    className={cn(
                      "inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5",
                      "border-[#C7691E]/40 bg-[#C7691E]/10 text-[#A85518]",
                      "dark:border-[#C7691E]/40 dark:bg-[#C7691E]/15 dark:text-[#D4782A]",
                    )}
                  >
                    <StudioIcon name={activePreset.icon} size={14} />
                    <span className="truncate text-xs font-medium">
                      {activePreset.title}
                    </span>
                    <button
                      type="button"
                      aria-label="Preset entfernen"
                      onClick={clearPreset}
                      className="ml-0.5 rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100"
                    >
                      <StudioIcon name="x" size={12} />
                    </button>
                  </span>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                adjustHeight();
              }}
              placeholder={
                activePreset
                  ? "Optional: Zusatzwunsch…"
                  : "Beschreibe dein Bild…"
              }
              className={cn(
                "min-h-[48px] w-full resize-none border-none bg-transparent px-4 py-3 text-sm shadow-none",
                "text-foreground placeholder:text-muted-foreground",
                "dark:bg-transparent dark:text-white dark:placeholder:text-neutral-400",
                "focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0",
                activePreset && "pt-1",
              )}
              style={{ overflow: "hidden" }}
            />

            <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Popover open={beerPickerOpen} onOpenChange={setBeerPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Sorte wählen"
                    className={cn(
                      "h-9 shrink-0 gap-2 bg-transparent px-2 text-foreground hover:bg-transparent",
                      "dark:bg-transparent dark:text-white dark:hover:bg-transparent",
                      selectedBeer && "font-medium",
                    )}
                  >
                    {selectedThumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedThumb}
                        alt=""
                        className="h-5 w-5 rounded-full object-cover"
                      />
                    ) : (
                      <StudioIcon name="cup" size={16} />
                    )}
                    {selectedBeer ? (
                      <span className="hidden max-w-[9rem] truncate text-xs font-medium sm:inline">
                        {selectedBeer.name}
                      </span>
                    ) : (
                      <span className="hidden text-xs text-muted-foreground sm:inline dark:text-neutral-400">
                        Sorte
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="top"
                  className="w-80 gap-0 p-1.5"
                >
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Sortiment wählen
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {beersLoading ? (
                      <p className="px-2 py-3 text-xs text-muted-foreground">
                        Sortiment wird geladen…
                      </p>
                    ) : beersError ? (
                      <p className="px-2 py-3 text-xs text-destructive">{beersError}</p>
                    ) : beers.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-muted-foreground">
                        Noch keine Sorten angelegt. Lege sie unter Markenprofil /
                        Meine Biere an.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                            "hover:bg-muted",
                            !selectedBeer && "bg-muted",
                          )}
                          onClick={() => {
                            setSelectedBeer(null);
                            setBeerPickerOpen(false);
                          }}
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <StudioIcon name="cup" size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              Keine Sorte
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              Allgemein / ohne Produktbezug
                            </span>
                          </span>
                          {!selectedBeer ? (
                            <StudioIcon name="check" size={14} />
                          ) : null}
                        </button>

                        {beers.map((beer) => {
                          const active = selectedBeer?.id === beer.id;
                          const thumb = beer.etikettUrl?.trim() || "";
                          return (
                            <button
                              key={beer.id}
                              type="button"
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                                "hover:bg-muted",
                                active && "bg-muted",
                              )}
                              onClick={() => {
                                setSelectedBeer(beer);
                                setBeerPickerOpen(false);
                              }}
                            >
                              <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
                                {thumb ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={thumb}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-muted-foreground">
                                    {beerInitials(beer.name)}
                                  </span>
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">
                                  {beer.name}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {beerMeta(beer)}
                                </span>
                              </span>
                              {active ? <StudioIcon name="check" size={14} /> : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover open={characterPickerOpen} onOpenChange={setCharacterPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Charakter wählen"
                    className={cn(
                      "h-9 shrink-0 gap-2 bg-transparent px-2 text-foreground hover:bg-transparent",
                      "dark:bg-transparent dark:text-white dark:hover:bg-transparent",
                      selectedCharacter && "font-medium",
                    )}
                  >
                    {selectedCharacterThumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedCharacterThumb}
                        alt=""
                        className="h-5 w-5 rounded-full object-cover"
                      />
                    ) : (
                      <StudioIcon name="user" size={16} />
                    )}
                    {selectedCharacter ? (
                      <span className="hidden max-w-[9rem] truncate text-xs font-medium sm:inline">
                        {selectedCharacter.name}
                      </span>
                    ) : (
                      <span className="hidden text-xs text-muted-foreground sm:inline dark:text-neutral-400">
                        Charakter
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="top"
                  className="w-80 gap-0 p-1.5"
                >
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Charakter wählen
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {charactersLoading ? (
                      <p className="px-2 py-3 text-xs text-muted-foreground">
                        Charaktere werden geladen…
                      </p>
                    ) : charactersError ? (
                      <p className="px-2 py-3 text-xs text-destructive">{charactersError}</p>
                    ) : characters.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-muted-foreground">
                        Noch keine Charaktere angelegt. Lege sie unter Markenprofil an.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                            "hover:bg-muted",
                            !selectedCharacter && "bg-muted",
                          )}
                          onClick={() => selectCharacter(null)}
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <StudioIcon name="user" size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              Kein Charakter
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              Ohne Personenbezug
                            </span>
                          </span>
                          {!selectedCharacter ? (
                            <StudioIcon name="check" size={14} />
                          ) : null}
                        </button>

                        {characters.map((character) => {
                          const active = selectedCharacter?.id === character.id;
                          const thumb = character.referenceImageUrls?.[0]?.trim() || "";
                          return (
                            <button
                              key={character.id}
                              type="button"
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                                "hover:bg-muted",
                                active && "bg-muted",
                              )}
                              onClick={() => selectCharacter(character)}
                            >
                              <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
                                {thumb ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={thumb}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-muted-foreground">
                                    {beerInitials(character.name)}
                                  </span>
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">
                                  {character.name}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {character.role?.trim() || "Charakter"}
                                </span>
                              </span>
                              {active ? <StudioIcon name="check" size={14} /> : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover open={formatPickerOpen} onOpenChange={setFormatPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Format wählen"
                    className={cn(
                      "h-9 shrink-0 gap-2 bg-transparent px-2 text-foreground hover:bg-transparent",
                      "dark:bg-transparent dark:text-white dark:hover:bg-transparent",
                      "font-medium",
                    )}
                  >
                    <StudioIcon name="image" size={16} />
                    <span className="text-xs font-medium tabular-nums">{aspectRatio}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-56 p-2"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                >
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Bildformat
                  </div>
                  {selectedCharacter ? (
                    <p className="mb-1 px-2 text-[11px] text-muted-foreground">
                      Mit Charakter nur Hochformat (4:5, 3:4, 9:16).
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-0.5">
                    {ASPECT_OPTIONS.map(({ value, hint }) => {
                      const allowed =
                        !selectedCharacter ||
                        (CHARACTER_ASPECTS as readonly string[]).includes(value);
                      const active = aspectRatio === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={!allowed}
                          onClick={() => selectAspect(value)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40",
                            active && "bg-muted",
                          )}
                        >
                          <span className="w-12 font-medium tabular-nums">{value}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                            {hint}
                          </span>
                          {active ? <StudioIcon name="check" size={14} /> : null}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover open={qualityPickerOpen} onOpenChange={setQualityPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Qualität wählen"
                    className={cn(
                      "h-9 shrink-0 gap-2 bg-transparent px-2 text-foreground hover:bg-transparent",
                      "dark:bg-transparent dark:text-white dark:hover:bg-transparent",
                      "font-medium",
                    )}
                  >
                    <StudioIcon name="spark" size={16} />
                    <span className="text-xs font-medium tabular-nums">
                      {requestQuality === "ultra" ? "4K" : requestQuality === "high" ? "2K" : "1K"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-56 p-2"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                >
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Qualität / Skalierung
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {QUALITY_OPTIONS.map(({ value, label, hint }) => {
                      const active = requestQuality === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setRequestQuality(value);
                            setQualityPickerOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                            active && "bg-muted",
                          )}
                        >
                          <span className="w-20 font-medium">{label}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                            {hint}
                          </span>
                          {active ? <StudioIcon name="check" size={14} /> : null}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover open={presetPickerOpen} onOpenChange={setPresetPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Preset wählen"
                    className={cn(
                      "h-9 shrink-0 gap-2 bg-transparent px-2 text-foreground hover:bg-transparent",
                      "dark:bg-transparent dark:text-white dark:hover:bg-transparent",
                      activePreset && "font-medium",
                    )}
                  >
                    <StudioIcon name={activePreset?.icon ?? "spark"} size={16} />
                    {activePreset ? (
                      <span className="hidden max-w-[8rem] truncate text-xs font-medium sm:inline">
                        {activePreset.title}
                      </span>
                    ) : (
                      <span className="hidden text-xs text-muted-foreground sm:inline dark:text-neutral-400">
                        Preset
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="top"
                  className="w-80 gap-0 p-1.5"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                >
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Preset wählen
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                          "hover:bg-muted",
                          !activePreset && "bg-muted",
                        )}
                        onClick={() => {
                          clearPreset();
                          setPresetPickerOpen(false);
                        }}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <StudioIcon name="spark" size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            Kein Preset
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            Freier Prompt ohne Vorlage
                          </span>
                        </span>
                        {!activePreset ? <StudioIcon name="check" size={14} /> : null}
                      </button>

                      {quickPresets.map((template) => {
                        const active = activePresetId === template.id;
                        return (
                          <button
                            key={template.id}
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                              "hover:bg-muted",
                              active && "bg-muted",
                            )}
                            onClick={() => applyPreset(template)}
                          >
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                              style={{
                                backgroundColor: `${template.accent}22`,
                                color: template.accent,
                              }}
                            >
                              <StudioIcon name={template.icon} size={14} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {template.title}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {template.subtitle}
                              </span>
                            </span>
                            {active ? <StudioIcon name="check" size={14} /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              </div>

              <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:min-w-[13.5rem] sm:items-stretch">
                <div
                  className="grid w-full grid-cols-3 gap-1 rounded-xl border border-border bg-muted/40 p-1"
                  role="radiogroup"
                  aria-label="Fotostil"
                >
                  {PHOTO_STYLE_OPTIONS.map((option) => (
                    <div key={option.value} className="relative min-w-0">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={photoStyle === option.value}
                        aria-label={option.fullLabel}
                        title={option.fullLabel}
                        className={cn(
                          "w-full rounded-lg px-1 py-1.5 pr-5 text-[10px] font-semibold leading-tight transition-colors sm:text-[11px]",
                          photoStyle === option.value
                            ? "bg-background text-foreground shadow-sm dark:bg-white/10 dark:text-white"
                            : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                        )}
                        onClick={() => setPhotoStyle(option.value)}
                      >
                        {option.label}
                      </button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={`${option.fullLabel}: Infos`}
                            className="absolute top-1/2 right-0.5 inline-flex size-3.5 -translate-y-1/2 items-center justify-center rounded-full border border-border/80 text-[9px] font-semibold leading-none text-muted-foreground hover:bg-background hover:text-foreground"
                            onClick={(event) => event.stopPropagation()}
                          >
                            !
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          side="top"
                          align="center"
                          className="w-64 p-3 text-xs leading-relaxed text-muted-foreground"
                        >
                          <div className="mb-1 font-semibold text-foreground">{option.fullLabel}</div>
                          {option.hint}
                        </PopoverContent>
                      </Popover>
                    </div>
                  ))}
                </div>
                <div className="flex w-full items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground dark:text-white">
                      <span>AI-Label</span>
                      <Switch
                        checked={aiWatermark}
                        onCheckedChange={setAiWatermark}
                        aria-label="AI-Label"
                        className="data-[state=checked]:!bg-emerald-600 dark:data-[state=checked]:!bg-emerald-600"
                      />
                    </label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label="Was ist AI-Label?"
                          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          !
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="end"
                        className="w-64 p-3 text-xs leading-relaxed text-muted-foreground"
                      >
                        Dezentes „AI“-Label unten rechts — erkennbar für veröffentlichte Inhalte (EU AI Act,
                        Art. 50).
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <GlowButton
                  className="w-full"
                  disabled={!canGenerate}
                  onClick={() => void handleGenerate()}
                  showIcon={false}
                  label={
                    runInFlight ? (
                      "Wird erstellt …"
                    ) : (
                    <>
                      Generieren
                      <span className="font-normal opacity-90">
                        <span className="sm:hidden">
                          {" "}
                          · {generationTokenCost.toLocaleString("de-DE")}
                        </span>
                        <span className="hidden sm:inline">
                          {" "}
                          · {generationTokenCost.toLocaleString("de-DE")} Tokens
                        </span>
                      </span>
                    </>
                    )
                  }
                />
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
