import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "@/components/ui/status-screen";

export default function NotFound() {
  return (
    <StatusScreen
      eyebrow="Fehler 404"
      title="Seite nicht gefunden"
      actions={
        <>
          <Button asChild>
            <Link href="/dashboard">Zur Übersicht</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/inhalte-erstellen">Bild erstellen</Link>
          </Button>
        </>
      }
    >
      Diese Adresse gibt es nicht oder nicht mehr. Prüfe den Link oder geh zurück zur Übersicht.
    </StatusScreen>
  );
}
