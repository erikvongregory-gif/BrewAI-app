# BrewAI – Architekturübersicht (Stand 2026-11-09)

Kurzfassung für neue Entwickler. Details und Befunde: `docs/audit/2026-11-09/06-cto-architecture.md`.

## Stack

Next.js 16 (App Router, Route Handler unter `src/app/api/**`), React 19, TypeScript strict, Supabase (Auth, Postgres mit RPCs, Storage), Stripe, Vercel (Funktionen, `after()`), GitHub Actions (CI, Cron).

KI-Anbieter:

| Zweck | Anbieter/Modell | Einstieg im Code |
|---|---|---|
| Studio-Bilder (Produktfoto, Social Post) | OpenAI Images API, `gpt-image-2.5-sunburst` | `src/lib/openai/generateImage.ts` |
| Bilder mit Charakter-Identität | KIE, Nano Banana (Pro) | `src/lib/kie/nanoBananaCharacterGenerate.ts` |
| Video | BytePlus ModelArk, Seedance 2 / 2.5 | `src/lib/generation/modelark.ts`, `src/app/api/generation/*` |
| Texte, Markenscan, Etikett-OCR, Assistent | Anthropic, `claude-sonnet-4-6` (Fallback Haiku 4.5) | `src/lib/anthropic/modelCandidates.ts` |
| Freisteller (Altpfad) | Photoroom / remove.bg | `src/app/(dashboard)/inhalte-erstellen/lib/image-clients/background-removal.ts` |

## Datenfluss einer Bildgenerierung (Hauptpfad)

```
Browser (inhalte-erstellen-studio.tsx)
  └─ POST /api/inhalte-erstellen/create-task | social-post   (Header: Idempotency-Key)
       ├─ requireImageGenerationUser: Origin, Rate-Limit (DB), Login, 2FA
       ├─ requireActiveSubscription, Token-Stand lesen
       ├─ resumeGenerationIfPresent  → gleicher Schlüssel = gleicher Job (kein Doppelbezug)
       ├─ prepareStudioGeneration    → Prompt V3, Referenzen, Kosten je Variante
       ├─ reserveGeneration          → RPC generation_reserve (Tokens atomar reservieren)
       ├─ Antwort 202 {jobId}
       └─ after(): executeStudioGeneration
             ├─ je Variante (sequenziell, Zeitbudget 270 s):
             │    OpenAI images/edits|generations  (Policy "paid", Timeout 180 s)
             │    oder KIE createTask + Polling (≤180 s, durch Budget begrenzt)
             │    → Zuschnitt (sharp) → optional Text-Overlay/Wasserzeichen
             │    → Upload Supabase Storage → saveGenerationProgress
             ├─ persistGeneratedMediaItems (Mediathek)
             └─ finishGeneration → RPC: nur fertige Varianten werden berechnet,
                                    Rest der Reservierung wird freigegeben
Browser pollt GET /api/dashboard/jobs?id=… (2,4 s → 7 s, max. 4 min)
Cron (GitHub Actions, alle 15 min) → POST /api/internal/reconcile
  └─ hängende Jobs (Status reserved): Provider-Status abfragen oder nach 30 min freigeben
```

Video: `POST /api/generation/submit` → ModelArk-Task → Browser pollt `/api/generation/status` (4 s) → Abschluss bucht Tokens; der Reconcile-Cron fängt abgebrochene Sitzungen auf.

## Abrechnung

- Token-Kontingente je Tarif: `src/lib/billing/tokenState.ts`; Preise: `src/lib/billing/planCatalog.ts`.
- Kosten je Bild/Video: `src/lib/billing/generationTokenCost.ts`.
- Buchungen nur über Postgres-RPCs (`generation_reserve`, `generation_finish`, …), Schema/Migrationen derzeit in `docs/*.sql` und `supabase/migrations/` (Konsolidierung offen).

## Schutzschichten gegen Kosten

| Schicht | Wo |
|---|---|
| Idempotency-Key, Job-Wiederaufnahme | `src/lib/billing/generationJobs.ts` |
| Rate-Limits je Route (persistent) | `src/lib/security/requestGuards.ts` |
| Retry-Policy `paid` (kein Retry nach Timeout), Zeitlimits, Budget | `src/lib/ai/providerRequest.ts` |
| Funktions-Zeitbudget je Studio-Auftrag | `src/lib/inhalte-erstellen/run-studio-generation.ts` |
| Kostenprotokoll je Bild (`domain: "ai-cost"`, ohne Prompt/PII) | `src/lib/openai/generateImage.ts` |
| Tagesdeckel je Konto (Bibliothek, Einbindung offen) | `src/lib/ai/costGuard.ts` |
| Abgelaufene Provider-Jobs (> 24 h) werden im Reconcile abgeschlossen, nur Geliefertes berechnet | `src/lib/generation/staleJob.ts`, `src/lib/kie/reconcileJob.ts`, `src/lib/generation/reconcileJob.ts` |

## Logging

Strukturierte JSON-Zeilen auf stdout (Vercel-Logs): `domain: "ai-provider"` (Fehler, Quota/Auth als `error`), `domain: "ai-cost"` (Tokenverbrauch je Bild), `domain: "studio-generation"` (übersprungene Varianten). Kein externes Fehler-Tracking eingerichtet.
