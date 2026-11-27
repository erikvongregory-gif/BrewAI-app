"use client";

import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { EvglabMark } from "@/components/studio/evglab-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { studioFontClassName } from "@/lib/fonts/studio-fonts";
import { MARKETING_SITE_URL } from "@/lib/siteConfig";
import { cn } from "@/lib/utils";

type FeedbackProps = {
  notice?: string;
  error?: string;
};

function Feedback({ notice, error }: FeedbackProps) {
  return (
    <>
      {notice ? (
        <div
          className="mb-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
          role="status"
        >
          {notice}
        </div>
      ) : null}
      {error ? (
        <div
          className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="h-11 w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function AuthShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-dvh w-full items-center justify-center bg-background p-4",
        studioFontClassName,
      )}
    >
      <div className="mx-auto w-full max-w-md">
        <a
          href={MARKETING_SITE_URL}
          className="mb-6 flex items-center justify-center gap-2 text-foreground"
          aria-label="BrewAI Startseite"
        >
          <EvglabMark size={22} />
          <span className="font-semibold tracking-tight">BrewAI</span>
        </a>

        <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card/80 shadow-xl backdrop-blur-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5" />
          <div className="relative z-10 space-y-6 p-8">
            <div className="text-center">
              <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{lead}</p>
            </div>
            {children}
          </div>
        </div>

        <p className="mt-6 text-center text-muted-foreground text-xs">app.brewai.de · Studio</p>
      </div>
    </div>
  );
}

export function PasswordResetLoading({ message = "Einen Moment …" }: { message?: string }) {
  return (
    <AuthShell title="Einen Moment …" lead={message}>
      <p className="text-center text-sm text-muted-foreground">Bitte warten.</p>
    </AuthShell>
  );
}

export function ForgotPasswordPage({ notice, error }: FeedbackProps) {
  const sent = Boolean(notice);

  if (sent) {
    return (
      <AuthShell title="E-Mail prüfen" lead="Wir haben dir einen Link zum Zurücksetzen geschickt.">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="size-8 text-primary" />
          </div>
          <Feedback notice={notice} error={error} />
          <Button variant="outline" className="mt-2 w-full" asChild>
            <Link href="/anmelden">Zurück zur Anmeldung</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Passwort zurücksetzen"
      lead="Gib deine E-Mail ein. Du erhältst einen Link von BrewAI."
    >
      <Feedback notice={notice} error={error} />

      <form className="space-y-5" action="/auth/reset-password/request" method="post">
        <div className="space-y-2">
          <Label htmlFor="reset-email">E-Mail</Label>
          <Input
            id="reset-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="name@beispiel.de"
          />
        </div>
        <SubmitButton label="Link senden" pendingLabel="Wird gesendet …" />
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/anmelden" className="text-primary underline-offset-4 hover:underline">
          ← Zurück zur Anmeldung
        </Link>
      </p>
    </AuthShell>
  );
}

export function ConfirmPasswordResetPage({ tokenHash }: { tokenHash: string }) {
  return (
    <AuthShell title="Passwort zurücksetzen" lead="Bestätige kurz, dann legst du dein neues Passwort fest.">
      <form method="get" action="/auth/callback" className="space-y-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value="recovery" />
        <input type="hidden" name="next" value="/passwort-zuruecksetzen" />
        <SubmitButton label="Neues Passwort festlegen" pendingLabel="Einen Moment …" />
      </form>
    </AuthShell>
  );
}

export function ResetPasswordPage({ notice, error }: FeedbackProps) {
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);

  return (
    <AuthShell title="Neues Passwort" lead="Mindestens 8 Zeichen, dann bist du wieder drin.">
      <Feedback notice={notice} error={error} />

      <form className="space-y-5" action="/auth/reset-password/update" method="post">
        <div className="space-y-2">
          <Label htmlFor="new-password">Neues Passwort</Label>
          <div className="relative">
            <Input
              id="new-password"
              name="password"
              type={showPw ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-0 right-0 h-full px-3"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Passwort verbergen" : "Passwort anzeigen"}
            >
              {showPw ? "🙈" : "👁"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password-confirm">Passwort bestätigen</Label>
          <div className="relative">
            <Input
              id="new-password-confirm"
              name="passwordConfirm"
              type={showPwConfirm ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-0 right-0 h-full px-3"
              onClick={() => setShowPwConfirm((v) => !v)}
              aria-label={showPwConfirm ? "Passwort verbergen" : "Passwort anzeigen"}
            >
              {showPwConfirm ? "🙈" : "👁"}
            </Button>
          </div>
        </div>

        <SubmitButton label="Passwort speichern" pendingLabel="Wird gespeichert …" />
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/passwort-vergessen" className="text-primary underline-offset-4 hover:underline">
          Neuen Link anfordern
        </Link>
      </p>
    </AuthShell>
  );
}
