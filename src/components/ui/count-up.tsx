"use client";

import { useLayoutEffect, useRef } from "react";

type CountUpProps = {
  value: number;
  format: (value: number) => string;
  /** Sekunden für den ersten Aufbau; spätere Wertänderungen laufen kürzer. */
  duration?: number;
  delay?: number;
  className?: string;
};

/** easeOutExpo-ähnlich, passend zu cubic-bezier(0.22, 1, 0.36, 1). */
function easeOut(t: number) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * Zählt beim Erscheinen von 0 hoch und bei späteren Änderungen vom alten zum neuen Wert.
 * Schreibt direkt in Reacts eigenen Textknoten (nodeValue) — kein Re-Render pro Frame,
 * kein Konflikt mit React-Updates. Erstes HTML zeigt den Endwert (SSR ohne JS korrekt).
 */
export function CountUp({ value, format, duration = 0.5, delay = 0, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const formatRef = useRef(format);

  useLayoutEffect(() => {
    formatRef.current = format;
  });

  // Layout-Effekt: vor dem ersten Paint auf den Startwert setzen, sonst blitzt der Endwert auf.
  useLayoutEffect(() => {
    const node = ref.current?.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const write = (v: number) => {
      node.nodeValue = formatRef.current(v);
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const first = shown.current == null;
    const from = shown.current ?? 0;
    // Hintergrund-Tab: rAF läuft nicht → sonst bliebe die Zahl auf dem Startwert stehen.
    if (reduce || from === value || document.hidden) {
      shown.current = value;
      write(value);
      return;
    }

    const ms = (first ? duration : 0.35) * 1000;
    const wait = (first ? delay : 0) * 1000;
    let raf = 0;
    let start: number | null = null;
    write(from);
    const tick = (now: number) => {
      start ??= now + wait;
      const t = Math.max(0, now - start) / ms;
      const v = from + (value - from) * easeOut(t);
      shown.current = v;
      // Zwischenwerte ganzzahlig, sonst zeigt de-DE „44,708“ statt „45“.
      write(t >= 1 ? value : Math.round(v));
      if (t < 1) raf = requestAnimationFrame(tick);
      else shown.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay]);

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
