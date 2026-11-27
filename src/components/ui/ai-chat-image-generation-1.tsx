"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface ImageGenerationProps {
  isLoading: boolean;
  /** Bild-URL — sobald gesetzt, startet der langsame Blur-Reveal. */
  imageSrc?: string | null;
  progress?: number;
  className?: string;
  aspectRatio?: string;
  hideStatus?: boolean;
  alt?: string;
  onPreviewClick?: (src: string) => void;
}

const STATUS = {
  starting: "Wird gestartet …",
  generating: "BrewAI generiert dein Bild …",
  revealing: "Bild wird sichtbar …",
  completed: "Bild erstellt.",
} as const;

/** Wechselnde Zeilen im Bild, während gewartet wird. */
const PHASES = [
  "Szene wird aufgebaut",
  "Licht wird gesetzt",
  "Schaumkrone formt sich",
  "Etikett wird platziert",
  "Farben nach Markenprofil",
  "Details werden geschärft",
] as const;

const PHASE_MS = 2800;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Feste Werte (kein Math.random), damit Server- und Client-Render gleich sind. */
const BUBBLES = [
  { x: 8, s: 6, d: 7.2, delay: 0.2 },
  { x: 16, s: 10, d: 9.1, delay: 2.4 },
  { x: 24, s: 4, d: 6.4, delay: 1.1 },
  { x: 33, s: 8, d: 8.3, delay: 3.6 },
  { x: 41, s: 5, d: 6.9, delay: 0.7 },
  { x: 49, s: 12, d: 10.2, delay: 4.1 },
  { x: 57, s: 4, d: 6.1, delay: 2.0 },
  { x: 64, s: 7, d: 7.8, delay: 5.2 },
  { x: 72, s: 5, d: 6.6, delay: 1.6 },
  { x: 79, s: 9, d: 8.8, delay: 3.0 },
  { x: 86, s: 4, d: 6.2, delay: 0.4 },
  { x: 93, s: 6, d: 7.5, delay: 4.6 },
];

/**
 * Warte-Effekt für ein entstehendes Bild: Körnung, Lichtstrahl, Bier-Bläschen, Orb,
 * wechselnde Statuszeilen und Fortschritt. Füllt den (relativ positionierten) Elternrahmen.
 * Ohne `progress` läuft die Leiste unbestimmt.
 */
export function GenerationWaitFx({ progress, compact = false }: { progress?: number; compact?: boolean }) {
  const reduce = useReducedMotion() === true;
  const [phase, setPhase] = React.useState(0);

  React.useEffect(() => {
    const timer = window.setInterval(() => setPhase((p) => (p + 1) % PHASES.length), PHASE_MS);
    return () => window.clearInterval(timer);
  }, []);

  const determinate = typeof progress === "number";

  return (
    <div className={cn("studio-image-gen__fx-root absolute inset-0", compact && "is-compact")}>
      <div className="studio-image-gen__fx" aria-hidden="true">
        <div className="studio-image-gen__grain" />
        <div className="studio-image-gen__beam" />
        <div className="studio-image-gen__bubbles">
          {BUBBLES.map((b, i) => (
            <span
              key={i}
              className="studio-image-gen__bubble"
              style={{
                left: `${b.x}%`,
                width: compact ? Math.max(3, b.s * 0.75) : b.s,
                height: compact ? Math.max(3, b.s * 0.75) : b.s,
                animationDuration: `${b.d}s`,
                animationDelay: `${b.delay}s`,
              }}
            />
          ))}
        </div>
      </div>

      <motion.div
        className="studio-image-gen__center"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.1 }}
      >
        <div className="studio-image-gen__orb" aria-hidden="true">
          <span className="studio-image-gen__orb-ring" />
          <span className="studio-image-gen__orb-ring studio-image-gen__orb-ring--2" />
          <span className="studio-image-gen__orb-core" />
        </div>
        <div className="studio-image-gen__phase" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={phase}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.45, ease: EASE_OUT }}
            >
              {PHASES[phase]}
            </motion.span>
          </AnimatePresence>
        </div>
      </motion.div>

      <div className={cn("studio-image-gen__bar", !determinate && "is-indeterminate")} aria-hidden="true">
        {determinate ? (
          <motion.span
            className="studio-image-gen__bar-fill"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: Math.max(0.04, Math.min(100, progress) / 100) }}
            transition={reduce ? { duration: 0 } : { duration: 1.2, ease: EASE_OUT }}
          />
        ) : (
          <span className="studio-image-gen__bar-fill" />
        )}
      </div>
    </div>
  );
}

export const ImageGeneration = ({
  isLoading,
  imageSrc,
  progress,
  className,
  aspectRatio = "4:5",
  hideStatus = false,
  alt = "Motivvorschau",
  onPreviewClick,
}: ImageGenerationProps) => {
  const reduce = useReducedMotion() === true;
  const clampedProgress = Math.max(0, Math.min(100, progress ?? 0));
  const [decoded, setDecoded] = React.useState(false);
  const [sharp, setSharp] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const revealStarted = React.useRef(false);

  const beginReveal = React.useCallback(() => {
    if (revealStarted.current) return;
    revealStarted.current = true;
    setDecoded(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setSharp(true));
    });
  }, []);

  React.useEffect(() => {
    setDecoded(false);
    setSharp(false);
    revealStarted.current = false;
  }, [imageSrc]);

  React.useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) beginReveal();
  }, [imageSrc, beginReveal]);

  const waiting = isLoading && !imageSrc;

  const loadingState: keyof typeof STATUS = !isLoading && sharp
    ? "completed"
    : imageSrc && decoded && !sharp
      ? "revealing"
      : clampedProgress < 10
        ? "starting"
        : "generating";

  const showAurora = isLoading || (Boolean(imageSrc) && !sharp);
  const showImage = Boolean(imageSrc);

  const handleImageLoad = () => {
    beginReveal();
  };

  return (
    <div className={cn("studio-image-gen flex flex-col gap-2", className)}>
      {hideStatus ? null : (
        <motion.span
          className="studio-image-gen__status bg-[length:200%_100%] bg-clip-text text-transparent text-base font-medium"
          style={{
            backgroundImage:
              "linear-gradient(110deg, var(--t3, #5E574E), 35%, var(--color-acc), 50%, var(--t1, #18140F), 65%, var(--t3, #5E574E), 85%, var(--t3, #5E574E))",
          }}
          initial={{ backgroundPosition: "200% 0" }}
          animate={{
            backgroundPosition: loadingState === "completed" ? "0% 0" : "-200% 0",
          }}
          transition={{
            repeat: loadingState === "completed" ? 0 : Infinity,
            duration: 3,
            ease: "linear",
          }}
          aria-live="polite"
        >
          {STATUS[loadingState]}
        </motion.span>
      )}

      <div
        className={cn(
          "studio-image-gen__frame studio-create-preview-stage relative overflow-hidden",
          waiting ? "is-generating" : "",
        )}
        data-aspect={aspectRatio}
      >
        {showAurora ? (
          <div className="studio-image-gen__aurora" aria-hidden="true">
            <div className="studio-image-gen__aurora-spin" />
          </div>
        ) : null}

        <AnimatePresence>
          {waiting ? (
            <motion.div
              key="waiting-fx"
              className="absolute inset-0 z-[2]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.6 } }}
              transition={{ duration: 0.8, ease: EASE_OUT }}
            >
              <GenerationWaitFx progress={clampedProgress} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={imageSrc ?? "empty"}
            ref={imgRef}
            src={imageSrc ?? undefined}
            alt={alt}
            className={cn(
              "studio-create-preview-stage__img studio-image-gen__img",
              !sharp && "is-blurred",
              sharp && "is-sharp",
            )}
            onLoad={handleImageLoad}
            onClick={() => {
              if (imageSrc && onPreviewClick) onPreviewClick(imageSrc);
            }}
          />
        ) : null}

        {sharp && !reduce ? (
          <motion.div
            key={`shine-${imageSrc}`}
            className="studio-image-gen__shine"
            aria-hidden="true"
            initial={{ x: "-120%", opacity: 0 }}
            animate={{ x: "120%", opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.6, ease: [0.45, 0, 0.2, 1], delay: 0.5 }}
          />
        ) : null}
      </div>
    </div>
  );
};

ImageGeneration.displayName = "ImageGeneration";

export default ImageGeneration;
