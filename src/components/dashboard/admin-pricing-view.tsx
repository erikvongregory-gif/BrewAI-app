"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { CheckCheck } from "lucide-react";
import NumberFlow from "@number-flow/react";
import { motion, useReducedMotion } from "motion/react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import styles from "./admin-pricing-view.module.css";
import {
  getPlanAnnualSavingsVsList,
  getPlanDisplayMonthlyPrice,
  SEEDANCE_VIDEO_TOKEN_HINT,
  STUDIO_PLANS,
  type BillingInterval,
  type StudioPlanDefinition,
} from "@/lib/billing/planCatalog";
import { startBillingCheckout } from "@/lib/billing/checkoutClient";
import type { SubscriptionPlanKey } from "@/lib/billing/tokenState";
import { isVideosCreateEnabled } from "@/lib/featureFlags";

/** Solange „Videos erstellen“ gesperrt ist, keine Video-Leistungen im Plan versprechen. */
const VIDEOS_AVAILABLE = isVideosCreateEnabled();

function visiblePlanFeatures(features: string[]): string[] {
  if (VIDEOS_AVAILABLE) return features;
  return features
    .filter((feature) => !/^Videos erstellen\b/i.test(feature))
    .map((feature) => feature.replace(/\s*·\s*ca\.[^·]*Videos?\s*$/i, "").trim());
}

function reveal(reduced: boolean | null, delay: number) {
  return {
    initial: reduced ? false as const : { opacity: 0, y: -20, filter: "blur(10px)" },
    whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
    viewport: { once: true, amount: 0.1 },
    transition: { duration: reduced ? 0 : 0.5, delay: reduced ? 0 : delay },
  };
}

function PlanCard({
  index,
  plan,
  yearlyBilling,
  currentPlan,
  checkoutPending,
  onCheckout,
}: {
  index: number;
  plan: StudioPlanDefinition;
  yearlyBilling: boolean;
  currentPlan: SubscriptionPlanKey | null;
  checkoutPending: SubscriptionPlanKey | null;
  onCheckout: (plan: SubscriptionPlanKey) => void;
}) {
  const reducedMotion = useReducedMotion();
  const price = getPlanDisplayMonthlyPrice(plan, yearlyBilling);
  const isCurrent = currentPlan === plan.id;
  const isRec = Boolean(plan.recommended);
  const showSavings = yearlyBilling;

  return (
    <motion.article {...reveal(reducedMotion, 0.1 + index * 0.05)} className={`${styles.plan} ${isRec ? styles.featured : ""}`} aria-label={plan.name}>
      <div className={styles.badges}>
        {isRec ? <span>Empfohlen</span> : null}
        {isCurrent ? <span>Aktueller Plan</span> : null}
      </div>
      <div className={styles.price}>
        <strong><NumberFlow value={price} locales="de-DE" format={{ style: "currency", currency: "EUR", maximumFractionDigits: 0 }} animated={!reducedMotion} /></strong><span>/Monat</span>
      </div>
      <p className={styles.billingNote}>
        {showSavings
          ? `${(price * 12).toLocaleString("de-DE")} € jährlich · ${getPlanAnnualSavingsVsList(plan).toLocaleString("de-DE")} € Ersparnis gegenüber monatlicher Zahlung`
          : "Monatliche Abrechnung · monatlich kündbar"}
      </p>
      <h2>{plan.name}</h2>
      <p className={styles.description}>{plan.tag}</p>
      <div className={styles.includes}>
        <h3>Im Plan enthalten:</h3>
        <ul>
          {visiblePlanFeatures(plan.features).map((feature) => (
            <li key={feature}>
              <span className={styles.check}><CheckCheck size={15} aria-hidden="true" /></span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        className={styles.cta}
        disabled={isCurrent || checkoutPending !== null}
        aria-busy={checkoutPending === plan.id}
        onClick={() => onCheckout(plan.id)}
      >
        {isCurrent ? "Aktueller Plan" : checkoutPending === plan.id ? "Weiterleitung …" : "Plan wählen"}
      </button>
    </motion.article>
  );
}

export function AdminPricingView({
  currentPlan,
  monthlyTokens,
  usedTokens,
  remainingTokens,
  initialCheckoutError = null,
}: {
  currentPlan: SubscriptionPlanKey | null;
  monthlyTokens: number;
  usedTokens: number;
  remainingTokens: number;
  initialCheckoutError?: string | null;
}) {
  const reducedMotion = useReducedMotion();
  const switchId = useId();
  const [yearlyBilling, setYearlyBilling] = useState(true);
  const billing: BillingInterval = yearlyBilling ? "yearly" : "monthly";
  const [checkoutPending, setCheckoutPending] = useState<SubscriptionPlanKey | null>(null);
  const [tokenPackPending, setTokenPackPending] = useState<"tokens_500" | "tokens_2000" | null>(null);
  const [portalPending, setPortalPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(initialCheckoutError);
  const [consumerConsent, setConsumerConsent] = useState(false);

  const activePlan = useMemo(
    () => STUDIO_PLANS.find((plan) => plan.id === currentPlan) ?? STUDIO_PLANS[1],
    [currentPlan],
  );
  const tokenPct = monthlyTokens > 0 ? Math.round((usedTokens / monthlyTokens) * 100) : 0;

  const startCheckout = useCallback(
    async (plan: SubscriptionPlanKey) => {
      if (!consumerConsent) {
        setCheckoutError(
          "Bitte bestätige die Zustimmung zum Leistungsbeginn vor Ablauf der Widerrufsfrist.",
        );
        return;
      }
      setCheckoutError(null);
      setCheckoutPending(plan);
      try {
        const result = await startBillingCheckout({
          plan,
          interval: billing,
          consumerEarlyPerformanceConsent: true,
        });
        if (!result.ok && !result.redirected) {
          setCheckoutError(result.error);
        }
      } catch {
        setCheckoutError("Checkout konnte nicht gestartet werden.");
      } finally {
        setCheckoutPending(null);
      }
    },
    [billing, consumerConsent],
  );

  const openPortal = useCallback(async () => {
    setPortalPending(true);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST", credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !json?.url) {
        setCheckoutError(json?.error ?? "Kundenportal konnte nicht geöffnet werden.");
        return;
      }
      window.location.href = json.url;
    } catch {
      setCheckoutError("Kundenportal konnte nicht geöffnet werden.");
    } finally {
      setPortalPending(false);
    }
  }, []);

  const buyTokenPack = useCallback(
    async (pack: "tokens_500" | "tokens_2000") => {
      if (!consumerConsent) {
        setCheckoutError(
          "Bitte bestätige die Zustimmung zum Leistungsbeginn vor Ablauf der Widerrufsfrist.",
        );
        return;
      }
      setCheckoutError(null);
      setTokenPackPending(pack);
      try {
        const res = await fetch("/api/billing/buy-tokens", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pack, consumerEarlyPerformanceConsent: true }),
        });
        const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
        if (!res.ok || !json?.url) {
          setCheckoutError(json?.error ?? "Token-Kauf konnte nicht gestartet werden.");
          return;
        }
        window.location.href = json.url;
      } catch {
        setCheckoutError("Token-Kauf konnte nicht gestartet werden.");
      } finally {
        setTokenPackPending(null);
      }
    },
    [consumerConsent],
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 aria-label="Pläne & Preise">
            {["Pläne", "&", "Preise"].map((word, index) => (
              <span key={word} className={styles.wordClip} aria-hidden="true">
                <motion.span
                  initial={reducedMotion ? false : { y: "-100%" }}
                  animate={{ y: 0 }}
                  transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 250, damping: 40, delay: index * 0.15 }}
                >{word}{index < 2 ? "\u00a0" : ""}</motion.span>
              </span>
            ))}
          </h1>
          <motion.p {...reveal(reducedMotion, 0)}>
            Der passende Plan für deine Brauerei. Erstelle {VIDEOS_AVAILABLE ? "Bilder und Videos" : "Bilder"} mit
            deinem monatlichen Token-Kontingent.
          </motion.p>
        </div>
        <motion.div {...reveal(reducedMotion, 0.05)} className={styles.period} role="group" aria-label="Abrechnungsintervall">
          <button type="button" aria-pressed={!yearlyBilling} onClick={() => setYearlyBilling(false)} disabled={checkoutPending !== null}>
            {!yearlyBilling && <motion.span aria-hidden="true" className={styles.switchHighlight} layoutId={switchId} transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }} />}
            <span className={styles.periodLabel}>Monatlich</span>
          </button>
          <button type="button" aria-pressed={yearlyBilling} onClick={() => setYearlyBilling(true)} disabled={checkoutPending !== null}>
            {yearlyBilling && <motion.span aria-hidden="true" className={styles.switchHighlight} layoutId={switchId} transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }} />}
            <span className={styles.periodLabel}>Jährlich <span className={styles.savings}>Bis zu {Math.round(Math.max(...STUDIO_PLANS.map((plan) => (1 - getPlanDisplayMonthlyPrice(plan, true) / getPlanDisplayMonthlyPrice(plan, false)) * 100)))} % sparen</span></span>
          </button>
        </motion.div>
      </header>

      <motion.div {...reveal(reducedMotion, 0.1)} className={styles.grid}>
        {STUDIO_PLANS.map((plan, index) => (
          <PlanCard key={plan.id} index={index} plan={plan} yearlyBilling={yearlyBilling} currentPlan={currentPlan} checkoutPending={checkoutPending} onCheckout={startCheckout} />
        ))}
      </motion.div>

      {checkoutError ? (
        <div className={styles.error} role="alert">
          {checkoutError}
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <Checkbox
          id="billing-consent"
          checked={consumerConsent}
          onCheckedChange={(v) => {
            setConsumerConsent(v === true);
            if (v === true) setCheckoutError(null);
          }}
        />
        <Label htmlFor="billing-consent" className="text-sm font-normal leading-relaxed">
          Ich stimme zu, dass BrewAI mit der digitalen Leistung vor Ablauf der 14-tägigen Widerrufsfrist beginnt, und
          weiß, dass ich mein Widerrufsrecht bei Beginn der Ausführung verliere. Details:{" "}
          <a href="https://brewai.de/widerruf" target="_blank" rel="noopener noreferrer" className="underline">
            Widerrufsbelehrung
          </a>
          .
        </Label>
      </div>

      <motion.section {...reveal(reducedMotion, 0.15)} className={styles.activeSection} aria-label="Aktiver Plan">
        <div className={styles.activeShell}>
          <article className={`${styles.plan} ${styles.activeCard}`}>
            <div className={styles.badges}>
              <span>Aktiver Plan</span>
              {currentPlan ? <span>Aktiv</span> : null}
            </div>
            <h2>{currentPlan ? activePlan.name : "Kein Abo"}</h2>
            <p className={styles.description}>
              {currentPlan ? "Aktives Abonnement · Tokens im aktuellen Abrechnungszyklus" : "Noch kein Plan gewählt"}
            </p>

            <div className={styles.activeUsage}>
              <div className={styles.activeUsageHead}>
                <span>Tokens · aktueller Zyklus</span>
                <span className={styles.activePct}>{tokenPct}% genutzt</span>
              </div>
              <div className={styles.activeBar} aria-hidden="true">
                <div className={styles.activeBarFill} style={{ width: `${Math.min(tokenPct, 100)}%` }} />
              </div>
              <p className={styles.activeUsageMeta}>
                {usedTokens.toLocaleString("de-DE")} verbraucht · {monthlyTokens.toLocaleString("de-DE")} gesamt ·{" "}
                {remainingTokens.toLocaleString("de-DE")} frei
              </p>
            </div>

            <button
              type="button"
              className={styles.cta}
              disabled={portalPending}
              aria-busy={portalPending}
              onClick={() => void openPortal()}
            >
              {portalPending ? "Öffnen …" : "Abo / Rechnungen"}
            </button>
          </article>
        </div>
      </motion.section>

      {currentPlan ? (
        <section className={styles.tokenSection} aria-label="Zusätzliche Tokens">
          <header className={styles.tokenHeader}>
            <h2>Zusätzliche Tokens</h2>
            <p>
              Einmalige Packs für mehr Generierungen. Gekaufte Tokens bleiben bis zum Verbrauch.
              {VIDEOS_AVAILABLE ? ` ${SEEDANCE_VIDEO_TOKEN_HINT}` : null}
            </p>
          </header>
          <div className={styles.tokenGrid}>
            {(
              [
                { pack: "tokens_500" as const, tokens: "+500 Tokens", price: 39, note: "Einmaliger Kauf · bleibt bis Verbrauch" },
                { pack: "tokens_2000" as const, tokens: "+2.000 Tokens", price: 119, note: "Einmaliger Kauf · bleibt bis Verbrauch" },
              ] as const
            ).map((item, index) => (
              <motion.article
                key={item.pack}
                {...reveal(reducedMotion, 0.05 + index * 0.05)}
                className={styles.plan}
                aria-label={item.tokens}
              >
                <div className={styles.price}>
                  <strong>
                    <NumberFlow
                      value={item.price}
                      locales="de-DE"
                      format={{ style: "currency", currency: "EUR", maximumFractionDigits: 0 }}
                      animated={!reducedMotion}
                    />
                  </strong>
                </div>
                <p className={styles.billingNote}>{item.note}</p>
                <h2>{item.tokens}</h2>
                <p className={styles.description}>
                  Sofort nach dem Kauf verfügbar für {VIDEOS_AVAILABLE ? "Bilder und Videos" : "Bilder"}.
                </p>
                <button
                  type="button"
                  className={styles.cta}
                  disabled={tokenPackPending !== null}
                  aria-busy={tokenPackPending === item.pack}
                  onClick={() => void buyTokenPack(item.pack)}
                >
                  {tokenPackPending === item.pack ? "Weiterleitung …" : "Jetzt kaufen"}
                </button>
              </motion.article>
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-muted-foreground text-xs leading-relaxed">
        Alle Preise gemäß § 19 UStG ohne Umsatzsteuer · Monatlich oder jährlich abrechenbar · Monatlich kündbar zum Ende
        des Abrechnungszeitraums · Token-Übertrag je nach Plan (Start: keiner · Wachstum: 1 Monat · Pro: 2
        Monate · Enterprise: 3 Monate) · Separat gekaufte Token-Pakete verfallen 12 Monate nach Kauf
        {VIDEOS_AVAILABLE ? " · Videos via Seedance 2.5" : null}
      </p>
    </div>
  );
}
