"use client";

import Link from "next/link";
import React from "react";
import { cn } from "@/lib/utils";

export type StudioButtonVariant = "primary" | "ghost" | "soft";
export type StudioButtonSize = "default" | "sm" | "lg";

const btnVariantClass: Record<StudioButtonVariant, string> = {
  primary: "evg-btn evg-btn--primary",
  ghost: "evg-btn evg-btn--ghost",
  soft: "evg-btn evg-btn--ghost", // ponytail: soft → ghost
};

const btnSizeStyle: Record<StudioButtonSize, React.CSSProperties | undefined> = {
  default: undefined,
  sm: { height: 26, padding: "0 10px", fontSize: 12 },
  lg: { height: 38, padding: "0 18px" },
};

type StudioButtonProps = {
  variant?: StudioButtonVariant;
  size?: StudioButtonSize;
  className?: string;
  children: React.ReactNode;
} & (
  | ({ href: string } & Omit<React.ComponentProps<typeof Link>, "className" | "children">)
  | ({ href?: undefined } & React.ButtonHTMLAttributes<HTMLButtonElement>)
);

export function StudioButton({
  variant = "primary",
  size = "default",
  className,
  style,
  children,
  ...rest
}: StudioButtonProps & { style?: React.CSSProperties }) {
  const cls = cn(btnVariantClass[variant], className);
  const mergedStyle = { ...btnSizeStyle[size], ...style };
  if ("href" in rest && rest.href) {
    const { href, ...linkRest } = rest;
    return (
      <Link href={href} className={cls} style={mergedStyle} {...linkRest}>
        {children}
      </Link>
    );
  }
  const buttonRest = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={buttonRest.type ?? "button"} className={cls} style={mergedStyle} {...buttonRest}>
      {children}
    </button>
  );
}

export function StudioIconButton({
  className,
  style,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn("evg-btn", className)}
      style={{ width: 30, height: 30, padding: 0, ...style }}
      {...props}
    >
      {children}
    </button>
  );
}

export function StudioCard({
  pad = false,
  hover = false,
  className,
  style,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { pad?: boolean; hover?: boolean }) {
  return (
    <div
      className={className}
      style={{
        border: "1px solid var(--line)",
        borderRadius: "var(--r, 0)",
        padding: pad ? 16 : undefined,
        background: hover ? "var(--raised)" : undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function StudioChip({
  active = false,
  className,
  style,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn("evg-mono", className)}
      style={{
        border: `1px solid ${active ? "var(--acc)" : "var(--line)"}`,
        borderRadius: "var(--r-chip, 2px)",
        background: active ? "var(--acc-dim)" : "transparent",
        color: active ? "var(--fg)" : "var(--fg-3)",
        padding: "4px 10px",
        fontSize: 12,
        cursor: "pointer",
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function StudioBadge({
  tone = "default",
  className,
  children,
}: {
  tone?: "default" | "acc" | "ok";
  className?: string;
  children: React.ReactNode;
}) {
  const color = tone === "acc" ? "var(--acc)" : tone === "ok" ? "var(--ok)" : "var(--fg-4)";
  return (
    <span
      className={cn("evg-mono", className)}
      style={{
        fontSize: 11,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color,
      }}
    >
      {children}
    </span>
  );
}

export function StudioEyebrow({
  dot = "accent",
  className,
  children,
}: {
  dot?: "accent" | "ok" | "none";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("evg-rubrik", className)}>
      {dot !== "none" ? (
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            marginRight: 8,
            background: dot === "ok" ? "var(--ok)" : "var(--acc)",
            verticalAlign: "middle",
          }}
        />
      ) : null}
      {children}
    </div>
  );
}

export function StudioFieldLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("evg-rubrik", className)}>{children}</span>;
}

export function StudioPageHeader({
  eyebrow,
  meta,
  title,
  subtitle,
  action,
  className,
}: {
  eyebrow: string;
  meta?: string;
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  // Shell-Stil (wie BrandProfileEmptyState): Eyebrow steht im DOM vor dem Titel, damit Titel und
  // Kennzeichnung nicht zu einem Wort verschmelzen („Lüne BräuMARKENPROFIL“).
  const metaText = meta ?? eyebrow;
  return (
    <header className={cn("mb-6 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {metaText ? <p className="mb-1 font-medium text-muted-foreground text-xs">{metaText}</p> : null}
        <h1 className="break-words font-semibold text-2xl tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-muted-foreground text-sm">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export type StudioStatIconTone = "acc" | "ok" | "blue" | "purple";

export function StudioStatCard({
  label,
  value,
  valueSuffix,
  delta,
  deltaDir = "flat",
  primary = false,
  icon,
  iconTone = "acc",
  className,
}: {
  label: string;
  value: string;
  valueSuffix?: React.ReactNode;
  delta: string;
  deltaDir?: "up" | "down" | "flat";
  primary?: boolean;
  icon?: React.ReactNode;
  iconTone?: StudioStatIconTone;
  className?: string;
}) {
  const toneColor =
    iconTone === "ok" ? "var(--ok)" : iconTone === "blue" || iconTone === "purple" ? "var(--fg-3)" : "var(--acc)";
  return (
    <div
      className={cn("evg-mono", className)}
      style={{
        borderBottom: "1px solid var(--line-faint)",
        padding: "14px 0",
        background: primary ? "var(--raised)" : undefined,
      }}
    >
      {icon ? <div style={{ color: toneColor, marginBottom: 8 }}>{icon}</div> : null}
      <div className="evg-rubrik" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 19, fontWeight: 500, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
        {value}
        {valueSuffix}
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: deltaDir === "up" ? "var(--ok)" : "var(--fg-5)" }}>{delta}</div>
    </div>
  );
}

export function StudioStatGrid({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 0, ...style }}
    >
      {children}
    </div>
  );
}

export function StudioSparkline({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  if (!data.length) return null;
  const width = 64;
  const height = 22;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastY = height - ((data[data.length - 1] - min) / range) * height;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <polyline points={pts} stroke="var(--acc)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={lastY} r="2" fill="var(--acc)" />
    </svg>
  );
}
