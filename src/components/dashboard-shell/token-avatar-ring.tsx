"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useBillingCredits } from "@/components/dashboard-shell/billing-credits-provider";
import { DashboardTabLink } from "@/components/dashboard-shell/dashboard-tab-nav";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type BillingTokenSnapshot = {
  remaining: number;
  total: number;
  unlimited: boolean;
};

export function useBillingTokens(): BillingTokenSnapshot | null {
  const { state } = useBillingCredits();
  if (!state) return null;
  return {
    remaining: state.remainingTokens,
    total: Math.max(state.monthlyTokens, 0),
    unlimited: Boolean(state.unlimited),
  };
}

/** Anteil verbleibender Tokens (1 = voll, 0 = leer). Unlimited = voller Ring. */
export function tokenRingProgress(snapshot: BillingTokenSnapshot | null): number {
  if (!snapshot) return 0;
  if (snapshot.unlimited) return 1;
  if (snapshot.total <= 0) return 0;
  return Math.min(1, Math.max(0, snapshot.remaining / snapshot.total));
}

export function tokenBalanceLabel(snapshot: BillingTokenSnapshot | null): string {
  if (snapshot == null) return "Token-Stand wird geladen";
  if (snapshot.unlimited) return "Unbegrenzte Tokens";
  return `${snapshot.remaining.toLocaleString("de-DE")} von ${snapshot.total.toLocaleString("de-DE")} Tokens übrig`;
}

type TokenAvatarRingProps = {
  children: ReactNode;
  className?: string;
  /** Gesamtdurchmesser inkl. Ring. */
  size?: number;
};

/**
 * Runder Marken-Ring um den Avatar — Bogenlänge = verbleibende Tokens.
 * overflow sichtbar, damit der Stroke nicht an Ecken abgeschnitten wird.
 */
export function TokenAvatarRing({ children, className, size = 36 }: TokenAvatarRingProps) {
  const snapshot = useBillingTokens();
  const progress = tokenRingProgress(snapshot);
  const remaining = snapshot && !snapshot.unlimited ? snapshot.remaining : null;
  // Verbrauch sichtbar machen: bei sinkendem Stand schwebt „−N“ kurz über dem Ring.
  const [prevRemaining, setPrevRemaining] = useState(remaining);
  const [spent, setSpent] = useState<{ amount: number; key: number } | null>(null);
  if (remaining !== prevRemaining) {
    setPrevRemaining(remaining);
    if (prevRemaining != null && remaining != null && remaining < prevRemaining) {
      setSpent((current) => ({ amount: prevRemaining - remaining, key: (current?.key ?? 0) + 1 }));
    }
  }
  // viewBox 40: Stroke liegt innen, kein Clipping am Rand
  const vb = 40;
  const stroke = 3;
  const radius = (vb - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const label = tokenBalanceLabel(snapshot);

  return (
    <Tooltip>
    <TooltipTrigger asChild>
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-visible", className)}
      style={{ width: size, height: size }}
      aria-label={label}
    >
      <svg
        className="pointer-events-none absolute inset-0 size-full! max-h-none! max-w-none! -rotate-90 overflow-visible transition-none!"
        viewBox={`0 0 ${vb} ${vb}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <circle
          cx={vb / 2}
          cy={vb / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted-foreground/25"
        />
        <circle
          cx={vb / 2}
          cy={vb / 2}
          r={radius}
          fill="none"
          stroke="var(--color-acc)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        />
      </svg>
      <AnimatePresence>
        {spent ? (
          <motion.span
            key={spent.key}
            aria-hidden
            className="pointer-events-none absolute top-full left-1/2 z-20 mt-1 rounded-full bg-foreground px-1.5 py-0.5 font-medium text-[10px] text-background tabular-nums whitespace-nowrap shadow-sm"
            initial={{ opacity: 0, y: -6, x: "-50%", scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-6, 0, 0, 6], x: "-50%", scale: 1 }}
            transition={{ duration: 2.2, times: [0, 0.12, 0.8, 1], ease: "easeOut" }}
            onAnimationComplete={() => setSpent(null)}
          >
            −{spent.amount.toLocaleString("de-DE")}
          </motion.span>
        ) : null}
      </AnimatePresence>
      {/* Avatar etwas kleiner als der Ring, damit der Bogen freiliegt */}
      <span className="relative z-10 flex size-[78%] items-center justify-center overflow-hidden rounded-full bg-background">
        {children}
      </span>
    </span>
    </TooltipTrigger>
    <TooltipContent side="bottom" sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Token-Stand als Kopf im Konto-Menü (Klick auf den Avatar-Ring). */
export function TokenBalanceMenuBlock() {
  const snapshot = useBillingTokens();
  const progress = tokenRingProgress(snapshot);
  return (
    <div className="px-2 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">Tokens</span>
        <DashboardTabLink href="/dashboard/pricing" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Aufladen
        </DashboardTabLink>
      </div>
      <p className="mt-0.5 text-sm font-medium tabular-nums">
        {snapshot == null
          ? "Wird geladen …"
          : snapshot.unlimited
            ? "Unbegrenzt"
            : <>{snapshot.remaining.toLocaleString("de-DE")} <span className="font-normal text-muted-foreground">von {snapshot.total.toLocaleString("de-DE")} übrig</span></>}
      </p>
      {snapshot && !snapshot.unlimited ? (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={cn("h-full rounded-full", progress < 0.15 ? "bg-destructive" : "bg-acc")}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
