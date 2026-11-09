"use client";

import React, { useEffect, useId, useState } from "react";
import { BrandReferenceGallery } from "@/components/dashboard/BrandReferenceGallery";
import { BrandProfileEmptyState } from "@/components/dashboard/BrandProfileEmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BrandingCard } from "@/components/ui/branding-card";
import { ColorPaletteCard } from "@/components/ui/color-palette-card";
import FileUpload from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProfileStrengthProgress } from "@/components/ui/profile-strength-progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToneFilterChips } from "@/components/ui/tone-filter-chips";
import { StudioIcon } from "@/components/studio/icons";
import { StudioButton, StudioPageHeader } from "@/components/studio/ui";
import {
  computeProfileStrength,
  formatDomain,
  parseHexSwatches,
  parseToneTags,
} from "@/lib/brand/brand-profile-display";
import { BrandImageRules } from "@/components/dashboard/BrandImageRules";
import { BrandBeersSection } from "@/components/dashboard/BrandBeersSection";
import { BrandCharactersSection } from "@/components/dashboard/BrandCharactersSection";

const BRAND_FONT_FAMILY = "BrewAiBrandHeadline";

type BrandSettings = {
  brandProfileMode: "undecided" | "guided" | "skip";
  brandInstagramUrl: string;
  brandWebsiteUrl: string;
  brandProfileSource: "url" | "instagram" | "manual" | "skip";
  brandLockLevel: "strict" | "balanced" | "loose";
  breweryName: string;
  brandTone: string;
  brandColors: string;
  brandDos: string;
  brandDonts: string;
  brandReferenceImageUrls: string[];
  brandHeadlineFontName?: string;
  brandFontFileUrl?: string;
  brandFontWeight?: string;
  brandAnalyzedAt?: string;
};

function formatAnalyzedLabel(iso?: string, fallbackNotice?: string): string {
  if (fallbackNotice?.trim()) return fallbackNotice;
  if (!iso?.trim()) return "Zuletzt analysiert · aktiv";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "Zuletzt analysiert · aktiv";
  const diffMs = Date.now() - t;
  if (diffMs < 60_000) return "Zuletzt analysiert · gerade eben";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `Zuletzt analysiert · vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Zuletzt analysiert · vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Zuletzt analysiert · gestern";
  return `Zuletzt analysiert · vor ${days} Tagen`;
}

const LOCK_OPTIONS: Array<{ id: BrandSettings["brandLockLevel"]; label: string; sub: string }> = [
  { id: "strict", label: "Streng", sub: "Maximale Markenbindung" },
  { id: "balanced", label: "Ausgewogen", sub: "Stil + kreativer Spielraum" },
  { id: "loose", label: "Frei", sub: "Profil als lose Inspiration" },
];

export function BrandProfileView({
  value,
  loaded,
  loadError,
  brandProfileComplete,
  brandProfileNotice,
  onOpenBrandSetup,
  onQuickAnalyze,
  onSkipBrandProfile,
  onResetBrandProfile,
  onChange,
  onSave,
}: {
  value: BrandSettings | null;
  loaded: boolean;
  loadError: string | null;
  brandProfileComplete: boolean;
  brandProfileNotice: string;
  onOpenBrandSetup: () => void;
  onQuickAnalyze?: (url: string) => void;
  onSkipBrandProfile: () => void;
  onResetBrandProfile: () => void | Promise<void>;
  onChange: (patch: Partial<BrandSettings>) => void;
  onSave: (patch?: Partial<BrandSettings>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fontUploadError, setFontUploadError] = useState<string | null>(null);
  const [fontReady, setFontReady] = useState(false);
  const fontFieldId = useId();
  const lockId = useId();

  const mode = value?.brandProfileMode ?? "undecided";
  const skipped = mode === "skip";
  const hasBrandData = Boolean(
    value?.brandTone?.trim() &&
      value?.brandColors?.trim() &&
      value?.brandDos?.trim() &&
      value?.brandDonts?.trim() &&
      (value?.breweryName?.trim() || value?.brandWebsiteUrl?.trim()),
  );
  const active = !skipped && (brandProfileComplete || (value?.brandProfileMode === "guided" && hasBrandData));

  async function selectLock(id: BrandSettings["brandLockLevel"]) {
    if (!value || skipped || value.brandLockLevel === id) return;
    onChange({ brandLockLevel: id });
    setSaving(true);
    setError(null);
    try {
      await onSave({ brandLockLevel: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadFont(file: File) {
    if (!value) throw new Error("Kein Markenprofil geladen.");
    setFontUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("fontName", value.brandHeadlineFontName?.trim() || file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/dashboard/brand-font", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = (await res.json()) as { error?: string; url?: string; fontName?: string };
      if (!res.ok) throw new Error(json.error ?? "Schrift-Upload fehlgeschlagen.");
      const patch = {
        brandFontFileUrl: json.url ?? "",
        brandHeadlineFontName: json.fontName ?? value.brandHeadlineFontName,
      };
      onChange(patch);
      await onSave(patch);
    } catch (uploadErr) {
      const message = uploadErr instanceof Error ? uploadErr.message : "Schrift-Upload fehlgeschlagen.";
      setFontUploadError(message);
      throw uploadErr instanceof Error ? uploadErr : new Error(message);
    }
  }

  async function clearFont() {
    if (!value) return;
    const patch = { brandFontFileUrl: "", brandHeadlineFontName: value.brandHeadlineFontName ?? "" };
    onChange(patch);
    setFontReady(false);
    try {
      await onSave(patch);
    } catch (e) {
      setFontUploadError(e instanceof Error ? e.message : "Schrift konnte nicht entfernt werden.");
    }
  }

  useEffect(() => {
    const url = value?.brandFontFileUrl?.trim();
    if (!url || typeof document === "undefined") {
      setFontReady(false);
      return;
    }
    let cancelled = false;
    const face = new FontFace(BRAND_FONT_FAMILY, `url(${JSON.stringify(url)})`, {
      weight: "100 900",
      style: "normal",
      display: "swap",
    });
    void face
      .load()
      .then((loaded) => {
        if (cancelled) return;
        document.fonts.add(loaded);
        setFontReady(true);
      })
      .catch(() => {
        if (!cancelled) setFontReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [value?.brandFontFileUrl]);

  if (!value) {
    return (
      <div className="studio-brand-page">
        {!loaded ? (
          <div className="studio-brand-skeleton" aria-busy="true" aria-label="Markenprofil wird geladen">
            <div className="studio-brand-skeleton__board studio-brand-skeleton__shimmer" />
            <div className="studio-brand-skeleton__rows">
              <div className="studio-brand-skeleton__line studio-brand-skeleton__shimmer" />
              <div className="studio-brand-skeleton__line studio-brand-skeleton__shimmer" />
            </div>
          </div>
        ) : loadError ? (
          <div className="studio-brand-quick">
            <div className="studio-brand-quick__copy">
              <div className="studio-brand-quick__t" style={{ color: "var(--warn)" }}>
                {loadError}
              </div>
            </div>
            <StudioButton type="button" variant="ghost" size="sm" onClick={() => window.location.reload()}>
              Erneut versuchen
            </StudioButton>
          </div>
        ) : (
          <p className="studio-faint">Keine Daten verfügbar.</p>
        )}
      </div>
    );
  }

  if (skipped || !active) {
    return (
      <BrandProfileEmptyState
        skipped={skipped}
        initialWebsiteUrl={value.brandWebsiteUrl}
        onQuickAnalyze={onQuickAnalyze}
        onOpenBrandSetup={onOpenBrandSetup}
        onSkipBrandProfile={onSkipBrandProfile}
      />
    );
  }

  const swatches = parseHexSwatches(value.brandColors);
  const hexOnly = swatches.map((c) => c.replace(/^#/, ""));
  const tags = parseToneTags(value.brandTone);
  const domain = value.brandWebsiteUrl
    ? formatDomain(value.brandWebsiteUrl)
    : value.breweryName || "beispiel.de";
  const analyzedLabel = formatAnalyzedLabel(value.brandAnalyzedAt, brandProfileNotice);
  const fontName = value.brandHeadlineFontName?.trim() || "Markenschrift";
  const strength = computeProfileStrength({
    breweryName: value.breweryName,
    brandTone: value.brandTone,
    brandColors: value.brandColors,
    brandDos: value.brandDos,
    brandDonts: value.brandDonts,
    referenceImageCount: value.brandReferenceImageUrls.length,
  });

  return (
    <div className="studio-brand-page">
      <StudioPageHeader
        eyebrow="Markenprofil · aktiv"
        title={value.breweryName.trim() || "Markenprofil"}
        subtitle="Diese Vorgaben fließen automatisch in jede Generierung ein."
        action={
          <StudioButton type="button" variant="ghost" size="sm" onClick={onOpenBrandSetup}>
            <StudioIcon name="pencil" size={15} />
            Neu einlesen
          </StudioButton>
        }
      />

      {/* Typografie + Upload | Farben spannt beide Zeilen · Schriftname darunter links */}
      <div className="mb-10 flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:grid-rows-[auto_auto]">
          <BrandingCard
            category="Branding"
            title="Typography"
            subtitle={fontName}
            displayElement={
              <span
                style={
                  fontReady
                    ? { fontFamily: `"${BRAND_FONT_FAMILY}", var(--font-sans, system-ui)` }
                    : undefined
                }
              >
                Aa<span className="text-white/40">Bb</span>
              </span>
            }
            className="!h-auto border-neutral-800 bg-[#1c1c1c] text-white shadow-none hover:shadow-xl [&_.text-muted-foreground]:text-neutral-400"
          />

          <ColorPaletteCard
            colors={hexOnly}
            statsText={`${domain} · ${analyzedLabel}`}
            className="h-full min-h-0 bg-[var(--s1)] shadow-sm md:row-span-2"
            icon={
              value.brandWebsiteUrl ? (
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--ok)]">Verbunden</span>
              ) : undefined
            }
          />

          <div className="min-w-0">
            <FileUpload
              multiple={false}
              maxFiles={1}
              accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
              titleIdle="Schrift hochladen"
              titleDragging="Schrift hier ablegen"
              titleHasFiles="Andere Schrift wählen"
              hint="Loslassen zum Hochladen"
              supportHint=".woff2, .woff, .ttf, .otf · max. 2 MB"
              uploadedLabel="Schriftdatei"
              clearAllLabel="Entfernen"
              onUpload={async (file) => {
                await uploadFont(file);
              }}
              onRemove={() => void clearFont()}
              onClearAll={() => void clearFont()}
            />
            {fontUploadError ? (
              <p className="studio-brand-inline-error mt-2" role="alert">
                {fontUploadError}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 md:w-[calc(50%-0.75rem)]">
          <Label htmlFor={fontFieldId} className="text-xs text-[var(--t3)]">
            Schriftname
          </Label>
          <Input
            id={fontFieldId}
            placeholder="z. B. Work Sans"
            value={value.brandHeadlineFontName ?? ""}
            onChange={(e) => onChange({ brandHeadlineFontName: e.target.value })}
            onBlur={() => void onSave({ brandHeadlineFontName: value.brandHeadlineFontName })}
            className="h-11 text-[15px]"
          />
          <p className="text-xs text-[var(--t3)]">
            {value.brandFontFileUrl
              ? fontReady
                ? "Eigene Datei aktiv für Bildexporte"
                : "Schrift wird vorbereitet …"
              : "Noch System-Fallback (Work Sans)"}
          </p>
        </div>
      </div>

      <div className="mb-10 max-w-md">
        <ProfileStrengthProgress
          value={strength.percent}
          statusLabel={strength.label}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]">
        <div className="flex min-w-0 flex-col gap-10">
          <section className="flex flex-col gap-6">
            <div className="studio-brand-sec__head">
              <h2>Vorgaben</h2>
            </div>

            <div className="rounded-2xl bg-[var(--s1)] p-5 shadow-sm sm:p-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--t3)]">Tonalität</p>
              <div className="mt-4">
                <ToneFilterChips
                  tags={tags}
                  onChange={(next) => {
                    const brandTone = next.join(", ");
                    onChange({ brandTone });
                    void onSave({ brandTone });
                  }}
                />
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <div className="studio-brand-sec__head">
              <h2>Bildregeln</h2>
              <span className="studio-brand-sec__note">Abgeleitet · anpassbar</span>
            </div>
            <BrandImageRules
              dos={value.brandDos}
              donts={value.brandDonts}
              referenceImageUrls={value.brandReferenceImageUrls}
              swatches={swatches}
              onSave={async (patch) => {
                onChange(patch);
                await onSave(patch);
              }}
            />
          </section>

          <BrandReferenceGallery urls={value.brandReferenceImageUrls} />

          <BrandBeersSection />

          <BrandCharactersSection />

          <div className="flex flex-col gap-4 rounded-2xl bg-[var(--s1)] p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--t1)]">Generisch weitermachen</div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--t3)]">
                Profil deaktivieren und Stil-Vorgaben entfernen. Neue Bilder ohne festes Markenprofil.
              </p>
            </div>
            <StudioButton
              type="button"
              variant="ghost"
              size="sm"
              disabled={resetting || saving}
              className="evg-btn--danger shrink-0"
              onClick={() => setResetConfirmOpen(true)}
            >
              {resetting ? "Wird zurückgesetzt…" : "Markenprofil löschen"}
            </StudioButton>
          </div>

          <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
            <AlertDialogContent size="default">
              <AlertDialogHeader>
                <AlertDialogTitle>Markenprofil löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Gespeicherte Farben, Tonalität und Bildregeln werden entfernt. Danach generierst du ohne festes
                  Markenprofil.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={resetting}
                  onClick={() => {
                    setResetting(true);
                    setError(null);
                    void Promise.resolve(onResetBrandProfile())
                      .catch((e) => {
                        setError(e instanceof Error ? e.message : "Zurücksetzen fehlgeschlagen.");
                      })
                      .finally(() => setResetting(false));
                  }}
                >
                  {resetting ? "Wird gelöscht…" : "Profil löschen"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <aside className="rounded-2xl bg-[var(--s1)] p-5 shadow-sm lg:sticky lg:top-6">
          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-medium leading-none text-[var(--t1)]">Markentreue</legend>
            <p className="text-xs leading-relaxed text-[var(--t3)]">
              Wie streng BrewAI sich an dein Markenprofil hält.
            </p>
            <RadioGroup
              className="flex flex-col gap-3"
              value={value.brandLockLevel}
              onValueChange={(v) => void selectLock(v as BrandSettings["brandLockLevel"])}
              disabled={saving}
            >
              {LOCK_OPTIONS.map((opt) => (
                <div
                  key={opt.id}
                  className="relative flex flex-col gap-1 rounded-xl bg-[var(--s2)] p-3 has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-ring"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      id={`${lockId}-${opt.id}`}
                      value={opt.id}
                      className="after:absolute after:inset-0"
                    />
                    <Label htmlFor={`${lockId}-${opt.id}`} className="font-medium">
                      {opt.label}
                    </Label>
                  </div>
                  <p className="pl-6 text-xs text-muted-foreground">{opt.sub}</p>
                </div>
              ))}
            </RadioGroup>
            {error ? (
              <p className="studio-brand-inline-error">{error}</p>
            ) : saving ? (
              <p className="text-xs text-muted-foreground">Speichert…</p>
            ) : null}
          </fieldset>
        </aside>
      </div>
    </div>
  );
}
