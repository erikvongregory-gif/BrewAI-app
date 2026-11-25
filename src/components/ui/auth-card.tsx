"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import React, { useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";

import { EvglabMark } from "@/components/studio/evglab-mark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { TERMS_ACCEPTANCE_FORM_FIELD } from "@/lib/auth/termsAcceptance";
import { studioFontClassName } from "@/lib/fonts/studio-fonts";
import { MARKETING_SITE_URL } from "@/lib/siteConfig";
import { cn } from "@/lib/utils";

export type AuthMode = "login" | "signup";
export type OAuthProvider = "google" | "apple" | "linkedin";

export interface AuthCardProps {
  defaultMode?: AuthMode;
  mode?: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
  onSubmit: (payload: {
    mode: AuthMode;
    email: string;
    password: string;
    brewery?: string;
    stayLoggedIn?: boolean;
    acceptedTerms?: boolean;
  }) => Promise<void> | void;
  onOAuth: (provider: OAuthProvider) => void;
  onForgotPassword?: () => void;
  loading?: boolean;
  error?: string | null;
  formAction?: string;
  nextPath?: string;
  inviteToken?: string;
  /** Prefill e-mail (e.g. from team invite). */
  defaultEmail?: string;
  oauthProviders?: OAuthProvider[];
  googleHref?: string;
  feedbackNotice?: React.ReactNode;
  inviteBlocked?: boolean;
  inviteBlockedMessage?: string;
  /** Softer signup copy when joining a team invite. */
  teamInviteMode?: boolean;
  termsHref?: string;
  privacyHref?: string;
  showModeSwitch?: boolean;
  forgotPasswordHref?: string;
}

function marketingLegalUrl(path: "agb" | "datenschutz" | "impressum") {
  try {
    const host = new URL(MARKETING_SITE_URL).hostname;
    if (host === "localhost" || host === "127.0.0.1") return `https://brewai.de/${path}`;
  } catch {
    /* keep fallback */
  }
  return `${MARKETING_SITE_URL.replace(/\/$/, "")}/${path}`;
}

function clearLegacySupabaseSessionCookies() {
  if (typeof document === "undefined") return;
  const names = document.cookie
    .split(";")
    .map((part) => part.slice(0, part.indexOf("=")).trim())
    .filter((name) => /^sb-[A-Za-z0-9_-]+-auth-token(?:\.\d+)?$/.test(name));
  for (const name of new Set(names)) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    document.cookie = `${name}=; Path=/; Domain=.brewai.de; Max-Age=0; SameSite=Lax; Secure`;
  }
}

const GoogleG = () => (
  <svg className="mr-2 size-4" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

function SubmitButton({ isSignup, busy }: { isSignup: boolean; busy: boolean }) {
  const { pending: actionPending } = useFormStatus();
  const pending = busy || actionPending;
  return (
    <Button type="submit" className="h-11 w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 size-4 animate-spin" />
          {isSignup ? "Konto wird angelegt …" : "Anmeldung läuft …"}
        </>
      ) : isSignup ? (
        "Konto anlegen"
      ) : (
        "Anmelden"
      )}
    </Button>
  );
}

export function AuthCard({
  defaultMode = "login",
  mode: controlledMode,
  onModeChange,
  onSubmit,
  onOAuth,
  onForgotPassword,
  loading = false,
  error = null,
  formAction,
  nextPath = "/dashboard",
  inviteToken,
  defaultEmail = "",
  oauthProviders = ["google"],
  googleHref,
  feedbackNotice,
  inviteBlocked = false,
  inviteBlockedMessage = "Registrierung ist nur mit Einladung möglich. Bitte nutze deinen Einladungslink.",
  teamInviteMode = false,
  termsHref = marketingLegalUrl("agb"),
  privacyHref = marketingLegalUrl("datenschutz"),
  showModeSwitch = true,
  forgotPasswordHref = "/passwort-vergessen",
}: AuthCardProps) {
  const reactId = useId();
  const [uncontrolledMode, setUncontrolledMode] = useState<AuthMode>(defaultMode);
  const mode = controlledMode ?? uncontrolledMode;
  const isSignup = mode === "signup";

  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [brewery, setBrewery] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultEmail) setEmail(defaultEmail);
  }, [defaultEmail]);

  const displayError = localError ?? error;
  const showGoogle = oauthProviders.includes("google");
  const [submitting, setSubmitting] = useState(false);
  const busy = loading;

  useEffect(() => {
    const reset = () => setSubmitting(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  const setMode = (next: AuthMode) => {
    setLocalError(null);
    setPasswordConfirm("");
    if (controlledMode === undefined) setUncontrolledMode(next);
    onModeChange?.(next);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    if (isSignup && !acceptedTerms) {
      event.preventDefault();
      setLocalError("Bitte die AGB akzeptieren.");
      return;
    }
    if (isSignup && inviteBlocked) {
      event.preventDefault();
      setLocalError(inviteBlockedMessage);
      return;
    }
    if (isSignup && password !== passwordConfirm) {
      event.preventDefault();
      setLocalError("Passwörter stimmen nicht überein.");
      return;
    }

    setLocalError(null);

    if (formAction) {
      if (submitting) { event.preventDefault(); return; }
      setSubmitting(true);
      clearLegacySupabaseSessionCookies();
      onSubmit({
        mode,
        email,
        password,
        brewery: isSignup ? brewery : undefined,
        acceptedTerms: isSignup ? acceptedTerms : undefined,
      });
      return;
    }

    event.preventDefault();
    await onSubmit({
      mode,
      email,
      password,
      brewery: isSignup ? brewery : undefined,
      acceptedTerms: isSignup ? acceptedTerms : undefined,
    });
  };

  const formProps = formAction
    ? { action: formAction, method: "post" as const, onSubmit: handleSubmit }
    : { onSubmit: handleSubmit };

  const googleSignupHref =
    isSignup && googleHref
      ? `${googleHref}${googleHref.includes("?") ? "&" : "?"}terms_accepted=1`
      : googleHref;

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
          <div className="relative z-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="p-8"
              >
                <div className="mb-8 text-center">
                  <h1 className="text-3xl font-semibold text-foreground">
                    {isSignup
                      ? teamInviteMode
                        ? "Konto für die Einladung"
                        : "Konto anlegen"
                      : "Willkommen zurück"}
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {isSignup
                      ? teamInviteMode
                        ? "Lege ein Konto mit der eingeladenen E-Mail an — danach trittst du dem Team bei."
                        : "Markenprofil, Sortiment und Mediathek — in wenigen Schritten bereit."
                      : "Melde dich an, um weiterzuarbeiten."}
                  </p>
                </div>

                {inviteBlocked && isSignup ? (
                  <div
                    className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
                    role="status"
                  >
                    {inviteBlockedMessage}
                  </div>
                ) : null}

                {feedbackNotice ? (
                  <div
                    className="mb-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
                    role="status"
                  >
                    {feedbackNotice}
                  </div>
                ) : null}

                {displayError ? (
                  <div
                    className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
                    role="alert"
                  >
                    {displayError}
                  </div>
                ) : null}

                <form key={mode} aria-busy={busy || submitting} className="space-y-5" {...formProps}>
                  <input type="hidden" name="next" value={nextPath} />
                  {inviteToken ? <input type="hidden" name="inviteToken" value={inviteToken} /> : null}

                  {isSignup && !teamInviteMode ? (
                    <div className="space-y-2">
                      <Label htmlFor={`${reactId}-brewery`}>Brauerei</Label>
                      <Input
                        id={`${reactId}-brewery`}
                        name="brewery"
                        type="text"
                        autoComplete="organization"
                        placeholder="Name der Brauerei"
                        disabled={busy}
                        value={brewery}
                        onChange={(e) => setBrewery(e.target.value)}
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor={`${reactId}-email`}>E-Mail</Label>
                    {teamInviteMode && defaultEmail ? (
                      <input type="hidden" name="email" value={defaultEmail} />
                    ) : null}
                    <Input
                      id={`${reactId}-email`}
                      name={teamInviteMode && defaultEmail ? undefined : "email"}
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="name@beispiel.de"
                      disabled={busy}
                      readOnly={teamInviteMode && Boolean(defaultEmail)}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`${reactId}-password`}>Passwort</Label>
                      {!isSignup ? (
                        onForgotPassword ? (
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 text-xs"
                            onClick={onForgotPassword}
                            disabled={busy}
                          >
                            Passwort vergessen?
                          </Button>
                        ) : (
                          <Link
                            href={forgotPasswordHref}
                            className="text-xs text-primary underline-offset-4 hover:underline"
                          >
                            Passwort vergessen?
                          </Link>
                        )
                      ) : null}
                    </div>
                    <div className="relative">
                      <Input
                        id={`${reactId}-password`}
                        name="password"
                        type={showPw ? "text" : "password"}
                        required
                        minLength={isSignup ? 8 : undefined}
                        autoComplete={isSignup ? "new-password" : "current-password"}
                        placeholder="••••••••"
                        disabled={busy}
                        className="pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-0 right-0 h-full px-3"
                        onClick={() => setShowPw((v) => !v)}
                        disabled={busy}
                        aria-label={showPw ? "Passwort verbergen" : "Passwort anzeigen"}
                      >
                        {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                    </div>
                  </div>

                  {isSignup ? (
                    <div className="space-y-2">
                      <Label htmlFor={`${reactId}-password-confirm`}>Passwort bestätigen</Label>
                      <div className="relative">
                        <Input
                          id={`${reactId}-password-confirm`}
                          name="passwordConfirm"
                          type={showPwConfirm ? "text" : "password"}
                          required
                          minLength={8}
                          autoComplete="new-password"
                          placeholder="••••••••"
                          disabled={busy}
                          className="pr-10"
                          value={passwordConfirm}
                          onChange={(e) => setPasswordConfirm(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-0 right-0 h-full px-3"
                          onClick={() => setShowPwConfirm((v) => !v)}
                          disabled={busy}
                          aria-label={showPwConfirm ? "Passwort verbergen" : "Passwort anzeigen"}
                        >
                          {showPwConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {isSignup ? (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id={`${reactId}-terms`}
                          checked={acceptedTerms}
                          onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                          disabled={busy || inviteBlocked}
                        />
                        <div className="space-y-1">
                          <Label htmlFor={`${reactId}-terms`} className="text-sm leading-snug font-normal">
                            {/* Datenschutzhinweise sind Information (Art. 13 DSGVO), keine Einwilligung.
                                Ein umschließendes span hält den Satz im Fließtext (Label ist ein Flex-Container). */}
                            <span>
                              Ich akzeptiere die{" "}
                              <a
                                href={termsHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline underline-offset-4"
                              >
                                AGB
                              </a>
                              . Die{" "}
                              <a
                                href={privacyHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline underline-offset-4"
                              >
                                Datenschutzhinweise
                              </a>{" "}
                              habe ich zur Kenntnis genommen.
                            </span>
                          </Label>
                        </div>
                      </div>
                      {acceptedTerms ? (
                        <input type="hidden" name={TERMS_ACCEPTANCE_FORM_FIELD} value="1" />
                      ) : null}
                    </div>
                  ) : null}

                  <SubmitButton isSignup={isSignup} busy={busy || submitting} />
                </form>

                {showGoogle ? (
                  <>
                    <div className="relative mt-6">
                      <div className="absolute inset-0 flex items-center">
                        <Separator />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Oder weiter mit</span>
                      </div>
                    </div>

                    <div className="mt-6">
                      {(() => {
                        const googleDisabled =
                          busy || (isSignup && (!acceptedTerms || inviteBlocked));
                        if (googleHref && !googleDisabled) {
                          return (
                            <Button variant="outline" className="h-11 w-full bg-background/50" asChild>
                              <a
                                href={googleSignupHref}
                                onClick={() => {
                                  // Nur Legacy-Cookies räumen — Navigation ausschließlich über href
                                  // (inkl. terms_accepted=1 im Signup). Kein onOAuth-Redirect hier,
                                  // sonst doppelter OAuth-Start und kaputter PKCE-Verifier.
                                  clearLegacySupabaseSessionCookies();
                                }}
                              >
                                <GoogleG />
                                Mit Google
                              </a>
                            </Button>
                          );
                        }
                        return (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 w-full bg-background/50"
                            disabled={googleDisabled}
                            onClick={() => {
                              if (googleHref || googleDisabled) return;
                              clearLegacySupabaseSessionCookies();
                              onOAuth("google");
                            }}
                          >
                            <GoogleG />
                            Mit Google
                          </Button>
                        );
                      })()}
                    </div>
                  </>
                ) : null}

                {showModeSwitch ? (
                  <p className="mt-8 text-center text-sm text-muted-foreground">
                    {isSignup ? (
                      <>
                        Schon ein Konto?{" "}
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 text-sm"
                          onClick={() => setMode("login")}
                          disabled={busy}
                        >
                          Anmelden
                        </Button>
                      </>
                    ) : (
                      <>
                        Noch kein Konto?{" "}
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 text-sm"
                          onClick={() => setMode("signup")}
                          disabled={busy}
                        >
                          Registrieren
                        </Button>
                      </>
                    )}
                  </p>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <nav aria-label="Rechtliches" className="mt-6 flex justify-center gap-3 text-muted-foreground text-xs">
          <a href={marketingLegalUrl("impressum")} target="_blank" rel="noopener noreferrer" className="hover:underline">
            Impressum
          </a>
          <span aria-hidden="true">·</span>
          <a href={privacyHref} target="_blank" rel="noopener noreferrer" className="hover:underline">
            Datenschutz
          </a>
          <span aria-hidden="true">·</span>
          <a href={termsHref} target="_blank" rel="noopener noreferrer" className="hover:underline">
            AGB
          </a>
        </nav>
      </div>
    </div>
  );
}
