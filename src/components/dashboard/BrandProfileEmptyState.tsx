"use client";

import { useId, useState } from "react";
import { ArrowRight, Check, Globe2, Images } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BrandingCard } from "@/components/ui/branding-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorPaletteCard } from "@/components/ui/color-palette-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BrandProfileEmptyStateProps = {
  skipped: boolean;
  initialWebsiteUrl?: string;
  onQuickAnalyze?: (url: string) => void;
  onOpenBrandSetup: () => void;
  onSkipBrandProfile: () => void;
};

/** Beispielwerte für die Vorschau — gleiche Bausteine wie das aktive Profil. */
const SAMPLE_COLORS = ["c7691e", "e6ae76", "e4d6bc", "87907d", "303d34"];
const SAMPLE_TONE = ["Ehrlich", "Handwerklich", "Nahbar"];

const STEPS = [
  { title: "Website eingeben", text: "Oder Screenshots und Referenzbilder hinzufügen." },
  { title: "Marke erkennen", text: "BrewAI schlägt Farben, Schrift, Tonalität und Bildregeln vor." },
  { title: "Prüfen & übernehmen", text: "Du entscheidest, was in dein Profil kommt." },
];

export function BrandProfileEmptyState({
  skipped,
  initialWebsiteUrl = "",
  onQuickAnalyze,
  onOpenBrandSetup,
  onSkipBrandProfile,
}: BrandProfileEmptyStateProps) {
  const inputId = useId();
  const [url, setUrl] = useState(initialWebsiteUrl);
  const [error, setError] = useState("");

  function submit() {
    setError("");
    let website: URL;
    try {
      const raw = url.trim();
      website = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!raw || !["http:", "https:"].includes(website.protocol) || !website.hostname.includes(".") || website.username || website.password) {
        throw new Error();
      }
    } catch {
      setError("Bitte gib eine gültige Website ein, zum Beispiel deine-brauerei.de.");
      return;
    }
    if (onQuickAnalyze) onQuickAnalyze(website.toString());
    else onOpenBrandSetup();
  }

  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-6" aria-labelledby="brand-empty-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="brand-empty-title" className="text-2xl font-semibold tracking-tight">Markenprofil</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Dein Stil. Die Grundlage für deine Motive.</p>
        </div>
        <Badge variant="secondary">{skipped ? "Aktuell ohne Markenprofil" : "Noch nicht eingerichtet"}</Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lies deine Marke ein</CardTitle>
          <CardDescription>
            Ein Link genügt: BrewAI erkennt Farben, Schrift und Tonalität und wendet sie auf jedes neue Motiv an.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Label htmlFor={inputId} className="sr-only">Website deiner Brauerei</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Globe2 size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id={inputId}
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    if (error) setError("");
                  }}
                  placeholder="deine-brauerei.de"
                  inputMode="url"
                  autoComplete="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={2000}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ""}`}
                  className="h-11 pl-9"
                />
              </div>
              <Button type="submit" className="h-11 gap-2 px-5">
                Website einlesen <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </div>
            {error ? <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
            <p id={`${inputId}-hint`} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check size={14} className="shrink-0" aria-hidden="true" />
              Du prüfst das Ergebnis, bevor du es übernimmst.
            </p>
          </form>

          <Button type="button" variant="outline" onClick={onOpenBrandSetup} className="h-auto justify-start gap-3 py-2.5 text-left whitespace-normal sm:self-start">
            <Images size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            Keine Website? Mit Screenshots oder manuell starten
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">So sieht dein Profil danach aus</h2>
          <Badge variant="outline">Beispiel</Badge>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2" aria-label="Beispiel eines Markenprofils">
          <BrandingCard
            category="Branding"
            title="Typography"
            subtitle="Deine Hausschrift"
            displayElement={<span>Aa<span className="text-white/40">Bb</span></span>}
            className="!h-auto border-neutral-800 bg-[#1c1c1c] text-white shadow-none hover:shadow-xl [&_.text-muted-foreground]:text-neutral-400"
          />
          <ColorPaletteCard
            colors={SAMPLE_COLORS}
            statsText="deine-brauerei.de"
            className="min-h-[180px] border shadow-sm"
            icon={
              <span className="hidden gap-1.5 sm:flex">
                {SAMPLE_TONE.map((tone) => (
                  <Badge key={tone} variant="outline" className="font-normal">{tone}</Badge>
                ))}
              </span>
            }
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="leading-none">So entsteht dein Markenprofil</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <footer className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-foreground">
          {skipped
            ? "Du kannst weiterhin ohne Markenprofil generieren und es jederzeit ergänzen."
            : "Du kannst dein Markenprofil jederzeit ändern oder später einrichten."}
        </p>
        {!skipped ? (
          <Button type="button" variant="ghost" size="sm" onClick={onSkipBrandProfile} className="text-muted-foreground">
            Vorerst ohne Profil fortfahren <ArrowRight size={14} aria-hidden="true" />
          </Button>
        ) : null}
      </footer>
    </section>
  );
}
