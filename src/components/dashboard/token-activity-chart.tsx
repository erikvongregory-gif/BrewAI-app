"use client";

import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Area, CartesianGrid, ComposedChart, XAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const chartConfig = {
  tokens: {
    label: "Tokens",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

/** Eigene Datei, damit recharts erst nachgeladen wird und nicht im ersten Dashboard-Bundle steckt. */
export default function TokenActivityChart({ data }: { data: { date: string; tokens: number }[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-80 w-full">
      <ComposedChart data={data} margin={{ top: 0 }}>
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
          animationDuration={400}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
