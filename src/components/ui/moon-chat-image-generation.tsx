"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { StudioIcon } from "@/components/studio/icons";
import { cn } from "@/lib/utils";

export type MoonGenPhase = "starting" | "generating" | "completed";

const STATUS: Record<MoonGenPhase, string> = {
  starting: "Wird gestartet …",
  generating: "BrewAI generiert dein Bild …",
  completed: "Bild erstellt.",
};

type Props = {
  phase: MoonGenPhase;
  /** 0–100 — steuert den Frosted-Reveal von oben nach unten. */
  progress: number;
  imageSrc?: string | null;
  aspectRatio?: string;
  mediaHref?: string | null;
  className?: string;
  alt?: string;
};

const ASPECT_CLASS: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "3:4": "aspect-[3/4]",
  "9:16": "aspect-[9/16]",
  "4:3": "aspect-[4/3]",
  "16:9": "aspect-video",
};

/**
 * Ergebnis/Ladezustand als Karte — gleiche Sprache wie die Chatbox,
 * nicht freischwebend über dem Mond.
 */
export function MoonChatImageGeneration({
  phase,
  progress,
  imageSrc,
  aspectRatio = "4:5",
  mediaHref,
  className,
  alt = "Generiertes Motiv",
}: Props) {
  const clamped = Math.max(0, Math.min(100, progress));
  const done = phase === "completed";
  const frameAspect = ASPECT_CLASS[aspectRatio] ?? ASPECT_CLASS["4:5"];

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-xl border shadow-sm",
        "border-border bg-background/90",
        "dark:border-sidebar-border dark:bg-sidebar",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2 dark:border-sidebar-border">
        <motion.span
          className="bg-[length:200%_100%] bg-clip-text text-sm font-medium text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(110deg, #5E574E, 35%, var(--color-acc), 50%, #18140F, 65%, #5E574E, 85%, #5E574E)",
          }}
          initial={{ backgroundPosition: "200% 0" }}
          animate={{
            backgroundPosition: done ? "0% 0" : "-200% 0",
          }}
          transition={{
            repeat: done ? 0 : Infinity,
            duration: 3,
            ease: "linear",
          }}
          aria-live="polite"
        >
          {STATUS[phase]}
        </motion.span>
        <div className="flex items-center gap-1">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground dark:bg-neutral-800">
            {aspectRatio}
          </span>
          {done && imageSrc ? (
            <>
              {mediaHref ? (
                <Link
                  prefetch={false}
                  href={mediaHref}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:hover:bg-neutral-800"
                >
                  <StudioIcon name="media" size={12} />
                  Mediathek
                </Link>
              ) : null}
              <a
                href={imageSrc}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:hover:bg-neutral-800"
              >
                <StudioIcon name="link" size={12} />
                Öffnen
              </a>
            </>
          ) : null}
        </div>
      </div>

      <div className="relative mx-auto w-full max-h-[min(46vh,420px)] max-w-md overflow-hidden">
        <div className={cn("relative w-full", frameAspect)}>
          {/* Mesh / Aurora — sichtbar bis Bild + Reveal fertig */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(120% 90% at 85% 100%, color-mix(in srgb, var(--color-acc) 55%, transparent) 0%, transparent 55%),
                radial-gradient(90% 70% at 15% 20%, rgba(180, 175, 210, 0.55) 0%, transparent 50%),
                radial-gradient(70% 60% at 50% 50%, rgba(230, 228, 235, 0.9) 0%, #d8d6de 100%)
              `,
            }}
          />
          <div
            aria-hidden
            className="absolute -right-8 -bottom-10 size-48 rounded-full bg-acc/35 blur-3xl motion-safe:animate-pulse"
          />
          <div
            aria-hidden
            className="absolute -left-10 top-6 size-40 rounded-full bg-[#9aa0c8]/40 blur-3xl"
          />

          {imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageSrc}
              alt={alt}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}

          <motion.div
            aria-hidden
            className="pointer-events-none absolute -top-[25%] h-[125%] w-full"
            initial={false}
            animate={{
              clipPath: `polygon(0 ${clamped}%, 100% ${clamped}%, 100% 100%, 0 100%)`,
              opacity: done ? 0 : 1,
            }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{
              backdropFilter: "blur(48px)",
              WebkitBackdropFilter: "blur(48px)",
              background:
                "linear-gradient(105deg, rgba(245,244,248,0.72) 0%, rgba(232,180,130,0.55) 55%, color-mix(in srgb, var(--color-acc) 45%, transparent) 100%)",
              clipPath: `polygon(0 ${clamped}%, 100% ${clamped}%, 100% 100%, 0 100%)`,
              maskImage:
                clamped <= 0
                  ? "linear-gradient(to bottom, black 0%, black 100%)"
                  : `linear-gradient(to bottom, transparent ${Math.max(0, clamped - 6)}%, black ${Math.min(100, clamped + 8)}%)`,
              WebkitMaskImage:
                clamped <= 0
                  ? "linear-gradient(to bottom, black 0%, black 100%)"
                  : `linear-gradient(to bottom, transparent ${Math.max(0, clamped - 6)}%, black ${Math.min(100, clamped + 8)}%)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
