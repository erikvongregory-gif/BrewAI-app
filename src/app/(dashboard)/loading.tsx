import { Skeleton } from "@/components/ui/skeleton";

/** Platzhalter nur im Inhaltsbereich: Shell bleibt stehen, kein heller Vollbild-Flash, keine Überhöhe. */
export default function StudioDashboardLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Inhalt wird geladen" className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
