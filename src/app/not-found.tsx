import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto my-10 flex w-full max-w-lg flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <p className="font-medium text-muted-foreground text-xs">404</p>
      <h1 className="font-semibold text-xl">Seite nicht gefunden</h1>
      <p className="text-muted-foreground text-sm">
        Diese Adresse gibt es nicht oder nicht mehr. Prüfe den Link oder geh zurück zur Übersicht.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/dashboard">Zur Übersicht</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/inhalte-erstellen">Bild erstellen</Link>
        </Button>
      </div>
    </div>
  );
}
