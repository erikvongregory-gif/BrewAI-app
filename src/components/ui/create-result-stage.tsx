"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GenerationWaitFx } from "@/components/ui/ai-chat-image-generation-1";
import { mediaLibraryHref } from "@/lib/inhalte-erstellen/start-studio-generation";
import { cn } from "@/lib/utils";

export type CreateRunStatus = "starting" | "running" | "done" | "failed" | "slow";

export type CreateRun = {
  id: string;
  jobId?: string;
  prompt: string;
  aspectRatio: string;
  status: CreateRunStatus;
  imageUrl?: string;
  error?: string;
  startedAt: number;
};

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** Grobe Erwartung für ein Motiv — nur für die gefühlte Fortschrittsleiste. */
const EXPECTED_MS = 45_000;

function aspectNumber(aspect: string) {
  const [w, h] = aspect.split(":").map(Number);
  return w > 0 && h > 0 ? w / h : 4 / 5;
}

/** Nähert sich asymptotisch ~94 % — die letzte Strecke gehört dem echten Bild. */
function useFeltProgress(startedAt: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 900);
    return () => window.clearInterval(id);
  }, [active]);
  const elapsed = Math.max(0, now - startedAt);
  return 6 + 88 * (1 - Math.exp(-elapsed / EXPECTED_MS));
}

function StageImage({ run }: { run: CreateRun }) {
  const reduce = useReducedMotion() === true;
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const sharp = Boolean(run.imageUrl) && loadedUrl === run.imageUrl;

  return (
    <>
      {run.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={run.imageUrl}
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0 && loadedUrl !== run.imageUrl) setLoadedUrl(run.imageUrl ?? null);
          }}
          src={run.imageUrl}
          alt={run.prompt || "Generiertes Motiv"}
          onLoad={() => setLoadedUrl(run.imageUrl ?? null)}
          className={cn(
            "absolute inset-0 size-full object-cover",
            "transition-[filter,opacity,scale] duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            sharp ? "scale-100 opacity-100 blur-0" : "scale-[1.04] opacity-0 blur-2xl",
          )}
        />
      ) : null}
      {sharp && !reduce ? (
        <motion.div
          key={`shine-${run.imageUrl}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[4]"
          style={{
            background: "linear-gradient(105deg, transparent 35%, rgb(255 255 255 / 0.5) 50%, transparent 65%)",
            mixBlendMode: "soft-light",
          }}
          initial={{ x: "-120%" }}
          animate={{ x: "120%" }}
          transition={{ duration: 1.5, ease: [0.45, 0, 0.2, 1], delay: 0.7 }}
        />
      ) : null}
    </>
  );
}

function RunFrame({ run }: { run: CreateRun }) {
  const waiting = run.status === "starting" || run.status === "running" || (run.status === "slow" && !run.imageUrl);
  const progress = useFeltProgress(run.startedAt, waiting);
  const ratio = aspectNumber(run.aspectRatio);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
      <motion.div
        layout
        className="relative overflow-hidden rounded-xl border border-border bg-muted shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_60px_-28px_rgb(0_0_0/0.35)]"
        style={{ aspectRatio: String(ratio), width: `min(100cqw, calc(100cqh * ${ratio}))` }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      >
        <AnimatePresence>
          {waiting ? (
            <motion.div
              key="wait"
              className="absolute inset-0 z-[2]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.6 } }}
              transition={{ duration: 0.5 }}
            >
              <GenerationWaitFx progress={progress} />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <StageImage run={run} />
        {run.status === "failed" ? (
          <div className="absolute inset-0 z-[3] flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Dieses Motiv konnte nicht erstellt werden.
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}

function statusLine(run: CreateRun) {
  switch (run.status) {
    case "starting":
      return "Auftrag wird gestartet …";
    case "running":
      return "BrewAI erstellt dein Motiv …";
    case "slow":
      return "Dauert länger als üblich — läuft in der Mediathek weiter.";
    case "failed":
      return run.error || "Generierung fehlgeschlagen.";
    case "done":
      return "Fertig · in der Mediathek gespeichert";
  }
}

export function CreateResultStage({
  runs,
  activeRunId,
  onSelectRun,
  onRegenerate,
  onNew,
}: {
  runs: CreateRun[];
  activeRunId: string | null;
  onSelectRun: (id: string) => void;
  onRegenerate: (run: CreateRun) => void;
  onNew: () => void;
}) {
  const run = runs.find((entry) => entry.id === activeRunId) ?? runs[0];
  if (!run) return null;
  const busy = runs.some((entry) => entry.status === "starting" || entry.status === "running");

  return (
    <motion.section
      aria-label="Ergebnis"
      className="flex h-full min-h-0 w-full max-w-4xl flex-col gap-3"
      initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
    >
      <RunFrame key={run.id} run={run} />

      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={`${run.id}-${run.status}`}
              className={cn(
                "text-xs font-medium",
                run.status === "failed" ? "text-destructive" : run.status === "done" ? "text-emerald-600" : "text-muted-foreground",
              )}
              aria-live="polite"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
            >
              {statusLine(run)}
            </motion.p>
          </AnimatePresence>
          {run.prompt ? (
            <p className="line-clamp-2 text-sm text-foreground/80" title={run.prompt}>
              {run.prompt}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {run.status === "done" || run.status === "failed" ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onRegenerate(run)}>
              <RotateCcw />
              {run.status === "failed" ? "Erneut versuchen" : "Nochmal"}
            </Button>
          ) : null}
          {run.jobId && run.status !== "failed" ? (
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href={mediaLibraryHref(run.jobId)}>
                In Mediathek
                <ArrowUpRight />
              </Link>
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onNew}>
            <Plus />
            Neues Motiv
          </Button>
        </div>
      </div>

      {runs.length > 1 ? (
        // Innenabstand, sonst schneidet overflow-x-auto den Auswahlring (ring + offset) ab.
        <div className="-mx-1.5 flex shrink-0 items-center gap-2.5 overflow-x-auto px-1.5 py-1.5" role="list" aria-label="Motive dieser Sitzung">
          <AnimatePresence initial={false}>
            {runs.map((entry) => {
              const active = entry.id === run.id;
              const pending = entry.status === "starting" || entry.status === "running";
              return (
                <motion.button
                  key={entry.id}
                  type="button"
                  role="listitem"
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 480, damping: 32 }}
                  onClick={() => onSelectRun(entry.id)}
                  aria-label={entry.prompt || "Motiv"}
                  aria-current={active || undefined}
                  className={cn(
                    "relative size-12 shrink-0 overflow-hidden rounded-lg border bg-muted outline-none transition-[box-shadow,opacity] duration-200",
                    active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-70 hover:opacity-100",
                  )}
                >
                  {entry.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={entry.imageUrl} alt="" className="size-full object-cover" />
                  ) : pending ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-muted">
                      <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary motion-reduce:animate-none" />
                    </span>
                  ) : null}
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      ) : null}
    </motion.section>
  );
}
