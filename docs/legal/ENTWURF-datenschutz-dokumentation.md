# ENTWURF – Datenschutz-Dokumentation BrewAI (juristisch zu prüfen)

> **ENTWURF, keine Rechtsberatung.** Erstellt am 2026-11-09 im Rahmen eines technischen Audits (Agent 4) aus dem Quellcode von `app.brewai.de` abgeleitet. Nicht geprüft: Verträge, tatsächliche Supabase-/Vercel-Regionen, Datenbank-Schema außerhalb von `supabase/migrations/`, Marketing-Site `brewai.de`. Alle Einträge sind von der verantwortlichen Stelle und einer Anwältin bzw. einem Anwalt zu prüfen und zu ergänzen. BrewAI ist durch dieses Dokument **nicht** rechtssicher.

## 1. Verzeichnis der Verarbeitungstätigkeiten (Art. 30 DSGVO) – Entwurf

Verantwortlicher: Betreiber von BrewAI (Name, Anschrift, Kontakt – **eintragen**). Datenschutzbeauftragter: **prüfen, ob Benennungspflicht besteht** (§ 38 BDSG, nicht abschließend geprüft).

| Nr. | Tätigkeit | Betroffene | Datenkategorien (laut Code) | Zweck | Rechtsgrundlage (Vorschlag, zu prüfen) | Empfänger | Löschfrist (Ist laut Code) |
|---|---|---|---|---|---|---|---|
| 1 | Konto, Anmeldung, 2FA | Kunden, Teammitglieder | E-Mail, Name, Brauereiname, Telefon (optional), Passwort-Hash (Supabase), Login-Zeitpunkte, Google-Identität, 2FA-Codes per E-Mail, AGB-/Datenschutz-Zeitstempel (`termsAcceptance.ts`) | Vertragserfüllung, Sicherheit | Art. 6 Abs. 1 lit. b, f DSGVO | Supabase, Resend, Google (OAuth), Vercel | bis Kontolöschung; 2FA-Codes kurzlebig (nicht geprüft) |
| 2 | Markenprofil und Website-Scan | Kunden; ggf. auf Websites genannte Personen | URL, Website-Texte, Bilder, Schriften, Logos, Instagram-Verbindung (Token in `integration_secrets`), Markenprofil in `user_metadata.dashboard` | Markenkonsistente Inhalte | Art. 6 Abs. 1 lit. b DSGVO | Anthropic (Analyse), Meta (Instagram Graph API), Supabase | bis Kontolöschung; keine automatische Löschung von Scan-Kopien |
| 3 | Bild- und Videoerzeugung | Kunden; abgebildete Personen auf Referenzfotos | Prompts, Referenzbilder (Etiketten, Personen-Referenzen `character-refs`, Uploads `generation-refs`), erzeugte Medien, Jobs (`generation_jobs`) | Leistungserbringung | Art. 6 Abs. 1 lit. b DSGVO; für Fotos Dritter: Rechtsgrundlage beim Kunden (zu prüfen) | OpenAI, KIE (inkl. Temp-Upload `*.redpandaai.co`), BytePlus ModelArk (Region ap-southeast), Supabase Storage | bis Kontolöschung; Dauer bei KI-Anbietern **unbekannt** |
| 4 | Texte, Captions, Assistent „Hopfen Hugo“ | Kunden | Eingaben, Markenkontext, Chatverlauf (zusätzlich lokal im Browser, `localStorage` `brewai.assistant.threads`) | Leistungserbringung, Support | Art. 6 Abs. 1 lit. b DSGVO | Anthropic | Server: nicht gespeichert (nicht geprüft); Browser: unbegrenzt bis manuelles Löschen |
| 5 | Mediathek und Speicher | Kunden | Bilddateien, Thumbnails, Avatare, Biere, Charaktere, Schriften | Leistungserbringung | Art. 6 Abs. 1 lit. b DSGVO | Supabase | bis Kontolöschung (seit Audit vollständige Ordnerliste, siehe `deleteAccount.ts`) |
| 6 | Team und Einladungen | Kunden, eingeladene Personen | E-Mail, Name und Rolle Eingeladener, Mitgliedschaften | Teamzugang | Art. 6 Abs. 1 lit. b, f DSGVO | Supabase, Resend | Einladungen mit Ablaufdatum; bei Kontolöschung seit Audit explizit gelöscht |
| 7 | Abrechnung | Kunden | Stripe-Kunden-ID, Abo-Status, Token-Kontingente, Rechnungen (bei Stripe) | Vertragserfüllung, gesetzliche Aufbewahrung | Art. 6 Abs. 1 lit. b, c DSGVO | Stripe | Abo-Daten bis Löschung; Rechnungen bei Stripe gemäß Aufbewahrungsfristen (Fristen prüfen) |
| 8 | Warteliste | Interessenten | E-Mail, Quelle (`waitlist_signups`) | Zugang zur Beta | Art. 6 Abs. 1 lit. b oder a DSGVO (prüfen) | Supabase | **keine Löschregel gefunden** |
| 9 | Sicherheit, Missbrauchsschutz | alle Nutzer | IP-basierte Rate-Limit-Schlüssel, Origin-/Fetch-Header, Server-Logs | Sicherheit (Art. 32) | Art. 6 Abs. 1 lit. f DSGVO | Vercel, Supabase | nicht dokumentiert |
| 10 | Löschaufträge | Kunden | `account_deletion_jobs` (User-ID, letzter Fehler) | Nachweis/Fortsetzung der Löschung | Art. 6 Abs. 1 lit. c, f DSGVO | Supabase | nicht dokumentiert |

## 2. Subprozessoren und Drittlandbezug – Entwurf

Abgeleitet aus Code, Hostnamen und Variablennamen in `.env.example` (keine Werte eingesehen oder übernommen). Vertragsstatus (AVV/DPA, SCC, DPF-Zertifizierung) ist **nicht** geprüft.

| Dienst | Funktion in BrewAI | Datenarten | Drittland möglich | Offene Prüfpunkte |
|---|---|---|---|---|
| Supabase | Auth, Postgres, Storage | alle Kontodaten, Medien | ja (US-Anbieter; Region des Projekts prüfen) | DPA, Region, Unterauftragnehmer, Bucket öffentlich oder privat (`.env.example` nennt „öffentlicher Storage-Bucket“) |
| Vercel | Hosting, Serverless-Funktionen, Logs | Requests, IP, Logs | ja (US) | DPA, Log-Aufbewahrung, Funktionsregion |
| Stripe | Checkout, Kundenportal, Rechnungen | Zahlungs- und Rechnungsdaten | ja | Vertragspartner (EU-Gesellschaft?), DPA |
| OpenAI | Bildgenerierung | Prompts, Referenzbilder | ja (US) | API-DPA, Aufbewahrung von Eingaben, Trainingsausschluss |
| Anthropic | Texte, Markenanalyse, Assistent | Prompts, Website-Inhalte, Chats | ja (US) | DPA, Aufbewahrung, Trainingsausschluss |
| KIE (kie.ai) inkl. `kieai.redpandaai.co` / `tempfile.redpandaai.co` | Bild-/Video-Modelle, Datei-Upload | Prompts, Referenzbilder (ggf. Personen) | **unklar** (Sitz und Speicherort unbekannt) | **hoch**: Vertragspartner, Sitz, AVV, Löschfrist der Temp-Dateien, Transfer-Folgenabschätzung |
| BytePlus ModelArk (`ark.ap-southeast.bytepluses.com`) | Seedance-Videos | Prompts, Bilder | ja (Region Südostasien) | **hoch**: Vertragspartner, SCC, Transfer-Folgenabschätzung |
| Resend | 2FA-Codes, Passwort-Reset, Einladungen | E-Mail-Adressen, Inhalte | ja (US) | DPA |
| Google | OAuth-Anmeldung | Identitätsdaten | ja | Rolle (eigene Verantwortlichkeit?), Hinweis in Datenschutzerklärung |
| Meta | Instagram-Verbindung für Markenprofil | Access-Token, Profildaten | ja | Plattformbedingungen, Rolle, Löschung der Tokens (seit Audit bei Kontolöschung explizit) |

Schriften werden über `next/font` selbst ausgeliefert; im Code wurde kein Laden von Google Fonts im Browser gefunden.

## 3. Technische und organisatorische Maßnahmen (Art. 32 DSGVO) – Übersicht aus dem Code

| Bereich | Vorhanden (laut Code) | Lücke / Empfehlung |
|---|---|---|
| Zugangskontrolle | 2FA laut `.env.example` für alle Konten verpflichtend (`hasPassedTwoFactor`), Admin-2FA mit vertrauenswürdigen Geräten, Einladungs-/Wartelistenmodus | Passwortrichtlinie und Sitzungsdauer dokumentieren |
| Anfrageschutz | Herkunftsprüfung (`enforceSameOrigin`), persistente Rate-Limits, CSP mit Nonce (Gründer-WIP), SSRF-Schutz beim Website-Abruf (`public-fetch`) | – |
| Trennung/Minimierung | Service-Role-Key nur serverseitig, Team-Rollen (`teamRoles`), signierte URLs für private Assets (1 h) | Bucket-Sichtbarkeit klären; Prompts in Jobs nach Frist löschen |
| Integrität | Stripe-Webhook-Signatur (`STRIPE_WEBHOOK_SECRET`), HMAC für Token-Status und 2FA-Cookies | – |
| Betroffenenrechte | Kontolöschung mit Löschauftrag (wiederaufnehmbar), seit Audit Datenexport `GET /api/account/export` | UI-Schaltfläche für Export fehlt; Löschkonzept mit Fristen fehlt |
| KI-Transparenz | sichtbares „AI“-Label optional, seit Audit Funktion für maschinenlesbare Kennzeichnung (EXIF + IPTC-XMP) | Kennzeichnung unabhängig vom Nutzerschalter einbinden; Videos nicht gekennzeichnet |
| Schlüsselverwaltung | eigener, eingeschränkter OpenAI-Projektschlüssel, Rotationsskript | Rotation für alle Anbieter dokumentieren |
| Protokollierung | Server-Logs (Vercel) | Aufbewahrung und Zugriff festlegen; Admin-Aktionen protokollieren |
| Datensicherung | Backup-Tabelle `brewai_release_backup_20260915.auth_dashboard_beers_metadata` | enthält Nutzerdaten ohne Löschregel – nach Prüfung entfernen |

## 4. Endgerätezugriffe (§ 25 TDDDG) – Bestandsaufnahme

Im Code gefundene Speicherungen (Cookies, `localStorage`, `sessionStorage`): Supabase-Sitzungscookies, 2FA-Cookies (pending/verified/trusted device), `brewai_terms_accepted`, Wartelisten-Bypass, Passwort-Recovery-Cookie, Instagram-OAuth-State, Sidebar-Zustand, Theme, Mediathek-Sortierung, Studio-Entwurf, Produkt-Tour-Status, Assistent-Verläufe, aktive Generierung, Markenwahl-Hinweis. Analyse- oder Tracking-Bibliotheken wurden in `package.json` und `src/` nicht gefunden.

Einschätzung (zu prüfen): Die gefundenen Einträge dienen dem vom Nutzer gewünschten Dienst und können unter § 25 Abs. 2 Nr. 2 TDDDG fallen. Sie sollten in der Datenschutzerklärung aufgeführt werden. `NEXT_PUBLIC_COOKIE_DOMAIN` teilt Cookies mit `brewai.de`; Tracking auf der Marketing-Site wurde nicht geprüft.
