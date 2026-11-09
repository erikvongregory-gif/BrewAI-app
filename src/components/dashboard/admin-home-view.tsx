"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  XAxis,
} from "recharts";
import { motion } from "framer-motion";
import {
  Coins,
  FolderOpen,
  ImageIcon,
  Palette,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CountUp } from "@/components/ui/count-up";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  aggregateTokenUsageFromDays,
  brandStatusLabel,
  formatCompactNumber,
  formatDeNumber,
  formatPeriodEnd,
  formatRelativeTime,
  mediaRowTitle,
  planLabelFromKey,
  TOKEN_RANGE_DAYS,
  TOKEN_RANGE_LABELS,
  tokensAvailablePct,
  tokensUsed,
  type DashboardHomeMediaItem,
  type DashboardHomeSettings,
  type DashboardHomeSummary,
  type TokenRangeKey,
} from "@/components/studio/dashboard/dashboard-home-utils";
import { hasActiveSubscriptionFromState } from "@/lib/billing/access";

type DashboardTab = "dashboard" | "media" | "team" | "brand" | "settings" | "pricing";

export type AdminHomeViewProps = {
  summary: DashboardHomeSummary | null;
  summaryLoaded: boolean;
  summaryError?: string | null;
  media: DashboardHomeMediaItem[];
  mediaLoaded: boolean;
  mediaError?: string | null;
  settings: DashboardHomeSettings | null;
  settingsLoaded: boolean;
  profileName: string;
  breweryName: string;
  brandProfileComplete: boolean;
  brandProfileMode: DashboardHomeSettings["brandProfileMode"];
  onOpenTab: (tab: DashboardTab) => void;
  onOpenBrandSetup: () => void;
  onRetrySummary?: () => void;
  onRetryMedia?: () => void;
  /** Optional start range for the token chart (marketing previews). */
  initialTokenRange?: TokenRangeKey;
};

const chartConfig = {
  tokens: {
    label: "Tokens",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function MetricCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Skeleton className="size-7 rounded-lg" />
        </CardTitle>
        <CardDescription>
          <Skeleton className="h-4 w-24" />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-40" />
      </CardContent>
    </Card>
  );
}

/** Aktiver Tarif oder Restguthaben — dieselbe Regel für Kennzahl und „Nächste Schritte“. */
function hasActivePlan(summary: DashboardHomeSummary | null): boolean {
  const unlimited = Boolean(summary?.unlimited || summary?.tokens.unlimited);
  return (
    unlimited ||
    (!summary?.degradedBilling &&
      (hasActiveSubscriptionFromState(summary?.plan, summary?.billingStatus) ||
        (summary?.tokens.remaining ?? 0) > 0))
  );
}

type NextStepId = "plan" | "brand" | "create";

/**
 * Zeigt nur offene Schritte bis zum ersten Motiv (Tarif → Markenprofil → erstes Bild).
 * Rendert erst, wenn alle Daten geladen sind, damit die Karte nicht kurz aufblitzt,
 * und verschwindet ganz, sobald nichts mehr offen ist.
 */
function BrewAiNextSteps({
  summary,
  summaryLoaded,
  summaryError,
  media,
  mediaLoaded,
  mediaError,
  settingsLoaded,
  brandProfileComplete,
  brandProfileMode,
  onOpenTab,
  onOpenBrandSetup,
}: {
  summary: DashboardHomeSummary | null;
  summaryLoaded: boolean;
  summaryError?: string | null;
  media: DashboardHomeMediaItem[];
  mediaLoaded: boolean;
  mediaError?: string | null;
  settingsLoaded: boolean;
  brandProfileComplete: boolean;
  brandProfileMode: DashboardHomeSettings["brandProfileMode"];
  onOpenTab: (tab: DashboardTab) => void;
  onOpenBrandSetup: () => void;
}) {
  if (!summaryLoaded || !mediaLoaded || !settingsLoaded) return null;

  const steps: { id: NextStepId; title: string; text: string }[] = [];
  if (!summaryError && !hasActivePlan(summary)) {
    steps.push({
      id: "plan",
      title: "Tarif wählen",
      text: "Bilder erstellen ist mit einem aktiven Tarif möglich.",
    });
  }
  if (!brandProfileComplete && brandProfileMode !== "skip") {
    steps.push(
      brandProfileMode === "undecided"
        ? {
            id: "brand",
            title: "Markenprofil anlegen",
            text: "Website deiner Brauerei eingeben – BrewAI übernimmt Farben, Tonalität und Sortiment.",
          }
        : {
            id: "brand",
            title: "Markenprofil vervollständigen",
            text: "Je genauer das Profil, desto markentreuer werden deine Motive.",
          },
    );
  }
  if (!mediaError && media.length === 0) {
    steps.push({
      id: "create",
      title: "Erstes Bild erstellen",
      text: "Sorte und Anlass wählen – fertige Motive landen automatisch in der Mediathek.",
    });
  }
  if (steps.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="leading-none">
          {steps.length === 1 ? "Nächster Schritt" : "Nächste Schritte"}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ol className="divide-y divide-border">
          {steps.map((step, index) => {
            const variant = index === 0 ? "default" : "outline";
            return (
              <li
                key={step.id}
                className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 gap-3">
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full border text-muted-foreground text-xs tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{step.title}</p>
                    <p className="text-muted-foreground text-sm">{step.text}</p>
                  </div>
                </div>
                <div className="shrink-0 pl-9 sm:pl-0">
                  {step.id === "plan" ? (
                    <Button variant={variant} onClick={() => onOpenTab("pricing")}>
                      Tarife ansehen
                    </Button>
                  ) : step.id === "brand" ? (
                    <Button variant={variant} onClick={onOpenBrandSetup}>
                      {brandProfileMode === "undecided" ? "Markenprofil anlegen" : "Profil ergänzen"}
                    </Button>
                  ) : (
                    <Button asChild variant={variant}>
                      <Link href="/inhalte-erstellen" prefetch={false}>
                        Bild erstellen
                      </Link>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

/** Füllstand der verfügbaren Tokens; unter 15 % in Warnfarbe. */
function TokenMeter({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div
      className="my-1 h-1.5 overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-label="Verfügbare Tokens"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <motion.div
        className={clamped < 15 ? "h-full origin-left rounded-full bg-destructive" : "h-full origin-left rounded-full bg-primary"}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: clamped / 100 }}
        transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

function BrewAiMetricCards({
  summary,
  summaryLoaded,
  summaryError,
  settings,
  settingsLoaded,
  brandProfileComplete,
  onRetrySummary,
}: {
  summary: DashboardHomeSummary | null;
  summaryLoaded: boolean;
  summaryError?: string | null;
  settings: DashboardHomeSettings | null;
  settingsLoaded: boolean;
  brandProfileComplete: boolean;
  brandProfileMode: DashboardHomeSettings["brandProfileMode"];
  onRetrySummary?: () => void;
}) {
  if (!summaryLoaded) {
    return (
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </div>
    );
  }

  if (summaryError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="leading-none">Kennzahlen</CardTitle>
          <CardDescription className="text-destructive">{summaryError}</CardDescription>
          {onRetrySummary ? (
            <CardAction>
              <Button variant="outline" size="sm" onClick={onRetrySummary}>
                Erneut laden
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
      </Card>
    );
  }

  const unlimited = Boolean(summary?.unlimited || summary?.tokens.unlimited);
  const remaining = summary?.tokens.remaining ?? 0;
  const monthly = summary?.tokens.monthly ?? 0;
  const used = tokensUsed(summary, unlimited);
  const availablePct = tokensAvailablePct(remaining, monthly, unlimited);
  const planLabel = planLabelFromKey(summary?.plan ?? null, unlimited);
  const periodEnd = formatPeriodEnd(summary?.periodEnd);
  const hasPlan = hasActivePlan(summary);
  const brandLabel = settingsLoaded
    ? brandStatusLabel(brandProfileComplete, settings)
    : "—";

  return (
    <div className="dash-rise-group grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs *:data-[slot=card]:transition-[translate,box-shadow,ring-color] *:data-[slot=card]:duration-200 *:data-[slot=card]:ease-[cubic-bezier(0.22,1,0.36,1)] *:data-[slot=card]:hover:-translate-y-0.5 *:data-[slot=card]:hover:shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_28px_-14px_rgb(0_0_0/0.25)] *:data-[slot=card]:hover:ring-foreground/15 motion-reduce:*:data-[slot=card]:transition-none motion-reduce:*:data-[slot=card]:hover:translate-y-0 xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:border-foreground/15 group-hover/card:bg-background group-hover/card:text-foreground">
              <Coins className="size-4" />
            </div>
          </CardTitle>
          <CardDescription>Tokens verfügbar</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
              {unlimited ? "∞" : <CountUp value={remaining} format={formatCompactNumber} />}
            </div>
            {availablePct != null ? <Badge variant="secondary">{Math.round(availablePct)}% frei</Badge> : null}
          </div>
          {!unlimited && availablePct != null ? <TokenMeter pct={availablePct} /> : null}
          <p className="text-muted-foreground text-sm">
            {unlimited
              ? "Unbegrenztes Kontingent"
              : `${formatDeNumber(used ?? 0)} von ${formatDeNumber(monthly)} verbraucht`}
            {periodEnd ? ` · bis ${periodEnd}` : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:border-foreground/15 group-hover/card:bg-background group-hover/card:text-foreground">
              <FolderOpen className="size-4" />
            </div>
          </CardTitle>
          <CardDescription>Motive diesen Monat</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
              {summary?.postsThisMonth == null ? (
                "—"
              ) : (
                <CountUp value={summary.postsThisMonth} format={formatDeNumber} delay={0.06} />
              )}
            </div>
          </div>
          <p className="text-muted-foreground text-sm">
            {summary?.chargesTotal != null
              ? `${formatDeNumber(summary.chargesTotal)} insgesamt erstellt`
              : "Erstellte Motive im laufenden Zeitraum"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:border-foreground/15 group-hover/card:bg-background group-hover/card:text-foreground">
              <Users className="size-4" />
            </div>
          </CardTitle>
          <CardDescription>Team</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">
              <CountUp value={summary?.teamMembers ?? 0} format={formatDeNumber} delay={0.12} />
            </div>
            {(summary?.openInvites ?? 0) > 0 ? (
              <Badge variant="secondary">{summary?.openInvites} offen</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">Aktive Mitglieder und Einladungen</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:border-foreground/15 group-hover/card:bg-background group-hover/card:text-foreground">
              <Palette className="size-4" />
            </div>
          </CardTitle>
          <CardDescription>Tarif & Marke</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium text-3xl leading-none tracking-tight">{planLabel}</div>
            <Badge variant={hasPlan ? "default" : "outline"}>{hasPlan ? "Aktiv" : "Kein Abo"}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">Marke: {brandLabel}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function BrewAiActivityOverview({
  summary,
  summaryLoaded,
  onOpenMedia,
  initialRange = "7d",
}: {
  summary: DashboardHomeSummary | null;
  summaryLoaded: boolean;
  onOpenMedia: () => void;
  initialRange?: TokenRangeKey;
}) {
  const [range, setRange] = useState<TokenRangeKey>(initialRange);
  const rangeDays = TOKEN_RANGE_DAYS[range];

  const chartData = useMemo(() => {
    const days = summary?.tokenUsageByDay ?? [];
    if (days.length === 0) return [];
    return aggregateTokenUsageFromDays(days, range).points;
  }, [summary?.tokenUsageByDay, range]);

  const hasData = chartData.some((point) => point.tokens > 0);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="leading-none">Token-Aktivität</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">
            {summary?.unlimited || summary?.tokens.unlimited
              ? `Nominalverbrauch (ohne Abbuchung) · letzte ${rangeDays} Tage`
              : `Verbrauch aus Generierungen der letzten ${rangeDays} Tage`}
          </span>
          <span className="@[540px]/card:hidden">Letzte {rangeDays} Tage</span>
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as TokenRangeKey)}>
            <SelectTrigger size="sm" className="w-32" aria-label="Zeitraum">
              <SelectValue placeholder="Zeitraum" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Zeitraum</SelectLabel>
                {(Object.keys(TOKEN_RANGE_LABELS) as TokenRangeKey[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {TOKEN_RANGE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={onOpenMedia}>
            Zur Mediathek
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {!summaryLoaded ? (
          <Skeleton className="h-80 w-full rounded-lg" />
        ) : !hasData ? (
          <div className="flex h-40 w-full items-center justify-center rounded-lg bg-muted/40 px-4 text-center">
            <p className="text-muted-foreground text-sm">
              Noch kein Token-Verbrauch in diesem Zeitraum. Sobald du Bilder erstellst, siehst du hier den
              Verlauf pro Tag.
            </p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-80 w-full">
            <ComposedChart data={chartData} margin={{ top: 0 }}>
              <defs>
                <linearGradient id="fillTokens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-tokens)" stopOpacity={0.36} />
                  <stop offset="95%" stopColor="var(--color-tokens)" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeOpacity={0.5} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={48}
                tickFormatter={(value) =>
                  parseISO(value).toLocaleDateString("de-DE", {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    className="w-50"
                    indicator="line"
                    labelFormatter={(value) => format(parseISO(String(value)), "d. MMMM yyyy", { locale: de })}
                  />
                }
              />
              <ChartLegend verticalAlign="top" content={<ChartLegendContent className="mb-5 justify-end" />} />
              <Area
                dataKey="tokens"
                type="natural"
                fill="url(#fillTokens)"
                stroke="var(--color-tokens)"
                strokeWidth={1.25}
                dot={false}
                fillOpacity={1}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function BrewAiAssetsOverview({
  media,
  mediaLoaded,
  mediaError,
  onRetryMedia,
  onOpenMedia,
}: {
  media: DashboardHomeMediaItem[];
  mediaLoaded: boolean;
  mediaError?: string | null;
  onRetryMedia?: () => void;
  onOpenMedia: () => void;
}) {
  const [query, setQuery] = useState("");
  const [resolution, setResolution] = useState<"all" | "1K" | "2K" | "4K">("all");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return media.filter((item) => {
      if (resolution !== "all" && item.resolution !== resolution) return false;
      if (!needle) return true;
      return mediaRowTitle(item).toLowerCase().includes(needle) || item.prompt.toLowerCase().includes(needle);
    });
  }, [media, query, resolution]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="leading-none">
          {mediaLoaded
            ? `${formatDeNumber(media.length)} ${media.length === 1 ? "Motiv" : "Motive"}`
            : "Motive"}
        </CardTitle>
        <CardDescription>Zuletzt erstellte Motive mit Format, Auflösung und Erstellungszeit.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={onOpenMedia}>
            Zur Mediathek
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Suche und Filter erst, wenn es etwas zu durchsuchen gibt. */}
        {mediaLoaded && !mediaError && media.length > 0 ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Motive suchen…"
            aria-label="Motive durchsuchen"
            className="max-w-sm"
          />
          <Select value={resolution} onValueChange={(v) => setResolution(v as typeof resolution)}>
            <SelectTrigger size="sm" className="w-36" aria-label="Nach Auflösung filtern">
              <SelectValue placeholder="Auflösung" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Auflösung</SelectLabel>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="1K">1K</SelectItem>
                <SelectItem value="2K">2K</SelectItem>
                <SelectItem value="4K">4K</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        ) : null}

        {!mediaLoaded ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : mediaError ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg bg-muted/40">
            <p className="text-destructive text-sm">{mediaError}</p>
            {onRetryMedia ? (
              <Button variant="outline" size="sm" onClick={onRetryMedia}>
                Erneut laden
              </Button>
            ) : null}
          </div>
        ) : media.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg bg-muted/40 px-4 py-6 text-center">
            <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium text-sm">Noch keine Motive</p>
              <p className="text-muted-foreground text-sm">
                Erstelle dein erstes Bild. Fertige Motive erscheinen hier und in der Mediathek.
              </p>
            </div>
            {/* Outline: Die primäre Aktion steht oben in „Nächste Schritte“. */}
            <Button asChild size="sm" variant="outline">
              <Link href="/inhalte-erstellen" prefetch={false}>
                Bild erstellen
              </Link>
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg bg-muted/40 px-4 text-center">
            <p className="text-muted-foreground text-sm">Keine Motive passen zu Suche oder Filter.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setResolution("all");
              }}
            >
              Filter zurücksetzen
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden">
            <Table>
              <TableHeader className="[&_tr]:border-0">
                <TableRow className="border-0 hover:bg-transparent">
                  <TableHead>Motiv</TableHead>
                  {/* Unter 640 px nur Motiv + Erstellt — sonst rutscht „Erstellt“ unsichtbar aus dem Bild. */}
                  <TableHead className="hidden sm:table-cell">Format</TableHead>
                  <TableHead className="hidden sm:table-cell">Auflösung</TableHead>
                  <TableHead className="text-right">Erstellt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr]:border-0">
                {rows.slice(0, 10).map((item) => (
                  <TableRow key={item.id} className="border-0">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 items-center justify-center overflow-hidden rounded-md bg-muted">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageUrl} alt="" className="size-full object-cover" />
                          ) : (
                            <ImageIcon className="size-4 text-muted-foreground" />
                          )}
                        </span>
                        <div className="min-w-0 max-w-[11rem] truncate font-medium text-sm leading-none sm:max-w-xs">
                          {mediaRowTitle(item)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary">{item.aspectRatio}</Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{item.resolution}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {formatRelativeTime(item.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminHomeView({
  summary,
  summaryLoaded,
  summaryError,
  media,
  mediaLoaded,
  mediaError,
  settings,
  settingsLoaded,
  brandProfileComplete,
  brandProfileMode,
  onOpenTab,
  onOpenBrandSetup,
  onRetrySummary,
  onRetryMedia,
  initialTokenRange,
}: AdminHomeViewProps) {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* Außerhalb von .dash-rise-stack: Die Karte erscheint erst nach dem Laden und darf die
          nth-child-Staffelung (und damit die Einblendung) der Kennzahlen nicht neu auslösen. */}
      <BrewAiNextSteps
        summary={summary}
        summaryLoaded={summaryLoaded}
        summaryError={summaryError}
        media={media}
        mediaLoaded={mediaLoaded}
        mediaError={mediaError}
        settingsLoaded={settingsLoaded}
        brandProfileComplete={brandProfileComplete}
        brandProfileMode={brandProfileMode}
        onOpenTab={onOpenTab}
        onOpenBrandSetup={onOpenBrandSetup}
      />
      <div className="dash-rise-stack flex flex-col gap-4 md:gap-6">
      <BrewAiMetricCards
        summary={summary}
        summaryLoaded={summaryLoaded}
        summaryError={summaryError}
        settings={settings}
        settingsLoaded={settingsLoaded}
        brandProfileComplete={brandProfileComplete}
        brandProfileMode={brandProfileMode}
        onRetrySummary={onRetrySummary}
      />
      <BrewAiActivityOverview
        summary={summary}
        summaryLoaded={summaryLoaded}
        onOpenMedia={() => onOpenTab("media")}
        initialRange={initialTokenRange}
      />
      <BrewAiAssetsOverview
        media={media}
        mediaLoaded={mediaLoaded}
        mediaError={mediaError}
        onRetryMedia={onRetryMedia}
        onOpenMedia={() => onOpenTab("media")}
      />
      </div>
    </div>
  );
}
