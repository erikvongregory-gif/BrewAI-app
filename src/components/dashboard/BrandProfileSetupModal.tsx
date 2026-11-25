"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BrandReviewPanel } from "@/components/dashboard/BrandReviewPanel";
import { StudioIcon } from "@/components/studio/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskSteps, type TaskStep } from "@/components/ui/task-steps";
import { fetchWithRetry, isTransientFetchError } from "@/lib/http/fetchWithRetry";
import { BRAND_SETTINGS_LIMITS, clampBrandSettingsFields } from "@/lib/dashboard/settingsPayload";
import { MAX_MY_BEERS, sanitizeProduktKategorie } from "@/lib/dashboard/metadata";
import { buildFieldStatusForActivation, FALLBACK_SWATCHES, formatDomain } from "@/lib/brand/brand-profile-display";
import {
  parseBrandEvidenceReport,
  parseProductEvidence,
  type BrandEvidenceReport,
  type ProductEvidence,
} from "@/lib/brand/brand-evidence-model";
import { cn } from "@/lib/utils";

export type BrandProfileSource = "url" | "instagram" | "manual" | "skip";

export type BrandReferenceImagePayload = {
  base64: string;
  mime: string;
};

export type BrandSuggestedBeer = {
  name: string;
  produktKategorie?: "bier" | "limonade" | "tafelwasser" | "mineralwasser";
  bierstil: string;
  flaschenTyp: string;
  flaschenfarbe: "braun" | "gruen" | "klar";
  glasTyp: string;
  filtrierung?: "filtriert" | "unfiltriert";
  etikettUrl: string;
  packagingNeedsReview?: boolean;
  /** Gebinde der Sorte laut Website (Flaschentyp-Codes). */
  gebinde?: string[];
  /** Weitere Bild-Kandidaten von der Website — im Prüfschritt wählbar. */
  bildAlternativen?: string[];
  bildStatus?: "flasche" | "etikett" | "ungeprueft" | "keins";
  /** Wo der Sortenname auf der Website steht — fehlt er, ist die Sorte unbestätigt. */
  nachweis?: ProductEvidence;
  /** false = Bierstil nicht angegeben (Standard geraten), true = belegt oder vom Nutzer gewählt. */
  bierstilBelegt?: boolean;
};

export type BrandScanSourceMeta = {
  confidence?: string;
  pageTitle?: string;
  reviewHints?: string[];
  /** Belegmodell je Feld (belegt / geschätzt / fehlt) — siehe lib/brand/brand-evidence. */
  evidence?: BrandEvidenceReport | null;
  crawlNote?: string | null;
  /** hersteller | gastro | handel | sonstiges */
  siteKind?: string;
  /** Bessere Scan-Adresse (z. B. Brauerei statt Wirtshaus). */
  suggestedUrl?: string;
};

export type BrandScanSuggestion = {
  breweryName: string;
  brandTone: string;
  brandColors: string;
  brandDos: string;
  brandDonts: string;
  referenceImageUrls: string[];
  referenceImagePayloads?: BrandReferenceImagePayload[];
  brandInstagramUrl: string;
  brandWebsiteUrl: string;
  brandProfileSource: BrandProfileSource;
  /** Bester Packshot (Etikett-Traeger) aus der Analyse — fuer Etikett-Treue bei der Generierung. */
  brandLabelReferenceUrl?: string;
  /** Aus Sortiment-/Produktseiten erkannte Biersorten — werden beim Aktivieren angelegt. */
  suggestedBeers?: BrandSuggestedBeer[];
  /** Aus Website-CSS / Google Fonts erkannte Headline-Schrift. */
  brandHeadlineFontName?: string;
  /** Hochgeladene Schriftdatei (signed URL), falls woff2 geladen werden konnte. */
  brandFontFileUrl?: string;
  /** Belegstatus je Feld beim Aktivieren (nur Website-Scan mit Belegmodell). */
  brandFieldStatus?: Partial<Record<string, "belegt" | "geschaetzt" | "fehlt" | "bestaetigt">>;
};

type Slot = {
  file: File | null;
  preview: string | null;
};

type ModalStep = "input" | "analyzing" | "review";
type InputTab = "url" | "manual";

const EMPTY_SLOTS: Slot[] = Array.from({ length: 5 }, () => ({ file: null, preview: null }));

/** Reihenfolge = Schritt-Index der Fortschrittsmeldungen von /api/brand/analyze-url. */
const ANALYSIS_STEPS = [
  "Website wird geladen…",
  "Unterseiten werden gelesen…",
  "Sortiment wird erkannt…",
  "Texte, Farben & Bildsprache werden erkannt…",
  "Produktbilder werden geprüft…",
  "Sortenbilder werden gespeichert…",
  "Markenprofil wird erstellt…",
];

/** Pausen (ms) zwischen den Checklisten-Schritten — der letzte Schritt bleibt aktiv bis zur Antwort. */
const ANALYSIS_STEP_DURATIONS_MS = [2400, 4200, 6200, 8200, 10500, 12500];

/** Hochwertiger Startpunkt fuer den Express-Weg ohne Analyse — Kunde ergaenzt nur den Namen. */
function manualTemplateReview(): BrandScanSuggestion {
  return {
    breweryName: "",
    brandTone: "Authentisch, Handwerklich, Regional, Warm",
    brandColors: FALLBACK_SWATCHES.join(", "),
    brandDos:
      "Warmes, natürliches Licht mit weichen Schatten. Produkt im Mittelpunkt, ruhige Komposition mit ehrlichen Materialien wie Holz und Glas.",
    brandDonts: "Keine grellen Neonfarben, keine überladenen Kompositionen, kein künstlich wirkender Studio-Look.",
    referenceImageUrls: [],
    brandInstagramUrl: "",
    brandWebsiteUrl: "",
    brandProfileSource: "manual",
  };
}

type BrandProfileSetupModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onSaved: (suggestion: BrandScanSuggestion) => Promise<void>;
  /** Vorbefuellte Website-URL fuer den Schnellstart aus dem Marken-Tab. */
  initialWebsiteUrl?: string;
  /** Zaehler — bei Erhoehung startet die URL-Analyse automatisch (Schnellstart). */
  autoAnalyzeSignal?: number;
};

function emptyReview(): BrandScanSuggestion {
  return {
    breweryName: "",
    brandTone: "",
    brandColors: "",
    brandDos: "",
    brandDonts: "",
    referenceImageUrls: [],
    brandInstagramUrl: "",
    brandWebsiteUrl: "",
    brandProfileSource: "url",
  };
}

function parseSuggestedBeers(value: unknown): BrandSuggestedBeer[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const beers: BrandSuggestedBeer[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<BrandSuggestedBeer>;
    if (typeof item.name !== "string" || !item.name.trim()) continue;
    const produktKategorie = sanitizeProduktKategorie(item.produktKategorie);
    beers.push({
      name: item.name.trim().slice(0, 80),
      produktKategorie,
      bierstil:
        typeof item.bierstil === "string" && item.bierstil.trim()
          ? item.bierstil.trim()
          : produktKategorie === "bier"
            ? "helles"
            : produktKategorie,
      flaschenTyp: typeof item.flaschenTyp === "string" && item.flaschenTyp.trim() ? item.flaschenTyp.trim() : "nrw_500",
      flaschenfarbe:
        item.flaschenfarbe === "gruen" || item.flaschenfarbe === "klar"
          ? item.flaschenfarbe
          : produktKategorie === "bier"
            ? "braun"
            : "klar",
      glasTyp: typeof item.glasTyp === "string" && item.glasTyp.trim() ? item.glasTyp.trim() : "willibecher",
      filtrierung:
        item.filtrierung === "unfiltriert" || item.filtrierung === "filtriert" ? item.filtrierung : undefined,
      etikettUrl: typeof item.etikettUrl === "string" ? item.etikettUrl.trim().slice(0, 1200) : "",
      packagingNeedsReview: item.packagingNeedsReview === true,
      gebinde: Array.isArray(item.gebinde)
        ? item.gebinde.filter((code): code is string => typeof code === "string").slice(0, 3)
        : undefined,
      bildAlternativen: Array.isArray(item.bildAlternativen)
        ? item.bildAlternativen.filter((url): url is string => typeof url === "string" && /^https?:/i.test(url)).slice(0, 5)
        : undefined,
      bildStatus:
        item.bildStatus === "flasche" ||
        item.bildStatus === "etikett" ||
        item.bildStatus === "ungeprueft" ||
        item.bildStatus === "keins"
          ? item.bildStatus
          : undefined,
      nachweis: parseProductEvidence(item.nachweis),
      bierstilBelegt: typeof item.bierstilBelegt === "boolean" ? item.bierstilBelegt : undefined,
    });
    if (beers.length >= MAX_MY_BEERS) break;
  }
  return beers.length > 0 ? beers : undefined;
}

function suggestionFromPartial(s: Partial<BrandScanSuggestion>, defaults: Partial<BrandScanSuggestion>): BrandScanSuggestion {
  return {
    breweryName: s.breweryName ?? "",
    brandTone: s.brandTone ?? "",
    brandColors: s.brandColors ?? "",
    brandDos: s.brandDos ?? "",
    brandDonts: s.brandDonts ?? "",
    referenceImageUrls: Array.isArray(s.referenceImageUrls) ? s.referenceImageUrls : [],
    referenceImagePayloads: Array.isArray(s.referenceImagePayloads) ? s.referenceImagePayloads : undefined,
    brandInstagramUrl: typeof s.brandInstagramUrl === "string" ? s.brandInstagramUrl : defaults.brandInstagramUrl ?? "",
    brandWebsiteUrl: typeof s.brandWebsiteUrl === "string" ? s.brandWebsiteUrl : defaults.brandWebsiteUrl ?? "",
    brandProfileSource: defaults.brandProfileSource ?? "url",
    brandLabelReferenceUrl: typeof s.brandLabelReferenceUrl === "string" ? s.brandLabelReferenceUrl : "",
    suggestedBeers: parseSuggestedBeers(s.suggestedBeers),
    brandHeadlineFontName:
      typeof s.brandHeadlineFontName === "string" ? s.brandHeadlineFontName.trim().slice(0, 80) : "",
    brandFontFileUrl: typeof s.brandFontFileUrl === "string" ? s.brandFontFileUrl.trim().slice(0, 1200) : "",
  };
}

function hasUsableReferenceUrls(urls: string[]): boolean {
  return urls.some((raw) => {
    try {
      const parsed = new URL(raw.trim());
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  });
}

function buildActivateRequestBody(suggestion: BrandScanSuggestion): Record<string, unknown> {
  const { referenceImagePayloads, ...rest } = suggestion;
  const clamped = clampBrandSettingsFields({
    breweryName: rest.breweryName,
    brandTone: rest.brandTone,
    brandColors: rest.brandColors,
    brandDos: rest.brandDos,
    brandDonts: rest.brandDonts,
    brandInstagramUrl: rest.brandInstagramUrl,
    brandWebsiteUrl: rest.brandWebsiteUrl,
    brandHeadlineFontName: rest.brandHeadlineFontName ?? "",
  });

  return {
    breweryName: clamped.breweryName ?? rest.breweryName.trim().slice(0, BRAND_SETTINGS_LIMITS.breweryName),
    brandTone: clamped.brandTone ?? rest.brandTone.trim().slice(0, BRAND_SETTINGS_LIMITS.brandTone),
    brandColors: clamped.brandColors ?? rest.brandColors.trim().slice(0, BRAND_SETTINGS_LIMITS.brandColors),
    brandDos: clamped.brandDos ?? rest.brandDos.trim().slice(0, BRAND_SETTINGS_LIMITS.brandDos),
    brandDonts: clamped.brandDonts ?? rest.brandDonts.trim().slice(0, BRAND_SETTINGS_LIMITS.brandDonts),
    brandInstagramUrl: rest.brandInstagramUrl,
    brandWebsiteUrl: rest.brandWebsiteUrl,
    brandProfileSource:
      rest.brandProfileSource === "manual"
        ? "manual"
        : rest.brandProfileSource === "instagram"
          ? "instagram"
          : "url",
    brandReferenceImageUrls: rest.referenceImageUrls,
    brandLabelReferenceUrl: rest.brandLabelReferenceUrl ?? "",
    brandHeadlineFontName: clamped.brandHeadlineFontName ?? (rest.brandHeadlineFontName ?? "").trim().slice(0, 80),
    brandFontFileUrl: (rest.brandFontFileUrl ?? "").trim().slice(0, 1200),
    referenceImagePayloads:
      hasUsableReferenceUrls(rest.referenceImageUrls) || !referenceImagePayloads?.length
        ? undefined
        : referenceImagePayloads,
    ...(rest.suggestedBeers?.length ? { suggestedBeers: rest.suggestedBeers } : {}),
    ...(rest.brandFieldStatus ? { brandFieldStatus: rest.brandFieldStatus } : {}),
  };
}

async function verifyBrandProfileSaved(
  expected: Omit<BrandScanSuggestion, "referenceImagePayloads">,
): Promise<BrandScanSuggestion | null> {
  try {
    const params = new URLSearchParams({ breweryName: expected.breweryName.trim() });
    const res = await fetch(`/api/brand/profile-status?${params.toString()}`, {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      saved?: boolean;
      settings?: {
        brandReferenceImageUrls?: string[];
      };
    };
    if (!data.saved) return null;

    // Profil gespeichert heißt nicht Sorten gespeichert — sonst meldet das Fenster Erfolg,
    // obwohl das Sortiment fehlt (z. B. Server-Fehler nach dem Profil-Update).
    if (expected.suggestedBeers?.length) {
      const beersRes = await fetch("/api/dashboard/my-beers", { cache: "no-store", credentials: "include" });
      if (!beersRes.ok) return null;
      const beersData = (await beersRes.json()) as { beers?: Array<{ name?: string }> };
      const savedNames = new Set(
        (beersData.beers ?? []).map((beer) => (beer.name ?? "").trim().toLowerCase()).filter(Boolean),
      );
      const allSaved = expected.suggestedBeers.every((beer) => savedNames.has(beer.name.trim().toLowerCase()));
      if (!allSaved) return null;
    }

    return {
      ...expected,
      referenceImageUrls:
        Array.isArray(data.settings?.brandReferenceImageUrls) && data.settings.brandReferenceImageUrls.length > 0
          ? data.settings.brandReferenceImageUrls
          : expected.referenceImageUrls,
    };
  } catch {
    return null;
  }
}

function refreshAuthSessionInBackground(): void {
  void fetch("/api/auth/repair-session", { method: "POST", credentials: "include", cache: "no-store" }).catch(
    () => undefined,
  );
}

async function postActivateBrandProfile(suggestion: BrandScanSuggestion): Promise<BrandScanSuggestion> {
  const { referenceImagePayloads: _payloads, ...rest } = suggestion;
  const requestBody = buildActivateRequestBody(suggestion);

  const parseSuccess = async (res: Response): Promise<BrandScanSuggestion> => {
    let data: { error?: string; referenceImageUrls?: string[] };
    try {
      data = (await res.json()) as { error?: string; referenceImageUrls?: string[] };
    } catch {
      const verified = await verifyBrandProfileSaved(rest);
      if (verified) {
        refreshAuthSessionInBackground();
        return verified;
      }
      throw new Error(res.ok ? "Ungueltige Server-Antwort." : `Speichern fehlgeschlagen (HTTP ${res.status}).`);
    }

    if (!res.ok) {
      const verified = await verifyBrandProfileSaved(rest);
      if (verified) {
        refreshAuthSessionInBackground();
        return verified;
      }
      throw new Error(data.error ?? "Markenprofil konnte nicht gespeichert werden.");
    }

    refreshAuthSessionInBackground();
    const persistedUrls = Array.isArray(data.referenceImageUrls) ? data.referenceImageUrls.filter(Boolean) : [];
    return {
      ...rest,
      referenceImageUrls: persistedUrls.length > 0 ? persistedUrls : rest.referenceImageUrls,
    };
  };

  try {
    const res = await fetch("/api/brand/activate-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(requestBody),
    });
    return await parseSuccess(res);
  } catch (error) {
    if (isTransientFetchError(error)) {
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      const verified = await verifyBrandProfileSaved(rest);
      if (verified) {
        refreshAuthSessionInBackground();
        return verified;
      }
    }
    throw error;
  }
}

function formatAnalysisError(error: unknown, phase: "analyze" | "save" = "analyze"): string {
  if (error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message)) {
    if (phase === "save") {
      return "Profil konnte nicht gespeichert werden (Verbindungsabbruch). Bitte erneut versuchen.";
    }
    return "Die Verbindung wurde unterbrochen — die Analyse kann bis zu 2 Min. dauern. Bitte erneut versuchen und das Fenster offen lassen.";
  }
  if (error instanceof Error) return error.message;
  return phase === "save" ? "Speichern fehlgeschlagen." : "Analyse fehlgeschlagen.";
}

type AnalyzeUrlResult = {
  status: number;
  body: {
    error?: string;
    suggestion?: Partial<BrandScanSuggestion>;
    sourceMeta?: BrandScanSourceMeta;
  };
};

/**
 * Startet die Website-Analyse als Stream: Zwischenstände (Schritt + Text) kommen live,
 * das Ergebnis als letzte Zeile. Antwortet der Server klassisch mit JSON, wird das genauso gelesen.
 */
async function postBrandAnalyzeUrl(
  url: string,
  onProgress: (step: number, label: string) => void,
): Promise<AnalyzeUrlResult> {
  const res = await fetchWithRetry(
    "/api/brand/analyze-url",
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson, application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ websiteUrl: url }),
    },
    { retries: 2, baseDelayMs: 1500 },
  );
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("ndjson") || !res.body) {
    try {
      return { status: res.status, body: (await res.json()) as AnalyzeUrlResult["body"] };
    } catch {
      throw new Error(res.ok ? "Ungueltige Server-Antwort." : `Analyse fehlgeschlagen (HTTP ${res.status}).`);
    }
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AnalyzeUrlResult | null = null;
  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let event: { type?: string; step?: unknown; label?: unknown; status?: unknown; body?: unknown };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      return;
    }
    if (event.type === "progress" && typeof event.step === "number") {
      onProgress(event.step, typeof event.label === "string" ? event.label : "");
    } else if (event.type === "result") {
      result = {
        status: typeof event.status === "number" ? event.status : 500,
        body: (event.body ?? {}) as AnalyzeUrlResult["body"],
      };
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  handleLine(buffer);
  if (!result) throw new TypeError("Failed to fetch");
  return result;
}

export function BrandProfileSetupModal({
  open,
  onOpenChange,
  title,
  onSaved,
  initialWebsiteUrl,
  autoAnalyzeSignal,
}: BrandProfileSetupModalProps) {
  const [inputTab, setInputTab] = useState<InputTab>("url");
  const [step, setStep] = useState<ModalStep>("input");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [slots, setSlots] = useState<Slot[]>(EMPTY_SLOTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [analysisStepIndex, setAnalysisStepIndex] = useState(0);
  const [analysisDetail, setAnalysisDetail] = useState("");
  /** Sobald der Server echte Schritte meldet, läuft die Checkliste nicht mehr nach Zeit weiter. */
  const serverProgressRef = useRef(false);
  const [review, setReview] = useState<BrandScanSuggestion>(emptyReview);
  const [sourceMeta, setSourceMeta] = useState<BrandScanSourceMeta | null>(null);
  /** Unveränderter Scan-Vorschlag — geänderte Felder gelten beim Aktivieren als „vom Nutzer bestätigt“. */
  const [scanBaseline, setScanBaseline] = useState<BrandScanSuggestion | null>(null);
  const [handledAutoSignal, setHandledAutoSignal] = useState(0);

  const filledCount = slots.filter((s) => s.file).length;
  const modalTitle = title ?? "Marke einlesen";
  const taskSteps: TaskStep[] = useMemo(
    () => ANALYSIS_STEPS.map((label, i) => ({ id: `step-${i}`, label })),
    [],
  );
  const analysisTargetLabel =
    inputTab === "url" ? formatDomain(websiteUrl) : `${filledCount} Screenshot${filledCount === 1 ? "" : "s"}`;

  const resetForm = useCallback(() => {
    setInputTab("url");
    setStep("input");
    setWebsiteUrl("");
    setSlots(EMPTY_SLOTS.map(() => ({ file: null, preview: null })));
    setError("");
    setAnalysisStepIndex(0);
    setAnalysisDetail("");
    setReview(emptyReview());
    setSourceMeta(null);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) resetForm();
    onOpenChange(next);
  };

  useEffect(() => {
    if (step !== "analyzing") return;
    setAnalysisStepIndex(0);
    let cancelled = false;
    let timer: number | undefined;
    let index = 0;
    const schedule = () => {
      if (cancelled || index >= ANALYSIS_STEPS.length - 1) return;
      const delay = ANALYSIS_STEP_DURATIONS_MS[Math.min(index, ANALYSIS_STEP_DURATIONS_MS.length - 1)] ?? 5000;
      timer = window.setTimeout(() => {
        if (serverProgressRef.current) return;
        index += 1;
        setAnalysisStepIndex(index);
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [step]);

  const setSlotFile = (index: number, file: File | null) => {
    setSlots((prev) => {
      const next = [...prev];
      const old = next[index];
      if (old?.preview) URL.revokeObjectURL(old.preview);
      if (!file) {
        next[index] = { file: null, preview: null };
        return next;
      }
      const preview = URL.createObjectURL(file);
      next[index] = { file, preview };
      return next;
    });
  };

  const applySuggestion = (s: BrandScanSuggestion) => {
    setReview(s);
    setStep("review");
  };

  const activateBrandProfile = async (suggestion: BrandScanSuggestion) => {
    const saved = await postActivateBrandProfile(suggestion);
    try {
      await onSaved(saved);
    } catch (syncError) {
      console.warn("[brand-profile] UI-Sync nach Speichern fehlgeschlagen:", syncError);
    }
    resetForm();
    onOpenChange(false);
  };

  const runUrlAnalysis = useCallback(async (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) {
      setError("Bitte die Website deiner Marke eingeben.");
      return;
    }
    if (/instagram\.com/i.test(url)) {
      setError("Instagram-Links können wir nicht einlesen. Bitte die Website oder Screenshots verwenden.");
      return;
    }

    setBusy(true);
    setError("");
    setAnalysisDetail("");
    serverProgressRef.current = false;
    setStep("analyzing");
    try {
      const { status, body: data } = await postBrandAnalyzeUrl(url, (stepIndex, label) => {
        serverProgressRef.current = true;
        setAnalysisStepIndex((current) => Math.max(current, Math.min(stepIndex, ANALYSIS_STEPS.length - 1)));
        if (label) setAnalysisDetail(label);
      });
      if (status < 200 || status >= 300) throw new Error(data.error ?? `Analyse fehlgeschlagen (HTTP ${status}).`);

      const s = data.suggestion;
      if (!s?.breweryName || !s?.brandTone || !s?.brandColors || !s?.brandDos || !s?.brandDonts) {
        throw new Error("Ungueltige Server-Antwort.");
      }

      const suggestion = suggestionFromPartial(s, {
        brandWebsiteUrl: url,
        brandProfileSource: "url",
      });
      setSourceMeta(
        data.sourceMeta ? { ...data.sourceMeta, evidence: parseBrandEvidenceReport(data.sourceMeta.evidence) } : null,
      );
      setReview(suggestion);
      setScanBaseline(suggestion);
      setStep("review");
    } catch (e) {
      setStep("input");
      setError(formatAnalysisError(e, "analyze"));
    } finally {
      setBusy(false);
    }
  }, []);

  // Schnellstart aus dem Marken-Tab: URL uebernehmen und Analyse sofort starten.
  useEffect(() => {
    if (!open || !autoAnalyzeSignal || autoAnalyzeSignal === handledAutoSignal) return;
    setHandledAutoSignal(autoAnalyzeSignal);
    const url = (initialWebsiteUrl ?? "").trim();
    setInputTab("url");
    if (!url) return;
    setWebsiteUrl(url);
    void runUrlAnalysis(url);
  }, [open, autoAnalyzeSignal, handledAutoSignal, initialWebsiteUrl, runUrlAnalysis]);

  /** Express-Weg: sofort in den Review-Schritt mit hochwertiger Vorlage — kein Scan noetig. */
  const startManualTemplate = () => {
    setError("");
    setSourceMeta(null);
    setReview(manualTemplateReview());
    setStep("review");
  };

  const runManualScan = async () => {
    if (filledCount < 1) {
      setError("Bitte mindestens 1 Screenshot auswählen.");
      return;
    }
    setBusy(true);
    setError("");
    setStep("analyzing");
    try {
      const fd = new FormData();
      for (const slot of slots) {
        if (slot.file) fd.append("image", slot.file);
      }
      const res = await fetch("/api/brand/scan-instagram-posts", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      let data: { error?: string; suggestion?: Partial<BrandScanSuggestion> };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        throw new Error(res.ok ? "Ungueltige Server-Antwort." : "Auswertung fehlgeschlagen.");
      }
      if (!res.ok) throw new Error(data.error ?? "Auswertung fehlgeschlagen.");

      const s = data.suggestion;
      if (!s?.breweryName || !s?.brandTone || !s?.brandColors || !s?.brandDos || !s?.brandDonts) {
        throw new Error("Ungueltige Server-Antwort.");
      }

      applySuggestion({
        breweryName: s.breweryName,
        brandTone: s.brandTone,
        brandColors: s.brandColors,
        brandDos: s.brandDos,
        brandDonts: s.brandDonts,
        referenceImageUrls: Array.isArray(s.referenceImageUrls) ? s.referenceImageUrls : [],
        brandInstagramUrl: typeof s.brandInstagramUrl === "string" ? s.brandInstagramUrl : "",
        brandWebsiteUrl: "",
        brandProfileSource: "manual",
      });
      setSourceMeta(null);
    } catch (e) {
      setStep("input");
      setError(formatAnalysisError(e, "analyze"));
    } finally {
      setBusy(false);
    }
  };

  const saveReview = async () => {
    if (
      !review.breweryName.trim() ||
      !review.brandTone.trim() ||
      !review.brandColors.trim() ||
      !review.brandDos.trim() ||
      !review.brandDonts.trim()
    ) {
      setError("Bitte alle Markenprofil-Felder ausfuellen.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const brandFieldStatus =
        review.brandProfileSource === "url"
          ? buildFieldStatusForActivation({
              evidence: sourceMeta?.evidence?.felder,
              scanned: scanBaseline,
              current: review,
            })
          : undefined;
      await activateBrandProfile(brandFieldStatus ? { ...review, brandFieldStatus } : review);
    } catch (e) {
      setError(formatAnalysisError(e, "save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "evg-studio studio-brand-modal fixed left-1/2 top-1/2 z-[130] flex max-h-[min(92vh,820px)] w-[min(100%,36rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-3xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-2xl sm:max-w-xl dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100",
          step === "review" && "max-w-2xl sm:max-w-2xl",
        )}
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">
          {step === "review" ? "Profil prüfen" : step === "analyzing" ? "Marke wird analysiert" : modalTitle}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {step === "review"
            ? "Passe den KI-Vorschlag an, bevor du dein Markenprofil aktivierst."
            : step === "analyzing"
              ? ANALYSIS_STEPS[analysisStepIndex]
              : "Ein Link genügt — BrewAI erkennt Tonalität, Farben und Bildsprache deiner Marke."}
        </DialogDescription>

        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 z-20 size-9 shrink-0 text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
            aria-label="Schließen"
            disabled={busy}
            onClick={(event) => {
              if (busy) {
                event.preventDefault();
                return;
              }
              handleOpenChange(false);
            }}
          >
            <StudioIcon name="x" size={18} />
          </Button>
        </DialogClose>

        {step === "review" ? (
          <BrandReviewPanel
            review={review}
            sourceMeta={sourceMeta}
            busy={busy}
            error={error}
            onChange={(patch) => setReview((prev) => ({ ...prev, ...patch }))}
            onBack={() => {
              setStep("input");
              setError("");
            }}
            onRescan={(nextUrl) => {
              setWebsiteUrl(nextUrl);
              void runUrlAnalysis(nextUrl);
            }}
            onActivate={() => void saveReview()}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="mb-6 flex items-start gap-3 pr-10 sm:gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-neutral-800 text-white dark:bg-neutral-700 sm:size-12">
                <StudioIcon name="brand" size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                  Markenprofil
                </p>
                <h2 className="mb-2 text-base font-semibold text-neutral-900 dark:text-neutral-100 sm:text-lg">
                  {modalTitle}
                </h2>
                <p className="text-sm font-normal leading-relaxed text-neutral-600 dark:text-neutral-400">
                  Ein Link genügt — BrewAI liest deine Website samt Unterseiten und erkennt Tonalität, Farben und
                  Bildsprache.
                </p>
              </div>
            </div>

            {step === "input" ? (
              <>
                <Tabs
                  value={inputTab}
                  onValueChange={(v) => setInputTab(v as InputTab)}
                  className="mb-6 gap-0 sm:mb-8"
                >
                  <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
                    <TabsTrigger
                      value="url"
                      className="gap-1.5 rounded-lg px-2 py-2.5 text-xs font-medium data-active:bg-white data-active:text-neutral-900 data-active:shadow-sm sm:text-sm dark:data-active:bg-neutral-700 dark:data-active:text-neutral-100"
                    >
                      <StudioIcon name="globe" size={15} />
                      <span className="hidden sm:inline">Website</span>
                      <span className="sm:hidden">Web</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="manual"
                      className="gap-1.5 rounded-lg px-2 py-2.5 text-xs font-medium data-active:bg-white data-active:text-neutral-900 data-active:shadow-sm sm:text-sm dark:data-active:bg-neutral-700 dark:data-active:text-neutral-100"
                    >
                      <StudioIcon name="image" size={15} />
                      <span className="hidden sm:inline">Screenshots</span>
                      <span className="sm:hidden">Upload</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="url" className="mt-6 space-y-4">
                    <div>
                      <Label htmlFor="brand-website-url" className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        Website deiner Marke
                      </Label>
                      <div className="relative mt-2">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                          <StudioIcon name="globe" size={16} />
                        </span>
                        <Input
                          id="brand-website-url"
                          type="url"
                          inputMode="url"
                          autoComplete="url"
                          value={websiteUrl}
                          onChange={(e) => setWebsiteUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && websiteUrl.trim() && !busy) void runUrlAnalysis(websiteUrl);
                          }}
                          disabled={busy}
                          placeholder="www.deine-brauerei.de"
                          className="h-12 rounded-xl border-neutral-300 bg-white pl-10 dark:border-neutral-700 dark:bg-neutral-900"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {[
                        { icon: "globe" as const, label: "Über uns" },
                        { icon: "media" as const, label: "Sortiment" },
                        { icon: "brand" as const, label: "Farben & Ton" },
                      ].map((chip) => (
                        <div
                          key={chip.label}
                          className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/50"
                        >
                          <span className="text-neutral-500">
                            <StudioIcon name={chip.icon} size={14} />
                          </span>
                          <span className="text-xs text-neutral-600 dark:text-neutral-400">{chip.label}</span>
                        </div>
                      ))}
                    </div>
                    {websiteUrl.trim() ? (
                      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900/50">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 items-center justify-center rounded-lg bg-neutral-200 dark:bg-neutral-800">
                            <StudioIcon name="link" size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                              Bereit zur Analyse
                            </p>
                            <p className="truncate text-xs text-neutral-600 dark:text-neutral-400">{websiteUrl}</p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <p className="text-xs leading-relaxed text-neutral-500">
                      Analysiert öffentliche Texte und Bilder — inklusive relevanter Unterseiten.
                    </p>
                  </TabsContent>

                  <TabsContent value="manual" className="mt-6 space-y-4">
                    <div className="rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-6 text-center dark:border-neutral-700 dark:bg-neutral-900/50">
                      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                        <StudioIcon name="image" size={22} />
                      </div>
                      <h3 className="mb-2 text-base font-medium text-neutral-900 dark:text-neutral-100">
                        Screenshots ablegen
                      </h3>
                      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
                        1–5 Screenshots als JPEG, PNG oder WebP
                      </p>
                      <div className="mx-auto grid max-w-sm grid-cols-5 gap-2">
                        {slots.map((slot, i) => (
                          <label
                            key={i}
                            className={cn(
                              "relative grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-lg border bg-white dark:bg-neutral-900",
                              slot.file
                                ? "border-solid border-neutral-300 dark:border-neutral-600"
                                : "border-dashed border-neutral-300 dark:border-neutral-700",
                            )}
                          >
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="sr-only"
                              disabled={busy}
                              onChange={(e) => {
                                const f = e.target.files?.[0] ?? null;
                                e.target.value = "";
                                setSlotFile(i, f);
                              }}
                            />
                            {slot.preview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={slot.preview} alt="" className="size-full object-cover" />
                            ) : (
                              <span className="text-[10px] text-neutral-400">{i + 1}</span>
                            )}
                          </label>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-neutral-500">
                        {filledCount} / 5 Bilder
                        {filledCount > 0 && filledCount < 3 ? " — mehr Bilder = präziseres Profil" : ""}
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="mb-2 text-center">
                  <button
                    type="button"
                    className="text-xs text-neutral-500 underline underline-offset-3 hover:text-neutral-700 disabled:opacity-50 dark:hover:text-neutral-300"
                    disabled={busy}
                    onClick={startManualTemplate}
                  >
                    Ohne Analyse starten — Profil mit Vorlage selbst ausfüllen
                  </button>
                </div>
              </>
            ) : null}

            {step === "analyzing" ? (
              <div className="py-4">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                  <StudioIcon name={inputTab === "url" ? "globe" : "media"} size={13} />
                  <span>{analysisTargetLabel}</span>
                </div>
                <TaskSteps steps={taskSteps} current={analysisStepIndex} label="Analyse-Fortschritt" />
                {analysisDetail ? (
                  <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300" aria-live="polite">
                    {analysisDetail}
                  </p>
                ) : null}
                <p className="mt-6 text-sm text-neutral-500">
                  Dauert meist ein bis zwei Minuten — bitte Fenster offen lassen.
                </p>
              </div>
            ) : null}

            {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

            {step !== "analyzing" ? (
              <div className="mt-8 flex flex-col-reverse gap-3 border-t border-neutral-200 pt-6 sm:flex-row sm:justify-end sm:gap-4 dark:border-neutral-800">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => handleOpenChange(false)}
                  className="h-12 rounded-xl border-neutral-300 bg-transparent px-6 text-sm dark:border-neutral-700"
                >
                  Abbrechen
                </Button>
                <Button
                  type="button"
                  disabled={
                    busy ||
                    (inputTab === "manual" && filledCount < 1) ||
                    (inputTab === "url" && !websiteUrl.trim())
                  }
                  onClick={() => {
                    if (inputTab === "url") void runUrlAnalysis(websiteUrl);
                    else void runManualScan();
                  }}
                  className="h-12 rounded-xl bg-neutral-900 px-8 font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                >
                  {busy ? (
                    "KI analysiert…"
                  ) : inputTab === "url" ? (
                    <>
                      <StudioIcon name="spark" size={15} />
                      Website analysieren
                    </>
                  ) : (
                    "Auswerten"
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
