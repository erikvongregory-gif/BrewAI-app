import { notFound } from "next/navigation";

const SECTIONS = new Set(["media", "team", "brand", "settings", "pricing", "assistant"]);

/**
 * Prüft den Abschnitt oberhalb der loading.tsx-Grenze dieses Segments: So fällt notFound() noch in die
 * Shell-Phase (HTTP 404) und wird von (dashboard)/not-found.tsx innerhalb der Shell angezeigt.
 * In der Page wäre es schon hinter Suspense, gestreamt mit 200.
 */
export default async function DashboardSectionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ section?: string[] }>;
}) {
  const section = (await params).section?.[0]?.toLowerCase();
  if (section && !SECTIONS.has(section)) notFound();
  return children;
}
