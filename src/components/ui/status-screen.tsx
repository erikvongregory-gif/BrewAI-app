import { EvglabMark } from "@/components/studio/evglab-mark";
import { APP_CONFIG } from "@/config/app-config";

/**
 * Zentrierte Hinweiskarte für 404, Fehler und gesperrte Zugänge.
 * Allein stehend: volle Höhe mit Logo. Innerhalb der Dashboard-Shell (.brewai-admin) ohne Logo,
 * weil die Sidebar es schon zeigt.
 */
export function StatusScreen({
  eyebrow,
  title,
  children,
  actions,
  footer,
  role,
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
  footer?: React.ReactNode;
  role?: "alert";
}) {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 bg-background px-4 py-10 text-foreground in-[.brewai-admin]:min-h-[70dvh] in-[.brewai-admin]:bg-transparent">
      <div className="flex items-center gap-2 in-[.brewai-admin]:hidden">
        <EvglabMark size={22} />
        <span className="font-semibold text-lg">{APP_CONFIG.name}</span>
      </div>
      <section
        role={role}
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
      >
        <div className="flex flex-col gap-2">
          {eyebrow ? <p className="font-medium text-muted-foreground text-xs">{eyebrow}</p> : null}
          <h1 className="font-semibold text-xl tracking-tight">{title}</h1>
          <div className="text-muted-foreground text-sm">{children}</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{actions}</div>
        {footer}
      </section>
    </div>
  );
}
