import Link from "next/link";
import { StudioIcon } from "@/components/studio/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  {
    icon: "spark" as const,
    title: "Reels & Stories im Markenlook",
    text: "Kurze Clips, die zu deiner Bildsprache passen.",
  },
  {
    icon: "brand" as const,
    title: "Basierend auf deinem Markenprofil",
    text: "Farben, Ton und Stil fließen automatisch ein.",
  },
  {
    icon: "media" as const,
    title: "Optimiert für Social Media",
    text: "Formate für Feed, Story und Werbeclips.",
  },
] as const;

export function CreateVideosComingSoonView() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <header className="space-y-3">
        <Badge variant="secondary" className="rounded-md px-2.5 py-0.5 text-xs font-medium">
          Demnächst verfügbar
        </Badge>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Videos erstellen
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            KI-Videos im Markenstil — Reels, Stories und Werbeclips aus deinem Markenprofil.
          </p>
        </div>
      </header>

      <Card className="border-border shadow-sm">
        <CardHeader className="gap-2 border-b border-border/60 pb-5">
          <CardTitle className="text-base font-semibold">In Arbeit</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            „Videos erstellen“ wird gerade vorbereitet. Sobald die Funktion freigeschaltet ist, erscheint sie
            in der Navigation und du kannst hier kurze Marken-Videos erstellen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <ul className="space-y-4">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground">
                  <StudioIcon name={feature.icon} size={18} />
                </span>
                <div className="min-w-0 space-y-0.5 pt-0.5">
                  <p className="text-sm font-medium text-foreground">{feature.title}</p>
                  <p className="text-sm text-muted-foreground">{feature.text}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-5">
            <Button asChild>
              <Link href="/inhalte-erstellen">
                <StudioIcon name="spark" size={16} />
                Bilder erstellen
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">
                <StudioIcon name="dash" size={16} />
                Zum Dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Fragen?{" "}
        <a
          href="mailto:kontakt@brewai.de"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          kontakt@brewai.de
        </a>
      </p>
    </div>
  );
}
