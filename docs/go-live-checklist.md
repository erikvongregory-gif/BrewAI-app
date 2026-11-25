# BrewAI App Go-live Runbook

## 1) Pflicht-Env in Produktion

- Soft-Launch (Production): Warteliste ist an, solange `NEXT_PUBLIC_LOGIN_WAITLIST_ENABLED` nicht `off` ist. Ein `0` in Vercel schaltet Production nicht mehr frei.
- Lokal/Dev: in `.env.local` `NEXT_PUBLIC_LOGIN_WAITLIST_ENABLED=0` — normal einloggen und Dashboard bauen.
- Go-live: Production-Env auf `off` setzen + Redeploy (Login/Registrierung freigeben).
- Admin-Bypass: `/admin/anmelden` ist auch bei aktiver Warteliste nutzbar (`waitlistMode={false}`).
- `NEXT_PUBLIC_APP_BASE_URL=https://app.brewai.de`
- `NEXT_PUBLIC_MARKETING_SITE_URL=https://brewai.de` (Alias: `NEXT_PUBLIC_SITE_URL`)
- `NEXT_PUBLIC_SITE_NAME=BrewAI`
- `NEXT_PUBLIC_PRODUCT_NAME=BrewAI`
- `NEXT_PUBLIC_COOKIE_DOMAIN=brewai.de` — Shared Cookies Marketing ↔ App (nur Production setzen)
- `NEXT_PUBLIC_SUPABASE_URL=...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `AUTH_INVITE_ONLY=false`
- `STRIPE_SECRET_KEY=sk_live_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `STRIPE_PRICE_START_MONTHLY=price_...`
- `STRIPE_PRICE_GROWTH_MONTHLY=price_...`
- `STRIPE_PRICE_PRO_MONTHLY=price_...`
- `STRIPE_PRICE_START_YEARLY=price_1TeElhRojElHlMEeaOShHJry` (Live) / `price_1TeEoBRsiwg9bLFFpIv3vznP` (Test)
- `STRIPE_PRICE_GROWTH_YEARLY=price_1TeElhRojElHlMEeRMLLZnUy` (Live) / `price_1TeEoBRsiwg9bLFFGkV9sJMW` (Test)
- `STRIPE_PRICE_PRO_YEARLY=price_1TeElhRojElHlMEeOuZHA68v` (Live) / `price_1TeEoCRsiwg9bLFFVoOX8v8r` (Test)
- `STRIPE_PRICE_TOKENS_500=price_...`
- `STRIPE_PRICE_TOKENS_2000=price_...`
- `STRIPE_ENABLE_AUTOMATIC_TAX=true`
- `NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED=true`
- `TOKEN_STATE_SECRET=...`
- `META_APP_ID=...` und `META_APP_SECRET=...` (Instagram Markenprofil-Scan, siehe [`docs/instagram-oauth-setup.md`](instagram-oauth-setup.md) — Meta Console + Vercel Schritt-für-Schritt)
- `ADMIN_2FA_SECRET=...` — min. 32 Zeichen, signiert alle 2FA-Cookies
- `RESEND_API_KEY=...` und `ADMIN_2FA_FROM_EMAIL=kontakt@brewai.de` — **ohne funktionierenden Mailversand kommt niemand mehr in die App**
- `OWNER_EMAILS=...` — Betreiber-Konten mit unbegrenzten Tokens ohne Stripe-Abo
- `OWNER_2FA_BACKUP_CODE=...` — lang und zufällig, in Production **anders** als lokal

## 1a) Zwei-Faktor-Authentifizierung (Pflicht für alle Konten)

2FA gilt seit dem Umbau für **jedes** Konto, nicht mehr nur für Admins: nach Login
(Passwort und Google) kommt ein 6-stelliger E-Mail-Code. Danach wird das Gerät
30 Tage als vertrauenswürdig gemerkt (`evglab_2fa_device`), die Session selbst 12 Stunden.

Vor dem Go-live zwingend prüfen:

1. Resend-Domain `brewai.de` verifiziert (SPF/DKIM/DMARC) — siehe [`docs/ki-provider-betrieb.md`](ki-provider-betrieb.md).
2. Testlogin mit einer externen Adresse: Code kommt an und landet nicht im Spam.
3. `ADMIN_2FA_SECRET` in Production gesetzt und mindestens 32 Zeichen lang.
   Bei zu kurzem Wert schlägt jeder Login mit einem Fehler fehl.
4. Ein Wechsel von `ADMIN_2FA_SECRET` invalidiert alle Trusted-Device-Cookies —
   alle Nutzer brauchen dann beim nächsten Login einen neuen Code.

## 1b) Betreiber-Konto (Owner)

Owner-Konten haben unbegrenzte Tokens und brauchen kein Stripe-Abo. Erkennung über
`OWNER_EMAILS` oder `app_metadata.role = "owner"` in Supabase (serverseitig, nicht vom Nutzer änderbar).

```bash
npm run setup:owner                        # Rolle setzen bzw. Konto anlegen
npm run setup:owner -- --password "..."    # zusätzlich das Passwort setzen
```

Da eine Owner-Adresse keinen echten Mailempfang haben muss, ersetzt
`OWNER_2FA_BACKUP_CODE` auf der 2FA-Seite den E-Mail-Code. Diesen Code wie ein
Passwort behandeln: er ist der einzige garantierte Zugang, wenn der Mailversand
ausfällt.

## 2) Supabase Setup

1. SQL aus `docs/billing-schema.sql` ausführen.
2. SQL aus `docs/stripe-webhook-events-schema.sql` ausführen.
3. Prüfen, dass `billing_subscriptions` und `stripe_webhook_events` existieren.
4. **Authentication → URL Configuration** (sonst hängt Google-Login in Production):
   - **Site URL:** `https://app.brewai.de` (nicht `http://localhost:3001`)
   - **Redirect URLs** (alle eintragen):
     - `https://app.brewai.de/**`
     - `http://localhost:3001/**`
5. **Authentication → Providers → Google:** aktiviert, Client ID/Secret aus Google Cloud.
6. **Google Cloud Console** → OAuth-Client → Authorized redirect URI (exakt):
   - `https://lutmsbxcjmocftiovwfs.supabase.co/auth/v1/callback`

## 3) Stripe Dashboard Setup

Konto: **evglab** (`acct_1TJanRRojElHlMEe`) — Live-Produkte/Preise sind angelegt (Metadaten `plan` / `pack` gesetzt).

| Plan / Pack | Intervall | Preis (EUR) | Hinweis |
|-------------|-----------|-------------|---------|
| Start | Monatsabo (Listenpreis) | 100 / Monat | `STRIPE_PRICE_START_MONTHLY` |
| Wachstum | Monatsabo (Listenpreis) | 200 / Monat | `STRIPE_PRICE_GROWTH_MONTHLY` |
| Pro | Monatsabo (Listenpreis) | 400 / Monat | `STRIPE_PRICE_PRO_MONTHLY` |
| Start | Jährlich (Aktionspreis) | 79 / Monat (948 / Jahr) | `STRIPE_PRICE_START_YEARLY` |
| Wachstum | Jährlich (Aktionspreis) | 149 / Monat (1.788 / Jahr) | `STRIPE_PRICE_GROWTH_YEARLY` |
| Pro | Jährlich (Aktionspreis) | 299 / Monat (3.588 / Jahr) | `STRIPE_PRICE_PRO_YEARLY` |
| +500 Tokens (einmalig) | — | 39 | `STRIPE_PRICE_TOKENS_500` → `price_1TUMhARojElHlMEeVvdClkWU` |
| +2000 Tokens (einmalig) | — | 119 | `STRIPE_PRICE_TOKENS_2000` → `price_1TUMhBRojElHlMEeblArEqAp` |

Neue Abo-Preise anlegen (gleiche Beträge in Test & Live):

```bash
node scripts/sync-stripe-plan-prices.mjs
# Live:
STRIPE_SECRET_KEY=sk_live_... node scripts/sync-stripe-plan-prices.mjs
```

1. **Live-API-Keys** unter [API keys](https://dashboard.stripe.com/acct_1TJanRRojElHlMEe/apikeys) → `STRIPE_SECRET_KEY=sk_live_…`
2. **Env in Produktion** (Vercel o. ä.) mit den neuen Live-`price_…`-IDs aus dem Sync-Skript befüllen (nicht die alten 79/149/299-Monatspreise).
3. **Stripe Tax** aktivieren und Regionen konfigurieren (oder `STRIPE_ENABLE_AUTOMATIC_TAX=false` bei Kleinunternehmer).
4. **Customer Portal** aktivieren (Settings → Billing → Customer portal), damit „Abo verwalten“ funktioniert.
5. **Webhook** auf `https://app.brewai.de/api/stripe/webhook` anlegen.
6. Events abonnieren:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid` (Token-Reset bei Abo-Verlängerung)
7. Live-Webhook-Secret in `STRIPE_WEBHOOK_SECRET` setzen.

## 3a) KI-Provider

Guthaben-Auffüllung, OpenAI-Organisationsverifizierung (Pflicht für `gpt-image-2`)
und Meta App Review: [`docs/ki-provider-betrieb.md`](ki-provider-betrieb.md).

## 4) Smoke-Test (Live-Readiness)

1. `https://brewai.de` öffnen, Dashboard-Abo wählen, auf App-Login weiterleiten.
2. Mit Google anmelden, 2FA-Code aus der E-Mail bestätigen.
3. Checkout starten, Zahlung abschließen.
4. Nach Redirect prüfen:
   - Dashboard zeigt aktiven Plan.
   - Tokens sind gesetzt.
5. Token-Pack kaufen und prüfen, dass Tokens steigen.
6. Stripe-Portal öffnen (`Abo verwalten`) und Abo-Änderung testen.
7. Webhook-Retries simulieren (Stripe CLI) und prüfen, dass kein doppelte Gutschrift entsteht.
8. Abmelden und erneut anmelden: das Gerät ist noch 30 Tage vertraut, es darf **kein** neuer Code kommen.
9. In einem anderen Browser anmelden: hier muss ein Code kommen.
10. Owner-Login über `/admin/anmelden` mit `OWNER_2FA_BACKUP_CODE` testen.

## 6) BrewAI Domains (manuell)

Nach Domain-Umstellung prüfen:

1. **Vercel** → Domains: `app.brewai.de` (Primary). Legacy `app.evglab.com` / `ki.evglab.com` dürfen auf dasselbe Projekt zeigen (Middleware → 308 auf `app.brewai.de`).
2. **Env Production:** `NEXT_PUBLIC_APP_BASE_URL`, `NEXT_PUBLIC_MARKETING_SITE_URL`, `NEXT_PUBLIC_COOKIE_DOMAIN=brewai.de`, `NEXT_PUBLIC_SITE_NAME` / `PRODUCT_NAME`.
3. **Supabase Auth** Site URL + Redirect URLs auf `https://app.brewai.de` (alte URLs optional behalten für Übergangszeit).
4. **Stripe** Webhook-Endpoint auf `https://app.brewai.de/api/stripe/webhook` (alten Endpoint deaktivieren, wenn Legacy-Host weg ist).
5. **Meta Instagram** Redirect URI + App-Domain auf `app.brewai.de`.
6. **Resend** Domain `brewai.de` verifizieren; From/Reply z. B. `kontakt@brewai.de`.
7. **Google OAuth** (falls Client-IDs an Domains gebunden): Authorized JS origins / redirect URIs prüfen.

## 7) Rollback-Option

- Bei Problemen Checkout sofort per `NEXT_PUBLIC_BILLING_CHECKOUT_ENABLED=false` deaktivieren.
- Danach nur Login/Bestandskundenzugriff aktiv lassen und Logs prüfen.
- Wenn der 2FA-Mailversand ausfällt und Nutzer ausgesperrt sind: Resend-Status und
  `ADMIN_2FA_FROM_EMAIL` prüfen. Der eigene Zugang läuft in der Zeit über
  `OWNER_2FA_BACKUP_CODE`.
