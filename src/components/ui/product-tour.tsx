"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";

export type TourPlacement = "top" | "bottom" | "left" | "right" | "auto" | "center";

export type TourStep = {
  target?: string;
  title: string;
  content: React.ReactNode;
  placement?: TourPlacement;
  padding?: number;
  /** Spotlight-Feld bleibt klickbar (z. B. Eingaben während der Tour). */
  interactWithTarget?: boolean;
  /** Optionales Icon links neben dem Titel. */
  icon?: React.ReactNode;
  /** Kleine Zeile über dem Titel (z. B. Bereich). */
  eyebrow?: string;
  /** Hervorgehobener Tipp unter dem Text. */
  tip?: React.ReactNode;
};

export type TourProps = {
  steps: TourStep[];
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  index?: number;
  onIndexChange?: (index: number) => void;
  onFinish?: () => void;
  onSkip?: () => void;
  showProgress?: boolean;
  clickToNext?: boolean;
  dark?: boolean;
  className?: string;
  /** Primär-Button deaktivieren (z. B. während Scan läuft). */
  primaryDisabled?: boolean;
  /** Label für den Primär-Button — Standard: Weiter / Fertig */
  primaryLabel?: string;
  /** Ersetzt die interne Weiter/Fertig-Logik (z. B. Validierung vor dem Schrittwechsel). */
  onPrimaryClick?: () => void | Promise<void>;
};

type Rect = { top: number; left: number; width: number; height: number };

const SPRING = { type: "spring" as const, stiffness: 260, damping: 30, mass: 0.8 };
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function Tour({
  steps,
  open,
  onOpenChange,
  index: controlledIndex,
  onIndexChange,
  onFinish,
  onSkip,
  showProgress = true,
  clickToNext = false,
  dark,
  className,
  primaryDisabled = false,
  primaryLabel,
  onPrimaryClick,
}: TourProps) {
  const reduce = useReducedMotion();
  const [detectedDark, setDetectedDark] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [indexState, setIndexState] = React.useState(0);
  const index = controlledIndex ?? indexState;
  const setIndex = React.useCallback(
    (i: number) => {
      onIndexChange?.(i);
      setIndexState(i);
    },
    [onIndexChange],
  );

  const rootRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [cardSize, setCardSize] = React.useState({ w: 320, h: 168 });
  const [vp, setVp] = React.useState({ w: 1024, h: 768 });
  // Richtung des letzten Schrittwechsels (für die Inhalts-Animation), per „State aus vorherigem Render“.
  const [stepNav, setStepNav] = React.useState({ index, direction: 1 });
  if (stepNav.index !== index) setStepNav({ index, direction: index > stepNav.index ? 1 : -1 });
  const direction = stepNav.index !== index ? (index > stepNav.index ? 1 : -1) : stepNav.direction;

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => { setDetectedDark(!!rootRef.current?.closest(".dark")); }, [open, mounted]);

  const step = steps[index];
  const count = steps.length;
  const isFirst = index === 0;
  const isLast = index === count - 1;
  const pad = step?.padding ?? 8;

  const finish = React.useCallback(() => {
    onFinish?.();
    onOpenChange?.(false);
    setIndexState(0);
  }, [onFinish, onOpenChange]);

  const skip = React.useCallback(() => {
    onSkip?.();
    onOpenChange?.(false);
    setIndexState(0);
  }, [onSkip, onOpenChange]);

  const next = React.useCallback(() => {
    if (primaryDisabled) return;
    if (onPrimaryClick) {
      void onPrimaryClick();
      return;
    }
    if (isLast) finish();
    else setIndex(index + 1);
  }, [isLast, finish, index, setIndex, primaryDisabled, onPrimaryClick]);

  const back = React.useCallback(() => {
    if (!isFirst) setIndex(index - 1);
  }, [isFirst, index, setIndex]);

  React.useEffect(() => {
    if (!open) return;
    const measure = () => {
      setVp({ w: window.innerWidth, h: window.innerHeight });
      if (!step?.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      // Versteckte/eingeklappte Ziele (z. B. mobile Sidebar) → mittig statt Spotlight ins Leere.
      if (r.width < 2 || r.height < 2) {
        setRect(null);
        return;
      }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const el = step?.target ? (document.querySelector(step.target) as HTMLElement | null) : null;
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center", inline: "center" });

    measure();
    const settle = window.setTimeout(measure, reduce ? 0 : 320);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, index, step, reduce]);

  React.useLayoutEffect(() => {
    // offset* statt getBoundingClientRect: unabhängig von der laufenden Scale-Animation.
    if (cardRef.current) {
      setCardSize({ w: cardRef.current.offsetWidth, h: cardRef.current.offsetHeight });
    }
  }, [index, open, rect]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skip();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Tab") {
        const focusables = cardRef.current?.querySelectorAll<HTMLElement>(
          "button, [href], input, [tabindex]:not([tabindex='-1'])",
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back, skip]);

  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      cardRef.current?.querySelector<HTMLElement>("[data-tour-primary]")?.focus();
    }, 40);
    return () => window.clearTimeout(t);
  }, [open, index]);

  if (!mounted) return null;
  const visible = open && Boolean(step);

  const isDark = dark ?? detectedDark;

  const gap = 14;
  let place: TourPlacement = step?.placement ?? "auto";
  if (!rect) place = "center";
  if (place === "auto" && rect) {
    if (rect.top + rect.height + gap + cardSize.h < vp.h) place = "bottom";
    else if (rect.top - gap - cardSize.h > 0) place = "top";
    else if (rect.left + rect.width + gap + cardSize.w < vp.w) place = "right";
    else place = "left";
  }

  let left = vp.w / 2 - cardSize.w / 2;
  let top = vp.h / 2 - cardSize.h / 2;
  if (rect) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (place === "bottom") {
      left = cx - cardSize.w / 2;
      top = rect.top + rect.height + gap + pad;
    } else if (place === "top") {
      left = cx - cardSize.w / 2;
      top = rect.top - gap - pad - cardSize.h;
    } else if (place === "right") {
      left = rect.left + rect.width + gap + pad;
      top = cy - cardSize.h / 2;
    } else if (place === "left") {
      left = rect.left - gap - pad - cardSize.w;
      top = cy - cardSize.h / 2;
    }
  }
  left = Math.min(Math.max(12, left), vp.w - 12 - cardSize.w);
  top = Math.min(Math.max(12, top), vp.h - 12 - cardSize.h);

  const spot = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;
  // Ohne Ziel schrumpft das Spotlight auf einen Punkt in der Mitte — so „öffnet“ es sich beim nächsten Schritt aus der Mitte.
  const hole = spot ?? { top: vp.h / 2, left: vp.w / 2, width: 0, height: 0 };

  const overlayInk = isDark ? "rgba(4,4,6,0.62)" : "rgba(17,17,20,0.48)";
  const nextLabel = primaryLabel ?? (isLast ? "Fertig" : "Weiter");
  const allowTargetInteraction = Boolean(step?.interactWithTarget && spot);
  const ringColor = isDark ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.9)";

  const backdropPanels =
    spot && allowTargetInteraction
      ? [
          { top: 0, left: 0, width: vp.w, height: Math.max(0, spot.top) },
          { top: spot.top + spot.height, left: 0, width: vp.w, height: Math.max(0, vp.h - spot.top - spot.height) },
          { top: spot.top, left: 0, width: Math.max(0, spot.left), height: spot.height },
          {
            top: spot.top,
            left: spot.left + spot.width,
            width: Math.max(0, vp.w - spot.left - spot.width),
            height: spot.height,
          },
        ]
      : null;

  return createPortal(
    <div ref={rootRef} className={`${isDark ? "dark" : ""} ${className ?? ""}`}>
      <AnimatePresence>
        {visible && step ? (
          <motion.div
            key="tour-layer"
            className="fixed inset-0 z-[100] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: EASE_OUT }}
            role="dialog"
            aria-modal="true"
            aria-label={typeof step.title === "string" ? step.title : "Produkt-Tour"}
          >
            {backdropPanels ? (
              backdropPanels.map((panel, i) => (
                <div
                  key={i}
                  className="pointer-events-auto absolute"
                  style={{ ...panel, background: overlayInk }}
                  onClick={() => clickToNext && !primaryDisabled && next()}
                />
              ))
            ) : (
              <motion.div
                className="pointer-events-auto absolute rounded-xl"
                initial={false}
                animate={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
                transition={reduce ? { duration: 0 } : SPRING}
                style={{ boxShadow: `0 0 0 9999px ${overlayInk}` }}
                onClick={() => clickToNext && !primaryDisabled && next()}
              />
            )}

            <motion.div
              className="pointer-events-none absolute rounded-xl"
              initial={false}
              animate={{
                top: hole.top,
                left: hole.left,
                width: hole.width,
                height: hole.height,
                opacity: spot ? 1 : 0,
              }}
              transition={reduce ? { duration: 0 } : SPRING}
              style={{
                outline: `1px solid ${ringColor}`,
                outlineOffset: 2,
                boxShadow: isDark
                  ? "0 0 0 1px rgba(255,255,255,0.22), 0 8px 40px rgba(0,0,0,0.5)"
                  : "0 0 0 1px rgba(0,0,0,0.06), 0 8px 40px rgba(0,0,0,0.18)",
              }}
            >
              {spot && !reduce ? (
                <motion.span
                  key={index}
                  aria-hidden
                  className="absolute inset-0 rounded-xl"
                  style={{ boxShadow: `0 0 0 2px ${ringColor}` }}
                  initial={{ opacity: 0, scale: 1 }}
                  animate={{ opacity: [0, 0.9, 0], scale: [1, 1, 1.08] }}
                  transition={{ duration: 1.8, ease: "easeOut", delay: 0.45, repeat: Infinity, repeatDelay: 1.2 }}
                />
              ) : null}
            </motion.div>

            <motion.div
              ref={cardRef}
              className="pointer-events-auto absolute w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/95 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.45)] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/95"
              initial={reduce ? false : { opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0, left, top }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 4, transition: { duration: 0.18 } }}
              transition={reduce ? { duration: 0 } : SPRING}
              style={{ left, top }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative h-1 w-full bg-zinc-100 dark:bg-zinc-800" aria-hidden>
                <motion.div
                  className="absolute inset-y-0 left-0 origin-left bg-gradient-to-r from-acc-light to-acc"
                  style={{ width: "100%" }}
                  initial={false}
                  animate={{ scaleX: (index + 1) / count }}
                  transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE_OUT }}
                />
              </div>
              <div className="p-4 pt-3.5">
                <motion.div
                  key={index}
                  initial={reduce ? false : { opacity: 0, x: direction * 14, filter: "blur(3px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  transition={{ duration: reduce ? 0 : 0.34, ease: EASE_OUT, delay: reduce ? 0 : 0.06 }}
                >
                  <div className="flex items-start gap-3">
                    {step.icon ? (
                      <motion.span
                        className="relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#F6D2AE] to-acc-light text-[#5A2D08] shadow-[0_6px_16px_-6px_rgba(199,105,30,0.7)] [&_svg]:size-[18px]"
                        initial={reduce ? false : { scale: 0.5, rotate: -12, opacity: 0 }}
                        animate={{ scale: 1, rotate: 0, opacity: 1 }}
                        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 18, delay: 0.1 }}
                      >
                        {step.icon}
                      </motion.span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-acc">
                          {step.eyebrow ?? "Rundgang"}
                          <span className="ml-1.5 font-medium tabular-nums text-zinc-400">
                            {index + 1}/{count}
                          </span>
                        </p>
                        <button
                          type="button"
                          onClick={skip}
                          aria-label="Tour schließen"
                          className="-mr-1.5 -mt-1 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                        >
                          <IconX />
                        </button>
                      </div>
                      <h3 className="mt-0.5 text-[15px] font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50">
                        {step.title}
                      </h3>
                      <div className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {step.content}
                      </div>
                    </div>
                  </div>
                  {step.tip ? (
                    <motion.div
                      className="mt-3 flex items-start gap-2 rounded-lg bg-acc/[0.07] px-3 py-2 text-[12px] leading-snug text-zinc-600 ring-1 ring-inset ring-acc/15 dark:text-zinc-300"
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: EASE_OUT, delay: reduce ? 0 : 0.2 }}
                    >
                      <span aria-hidden className="mt-px text-acc">✦</span>
                      <span>{step.tip}</span>
                    </motion.div>
                  ) : null}
                </motion.div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  {showProgress ? (
                    <div className="flex items-center gap-1" aria-hidden>
                      {steps.map((_, i) => (
                        <motion.span
                          key={i}
                          className={`h-1.5 rounded-full ${
                            i <= index ? "bg-acc" : "bg-zinc-200 dark:bg-zinc-700"
                          }`}
                          initial={false}
                          animate={{ width: i === index ? 16 : 6, opacity: i < index ? 0.4 : 1 }}
                          transition={reduce ? { duration: 0 } : { duration: 0.35, ease: EASE_OUT }}
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="hidden text-[11px] text-zinc-400 sm:inline">
                      <kbd className="rounded border border-zinc-200 px-1 font-sans dark:border-zinc-700">←</kbd>{" "}
                      <kbd className="rounded border border-zinc-200 px-1 font-sans dark:border-zinc-700">→</kbd> navigieren
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-1.5">
                    {!isFirst && (
                      <button
                        type="button"
                        onClick={back}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      >
                        <IconArrow className="rotate-180" />
                        Zurück
                      </button>
                    )}
                    <button
                      type="button"
                      data-tour-primary
                      onClick={next}
                      disabled={primaryDisabled}
                      className="group inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-[12.5px] font-medium text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:focus-visible:ring-offset-zinc-900"
                    >
                      {nextLabel}
                      {!isLast && <IconArrow className="transition-transform duration-200 group-hover:translate-x-0.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

export function useTour(storageKey?: string) {
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);

  const seen = React.useCallback(() => {
    if (!storageKey) return false;
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  }, [storageKey]);

  const start = React.useCallback(() => {
    setIndex(0);
    setOpen(true);
  }, []);

  const markSeen = React.useCallback(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      return;
    }
  }, [storageKey]);

  return { open, setOpen, index, setIndex, start, seen, markSeen };
}

function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" className="h-4 w-4">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function IconArrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 ${className}`}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
