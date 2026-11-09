# 01 – Sicherheitsprüfung (Agent 1, Security Engineer)

Stand: 2026-11-09, 20:10–20:39. Grundlage: Arbeitsbaum inkl. nicht committeter Gründer-Arbeit (Auth/CSP-Umbau).
Kein Live-Test gegen app.brewai.de, auth.brewai.de oder das Supabase-Projekt; keine kostenpflichtigen API-Aufrufe;
keine Paketänderungen. Alles unten bezieht sich auf den Code im Repository. Dies ist kein vollständiger Penetrationstest.

## (a) Ausgangszustand

- 59 Route-Handler unter `src/app/api/**` plus 12 Auth-Routen unter `src/app/auth/**` geprüft (Guard, Herkunftsprüfung,
  Rate-Limit, Mandanten-Scoping, Teamrolle bei Schreibzugriffen). Die während des Laufs von Agent 4 angelegte Route
  `src/app/api/account/export/` ist nicht geprüft.
- Gemeinsame Guards: `src/app/(dashboard)/inhalte-erstellen/lib/api-guards.ts` (Origin → Auth → 2FA → Rate-Limit →
  `workspaceResourceUser`), `src/lib/dashboard/workspace.ts` (Teamzuordnung aus Tabelle `workspace_members`, nicht aus
  user_metadata), `src/lib/billing/access.ts`, `src/lib/billing/generationJobs.ts` (Reservierung per RPC
  `generation_reserve`, Abrechnung per `generation_finish`).
- Datenbank laut `docs/*.sql` und `supabase/migrations/*.sql`: alle Anwendungstabellen mit RLS, „No client access“-Policies,
  `revoke … from public, anon, authenticated`, Zugriff nur über `service_role`; alle `security definer`-Funktionen mit
  `set search_path = public` und EXECUTE nur für `service_role`. Ausnahme ohne Belang: `billing_token_carry_days`
  (reine `immutable`-SQL-Funktion ohne Datenzugriff).
- Vorbericht `SECURITY-REVIEW-2026-10-08.md` (Herkunftsschutz, Session-Reparatur, Referenzbild-MIME) – dort behobene
  Punkte sind weiterhin korrekt umgesetzt; nicht erneut aufgeführt.
- Baseline laut Arbeitsplan: `imageApiKey.test.ts` scheiterte lokal und gab dabei einen echten Key im Klartext aus.

### Ergebnis Mandantentrennung (Schwerpunkt 1)

Kein IDOR gefunden. Alle Ressourcenzugriffe laufen über die Workspace-ID aus `workspaceResourceUser(...)`.id:
`dashboard/jobs` (`getGenerationJobForUser` mit `.eq("user_id", owner)`), `dashboard/media` (alle Operationen
`.eq("user_id", owner)`), `generation/status` und `kie/nano-banana/task-status` (`user_id` + `provider_task_id`),
`inhalte-erstellen/social-post/relayout` (Job über `getGenerationJobForUser`), `brand/reference-image/[id]` (Bytes nur aus
den Metadaten des eigenen Workspace). `hydratePrivateAssets` signiert nur Storage-Pfade mit der eigenen Nutzer-ID als
zweitem Segment (`..`, kodierte Trenner geprüft). Der KIE-Medienproxy (`kie/media`, `kie/download`) ruft nur HTTPS-URLs
auf einer Host-Allowlist ohne Zugangsdaten ab; private Storage-Objekte sind darüber nur mit bereits bekannter
signierter URL erreichbar. Schreibende Routen fordern `write=true` (Viewer → 403); Abrechnungsrouten
(checkout, buy-tokens, confirm-session, onboarding-bonus, portal, sync) sind auf den Teaminhaber beschränkt.
Mit Regressionstests belegt: fremde Request-ID → „Auftrag nicht gefunden“, kein Anbieteraufruf
(`src/lib/security/apiGuards.test.ts`).

### Ergebnis user_metadata-Vertrauen (Schwerpunkt 2)

Serverseitige Sicherheits-/Abrechnungsentscheidungen nutzen user_metadata an genau diesen Stellen:

| Stelle | Nutzung | Bewertung |
|---|---|---|
| `src/lib/auth/passwordRecoveryGate.ts:71` `readPasswordEpoch` | Gültigkeit des Trusted-Device-Cookies (2FA) | **Schwachstelle** (siehe H1): Nutzer können `password_epoch` selbst setzen. |
| `src/app/api/billing/onboarding-bonus/route.ts:92` `onboarding_bonus_claimed_at` | Bonus erneut vergeben? | Unkritisch, solange die RPC existiert (sie prüft die DB-Spalte). Fallback ohne RPC vertraute nur Metadaten → **behoben** (F7). |
| `src/app/api/billing/state/route.ts:33` | nur Anzeige | unkritisch |
| `brandReferenceImages`, Markenprofil, Einstellungen | Inhalte des eigenen Workspace | MIME bereits im Vorbericht abgesichert; sonst nur Selbstschaden. |

Plan, Guthaben, Owner/Admin (`app_metadata.role` bzw. `OWNER_EMAILS` + bestätigte E-Mail), Teamzugehörigkeit,
Teamrollen und Generierungs-Jobs kommen aus serverseitigen Quellen (Tabellen bzw. app_metadata). Doku-Fehler:
`docs/go-live-checklist.md:55` nennt `user_metadata.role = "owner"`, der Code liest `app_metadata.role`.

## (b) Befunde, priorisiert

Legende: **behoben** = in diesem Lauf geändert und getestet; **offen** = dokumentiert, nicht geändert.

### Kritisch

**K1 – Next.js 16.3.8 liegt im Bereich kritischer Advisories (offen, Paketänderung nicht erlaubt).**
`npm audit --omit=dev` (20:20): `next` >=16.0.0 <=16.4.0 – GHSA-2464-fhr4-w9xw (RCE im Image-Optimization-API bei
SVG), GHSA-673q-mjm6-r5xr (RCE in `use cache`-Funktionen mit Typed Arrays), GHSA-p3m5-59mp-jv5r (DoS über Server
Actions, high). Einordnung ohne Live-Test: `next.config.ts` setzt `images.unoptimized: true`, kein
`dangerouslyAllowSVG`, kein `"use cache"` im Code – die beiden RCE-Pfade sind damit vermutlich schwer erreichbar,
das ist aber **nicht verifiziert**. Server Actions existieren (`src/server/server-actions.ts`) → DoS-Advisory
relevant. Empfehlung: `next` auf die erste gepatchte Version > 16.4.0 heben (npm meldet `fixAvailable`), danach
Build + Tests. Gleicher Lauf: `zod` < 4.6.6 (high, GHSA-mrhx-c7xc-m3w5, Speicherauslastung bei übergroßen
begrenzten Collections – die API validiert Request-Arrays mit `.max(n)`, installiert ist 4.4.1) und `undici` < 7.30.1
(mehrere high, u. a. TLS-Validierung, Cache-Poisoning; transitive Abhängigkeit).

### Hoch

**H1 – 2FA wirkt nur in der Next.js-Schicht, nicht in Supabase (offen, Architektur).**
Die E-Mail-2FA ist ein signiertes App-Cookie (`src/lib/admin/emailTwoFactor.ts`). Mit E-Mail + Passwort erhält ein
Angreifer über den öffentlichen Anon-Key direkt eine Supabase-Session (ohne 2FA) und kann damit die Auth-API nutzen:
user_metadata lesen/ändern (Markenprofil, Einstellungen, Referenzbilder) und `password_epoch` auf einen alten Wert
zurücksetzen. Da `isTrustedDeviceForUser` den Epoch aus user_metadata liest (`twoFactorSession.ts:24`,
`passwordRecoveryGate.ts:71`), wird ein früher gestohlenes Trusted-Device-Cookie nach einem Passwortwechsel damit
wieder gültig (Kette: neues Passwort + altes Device-Cookie). Tabellendaten sind wegen deny-all-RLS nicht betroffen.
Empfehlung: (1) `password_epoch` serverseitig in `app_metadata` führen (Schreiben in
`src/app/auth/reset-password/update/route.ts` über Admin-Client, Lesen app_metadata zuerst, user_metadata nur noch
als Altwert-Fallback beim Übergang); (2) mittelfristig Supabase-MFA (AAL2) statt reinem App-Cookie bzw. in Supabase
„Secure password change“/„Secure email change“ aktivieren (Live-Einstellung nicht geprüft).

**H2 – Tokens werden unabhängig vom Zahlungs-/Abo-Status gutgeschrieben (offen, Ausnutzbarkeit abhängig von den in
Stripe aktivierten Zahlarten, nicht verifiziert).**
Code-Fakten: `billing_activate_plan_atomic` (`supabase/migrations/20260924110000_token_carry_by_plan_enterprise.sql:53ff.`)
legt Token-Lots für jeden `p_status` an (auch `incomplete`/`past_due`) und setzt `token_period_granted`.
`src/app/api/billing/confirm-session/route.ts:51` aktiviert ein Abo schon bei `session.status === "complete"`, auch wenn
`payment_status === "unpaid"`; der Webhook (`src/app/api/stripe/webhook/route.ts:83ff.`) aktiviert bei
`checkout.session.completed` ohne Blick auf `payment_status`, und `checkout.session.async_payment_failed` wird nicht
behandelt. Bei verzögerten Zahlarten (z. B. SEPA-Lastschrift) kann damit Guthaben vor bzw. ohne Zahlungseingang
entstehen; Rückbuchung gibt es nicht. Checkout setzt keine `payment_method_types` → es gelten die im Stripe-Dashboard
aktivierten Methoden. Vorschlag siehe (f) F-3; bewusst nicht umgesetzt, weil die Stripe-Semantik für die konkret
aktivierten Zahlarten erst bestätigt und die Migration mit PGlite getestet werden muss.

### Mittel

**F1 – SSRF-Schutz: IPv6-Lücken in `isPublicAddress` (behoben).** `src/lib/security/public-fetch.ts`: `::/96`
(IPv4-kompatibel, z. B. `::7f00:1`), `64:ff9b::/96` (NAT64, z. B. `64:ff9b::a9fe:a9fe` → 169.254.169.254) und
`fec0::/10` (site-local) galten als öffentlich (vorher per Skript nachgewiesen: `check()` lieferte `false`).
Ausnutzbar nur, wenn die Laufzeitumgebung solche Ziele routet (NAT64/DNS64) – für Vercel nicht geprüft. DNS-Pinning,
Redirect-Neuprüfung, Ports, Größe und Timeout waren bereits korrekt.

**F2 – Kostenbremse pro Konto per IP-Wechsel umgehbar (behoben).** `requireImageGenerationUser` zählte die
Stunden-/Tageslimits (30/100) mit Schlüssel `IP|User` (`identifierParts`). Jede neue IP – etwa wechselnde
IPv6-Adressen – bekam ein frisches Kontingent; betrifft alle Generierungs- und Claude-Routen
(`claude/*`, `suggest-copy`, Studio-Generierung). Jetzt Schlüssel `user:<id>` (`costLimitIdentifier`).
Nebenwirkung: Zähler starten nach dem Deploy neu.

**F3 – Server Actions lasen/schrieben beliebige Cookies, auch HttpOnly (behoben).** `src/server/server-actions.ts`:
`getValueFromCookie(key)` gab jeden Cookie-Wert an den Client zurück (inkl. Supabase-Session und 2FA-Cookies),
`setValueToCookie` setzte beliebige Namen/Werte/Pfade. Server Actions sind öffentlich aufrufbare POST-Endpunkte
(Next prüft die Origin, CSRF daher kein Thema); das Problem ist die Aushebelung von HttpOnly bei einer künftigen XSS.
Jetzt nur registrierte Darstellungs-Einstellungen, Wert über `parsePreference`, Pfad `/`, Laufzeit ≤ 1 Jahr.

**F4 – Admin-Route konnte Owner-Konten entmachten (behoben).** `PATCH /api/admin/users` überschrieb
`app_metadata.role` jedes Kontos; ein Admin konnte damit einem Owner (Rolle `owner`) still die Owner-Rechte nehmen oder
die eigene Rolle ändern. Jetzt 403 für Owner-Ziele (app_metadata oder `OWNER_EMAILS`) und für die eigene ID, 404 für
unbekannte Nutzer.

**F5 – Operator-Zugang ohne Rate-Limit, Token = ggf. Owner-Backup-Code (teilweise behoben).**
`src/app/auth/operator-access/route.ts` prüfte das Wartelisten-Bypass-Token ohne Begrenzung. Laut
`src/lib/auth/waitlistBypass.ts:12-14` fällt das Token auf `OWNER_2FA_BACKUP_CODE` zurück, wenn
`LOGIN_WAITLIST_BYPASS_SECRET` fehlt – dann steht der 2FA-Backup-Code des Owners als Query-Parameter in
Browser-Verlauf und Request-Logs. Behoben: persistentes Rate-Limit (10/10 min), `Referrer-Policy: no-referrer`.
Offen: Fallback entfernen, sobald ein eigenes Secret (≥ 32 Zeichen) in Vercel gesetzt ist (Live-Konfiguration nicht
geprüft; Entfernen ohne gesetztes Secret würde den Operator-Zugang abschalten).

**O1 – Reconcile kann dauerhaft blockieren (offen, Stabilität/Kosten).** `src/app/api/internal/reconcile/route.ts:16`
nimmt die 10 ältesten `reserved`-Jobs. Bleibt ein KIE-Task dauerhaft unvollständig (oder meldet Erfolg ohne Medien-URL,
`src/lib/kie/reconcileJob.ts:17`), wird er nie abgeschlossen; zehn solche Jobs blockieren die Erstattung aller übrigen
Reservierungen. Vorschlag siehe (f) F-4.

### Niedrig

- **F6 – Uploads nur mit Client-MIME geprüft (behoben).** `generation/upload` (Bilder/Video/Audio) und
  `dashboard/brand-font` prüfen jetzt Magic Bytes (`src/lib/security/fileSignature.ts`). Vorher landete z. B. HTML als
  `image/png` im Storage. Avatar war bereits sicher (Neukodierung über sharp). Folge: Dateien, deren Inhalt nicht zur
  Endung passt (z. B. HEIC als `.jpg`), werden jetzt mit 400 abgelehnt.
- **F7 – Bonus-Fallback ohne RPC vertraute user_metadata (behoben).** Fallback prüft jetzt
  `onboarding_bonus_granted`/`stripe_subscription_id` und bucht bedingt (`.eq("onboarding_bonus_granted", false)`).
- **F8 – `POST /api/generation/status` ohne Herkunftsprüfung (behoben).** Route rechnet ab und schreibt die Mediathek;
  jetzt `enforceSameOrigin` wie alle zustandsändernden Routen (praktisch begrenzt durch SameSite=Lax-Cookies).
- **F9 – Mediathek akzeptierte `javascript:`/`data:`-URLs (behoben).** `imageUrl`/`thumbUrl` nur noch http(s).
  React 19 blockiert `javascript:`-hrefs ohnehin; die Mediathek ist aber teamweit sichtbar.
- **F10 – `imageApiKey.test.ts` gab echte Keys aus (behoben).** Test ist hermetisch (beide Variablen vor jedem Test
  geleert, Vergleich ohne Klartext im Fehlertext). `imageApiKey.ts` liest Keys nur aus `process.env`, nicht aus Dateien.
- **O2** HMAC-Vergleiche nicht zeitkonstant (`emailTwoFactor.ts:68`, `waitlistBypass.ts:31`, `sign(raw) !== signature`);
  über das Netz praktisch nicht ausnutzbar, Härtung mit `timingSafeEqual` empfohlen.
- **O3** `kie/download` (SVG-Ausgabe) bettet den Upstream-Content-Type in SVG-Markup ein (`route.ts:120-136`); Antwort
  ist `attachment`. Empfehlung: MIME aus `sharp().metadata().format` ableiten.
- **O4** In-Memory-Rate-Limits (`enforceRateLimit`) an `kie/media`, `kie/download`, Admin-Routen gelten pro Instanz;
  die persistente Guard-Grenze greift zusätzlich.
- **O5** Teammitglieder im Workspace eines Owner-Kontos generieren kostenlos (`reserveGeneration` mit Betrag 0,
  `workspace.ts:44`) – so gewollt, aber jede Owner-Einladung vergibt unbegrenzte Generierung.
- **O6** Backup-Schema `brewai_release_backup_20260915` (Migration `20260915184554`) enthält Kopien von Nutzerdaten ohne
  RLS; nicht über PostgREST exponiert (kein USAGE für anon/authenticated). Nach Abnahme löschen (Datenminimierung).
- **O7** `middleware.ts` ist in Next 16 veraltet (umbenannt zu `proxy.ts`, Funktion unverändert laut
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`). Umbenennung nicht
  vorgenommen, um den Gründer-WIP nicht zu verschieben.

### Preisangabe Video (Hinweis des Orchestrators, aus 05-industry-product.md (f) Nr. 9) – übernommen

**P1 – Preisangabe passte nicht zur Abrechnung (behoben).** `SEEDANCE_VIDEO_TOKEN_HINT` nannte „Seedance 2.5 … 100
Tokens“; `calculateSeedanceVideoTokenCost` berechnet für `seedance-2.5` Faktor 1,5 → ⌈5 × 16 × 1,5 × 1,25⌉ = 150.
`formatPlanVideoEstimate` rechnete ohne Modell-ID (Start: „ca. 5–12 Videos“), obwohl die Tarifkarte „Videos erstellen
mit Seedance 2.5“ bewirbt. Jetzt: Hinweistext wird aus derselben Formel erzeugt („mit Seedance 2 100 Tokens, mit
Seedance 2.5 150 Tokens“), die Spanne rechnet die Untergrenze mit Seedance 2.5 (Start: „ca. 3–12 Videos“; 12 s mit 2.5 =
360 Tokens, 5 s mit Seedance 2 = 100 Tokens). Einschränkung: Ist serverseitig `KIE_SEEDANCE_TOKEN_COST` gesetzt, gilt
ein Pauschalpreis pro Video, den weder Hinweis noch Spanne abbilden (Client kennt die Variable nicht; Live-Wert nicht
geprüft). `STUDIO_PLANS[].yearly` (65/125/249/499) wird nirgends gelesen (`getPlanDisplayMonthlyPrice` nutzt
`monthly` bzw. `compareAtMonthly`); nicht entfernt, um den Typ nicht zu brechen – Entfernen oder Kommentieren
empfohlen, sobald geklärt ist, dass kein externer Code das Feld nutzt. Rechtliche Einordnung der Preisangaben: Agent 4.

### Prüfung Gründer-WIP (CSP/Nonce, adopt-session, persistHashSession, Sign-out)

Keine Fehler gefunden, nichts geändert. CSP pro Request mit `crypto.randomUUID()`-Nonce in `middleware.ts`, Next liest die
Nonce aus dem `content-security-policy`-Request-Header; `src/app/layout.tsx` ruft `headers()` auf, rendert damit dynamisch
(Voraussetzung laut `02-guides/content-security-policy.md`). Client-gesetzte `x-nonce`/CSP-Header werden in der
Middleware überschrieben. `script-src` ohne `unsafe-inline` (Produktion); `style-src 'unsafe-inline'` bleibt bewusst.
`/auth/adopt-session`: Origin-Prüfung, Rate-Limit, Token-Validierung serverseitig über `setSession`. Eine
Login-CSRF über präparierte Hash-Tokens würde an der App-2FA des Angreiferkontos scheitern. Hinweis für den Build-Test:
Seiten außerhalb des Middleware-Matchers (statische Bilddateien) erhalten keine CSP mehr aus `next.config.ts` – für
Bilddateien unkritisch.

## (c) Umgesetzte Änderungen

Geändert:
- `src/lib/security/public-fetch.ts` – IPv6-Sperrliste um `::/96`, `64:ff9b::/96`, `fec0::/10` ergänzt (F1).
- `src/app/(dashboard)/inhalte-erstellen/lib/api-guards.ts` – Kostenlimits pro Konto, neue Funktion `costLimitIdentifier` (F2).
- `src/server/server-actions.ts` – Cookie-Server-Actions auf Einstellungs-Keys beschränkt (F3).
- `src/app/api/admin/users/route.ts` – Owner-/Selbstschutz, 404 bei unbekanntem Ziel (F4).
- `src/app/auth/operator-access/route.ts` – Rate-Limit, `Referrer-Policy: no-referrer` (F5).
- `src/app/api/generation/upload/route.ts` – Magic-Byte-Prüfung, frühe Größenprüfung (F6).
- `src/app/api/dashboard/brand-font/route.ts` – Magic-Byte-Prüfung für Schriften (F6).
- `src/app/api/billing/onboarding-bonus/route.ts` – Fallback prüft DB-Spalte, bedingte Buchung (F7).
- `src/app/api/generation/status/route.ts` – `enforceSameOrigin` (F8).
- `src/app/api/dashboard/media/route.ts` – nur http(s)-URLs (F9).
- `src/lib/openai/imageApiKey.test.ts` – hermetisch, ohne Klartextausgabe (F10).
- `src/lib/security/public-fetch.test.ts` – neue Fälle (F1).
- `src/lib/billing/generationTokenCost.ts` – Video-Spanne mit Seedance 2.5 als Untergrenze (P1).
- `src/lib/billing/planCatalog.ts` – Video-Hinweis aus der Abrechnungsformel erzeugt (P1).
- `src/lib/billing/generationTokenCost.test.ts` – drei hermetische Tests zu P1.

Neu:
- `src/lib/security/fileSignature.ts` (+ `fileSignature.test.ts`)
- `src/lib/security/apiGuards.test.ts`, `adminBillingBoundaries.test.ts`, `operatorAccess.test.ts`, `serverActions.test.ts`
- dieser Bericht

Keine Gründer-WIP-Datei verändert. Keine Migration angelegt.

## (d) Tests (tatsächlich ausgeführt)

| Zeit | Befehl | Ergebnis |
|---|---|---|
| 20:15 | `npx vitest run src/lib/openai/imageApiKey.test.ts` | 5/5 bestanden (Shell-Umgebung mit gesetztem Key, kein Klartext) |
| 20:20 | `npx vitest run src/lib/security/public-fetch.test.ts` | 6/6 bestanden |
| 20:21 | Node-Skript mit alter Sperrliste | `::7f00:1`, `64:ff9b::a9fe:a9fe`, `fec0::1` vorher nicht blockiert (Nachweis F1) |
| 20:23 | `npx vitest run src/lib/security/apiGuards.test.ts` | 10/10 bestanden (fremde Origin, 401, 2FA, Viewer schreibt, kein Abo → 402, Kostenlimit pro Konto, fremde Job-ID, Mediathek-URLs) |
| 20:24 | `npx vitest run src/lib/security/adminBillingBoundaries.test.ts` | 9/9 bestanden |
| 20:25 | `npx vitest run src/lib/security/operatorAccess.test.ts` | 3/3 bestanden |
| 20:26 | `npx vitest run src/lib/security/serverActions.test.ts` | 5/5 bestanden |
| 20:27 | `npx eslint <alle geänderten/neuen Dateien>` | 0 Fehler, 0 Warnungen |
| 20:28 | `npx tsc --noEmit --incremental false` (Lauf 1) | 2 Fehler, beide in `src/lib/openai/generateImage.test.ts:43` (Datei von Agent 6); in meinen Dateien 0 |
| 20:36 | `npx tsc --noEmit --incremental false` (Lauf 2) | 3 Fehler in `src/lib/openai/aiWatermark.ts` (Agent 4, parallel in Arbeit) und 1 Fehler in meiner `fileSignature.test.ts:78` (BlobPart-Typ) → behoben |
| 20:37 | `npx tsc --noEmit --incremental false` (Lauf 3) | 0 Fehler |
| 20:29 | `npx vitest run src/lib/security/fileSignature.test.ts` | 6/6 bestanden (inkl. Route: HTML als PNG → 400, echtes PNG → 200) |
| 20:29 | `npx vitest run src/lib/security src/lib/auth src/lib/admin src/lib/openai/imageApiKey.test.ts src/lib/billing/billingRoutes.test.ts src/lib/billing/access.test.ts src/lib/ai/imageRejection.test.ts src/lib/brand/reference-image-bytes.test.ts src/lib/brand/reference-image-security.test.ts src/lib/inhalte-erstellen/run-studio-generation.test.ts src/lib/supabase` | 33 Dateien, 140/140 bestanden |
| 20:34 | `npx vitest run src/lib/billing/generationTokenCost.test.ts src/lib/billing/goLiveBilling.test.ts src/lib/billing/access.test.ts` | 31/31 bestanden; nach Hermetik-Ergänzung `generationTokenCost.test.ts` 13/13 |
| 20:35 | `npx eslint` auf P1-/F6-Dateien | 0 Fehler, 0 Warnungen |
| 20:36 | Abschlusslauf `npx vitest run src/lib/security src/lib/auth src/lib/admin src/lib/billing src/lib/supabase src/lib/openai/imageApiKey.test.ts src/lib/ai/imageRejection.test.ts src/lib/brand/reference-image-bytes.test.ts src/lib/brand/reference-image-security.test.ts src/lib/inhalte-erstellen/run-studio-generation.test.ts` | 41 Dateien, 197/197 bestanden (inkl. `atomicBilling.test.ts`, das in der Baseline unter Last ein Timeout hatte) |
| 20:20 | `npm audit --omit=dev` | 1 critical (next), 2 high (undici, zod) – siehe K1 |
| 20:20 | `git grep` nach `sk-proj-`, `sk_live_`, `rk_live_`, `whsec_`, `sk-ant-`, `re_…`, JWT, `AKIA`, `ghp_`, `xox` | 0 Treffer in getrackten Dateien; nur `.env.example` und `.env.rotation.local.example` getrackt. Keine Geheimnisse in `NEXT_PUBLIC_*` (nur URL/Anon-/Publishable-Key, Flags). |

Nicht getestet: Gesamtlauf aller 88 Testdateien (Orchestrator), Build, Browser, Live-Konfiguration (Supabase-Auth-
Einstellungen, Storage-Bucket-Richtlinien – im Repo gibt es dazu kein SQL –, tatsächlich ausgerollte Migrationen,
Vercel-Variablen wie `LOGIN_WAITLIST_BYPASS_SECRET`).

## (e) Offene Punkte und Risiken

1. K1 Paket-Updates (next, zod, undici) – höchste Priorität, Orchestrator/Gründer.
2. H1 2FA nur App-Schicht; `password_epoch` in user_metadata.
3. H2 Token-Gutschrift unabhängig vom Zahlungsstatus; `async_payment_failed` fehlt. Nebenbefund: Nach gescheiterter
   Erstzahlung blockiert `billing_activate_plan_atomic` ein neues Abo („A different subscription is already linked“),
   solange der alte Status nicht `canceled`/`none` ist.
4. O1 Reconcile-Blockade.
5. F5 Rest: Fallback des Bypass-Secrets auf den Owner-Backup-Code.
6. Neue Ablehnungen durch F6 (nicht passende Dateisignaturen) können bei exotischen Dateien auffallen – bewusst so.
7. F2 setzt die Stunden-/Tageszähler beim Deploy zurück.

## (f) Änderungswünsche an andere Bereiche (mit Diff-Vorschlag)

**F-1 (Orchestrator, package.json/package-lock.json):** `next` auf die erste gepatchte Version > 16.4.0, `zod` ≥ 4.6.6,
`undici` ≥ 7.30.1 (ggf. per `overrides`, falls transitive Abhängigkeit). Danach `npm audit --omit=dev`, Build, Tests.

**F-2 (Orchestrator, `docs/go-live-checklist.md:55`):**
```diff
-`OWNER_EMAILS` oder `user_metadata.role = "owner"` in Supabase.
+`OWNER_EMAILS` (nur mit bestätigter E-Mail) oder `app_metadata.role = "owner"` in Supabase
+(serverseitig, z. B. per Admin-API; user_metadata ist vom Nutzer änderbar und zählt nicht).
```

**F-3 (Agent 1 / Gründer, nach Klärung der Stripe-Zahlarten – nicht umgesetzt):**
neue Migration (nur anlegen, mit PGlite-Test wie `src/lib/billing/atomicBilling.test.ts`):
```sql
-- in billing_activate_plan_atomic: Lots nur bei bezahltem/aktivem Abo; Zeitraum erst dann als vergeben markieren
delta := case when p_status not in ('active','trialing') then 0
              when b.stripe_subscription_id is distinct from p_subscription_id and b.subscription_status='canceled'
              then p_allowance else greatest(p_allowance-b.token_period_granted,0) end;
...
token_period_granted = case when p_status in ('active','trialing')
                            then greatest(token_period_granted,p_allowance) else token_period_granted end
```
Dazu im Webhook bei `checkout.session.completed` mit `payment_status === "unpaid"` nicht aktivieren (auf
`async_payment_succeeded` warten), `checkout.session.async_payment_failed` behandeln, und in `confirm-session`
für Abos `payment_status` in (`paid`, `no_payment_required`) verlangen.

**F-4 (Agent 6, `src/lib/kie/reconcileJob.ts`; Route `internal/reconcile` ist Agent 1):**
```diff
-  else if(["success","succeeded","completed","done"].includes(state) && (media.mediaUrl||media.imageUrl||media.videoUrl))await finishGeneration(job,job.amount,result);
+  else if(["success","succeeded","completed","done"].includes(state)) {
+    const hasMedia = Boolean(media.mediaUrl||media.imageUrl||media.videoUrl);
+    await finishGeneration(job, hasMedia ? job.amount : 0, hasMedia ? result : { ...result, error: "Anbieter lieferte kein Ergebnis." });
+  }
+  else if (job.created_at && Date.parse(job.created_at) < Date.now() - 24 * 3600_000)
+    await finishGeneration(job, 0, { ...result, error: "Zeitüberschreitung; Reservierung freigegeben." });
```
(setzt voraus, dass `reconcileKieJob` `created_at` erhält – die Route lädt `select("*")`.)

**F-5 (Agent 6, erledigt):** `src/lib/openai/generateImage.test.ts:43` hatte um 20:28 zwei TypeScript-Fehler; im
Lauf um 20:37 waren sie behoben.

**F-6 (Agent 3, Info):** Website-/Bildabruf über `publicFetch` profitiert automatisch von F1; keine Änderung nötig.
`url-intake.ts` sendet feste Consent-Cookies auch nach Weiterleitungen auf fremde Hosts – unkritisch, da keine Geheimnisse.

## (g) Tatsächliche Arbeitsschritte

| Uhrzeit | Schritt |
|---|---|
| 20:10 | Arbeitsplan gelesen, Routen- und Bibliotheksinventar |
| 20:11–20:19 | Guards, Workspace/Teamrollen, Jobs/Billing, 2FA, Admin, SQL/RLS, Medienproxy, Webhook, Checkout/Confirm geprüft |
| 20:14–20:15 | `imageApiKey.test.ts` hermetisch gemacht und ausgeführt |
| 20:16–20:20 | `public-fetch.ts`, CSP-WIP (inkl. Next-16-Doku zu Proxy/Nonce), adopt-session geprüft; Secret-Scan; `npm audit` |
| 20:20–20:22 | F1 SSRF-Härtung + Tests + Vorher-Nachweis |
| 20:22–20:24 | F2, F8, F4, F7, F9 umgesetzt; zwei Testdateien |
| 20:24–20:26 | Operator-Zugang (F5), Server Actions (F3) + Tests |
| 20:26–20:28 | ESLint, Typecheck |
| 20:28–20:30 | Magic-Byte-Prüfung (F6) + Tests; Gesamtlauf Security-Suites (140/140) |
| 20:30–20:33 | Restprüfung (Settings-Viewer-Pfad, Billing-Owner-Pflicht), Bericht |
| 20:33–20:35 | Orchestrator-Hinweis Video-Preisangabe (P1) umgesetzt + Tests |
| 20:35–20:39 | Bericht vervollständigt, Abschlusslauf Tests (197/197), Typecheck Lauf 2 und 3 |
