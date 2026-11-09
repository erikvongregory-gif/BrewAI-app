"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Clapperboard,
  FolderOpen,
  ImagePlus,
  LayoutDashboard,
  MessageSquareText,
  Palette,
  PlusCircle,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Tour, useTour, type TourStep } from "@/components/ui/product-tour";
import { EvglabMark } from "@/components/studio/evglab-mark";
import { UI_TOUR_VERSION } from "@/lib/dashboard/onboarding";
import { isVideosCreateEnabled } from "@/lib/featureFlags";
import { patchOnboarding } from "@/components/studio/onboarding/onboarding-tour-types";


/** Event, mit dem sich der Rundgang von überall erneut starten lässt (z. B. Konto-Menü). */
export const START_TOUR_EVENT = "brewai:start-tour";

export function startDashboardTour() {
  window.dispatchEvent(new Event(START_TOUR_EVENT));
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const ALL_STEPS: TourStep[] = [
  {
    target: "#tour-create",
    eyebrow: "Schnellstart",
    icon: <PlusCircle />,
    title: "Neu erstellen",
    content: "Der schnellste Weg zu einem neuen Motiv — ein Klick, und du bist im Studio.",
    tip: "Dein Markenprofil ist schon hinterlegt. Du wählst nur noch Bier und Anlass.",
    placement: "right",
  },
  {
    target: "#tour-nav-dashboard",
    eyebrow: "Arbeitsbereich",
    icon: <LayoutDashboard />,
    title: "Dashboard",
    content: "Dein Überblick: Tokens, letzte Motive und was als Nächstes sinnvoll ist.",
    placement: "right",
  },
  {
    target: "#tour-nav-assistant",
    eyebrow: "Arbeitsbereich",
    icon: <MessageSquareText />,
    title: "BrewAI Assistent",
    content: "Frag nach Captions, Kampagnen-Ideen oder Texten — er kennt deine Marke.",
    tip: "Probier: „Schreib mir drei Instagram-Captions für unser Helles.“",
    placement: "right",
  },
  {
    target: "#tour-nav-create",
    eyebrow: "Arbeitsbereich",
    icon: <ImagePlus />,
    title: "Bilder erstellen",
    content: "Fotorealistische Motive mit deinem Sortiment — Reportage, Premium oder Kampagne.",
    placement: "right",
  },
  {
    target: "#tour-nav-create-videos",
    eyebrow: "Arbeitsbereich",
    icon: <Clapperboard />,
    title: "Videos erstellen",
    content: "Aus Motiven werden kurze Clips für Reels und Stories.",
    placement: "right",
  },
  {
    target: "#tour-nav-media",
    eyebrow: "Arbeitsbereich",
    icon: <FolderOpen />,
    title: "Mediathek",
    content: "Alle fertigen Motive und laufenden Aufträge an einem Ort — suchen, laden, teilen.",
    placement: "right",
  },
  {
    target: "#tour-nav-brand",
    eyebrow: "Marke",
    icon: <Palette />,
    title: "Markenprofil",
    content: "Farben, Tonalität und Sortiment aus dem Einlesen. Hier feinjustierst du alles.",
    tip: "Je genauer das Profil, desto markentreuer werden deine Motive.",
    placement: "right",
  },
  {
    target: "#tour-search",
    eyebrow: "Navigation",
    icon: <Search />,
    title: "Schnellsuche",
    content: "Springe direkt zu jedem Bereich im Studio.",
    tip: "Tastenkürzel: Strg + J (Mac: ⌘ J)",
    placement: "bottom",
  },
  {
    target: "#tour-avatar",
    eyebrow: "Konto",
    icon: <UserRound />,
    title: "Konto & Tokens",
    content: "Der Ring zeigt deine verbleibenden Tokens. Dahinter: Abo, Profil und Einstellungen.",
    tip: "Den Rundgang kannst du hier jederzeit neu starten.",
    placement: "bottom",
  },
];

const INTRO_POINTS = [
  // Videos nur nennen, wenn der Bereich freigeschaltet ist (Feature-Flag), sonst kein leeres Versprechen.
  { icon: ImagePlus, title: "Erstellen", text: isVideosCreateEnabled() ? "Motive & Videos" : "Fotorealistische Motive" },
  { icon: FolderOpen, title: "Sammeln", text: "Alles in der Mediathek" },
  { icon: Palette, title: "Steuern", text: "Deine Marke im Griff" },
];

const CONFETTI = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2;
  const dist = 90 + ((i * 37) % 70);
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist - 20,
    r: ((i * 53) % 180) - 90,
    color: ["#C7691E", "#E9A25F", "#F6D2AE", "#2F7A4A", "#18140F"][i % 5],
    w: i % 3 === 0 ? 10 : 6,
  };
});

function isVisibleTarget(selector?: string) {
  if (!selector) return true;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width >= 2 && r.height >= 2 && r.right > 0 && r.left < window.innerWidth;
}

type Phase = "idle" | "intro" | "tour" | "outro";

export function DashboardProductTour({
  initialSeen,
  firstName,
  userId,
}: {
  initialSeen: boolean;
  firstName?: string;
  userId?: string;
}) {
  // Lokale Markierung nur pro Nutzer — sonst verschluckt ein geteilter Browser den Rundgang für neue Accounts.
  // Ohne userId entscheidet allein der Server-Flag.
  const tour = useTour(userId ? `brewai-ui-tour-v${UI_TOUR_VERSION}:${userId}` : undefined);
  const reduce = useReducedMotion() === true;
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [steps, setSteps] = React.useState<TourStep[]>(ALL_STEPS);

  const persistSeen = React.useCallback(() => {
    tour.markSeen();
    void patchOnboarding({ uiTourVersion: UI_TOUR_VERSION }).catch(() => {});
  }, [tour]);

  React.useEffect(() => {
    if (initialSeen) {
      tour.markSeen();
      return;
    }
    if (tour.seen()) {
      // Dieser Nutzer hat ihn hier schon gesehen, nur das Speichern am Server fehlte → nachziehen
      void patchOnboarding({ uiTourVersion: UI_TOUR_VERSION }).catch(() => {});
      return;
    }
    const t = window.setTimeout(() => setPhase("intro"), 700);
    return () => window.clearTimeout(t);
    // einmalig nach Mount
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start only once
  }, []);

  React.useEffect(() => {
    const onStart = () => {
      tour.setOpen(false);
      setPhase("intro");
    };
    window.addEventListener(START_TOUR_EVENT, onStart);
    return () => window.removeEventListener(START_TOUR_EVENT, onStart);
  }, [tour]);

  React.useEffect(() => {
    if (phase !== "intro" && phase !== "outro") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        persistSeen();
        setPhase("idle");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, persistSeen]);

  const beginSpotlight = () => {
    // Nur Ziele zeigen, die gerade sichtbar sind (mobile Sidebar ist z. B. eingeklappt).
    const visible = ALL_STEPS.filter((s) => isVisibleTarget(s.target));
    setSteps(visible.length ? visible : ALL_STEPS);
    setPhase("tour");
    tour.start();
  };

  const skipAll = () => {
    persistSeen();
    setPhase("idle");
  };

  const name = firstName?.trim().split(" ")[0];
  const overlayOpen = phase === "intro" || phase === "outro";

  return (
    <>
      <Tour
        steps={steps}
        open={tour.open && phase === "tour"}
        onOpenChange={tour.setOpen}
        index={tour.index}
        onIndexChange={tour.setIndex}
        showProgress={false}
        primaryLabel={tour.index === steps.length - 1 ? "Abschließen" : undefined}
        onFinish={() => {
          persistSeen();
          setPhase("outro");
        }}
        onSkip={skipAll}
      />

      <AnimatePresence>
        {overlayOpen ? (
          <motion.div
            key="tour-overlay"
            className="fixed inset-0 z-[110] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            transition={{ duration: reduce ? 0 : 0.35, ease: EASE_OUT }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-overlay-title"
          >
            <div className="absolute inset-0 bg-zinc-950/55 backdrop-blur-[6px]" onClick={skipAll} />

            <AnimatePresence mode="wait">
              {phase === "intro" ? (
                <motion.div
                  key="intro"
                  className="relative w-full max-w-[460px] overflow-hidden rounded-3xl border border-white/10 bg-white shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)] dark:bg-zinc-900"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 24 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -12, transition: { duration: 0.22 } }}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26 }}
                >
                  <div className="relative h-40 overflow-hidden bg-[#18140F]">
                    <motion.div
                      aria-hidden
                      className="absolute -inset-1/2"
                      style={{
                        background:
                          "conic-gradient(from 0deg, #18140F, #C7691E 70deg, #F6D2AE 120deg, #18140F 190deg, #7A3E10 260deg, #18140F)",
                        filter: "blur(40px)",
                      }}
                      animate={reduce ? undefined : { rotate: 360 }}
                      transition={{ duration: 14, ease: "linear", repeat: Infinity }}
                    />
                    <div
                      aria-hidden
                      className="absolute inset-0 opacity-[0.18] mix-blend-overlay"
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
                      }}
                    />
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center"
                      initial={reduce ? false : { scale: 0.4, opacity: 0, rotate: -20 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.15 }}
                    >
                      <span className="flex size-16 items-center justify-center rounded-2xl bg-white/95 shadow-[0_0_60px_rgba(233,162,95,0.65)]">
                        <EvglabMark size={34} />
                      </span>
                    </motion.div>
                  </div>

                  <div className="p-6 pt-5">
                    <motion.p
                      className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#C7691E]"
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.25 }}
                    >
                      Einrichtung abgeschlossen
                    </motion.p>
                    <h2 id="tour-overlay-title" className="mt-1.5 text-2xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">
                      {(name ? `Willkommen im Studio, ${name}.` : "Willkommen im Studio.").split(" ").map((word, i) => (
                        <motion.span
                          key={`${word}-${i}`}
                          className="mr-[0.25em] inline-block"
                          initial={reduce ? false : { opacity: 0, y: 10, filter: "blur(6px)" }}
                          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                          transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.3 + i * 0.06 }}
                        >
                          {word}
                        </motion.span>
                      ))}
                    </h2>
                    <motion.p
                      className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400"
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.6 }}
                    >
                      In einer Minute zeigen wir dir, wo was liegt — danach legst du los.
                    </motion.p>

                    <div className="mt-5 grid grid-cols-3 gap-2">
                      {INTRO_POINTS.map((point, i) => {
                        const Icon = point.icon;
                        return (
                          <motion.div
                            key={point.title}
                            className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-800/50"
                            initial={reduce ? false : { opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.7 + i * 0.09 }}
                          >
                            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#F6D2AE] to-[#E9A25F] text-[#5A2D08]">
                              <Icon className="size-4" aria-hidden />
                            </span>
                            <p className="mt-2 text-[13px] font-semibold text-zinc-900 dark:text-zinc-50">{point.title}</p>
                            <p className="text-[11.5px] leading-snug text-zinc-500 dark:text-zinc-400">{point.text}</p>
                          </motion.div>
                        );
                      })}
                    </div>

                    <motion.div
                      className="mt-6 flex items-center justify-between gap-3"
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.95 }}
                    >
                      <button
                        type="button"
                        onClick={skipAll}
                        className="rounded-lg px-2 py-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
                      >
                        Überspringen
                      </button>
                      <button
                        type="button"
                        autoFocus
                        onClick={beginSpotlight}
                        className="group inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-black/20 transition-[background-color,transform] hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C7691E] focus-visible:ring-offset-2 active:scale-[0.97] dark:bg-white dark:text-zinc-900"
                      >
                        Rundgang starten
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </button>
                    </motion.div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="outro"
                  className="relative w-full max-w-[400px] rounded-3xl border border-white/10 bg-white p-7 text-center shadow-[0_40px_120px_-30px_rgba(0,0,0,0.6)] dark:bg-zinc-900"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 24 }}
                >
                  <div className="relative mx-auto flex size-20 items-center justify-center">
                    {!reduce
                      ? CONFETTI.map((c, i) => (
                          <motion.span
                            key={i}
                            aria-hidden
                            className="absolute left-1/2 top-1/2 rounded-[2px]"
                            style={{ width: c.w, height: c.w * 0.45, background: c.color, marginLeft: -c.w / 2 }}
                            initial={{ x: 0, y: 0, opacity: 0, rotate: 0, scale: 0.4 }}
                            animate={{ x: c.x, y: [0, c.y, c.y + 60], opacity: [0, 1, 0], rotate: c.r * 4, scale: 1 }}
                            transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 + (i % 5) * 0.03 }}
                          />
                        ))
                      : null}
                    <motion.span
                      className="absolute inset-0 rounded-full bg-[#C7691E]/20"
                      initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                      animate={reduce ? undefined : { scale: [0.6, 1.5], opacity: [0.8, 0] }}
                      transition={{ duration: 1.2, ease: "easeOut", delay: 0.15 }}
                    />
                    <motion.span
                      className="relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E9A25F] to-[#C7691E] text-white shadow-[0_12px_36px_-8px_rgba(199,105,30,0.8)]"
                      initial={reduce ? false : { scale: 0.3, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 380, damping: 14, delay: 0.1 }}
                    >
                      <Sparkles className="size-7" aria-hidden />
                    </motion.span>
                  </div>
                  <h2 id="tour-overlay-title" className="mt-5 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    Du bist startklar.
                  </h2>
                  <p className="mx-auto mt-2 max-w-[300px] text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                    Dein Markenprofil steht. Zeit für dein erstes Motiv — in unter einer Minute fertig.
                  </p>
                  <div className="mt-6 flex flex-col gap-2">
                    <Link
                      href="/inhalte-erstellen"
                      autoFocus
                      onClick={() => setPhase("idle")}
                      className="group inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-black/20 transition-[background-color,transform] hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C7691E] focus-visible:ring-offset-2 active:scale-[0.98] dark:bg-white dark:text-zinc-900"
                    >
                      <ImagePlus className="size-4" aria-hidden />
                      Erstes Motiv erstellen
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setPhase("idle")}
                      className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    >
                      Erst mal umschauen
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
