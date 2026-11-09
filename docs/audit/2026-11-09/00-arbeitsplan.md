# BrewAI Master-Audit 2026-11-09 – Arbeitsplan und Dateizuständigkeiten

Start: 2026-11-09 19:59 (lokale Zeit). Zeitbudget: 120 Minuten. Orchestrator: Claude (Hauptsitzung).

## Ausgangszustand (gemessen vom Orchestrator)

- Next.js 16.3.8 (App Router, Turbopack), React 19.2.4, TypeScript strict, Supabase (Auth, Postgres, Storage, RPC), Stripe, KI-Anbieter OpenAI (Bilder), KIE (Nano Banana, Seedance, GPT Image 2), Anthropic (Texte/Assistent), Vitest, ESLint 9.
- 618 TS/TSX-Dateien unter `src/`, 88 Testdateien, 71 Route-Handler (`route.ts`).
- Nicht committete Arbeit des Gründers (Auth/CSP/Nonce-Umbau) in 17 Dateien plus 5 neuen Dateien. Gesichert als Git-Ref `refs/audit/wip-baseline-20261109` (Commit 266f155) und als Patch im Scratchpad. Diese Änderungen bleiben erhalten.
- Baseline 20:00: `vitest run` 535 Tests, 533 bestanden, 2 fehlgeschlagen:
  - `src/lib/billing/atomicBilling.test.ts` – Timeout 5 s (PGlite unter Last).
  - `src/lib/openai/imageApiKey.test.ts` – liest einen echten Key aus der lokalen Umgebung und gibt ihn bei Fehlschlag im Klartext aus.
- Baseline `tsc --noEmit`: 0 Fehler.
- Vorherige Sicherheitsprüfung: `SECURITY-REVIEW-2026-10-08.md` (Herkunftsschutz, Session-Reparatur, Referenzbild-MIME, Pakete).

## Arbeitsweise

Alle Agenten arbeiten im Haupt-Checkout. Git-Worktrees wurden bewusst nicht verwendet: Die nicht committete Auth/CSP-Arbeit wäre dort unsichtbar, und jeder Worktree bräuchte ein eigenes `node_modules`. Stattdessen gilt eine strikte Dateizuständigkeit. Nur der Orchestrator führt Git-Operationen, Builds und die Zusammenführung durch.

## Agenten und Zuständigkeiten (Schreibrechte)

Alles, was hier nicht einem Agenten zugeordnet ist, ist für alle Agenten schreibgeschützt. Änderungswünsche an fremde Dateien kommen mit Diff-Vorschlag in den Bericht; der Orchestrator führt sie zusammen.

### Agent 1 – Security (Bericht `01-security.md`)
- `middleware.ts`, `next.config.ts` (Gründer-WIP erhalten)
- `src/lib/security/**`, `src/lib/supabase/**`, `src/lib/auth/**` (außer `termsAcceptance*`), `src/lib/admin/**`, `src/lib/invite/**`, `src/lib/email/**`, `src/lib/billing/**`, `src/server/**`
- `src/app/auth/**`, `src/app/anmelden/**`, `src/app/registrieren/**`, `src/app/passwort-vergessen/**`, `src/app/passwort-zuruecksetzen/**`, `src/app/admin/**`, `src/app/invite/**`, `src/app/dashboard/2fa-email/**`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/auth/**`, `src/scripts/**`
- Alle Route-Handler unter `src/app/api/**` außer `api/brand/analyze-url`, `api/brand/activate-profile`, `api/brand/profile-status` (Agent 3) und `api/account/**` (Agent 4)
- `src/app/(dashboard)/inhalte-erstellen/lib/api-guards.ts`, `src/app/(dashboard)/inhalte-erstellen/lib/schemas.ts`
- `src/lib/dashboard/{workspace,metadata,freshMetadata,settingsPayload,teamInvites,teamRoles,teamInvitePreview,media-store,persistGeneratedMedia,character-store}.ts` (+ Tests)
- `src/lib/brand/{instagram-*,reference-image-store,reference-image-bytes,reference-image-security.test,kie-upload}.ts`
- `src/lib/openai/imageApiKey.ts` (+ Test)
- neue Dateien in `supabase/migrations/` (nur anlegen, nie ausführen)

### Agent 2 – UI/UX (Bericht `02-ui-ux.md`)
- `src/components/dashboard-shell/**` (Gründer-WIP in `brewai-admin-shell.tsx`, `nav-user.tsx` erhalten), `src/components/studio/**`, `src/components/ui/**`, `src/components/dashboard-stubs/**`, `src/components/admin/**`
- `src/components/dashboard/admin-*.tsx`, `admin-pricing-view.module.css`
- `src/app/(dashboard)/**` außer `inhalte-erstellen/lib/**`, `src/app/onboarding/**`, `src/app/globals.css`
- `src/navigation/**`, `src/styles/**`, `src/hooks/**`, `src/stores/**`, `src/lib/preferences/**`, `src/config/**`
- `src/lib/dashboard/onboarding.ts` (+ Test), `src/lib/inhalte-erstellen/{media-title,media-job-cards}.ts` (+ Tests)
- Einziger Agent, der einen Dev-Server starten darf (Port 3001, nur für `marketing-preview`-Ansichten ohne Login), am Ende wieder stoppen.

### Agent 3 – Brand Intelligence (Bericht `03-brand-intelligence.md`)
- `src/lib/brand/**` außer den Security-Dateien oben
- `src/app/api/brand/analyze-url/**`, `src/app/api/brand/activate-profile/**`, `src/app/api/brand/profile-status/**` (Guard-, Origin- und Rate-Limit-Aufrufe nur beibehalten oder verschärfen)
- `src/lib/dashboard/{brandProfile,beer-store,character-appearance}.ts` (+ Tests), `src/lib/beverages/**`
- `src/components/dashboard/Brand*.tsx`, `brand-review-utils.ts`, `brand-profile-empty-state.module.css`
- `src/lib/prompts/**`, `src/app/(dashboard)/inhalte-erstellen/lib/{prompt-builders/**,brewing-knowledge*,beer-styles.ts,occasion-templates*}`
- `src/lib/inhalte-erstellen/{image-prompt-v3,legacy-v3-adapters}.ts` (+ Tests)
- `src/lib/openai/{beerColorReference,bottleShapeReference,glassShapeReference,liquidClarityReference,styleLookReferences,blurLookReference}.ts` (+ Tests)

### Agent 4 – Legal, DSGVO, Compliance (Bericht `04-legal-compliance.md`)
- neu: `src/lib/compliance/**`, `src/components/compliance/**`, `docs/legal/**`
- `src/app/api/account/**` (Löschung, neu: Datenexport), `src/lib/dashboard/deleteAccount.ts`
- `src/lib/auth/termsAcceptance.ts` (+ Test), `src/lib/inhalte-erstellen/casting-direction.ts` (+ Test), `src/lib/openai/aiWatermark.ts` (+ Test), `src/lib/assistant/**`

### Agent 5 – Branchenforschung und Produktstrategie (Bericht `05-industry-product.md`)
- neu: `docs/strategy/**`
- Kein Produktivcode. Fachliche Fehler (Bierstile, Brauwissen, Gebinde) als Änderungswunsch an Agent 3 bzw. den Orchestrator.

### Agent 6 – CTO, Architektur, QA (Bericht `06-cto-architecture.md`)
- `src/lib/generation/**`, `src/lib/kie/**`, `src/lib/ai/**`, `src/lib/http/**`, `src/lib/anthropic/**`, `src/lib/video-studio/**`, `src/lib/social/**`, `src/lib/images/**`, `src/lib/image-types/**`
- `src/lib/openai/{generateImage,imageAspectRatio}.ts` (+ Tests), `src/app/(dashboard)/inhalte-erstellen/lib/image-clients/**`
- `src/lib/inhalte-erstellen/**` außer den Dateien von Agent 2, 3 und 4
- `src/lib/dashboard/{generationUsage,dashboardPerf}.ts` (+ Tests)
- `src/app/marketing-preview/**`, `src/app/codex-gallery-preview/**`
- `.github/workflows/**`, `vitest.config.ts`, `eslint.config.mjs`, neu: `docs/architecture/**`

## Abhängigkeiten

| Von | Nach | Abhängigkeit |
|---|---|---|
| Agent 3 (Scanner) | Agent 1 (Security) | Website-Abruf läuft über `src/lib/security/public-fetch.ts` (SSRF-Schutz). Security härtet den Helfer, Brand nutzt ihn. Prompt-Injection aus Websites behandelt Agent 3 in der Extraktion, Agent 1 prüft. |
| Agent 4 (Compliance-Modul) | Agent 2 (UI), Agent 1 (Routen) | Das Prüfmodul ist reine Bibliothek. Einbindung in Text-Routen und Erstellen-Ansicht übernimmt der Orchestrator. |
| Agent 4 (Datenexport) | Agent 1 (Guards) | Neue Route nutzt die gemeinsamen Guards (`requireAuthenticatedUser` o. ä.). |
| Agent 6 (Kostenschutz) | Agent 1 (Guards) | Kostenlimits als Bibliothek in `src/lib/ai/`; Einbindung in Guards/Routen als Änderungswunsch. |
| Agent 5 (Forschung) | Agent 3, Orchestrator | Fachkorrekturen an Brauwissen als Änderungswunsch. |
| Alle | Orchestrator | Build, Gesamt-Testlauf, Lint, Browser-Prüfung, Zusammenführung, `BREWAI_MASTER_AUDIT.md`. |

## Phasen

1. 19:59–20:10 Bestandsaufnahme, Baseline, Plan (Orchestrator).
2. 20:10–21:15 Analyse und Umsetzung durch sechs parallele Agenten.
3. 21:15–21:45 Zusammenführung, Änderungswünsche, Typecheck, Lint, Tests, Build, Browser-Stichprobe.
4. 21:45–22:00 Abschlussbericht `BREWAI_MASTER_AUDIT.md`.
