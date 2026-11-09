# 05 – Branchenforschung und Produktstrategie (Agent 5)

Audit vom 2026-11-09, Arbeitszeit 20:10–20:33 (Uhrzeiten in Abschnitt h). Rolle: Brewery Industry Research & Product Innovation. Kein Produktivcode geändert. Neue Dateien: dieser Bericht und `docs/strategy/2026-11-09-produktionsdaten-import-konzept.md`.

Kennzeichnung: **[Qn]** = Quelle im Verzeichnis (g), alle abgerufen am 09.11.2026. **(Annahme)** = nicht belegt, im Pilot zu prüfen. **(Rechnung)** = eigene Rechnung aus belegten Eingangswerten. Wo eine Quelle nur als Suchauszug vorlag (Seite nicht vollständig gelesen), steht das im Verzeichnis.

---

## Kurzfassung

1. **BrewAI ist heute ein Bild- und Video-Generator mit echtem Brauwissen, aber ohne messbaren Geschäftsnutzen im Produkt.** Gemessen werden Tokens, nicht veröffentlichte Beiträge, gesparte Stunden oder Absatz. Das Brauwissen (26 Bierstile mit Farbe/Schaum/Kohlensäure, 11 Gläser mit Eichstrich, 13 Biergebinde, Etiketttreue) ist der stärkste Unterschied zu Canva/ChatGPT, lässt sich aber in Wochen nachbauen. Der Assistent „Hopfen Hugo“ ist ausdrücklich ein Allzweck-Chat und damit der Teil, der am meisten nach austauschbarem GPT-Wrapper aussieht.
2. **Der Markt für reines Brauerei-Marketing ist klein.** 2025 gab es 1.415 Brauereien in Deutschland, davon 821 mit höchstens 1.000 hl Jahresausstoß [Q2]. In der letzten vollständigen Größenklassen-Tabelle (2021) lagen nur 348 Brauereien zwischen 5.000 und 200.000 hl [Q42]. Selbst wenn jede der 594 Brauereien über 1.000 hl den Wachstums-Tarif (1.788 €/Jahr) und jede Kleinstbrauerei den Start-Tarif (948 €/Jahr) buchen würde, ergäbe das nur rund 1,8 Mio. € Jahresumsatz (Rechnung). Realistische Marktdurchdringung liegt weit darunter. Für ein Wachstumsunternehmen reicht „KI-Bilder für Brauereien“ allein nicht. Mehr Umsatz pro Kunde muss aus Vertrieb und Produktion kommen, mehr Kunden aus angrenzenden Getränkesegmenten (AfG/Mineralbrunnen sind im Gebindekatalog schon angelegt) und aus Österreich (361 Brauereien [Q37]).
3. **Geld geben Brauereien belegbar für Pflichten und Betrieb aus:** ERP mit Leergut/Pfand, Biersteuer und Chargenrückverfolgung [Q9][Q12], Leitsysteme [Q13], Außendienst-/Absatzsoftware [Q19][Q20], Agenturen [Q36]. Für Marketingbudgets und Marketingpersonal kleiner und mittlerer Brauereien habe ich **keine belastbare öffentliche Quelle** gefunden. Das muss in Pilotgesprächen erhoben werden, bevor Preise oder neue Module festgelegt werden.
4. **Empfohlene Richtung:** Marketing-Kern schärfen (Kampagnenkalender aus dem Sortiment, Gastro-Partner-Kit, Alkoholwerbe-Check), parallel zwei günstige, read-only Concierge-Tests starten: **Absatz-Frühwarnung je Kunde** aus vorhandenen Exporten (GEDAT/ERP) und **Gärprotokoll-Wächter** aus CSV/Brewfather. Beide verbinden Daten mit dem bestehenden Sortiment und können eine Marketing-Aktion auslösen. Erst bauen, wenn Pilotbrauereien Daten liefern und Treffer als „berechtigt und neu“ bewerten.
5. **Fachliche Fehler gefunden** (Abschnitt f): u. a. widersprüchliche NRW-Flaschengeometrie, die so im Bildprompt landet, falsche Höhe der Euroflasche, „NRW ist höher als Longneck“ (falsch), IPA-Farbe zu dunkel, Zitronenscheibe als Standard-Requisit beim Hefeweizen. Dazu eine Preisangabe, die nicht zur Abrechnung passt (Seedance 2.5: Hinweis 100 Tokens, berechnet 150).

---

## (a) Ist-Stand des Produkts aus Kundensicht

### Was ein Kunde heute bekommt (aus dem Code gelesen)

| Bereich | Funktion | Fundstelle |
|---|---|---|
| Navigation | Dashboard, „BrewAI“-Assistent, Bilder erstellen, Videos erstellen, Mediathek; Marke: Markenprofil, Team; Konto: Abonnement, Einstellungen | `src/navigation/sidebar/sidebar-items.ts` |
| Markenprofil | Website-Scanner (`api/brand/analyze-url`), Instagram-Verbindung und Post-Scan (`api/brand/instagram/*`, `scan-instagram-posts`), Markenschrift, Profil-Aktivierung | `src/app/api/brand/**` |
| Sortiment „Meine Biere“ | Bier mit Stil, Gebinde, Glas, Etikett-/Produktfoto; Stil-Erkennung aus dem Namen | `api/dashboard/my-beers`, `beer-styles.ts` |
| Bilder | Hyperrealistische Bilder, Studio, Freisteller, Kampagne mit Text (nur mit Textprofil), Social-Post mit Textvorschlag und Neu-Layout; 12 Anlass-Vorlagen (Biergarten, Feierabend, Wirtshaus, Produktneuheit, Food-Pairing, Brotzeit am Berg, See, Public Viewing, Oktoberfest, Winter/Weihnachten, Vatertag, Tag des Bieres) | `api/generate-*`, `api/inhalte-erstellen/*`, `occasion-templates.ts` |
| Brauwissen | 26 Bierstile mit Farbe (SRM/Hex), Trübung, Schaum, Schaumhöhe, Kohlensäure; 11 Glastypen mit Eichstrich; 13 Biergebinde plus AfG-/Wasser-Gebinde; Etikett-Modus „marke“ mit Referenzfoto | `brewing-knowledge.ts`, `beer-appearance.ts` |
| Personen | Wiederverwendbare Charaktere | `api/dashboard/my-characters` |
| Video | Seedance 2 / 2.5 (inkl. Edit/Extend), 480p–1080p, 4–15 s, optional Audio | `src/lib/generation/catalog/*`, `api/generation/*` |
| Assistent | Claude-basierter Chat, laut System-Prompt „zu fast allen harmlosen Themen“ | `src/lib/assistant/hopfenHugoPolicy.ts` |
| Team, Abrechnung | Sitzplätze, Einladungen; Stripe, Token-Kontingent, Token-Übertrag, Token-Nachkauf | `planCatalog.ts`, `api/billing/*` |

**Nicht vorhanden (Navigation und Routen geprüft):** Planung/Kalender, Freigabe-Workflow, Veröffentlichung oder Performance-Auswertung, Verkaufsunterlagen für Handel/Gastronomie, jede Form von Produktions-, Absatz- oder Qualitätsdaten.

### Preise und Mengen

| Tarif | €/Monat bei Jahreszahlung (Monatsabo) | Tokens/Monat | Sitze | Bilder/Monat laut Tarifkarte (Rechnung) | Videos laut Tarifkarte |
|---|---|---|---|---|---|
| Start | 79 (100) | 1.200 | 1 | 70–400 | 5–12 |
| Wachstum | 149 (200) | 3.000 | 3 | 176–1.000 | 12–30 |
| Pro | 299 (400) | 7.500 | 10 | 441–2.500 | 31–75 |
| Enterprise | 599 (799) | 20.000 | 25 | 1.176–6.666 | 83–200 |

Token-Kosten je Bild: 3 (1K) bis 17 (4K mit Referenz und strengem Etikett-Modus); ein Markenbild mit Produktfoto kostet standardmäßig 11 Tokens (2K + Referenz + Etikett), also rund 0,72 € im Start-Tarif bei Jahreszahlung (Rechnung). Laut Code-Kommentar liegen die Token-Preise beim 4- bis 5-Fachen der Anbieterkosten.

**Einordnung (Annahme, im Pilot prüfen):** Eine Brauerei mit drei Posts pro Woche und je drei Varianten braucht rund 40 Markenbilder im Monat, also etwa 440 Tokens. Der Start-Tarif reicht dafür. Mehr Umsatz pro Kunde entsteht deshalb kaum über Bildmengen, sondern über Sitze, Video und neue Module.

### Kritische Bewertung (SaaS-Investor und zahlender Brauereikunde)

| Frage | Befund |
|---|---|
| Wo ist der Nutzen messbar? | Heute nur indirekt: Ein Bild für 0,20–1,12 € statt Fotoshooting. Das Produkt misst weder Veröffentlichung noch Zeitersparnis noch Wirkung. Ohne diese Zahlen ist jede Verlängerung eine Bauchentscheidung des Kunden. |
| Wo ist BrewAI austauschbar? | Allzweck-Assistent (beantwortet laut Prompt fast alles), freie Textvorschläge, generische Szenen. Preisanker im Markt: Canva Pro 110 €/Jahr, Canva Business 160–170 € pro Person und Jahr [Q32]; Simplified bietet einen KI-Generator für Bierwerbung und einen Content-Kalender für Craft-Brauereien [Q34]. Der Start-Tarif kostet mit 948 €/Jahr rund das 8,6-Fache von Canva Pro (Rechnung). Das trägt nur, wenn die Bilder fachlich und markentreu sichtbar besser sind. |
| Verteidigungslinie heute | (1) **Produkttreue:** Etikett-Modus, Gebinde- und Glaskatalog, Schaum je Sorte. Stark, aber nur so gut wie die Fachdaten (siehe Fehler in f). (2) **Sortiment und Markenprofil:** Wechselkosten entstehen, sobald Biere, Etikettfotos und Markenregeln gepflegt sind. (3) **Gründer ist Brauer:** Glaubwürdigkeit im Vertrieb und in Fachregeln. |
| Verteidigungslinie fehlt | Workflow (Kalender, Freigabe, Gastro-Partner), eigene Daten über Wirkung, Integrationen, Vertriebskanal über Verbände. |
| Größtes Risiko | Die großen Bildmodelle werden bei Produkttreue mit Referenzbild von selbst besser. Dann schrumpft der Vorsprung auf das Fachwissen in den Prompts. |

---

## (b) Branchenbefunde mit Quellen

### Marktstruktur Deutschland (und DACH)

| Kennzahl | Wert | Quelle |
|---|---|---|
| Brauereien 2025 | 1.415 (−53 bzw. −3,6 % zum Vorjahr; −137 seit 2019) | [Q2] |
| davon bis 100.000 l (= 1.000 hl) Jahreserzeugung | 821 | [Q2] |
| davon mindestens 200 Mio. l (= 2 Mio. hl) | 8 | [Q2] |
| Regional 2025 | Bayern 588, Baden-Württemberg 190, NRW 131 | [Q2] |
| Brauereien nach Jahreserzeugung 2021 (letzte vollständige Tabelle gefunden) | bis 1.000 hl: 890 · 1.000–10.000 hl: 307 · 10.000–50.000 hl: 167 · 50.000–200.000 hl: 84 · 200.000 hl–2 Mio. hl: 57 · über 2 Mio. hl: 7 · gesamt 1.512 | [Q42] (Klassen zusammengefasst, Rechnung) |
| Bierabsatz 2025 | rund 7,8 Mrd. l, −6,0 % (−497,1 Mio. l), stärkster Rückgang seit Beginn der Reihe 1993; ohne alkoholfreies Bier und Malztrunk; Biermischungen 402 Mio. l (−5,2 %) | [Q1] |
| Bierabsatz 2023 / davon alkoholfrei | 83,76 Mio. hl / 6,65 Mio. hl (vorläufig) | [Q3] |
| Beschäftigte 2023 (nur Betriebe > 20 Beschäftigte) | 27.524 | [Q3] |
| Umsatz 2023 (nur Betriebe > 20 Beschäftigte) | 8.931 Mio. € | [Q3] |
| Biersteuer 2023 | 580 Mio. € | [Q3] |
| Anteil alkoholfreies Bier am Konsum | 11 % laut Brauer-Bund | [Q4] (Suchauszug) |
| Österreich 2025 | 361 Brauereien | [Q37] |
| Schweiz | keine belastbare aktuelle Zahl gefunden | – |

Abgeleitet: 1.415 − 821 = **594 Brauereien über 1.000 hl** (Rechnung). Die 8 größten haben Agenturen (z. B. betreut die Agentur Butter Social Media für Bitburger, König Pilsener, Köstritzer [Q36]) und sind keine Selbstbedienungskunden.

**Marktgröße für reines Marketing-SaaS (Rechnung mit Annahmen):** 594 × 1.788 € (Wachstum, Jahreszahlung) + 821 × 948 € (Start, Jahreszahlung) ≈ 1,84 Mio. € Jahresumsatz bei **100 %** Marktdurchdringung in Deutschland. Bei 10–20 % Durchdringung (Annahme) wären es 0,2–0,4 Mio. €. Der wahrscheinlich zahlungsfähigste Kern (5.000–200.000 hl, eigene Vermarktung, keine Großagentur; Annahme) umfasste 2021 nur 348 Betriebe [Q42]; selbst alle im Wachstums-Tarif ergäben rund 0,62 Mio. € (Rechnung). Das ist die zentrale Investorenfrage an BrewAI.

### Wirtschaftliche Lage und Schmerzpunkte

Belegt:

- **Sinkender Absatz** [Q1] und **Betriebsaufgaben** [Q2]; Destatis nennt den Absatzrückgang als Hauptgrund für die sinkende Zahl der Brauereien [Q2].
- **Steigende Kosten** für Energie, Rohstoffe und Logistik; der Brauer-Bund erwartet für 2026 „ein sehr hartes Jahr“; viele Brauer reagieren mit mehr alkoholfreiem Bier und Limonaden [Q4]. **Für 40 % der Bierhersteller hat laut Verband Private Brauereien derzeit das wirtschaftliche Überleben oberste Priorität** [Q4]. Folgerung für BrewAI: Ausgaben ohne nachweisbaren Spar- oder Absatzeffekt werden gestrichen; Nutzen muss in Euro oder Stunden belegbar sein.
- **Investitionsbereitschaft trotz Krise:** rund 80 % der Mitgliedsbetriebe der Privatbrauereien kündigten für 2026 Investitionen an [Q5] (Suchauszug, Verbandsangabe). Das widerspricht dem vorigen Punkt nicht: investiert wird in Anlagen und Betrieb, nicht zwingend in Software.
- **Pflichten mit festen Fristen:** monatliche Biersteuererklärung bis zum 7. Tag des Folgemonats (verlängerbar bis zum 10.), Fälligkeit am 20. [Q7]. Regelsteuersatz 0,787 € je Grad Plato und hl; unabhängige Brauereien unter 200.000 hl zahlen gestaffelt 50 % (bis 5.000 hl) bis 75 % (ab 40.000 hl) in 1.000-hl-Stufen [Q6]; der Brauer-Bund verteidigt die Staffel 2026 gegen Kürzungspläne [Q40].
- **Standardanforderungen an Brauereisoftware:** Leergutverwaltung und -bewertung, Chargenverfolgung, Rückbierverwaltung, Biersteuerberechnung [Q9]; eine kleine Brauerei schrieb zusätzlich Pfand, Chargenrückverfolgung, Lager und Finanzbuchhaltung aus [Q12].
- **Werberecht:** Die Verhaltensregeln des Deutschen Werberats für alkoholhaltige Getränke gelten in neuer Fassung ab Januar 2026 [Q31]. Für Bildmotive und Texte von BrewAI direkt relevant: gezeigte Personen mindestens 18 und optisch junge Erwachsene (2.2); keine aktiven Wettkampfsportler beim Trinken oder Zuprosten (3); keine Verbindung von Trinken und Fahren (4); kein Konsum bei Sicherheitsverstößen, z. B. an gefährlichen Maschinen, „situative Nüchternheit“ am Arbeitsplatz (5) – heikel für Szenen „Brauer im Sudhaus mit Bier“; keine Heil- oder Gesundheitsaussagen (6); hoher Alkoholgehalt nicht als Kaufanreiz herausstellen (7.1) – heikel für Starkbier/Doppelbock; keine enthemmende oder angstlösende Wirkung (8); kein Leistungs-, sozialer oder sexueller Erfolg durch Alkohol (9). Social-Media-Leitlinien verlangen eine technische Altersschranke [Q31]. Der BGH hat „bekömmlich“ für Bier als unzulässige gesundheitsbezogene Angabe nach der Health-Claims-Verordnung eingestuft (Urteil vom 17.05.2018, I ZR 252/16) [Q30].

Nicht belegt (Annahme, im Pilot zu erheben):

- Marketingbudget und Marketingpersonal kleiner/mittlerer Brauereien. Gesucht in Destatis, Brauer-Bund, Privatbrauereien, Branchenpresse: **nichts Belastbares gefunden**. Die einzige Social-Media-Studie (100 Brauereien, 2021) zeigt nur, dass fast alle Facebook nutzen [Q39].
- Zeitaufwand für Content, fehlende Produktfotos bei Saison- und Neuheiten-Bieren, Anfragen von Gastro-Partnern nach Werbemitteln, Produktionsdaten in Excel oder auf Papier.

### Brauereisoftware und belegte Integrationsmöglichkeiten

| System | Segment | Belegte Schnittstelle | Quelle | Bewertung für BrewAI |
|---|---|---|---|---|
| ProLeiT Brewmaxx | Leitsystem/MES, eher größere Brauereien (Referenzen u. a. Warsteiner, Erdinger, Feldschlösschen, Egger) | OPC-UA-Server ab V9.70; „brewmaxx connect“ mit XML/B2MML zum ERP; SAP-Kopplung beschrieben | [Q13] (Herstellerangaben) | Nur über Kunden-IT und Gateway im OT-Netz. Spät. |
| Aptean Drink-IT | Getränke-ERP auf Microsoft Dynamics 365 Business Central (u. a. Flensburger, Einbecker, Schwarzbräu, Wieninger) | Business Central hat eine dokumentierte REST-API v2.0, online standardmäßig aktiv; Branchenfelder von Drink-IT nicht öffentlich dokumentiert | [Q9][Q10][Q16] | Realistischer zweiter Schritt, je Kunde mit dessen App-Freigabe. |
| CSB-System | ERP-Branchenlösung Getränke | keine öffentliche API-Doku gefunden | [Q11] | CSV-Export. |
| BrewMan (Premier Systems) | Brauerei-Software für Deutschland mit Biersteuer-Dokumentation | keine API-Doku gefunden | [Q38] | CSV-Export. |
| GFGH-Branchenlösungen (GESOFT, ORGA-SOFT INTEGRA, CSB, GRS, DELOMA) | Getränkefachgroßhandel | keine API-Doku gefunden | [Q18] | indirekt über GEDAT. |
| GEDAT / getITEM | Datendrehscheibe Hersteller ↔ GFGH: über 2.000 GFGH-Geschäftspartner (Stand 2023); Händler erfassen ihren Absatz monatlich, GEDAT übermittelt ihn an die Brauerei; laut Meininger-Suchauszug 80 Hersteller | Absatzmeldeverfahren, EDI, GDSN | [Q17] | **Wichtigste Datenquelle für Absatz-Frühwarnung**: Die Brauerei hat die Daten schon. |
| ORBIS BeverageONE | Außendienst/Absatz für Brauereien auf Dynamics 365 bzw. SAP S/4HANA: Absatzdaten, Vertriebsaktionen mit Alarmfunktion, Distributionsmonitoring | – | [Q19] | Wettbewerber für Absatz-Frühwarnung bei größeren Brauereien. |
| maiTour | Touren-/Besuchsplanung, u. a. Warsteiner | – | [Q20] | Wettbewerber im Außendienst. |
| Brewfather | Cloud-Brausoftware (Hobby/Craft) | Dokumentierte API v2 (v1 abgekündigt), HTTP-Basic-Auth mit API-Schlüssel, 500 Aufrufe/Stunde je Schlüssel (ohne Ankündigung änderbar), getrennte Lese-/Schreib-/Lösch-Scopes (`batches.read` genügt), alle Messwerte je Sud abrufbar | [Q14] | Einfachster API-Connector für kleine Brauereien; nur Lese-Scope anfordern. |
| Ekos | Craft-Brauereisoftware (USA) | öffentliche API **nicht** belegt (Quellen widersprechen sich); Integration Arryved per Token | [Q15] | Für DACH nachrangig. |
| Sennos BrewIQ, Endress+Hauser QWX43 | In-Tank-Sensorik (Dichte, Temperatur, pH, gelöster O₂ …) | E+H: Netilion-API; BrewIQ: Cloud, API-Doku nicht gefunden | [Q21][Q22] | Voraussetzung für Prognosen (Stufe 4). |
| Untappd for Business | Bier-Menüs (vor allem USA), ca. 899–1.199 USD/Jahr | API im Premium-Tarif | [Q33] (Drittquellen) | Preisanker für Gastro-Menüs, kein DACH-Standard. |

**Ist read-only und zuerst CSV/Excel der richtige erste Schritt? Ja, mit Einschränkung.**

- Dafür: Für die verbreiteten DACH-Systeme ist keine öffentliche, mandantenunabhängige API belegt. Ein Export geht überall. Kein Eingriff in OT- oder ERP-Netze, kein Haftungsrisiko aus Schreibzugriffen. Datenmodell und Nutzen lassen sich testen, bevor Connectoren gebaut werden.
- Dagegen: Monatliche Handarbeit beim Kunden. Wenn Export und Upload länger als etwa 10 Minuten dauern (Annahme), stirbt die Nutzung. Deshalb Vorlagen je Quellsystem und gespeicherte Spaltenzuordnung.
- Reihenfolge: CSV (Absatz, Gärprotokoll) → Brewfather-API → Business-Central-API je Kunde → OPC UA nur mit Kundenprojekt → MCP read-only. Details: `docs/strategy/2026-11-09-produktionsdaten-import-konzept.md`.

### Leitfrage „BrewAI erkennt ein Problem, das der Mitarbeiter noch nicht erkannt hat“

| Stufe | Was es ist | Benötigte Daten | Validierbarkeit | Fehlalarmrisiko | Realistischer Aufwand | Empfehlung |
|---|---|---|---|---|---|---|
| 1 Regelbasierte Warnung | Feste Schwellen, vom Braumeister bzw. Vertriebsleiter gesetzt (z. B. Extraktabnahme < Schwelle in 24 h; Kunde 3 Monate unter Vorjahr; Biersteuer-Frist) | Tages- bzw. Monatswerte | Hoch (Regel trifft oder nicht) | niedrig–mittel, einstellbar | gering | **Jetzt testen** (Concierge) |
| 2 Statistische Auffälligkeit | Brauereieigene Baselines je Sorte: Gärverlauf, Sudhausausbeute, Schwand, Energie/Wasser je hl, Absatztrend je Kunde (Median/MAD, EWMA/CUSUM) | viele Sude je Sorte bzw. ≥ 12 Monate Absatz | mittel (Backtest + Bewertung) | mittel; **Branchenrichtwerte taugen nicht als Schwelle**: Sudhausausbeute in einer österreichischen Abfrage 46,7–67,1 % [Q24], Energie-Benchmarks (207 MJ/hl Durchschnitt, Best Practice 141 MJ/hl und 3,3 hl Wasser/hl) stammen aus Brauereien > 0,5 Mio. hl [Q23] | mittel | nach Pilotdaten |
| 3 KI-Ursachenanalyse | Sprachmodell verknüpft gleichzeitige Abweichungen zu Hypothesen mit Datenbelegen | Befunde aus 1/2 plus Kontext (Hefegeneration, Rohstoffcharge) | niedrig (nur Nutzerbewertung) | hoch (plausibel, aber falsch) | mittel–hoch | nur als „Hypothese“, nie handelnd |
| 4 Prognosemodell | z. B. Zeit bis Schlauchreife aus den ersten 48 h Gärkurve; Absatzprognose je Sorte | dichte Sensordaten über viele Sude [Q21][Q22], mehrjährige Absatzhistorie | gut (Backtest) | mittel | hoch | erst mit Daten aus Pilot |

Keine Werbeaussage „KI erkennt Probleme früher“, bevor Präzision und Vorlauf in Pilotbrauereien gemessen sind.

### Wettbewerb im Marketing-Teil (nur Belegtes)

- Generisch: Canva [Q32], Simplified mit Bierwerbung und Craft-Brauerei-Kalender [Q34], PosterMyWall (Fallstudie einer Craft-Brauerei, Herstellerblog) [Q35].
- Agenturen mit KI: Butter für Bitburger-Tochter Craftwerk [Q36]; Beck's nutzte ChatGPT und Midjourney für eine Kampagne [Q36].
- Eine deutschsprachige, brauereispezifische KI-Marketing-SaaS habe ich in den Suchen nicht gefunden. Das ist kein Beweis, dass es keine gibt.

---

## (c) Bewertete Funktionsideen

Legende: ZB = Zahlungsbereitschaft. Aufwand S/M/L/XL ≈ 1 / 2–4 / 4–8 / > 8 Personenwochen (Annahme). Priorität: J = jetzt, 3M = nächste 3 Monate, 12M = 6–12 Monate, N = vorerst nicht.

| # | Funktion | Kundenproblem | Zielgruppe | ZB (Begründung) | Aufwand | Daten | Integration | Sicherheit/Compliance | Wartung | Differenzierung (Beleg) | Startup-tauglich | Prio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 | Kampagnenkalender aus Sortiment und Saison (Bockbier, Maibock, Oktoberfest, Weihnachtsbier, Tag des Bieres, lokale Feste) mit Vorproduktion | Content entsteht spontan, Saisonbiere ohne Bilder (Annahme) | 1.000–200.000 hl | mittel: macht den Tarif zur Routine statt Einzelkauf (Annahme) | M | vorhanden (Sortiment, Anlässe) | keine | gering | gering | generische Kalender existieren [Q34]; Sortimentsbezug fehlt dort | ja | J/3M |
| F2 | Gastro-Partner-Kit: Tischaufsteller, Getränkekarten-Seite, Social-Posts im Namen des Wirts mit Bier aus dem Sortiment | Brauerei unterstützt Gastro-Kunden mit Werbemitteln (Annahme; Getränkekarte gilt als Werbemittel, schwache Quelle [Q41]) | Brauereien mit Gastro-Geschäft | mittel–hoch, wenn es Absatz in der Gastro hält (Annahme) | M | Sortiment + Partnerlogo | keine | Werberat-Regeln [Q31] | gering | keine brauereispezifische Lösung gefunden | ja | 3M |
| F3 | Vertriebsunterlagen für Handel/GFGH (Neuheiten-Sheet, Produktdatenblatt) aus „Meine Biere“ | Unterlagen werden pro Listung neu gebaut (Annahme) | mittlere Brauereien | mittel | S–M | Sortiment; Stammdaten über getITEM [Q17] | optional getITEM | gering | gering | – | ja | 12M |
| F4 | Alkoholwerbe- und Claim-Check vor Export (Werberat 2026 Abschnitte 1–10, „bekömmlich“, Altersanmutung, Sportler, Fahren, Arbeitsplatz, Starkbier-Alkoholgehalt; auch für Bildszenen der Anlass-Vorlagen) | Abmahn- und Rügerisiko [Q30][Q31] | alle | mittel: kaum separat verkäuflich, stärkt Vertrauen und Verlängerung | S–M (Agent 4 baut `src/lib/compliance`) | Texte, Bild-Metadaten | keine | senkt Risiko; keine Rechtsberatung versprechen | Regeländerungen pflegen | generische Tools prüfen deutsches Alkoholwerberecht nicht (nicht belegt, aber in keiner Quelle erwähnt) | ja | J |
| F5 | Produkttreue-Prüfung: Glas, Schaum, Gebinde, Etikett gegen Sortiment automatisch prüfen, Fehlbilder nicht berechnen | Falsches Glas/falsche Flasche zerstört Vertrauen beim Brauer | alle | indirekt hoch (Kern des Vorsprungs) | M–L | Referenzfotos vorhanden | keine | gering | Modellwechsel | interner Vorsprung | ja | J/3M |
| F6 | Wirkungs-Rückkanal: Instagram-Kennzahlen je Motiv | Niemand weiß, welche Motive wirken | aktive Social-Media-Brauereien | mittel (Annahme) | M | Instagram-Verbindung existiert; Insights-Zugriff nicht geprüft | Meta-API (Berechtigungen prüfen) | DSGVO, Plattform-AGB | mittel | generische Social-Tools | bedingt | 12M |
| F7 | Hopfen Hugo als Daten-Copilot statt Allzweck-Chat (nur Sortiment, Kalender, Befunde) | Allzweck-Chat ist austauschbar und kostet | alle | niedrig separat; senkt Kosten | S | vorhanden | keine | geringere Missbrauchsfläche | gering | ohne Datenbezug keine | ja | 3M |
| F8 | **Absatz-Frühwarnung je Kunde** aus ERP-/GEDAT-Export plus Aktionspaket (F2) | Rückgang bei Gastro-/GFGH-Kunden fällt spät auf (Annahme; BeverageONE verkauft genau „Vertriebsaktionen mit Alarmfunktion“ [Q19]) | 5.000–200.000 hl mit Vertrieb (Annahme) | **hoch**, wenn Treffer Umsatz retten; Geldwert direkt messbar | M (Concierge: S) | GEDAT-Absatzmeldungen liegen vor [Q17] | CSV | Kundendaten pseudonymisieren (DSGVO) | mittel | BeverageONE [Q19] für Dynamics/SAP-Kunden; leichtgewichtige Lösung für Mittelstand nicht gefunden | ja | 3M |
| F9 | **Gärprotokoll-Wächter** (CSV/Brewfather, Regeln je Sorte) | Stockende oder zu warme Gärung wird spät bemerkt (Annahme) | 1.000–50.000 hl ohne Leitsystem (Annahme) | mittel (Fehlsud kostet; Höhe unbekannt) | M (Concierge: S) | Excel/Papier, Brewfather [Q14] | CSV, Brewfather-API | read-only, keine Freigaben | mittel | Brewfather selbst [Q14], BrewIQ [Q21] mit Hardware | ja | 3M |
| F10 | Kennzahlen-Baselines: Sudhausausbeute, Schwand, Energie/Wasser je hl | Verluste und Energie je hl ohne Vergleich | 5.000–200.000 hl | mittel–hoch bei Energiekosten [Q4] | L | Zählerstände, Sudprotokolle | CSV | gering | mittel | Brewmaxx „Output and Loss Monitoring“ (Fallstudie Egger) [Q13] für Großanlagen | bedingt | 12M |
| F11 | Biersteuer-Monatsübersicht und Fristerinnerung (nur Vorbereitung) | Frist am 7. des Folgemonats [Q7] | Brauereien ohne ERP-Funktion | mittel | M | Ausstoß/Abfüllung | CSV | **Haftung**: keine Steuerberatung, keine Abgabe | mittel (Rechtsänderungen) | Drink-IT „Alkoholbilanz“ [Q10], BrewMan [Q38] | bedingt | 12M (nur auf Nachfrage) |
| F12 | KI-Ursachenhypothesen (Stufe 3) | Ursache einer Abweichung unklar | wie F9/F10 | unklar | M–L | Befunde aus F9/F10 | – | Halluzinationsrisiko | mittel | – | erst mit Daten | 12M |
| F13 | Prognosen (Stufe 4) | Planung von Tankbelegung/Absatz | größere Brauereien | unklar | XL | Sensorik [Q21][Q22] | Sensor-APIs | gering | hoch | Leitsystem-/ERP-Anbieter | nein | N |
| F14 | Chargenrückverfolgung/QM-Akte | Pflicht zur Rückverfolgbarkeit [Q8][Q9] | alle | hoch, aber im ERP schon gekauft [Q9][Q10] | XL | ERP | tief | **hoch** (Pflichtdokumentation) | hoch | ERP-Anbieter | nein | N |
| F15 | Segment- und Länderausbau: AfG/Mineralbrunnen (Gebinde schon im Katalog), Österreich [Q37] | Markt zu klein (Rechnung oben) | Getränkehersteller | wie Marketing-Kern | S–M | vorhanden | keine | Werberecht je Land | gering | – | ja | 3M (Marktprüfung) |

---

## (d) Priorisierte Roadmap

### Jetzt (0–4 Wochen)

1. **Fachkorrekturen übernehmen** (Abschnitt f), zuerst NRW-Geometrie und Euroflaschen-Höhe, weil sie direkt im Bildprompt stehen.
2. **Preisangabe Video korrigieren** (Seedance 2.5, Abschnitt f, Nr. 9).
3. **Alkoholwerbe-Check (F4)** aus dem Compliance-Modul von Agent 4 in Textvorschlag und Export einbinden.
4. **Messen statt vermuten:** Ereignisse „heruntergeladen“, „kopiert“, „als veröffentlicht markiert“ je Workspace erfassen; Dashboard-Kachel „diesen Monat erstellt/verwendet“. Ohne diese Zahl ist kein MVP-Erfolgskriterium prüfbar.
5. **10–15 Problem-Interviews** (Gründer persönlich; Fragenliste im Konzept, Abschnitt 9), Ziel: Marketingbudget, Personal, Datenlage, teuerste Abweichung des letzten Jahres. Daraus 3–5 Pilotbrauereien auswählen.

### Nächste 3 Monate

1. **F1 Kampagnenkalender** (Monatsplan je Bier aus Sortiment + Anlass-Vorlagen, Vorproduktion mit einem Klick).
2. **F2 Gastro-Partner-Kit** mit drei Formaten (Tischaufsteller A6, Getränkekarten-Seite, quadratischer Post mit Partnerlogo).
3. **F8 Absatz-Frühwarnung als Concierge-Test** (CSV-Export → manuelle Auswertung → monatlicher Report), kein Produktbau vor Erfolgskriterium.
4. **F9 Gärprotokoll-Wächter als Concierge-Test** (Google-Sheet/CSV oder Brewfather, Regeln mit dem Braumeister).
5. **F7** Assistent auf BrewAI- und Brauerei-Aufgaben eingrenzen.
6. **F15** Marktprüfung AfG/Mineralbrunnen und Österreich (Anzahl, Ansprechpartner, Werberecht).

### 6–12 Monate (nur wenn die Tests bestehen)

1. CSV-Import als Produkt (Konzept Abschnitte 3–4), Regeln Stufe 1 mit Bewertungsfunktion, Wochen-Mail.
2. Statistik Stufe 2 (F10) mit Backtest auf Pilotdaten.
3. Connectoren: Brewfather, danach Business Central (Drink-IT-Kunden) je Kunde.
4. Stufe 3 Hypothesen mit Feedback; read-only MCP/API.
5. F3, F6, F11 nach Nachfrage aus den Piloten.

Konkrete nächste Entwicklungsschritte (in dieser Reihenfolge): (1) Diffs aus Abschnitt f, (2) Tracking-Ereignisse, (3) Datenmodell `findings` + Bewertungs-UI als kleiner Prototyp ohne Import (Befunde werden im Concierge-Test manuell angelegt; so ist die spätere Oberfläche schon im Pilot sichtbar), (4) Kalender-Ansicht auf Basis der Anlass-Vorlagen.

---

## (e) MVP-Vorschläge

Alle Zielwerte sind Vorschläge (Annahme) und vor Pilotstart mit dem Gründer festzulegen. Zahlungsbereitschaft wird nicht geschätzt, sondern im Test mit einem echten Angebot gemessen.

### MVP 1 – Kampagnenkalender + Gastro-Partner-Kit

- **Hypothese:** Brauereien mit 1.000–100.000 hl nutzen BrewAI regelmäßig, wenn es aus Sortiment und Saison einen fertigen Monatsplan samt Gastro-Material liefert.
- **Erfolgskriterium:** Mindestens 3 von 5 Piloten verwenden in zwei aufeinanderfolgenden Monaten je ≥ 8 BrewAI-Motive (Tracking „heruntergeladen/veröffentlicht“); mindestens 2 Piloten nehmen am Ende ein Angebot zum Listenpreis an; selbst berichtete Zeit für Content sinkt gegenüber dem Ausgangsinterview um mindestens die Hälfte.
- **Testaufbau:** 5 Brauereien (gemischt Bayern/BW/NRW, mindestens 2 mit Gastro-Geschäft), 8 Wochen kostenlos gegen Ausgangsinterview, wöchentliche 15-Minuten-Rückmeldung und Abschlussgespräch mit Preisangebot.
- **Abbruch:** In Woche 6 weniger als 2 aktive Piloten oder kein Pilot bereit zu zahlen.

### MVP 2 – Absatz-Frühwarnung (Concierge)

- **Hypothese:** Vertriebsleiter mittelständischer Brauereien bemerken Absatzrückgänge einzelner Gastro- und GFGH-Kunden zu spät; ein Monatsreport aus vorhandenen Exporten liefert mindestens einen handlungsrelevanten Fall pro Monat.
- **Erfolgskriterium:** Je Pilot mindestens 1 Meldung pro Monat, die der Vertriebsleiter als „berechtigt und neu“ bewertet; Präzision (berechtigte Meldungen/alle Meldungen) ≥ 50 %; mindestens 3 von 5 Piloten wollen nach 3 Monaten weitermachen und nennen im Abschlussgespräch einen Preis.
- **Testaufbau:** 3–5 Brauereien mit 5.000–200.000 hl, die GEDAT-Absatzmeldungen oder ERP-Auswertungen je Kunde erhalten [Q17]. Monatlicher CSV-Export (Kundennummer statt Name), Auswertung mit Regel „3 Monate unter Vorjahresmonat“ plus robuste Trendabweichung, Report als PDF, Bewertung jeder Meldung. Auftragsverarbeitungsvertrag mit Agent 4.
- **Abbruch:** Präzision < 30 % nach zwei Zyklen oder bei 3 von 5 Piloten keine Daten beschaffbar.

### MVP 3 – Gärprotokoll-Wächter (Concierge)

- **Hypothese:** In Brauereien ohne Leitsystem werden auffällige Gärverläufe (stockend, zu warm, Endvergärung nicht erreicht) später erkannt als nötig; Regeln auf täglichen Einträgen melden Fälle früher.
- **Erfolgskriterium:** Über alle Piloten mindestens 1 berechtigte Meldung je Brauerei in 8 Wochen; höchstens 1 unberechtigte Meldung pro Woche und Brauerei; Pflegeaufwand ≤ 5 Minuten pro Tag.
- **Testaufbau:** 3–5 Brauereien mit 1.000–50.000 hl ohne Leitsystem; Eingabe in vorbereitetes Google-Sheet/CSV oder Brewfather [Q14]; Schwellen je Sorte mit dem Braumeister festgelegt; tägliche automatische Prüfung, Meldung per E-Mail, Bewertung per Klick.
- **Abbruch:** Nach 4 Wochen pflegen weniger als 3 Piloten die Daten, oder nach 8 Wochen gibt es keine einzige berechtigte Meldung.

### MVP 4 – Alkoholwerbe-Check (klein, sofort)

- **Hypothese:** Marketingverantwortliche wollen vor der Veröffentlichung eine Prüfung gegen Werberat-Regeln und Claim-Verbote.
- **Erfolgskriterium:** ≥ 60 % der Exporte laufen durch den Check; unberechtigte Hinweise < 20 % (Nutzerbewertung).
- **Testaufbau:** Für alle Bestandskunden einschalten, Hinweis statt Sperre, Bewertung „hilfreich/falsch“.
- **Abbruch:** Unberechtigte Hinweise > 40 % nach 4 Wochen.

---

## (f) Änderungswünsche (fachliche Korrekturen) mit Diff-Vorschlag

Dateien gehören Agent 3 (Brauwissen) bzw. Agent 1/4 (Abrechnung, Assistent). Zusammenführung durch den Orchestrator. Priorität: H = hoch, M = mittel, N = niedrig.

### 1 (H) NRW-Flasche: Geometrie widerspricht der Beschreibung und landet im Prompt

`geometry_profile` wird als „Container geometry: …“ in den Bildprompt geschrieben (`src/lib/prompts/prompt-compiler/assemble-master-prompt.ts:130`, `src/lib/inhalte-erstellen/image-prompt-v3.ts:91`). Beim NRW steht dort „breiter Körper, kurze ausgeprägte Schulter, vergleichsweise kurzer Hals“, in `promptDescription` dagegen schlanker Körper und sanfte Schulter. Maße laut VLB: NRW 0,5 l braun 260 mm hoch, Ø 67,5 mm [Q25].

```diff
--- a/src/app/(dashboard)/inhalte-erstellen/lib/brewing-knowledge.ts
+++ b/src/app/(dashboard)/inhalte-erstellen/lib/brewing-knowledge.ts
@@ nrw_500
-    geometry_profile: "breiter Körper, kurze ausgeprägte Schulter, vergleichsweise kurzer Hals, Kronkorken",
+    geometry_profile: "schlanker Körper (Ø ca. 67,5 mm, Höhe ca. 26 cm), mittellanger Hals, sanfte allmähliche Schulter, Kronkorken",
```

### 2 (H) Euroflasche 0,5 l ist rund 23 cm hoch, nicht 25–26 cm

VLB: Euro 0,5 l braun 228 mm hoch, Ø 70,5 mm, also niedriger und breiter als NRW [Q25]. Der Schlüssel heißt `vichy_500`, das Label „Euroflasche“: Schlüssel wegen gespeicherter Sortimente nicht umbenennen, aber kommentieren.

```diff
@@ vichy_500
+  // Schlüssel historisch „vichy_500“, gemeint ist die Euroflasche (VLB: 228 mm, Ø 70,5 mm). Nicht umbenennen (gespeicherte Sortimente).
   vichy_500: bottle({
     label: "Euroflasche 0,5 l",
@@
-      "a 0.5 litre traditional German Euroflasche / Euro-Bierflasche (the classic stocky returnable beer bottle): a full-size half-litre bottle with a VERY SHORT neck, a strongly pronounced rounded shoulder and straight vertical cylindrical body walls, sealed with a 26 mm metal crown cap, total height roughly 25–26 cm — noticeably stockier and far shorter-necked than the slim NRW returnable or the long-neck",
+      "a 0.5 litre traditional German Euroflasche / Euro-Bierflasche (the classic stocky returnable beer bottle): a full-size half-litre bottle with a VERY SHORT neck, a strongly pronounced rounded shoulder and straight vertical cylindrical body walls about 7 cm wide, sealed with a 26 mm metal crown cap, total height roughly 23 cm (about 3 cm shorter than the NRW) — noticeably stockier and far shorter-necked than the slim NRW returnable or the long-neck",
```

### 3 (H) „Die NRW ist höher als der Longneck“ ist falsch

VLB: Longneck 0,5 l 270 mm, Ø 68,5 mm; NRW 0,5 l 260 mm, Ø 67,5 mm; „Ale und LGN sind in der Praxis nicht zu unterscheiden“ [Q25].

```diff
@@ longneck_500
-      "NOT a German NRW returnable (the NRW is taller, slimmer and has a SMOOTH gradual sloping shoulder with a long slender nearly-straight body), NOT a short stocky Euroflasche, NOT a short stubby Steinie/Stubbi, NOT a small 0.33 L bottle, NOT a swing-top bottle, NOT an aluminium can — it MUST be the Ale long-neck with a more pronounced rounded shoulder",
+      "NOT a German NRW returnable (the NRW is about 1 cm shorter, with a shorter, thicker neck and a SMOOTH gradual sloping shoulder), NOT a short stocky Euroflasche, NOT a short stubby Steinie/Stubbi, NOT a small 0.33 L bottle, NOT a swing-top bottle, NOT an aluminium can — it MUST be the Ale long-neck (about 27 cm) with a long slim neck and a more pronounced rounded shoulder",
```

### 4 (M) IPA zu dunkel

BJCP 2021, 21A American IPA: „medium gold to light reddish-amber“, SRM 6–14 [Q26]. Heute „deep amber to copper“ und Hex #D4843A (kupfrig). Hex-Wert ist ein Vorschlag, bitte visuell gegen die Farbreferenz (`beerColorReference`) prüfen.

```diff
--- a/src/lib/beverages/beer-appearance.ts
+++ b/src/lib/beverages/beer-appearance.ts
@@ ipa
-    srm: "8–14",
-    hex: "#D4843A",
-    liquid: "deep amber to copper IPA with slight haze and warm orange-amber clarity",
+    srm: "6–14",
+    hex: "#E0A040",
+    liquid: "medium gold to light reddish-amber IPA, clear to very slightly hazy, bright golden-orange glow when backlit",
```

### 5 (N) Schwarzbier: SRM-Spanne

BJCP 8B: SRM 19–30, „almost never truly black“ [Q27]. Beschreibungstext ist bereits richtig.

```diff
@@ schwarzbier
-    srm: "25–35",
+    srm: "19–30",
```

### 6 (M) Radler: keine „citrus particles“

Radler ist Bier mit Zitronenlimonade, je nach Limonade klar oder naturtrüb; Fruchtpartikel sind untypisch (fachliche Einschätzung, keine externe Quelle geprüft).

```diff
@@ radler
-    liquid: "hazy pale golden-lemon Radler with cloudy lemon-gold body and subtle citrus particles",
+    liquid: "pale golden-lemon Radler (beer mixed with lemon soda), clear or naturally cloudy depending on the lemonade, no fruit pulp or particles",
```

### 7 (M) Zitronenscheibe kein Standard-Requisit beim Weißbier

Die Zitrone war ein Behelf gegen bittere Hefereste und ist heute nicht mehr nötig [Q29]; viele Brauer lehnen sie ab, weil sie den Schaum zerstört (fachliche Einschätzung des Brauerhandwerks). „Bananenblätter“ ist kein üblicher Bezug zur Bananennote. Nur auf ausdrücklichen Wunsch einsetzen.

```diff
--- a/src/app/(dashboard)/inhalte-erstellen/lib/brewing-knowledge.ts
@@ STUDIO_PROPS_BY_BIERSTIL
-  hefeweizen: ["Zitronenscheibe", "frische Weizenähren", "Bananenblätter dezent"],
-  kristallweizen: ["Zitronenscheibe", "Weizenähren"],
+  hefeweizen: ["frische Weizenähren", "Brezn", "Holztisch im Biergarten"],
+  kristallweizen: ["Weizenähren", "Wassertropfen am Glas"],
@@
-  saison: ["Pfefferkörner", "Koriandersamen", "getrocknete Kräuter"],
+  saison: ["rustikales Bauernbrot", "getrocknete Wiesenkräuter", "Pfefferkörner"],
```

(Saison: Koriander ist das Kennzeichen des Witbiers, nicht der Saison; fachliche Einschätzung, niedrig.)

### 8 (M) Stil-Erkennung: „Pils-Radler“ wird zum Pils, „Alster“ fehlt

In `NAME_STYLE_HINTS` steht `pils` vor `radler`. „Pils Radler“/„Pilsradler“ bekommt dadurch Pils-Farbe und Pilstulpe. Norddeutsch heißt Radler „Alster“.

```diff
--- a/src/app/(dashboard)/inhalte-erstellen/lib/beer-styles.ts
@@ NAME_STYLE_HINTS
   { pattern: /bock/, bierstil: "bock" },
+  { pattern: /radler|alster/, bierstil: "radler" },
   { pattern: /pils/, bierstil: "pils" },
   { pattern: /koelsch|kölsch/, bierstil: "koelsch" },
   { pattern: /altbier/, bierstil: "altbier" },
-  { pattern: /radler/, bierstil: "radler" },
```

Test ergänzen: `inferBierstilFromName("Pils Radler") === "radler"`, `inferBierstilFromName("Alsterwasser") === "radler"`.

Weitere Hinweise ohne Diff (N): Weizenbock gibt es auch hell (BJCP 10C: „Pale versions are gold to amber“, SRM 6–25 [Q28]); der Katalog kennt nur die dunkle Variante, ein helles Weizenbock (z. B. aus dem Sortiment) wird dunkel gerendert. Altbier wird traditionell im Becher serviert, der niedriger und breiter ist als die Kölsch-Stange (fachliche Einschätzung); eigener Glastyp „Altbierbecher“ prüfen. Rauchbier-Requisit „Holzkohle“ besser „Buchenholzscheite“ (Rauchmalz wird über Buchenholz gedarrt; Einschätzung, Quelle nicht geprüft).

### 9 (H) Preisangabe Video passt nicht zur Abrechnung (Agent 1, `src/lib/billing`)

`SEEDANCE_VIDEO_TOKEN_HINT` sagt „Seedance 2.5 · 720p · 5 s · mit Audio kostet 100 Tokens“, die Tarifkarte wirbt mit „Videos erstellen mit Seedance 2.5“. `calculateSeedanceVideoTokenCost` rechnet für eine Modell-ID mit „2.5“ den Faktor 1,5: ⌈5 × 16 × 1,5 × 1,25⌉ = **150 Tokens**. Die Studio-Oberfläche (`video-generation-studio.tsx`) und `api/generation/submit` übergeben die Modell-ID; `formatPlanVideoEstimate` rechnet ohne Modell-ID (Faktor 1). Im Start-Tarif sind mit Seedance 2.5 also 3–8 statt „5–12“ Videos möglich (Rechnung). Preisangaben müssen zur tatsächlichen Abrechnung passen (Agent 4 bitte rechtlich einordnen).

```diff
--- a/src/lib/billing/planCatalog.ts
+++ b/src/lib/billing/planCatalog.ts
 export const SEEDANCE_VIDEO_TOKEN_HINT =
-  "Ein Standard-Video (Seedance 2.5 · 720p · 5 s · mit Audio) kostet 100 Tokens — Varianten und längere Clips multiplizieren 1:1.";
+  "Ein Standard-Video (720p · 5 s · mit Audio) kostet mit Seedance 2 100 Tokens, mit Seedance 2.5 150 Tokens — Varianten und längere Clips multiplizieren 1:1.";
--- a/src/lib/billing/generationTokenCost.ts
+++ b/src/lib/billing/generationTokenCost.ts
@@ export function formatPlanVideoEstimate(monthlyTokens: number): string {
   const longCost = calculateSeedanceVideoTokenCost({
     resolution: "720p",
     duration: 12,
     generateAudio: true,
+    modelId: "seedance-2.5",
   });
```

Zusätzlich prüfen (N): `STUDIO_PLANS[].yearly` (65/125/249/499) wird von `getPlanDisplayMonthlyPrice` nicht verwendet; sicherstellen, dass dieser Wert nirgends als Preis angezeigt wird oder ihn entfernen.

### 10 (M) Assistent eingrenzen (Agent 4, `src/lib/assistant/hopfenHugoPolicy.ts`)

Produktentscheidung, kein Fehler: Ein Allzweck-Chat ist austauschbar, kostet API-Geld und vergrößert die Missbrauchsfläche.

```diff
-    "- Du darfst zu fast allen harmlosen Themen antworten: Erklärungen, Brainstorming, Texte, Marketing, Brauerei, Social Media, Dashboard-Hilfe, Prompt-Ideen, Formate, Markenlook.",
+    "- Du hilfst bei BrewAI, Brauerei-Marketing, Bier und Brauwesen, Social Media, Prompt-Ideen und Markenlook. Bei themenfremden Fragen antworte in einem Satz, dass du dafür nicht gedacht bist, und schlage eine passende BrewAI-Aufgabe vor.",
```

`HOPFEN_HUGO_GREETING` entsprechend ohne „oder allgemeinen Themen“.

### 11 (M) Anlass-Vorlage „Vatertag-Tour“ entschärfen (Agent 3, `occasion-templates.ts`)

Die Vorlage beschreibt eine Männerrunde mit Handwagen. Das ist das typische Bild des Vatertags-Trinkens; Werberat 1.1 verbietet, missbräuchlichen Konsum zu fördern oder zu verharmlosen, 2.2 verlangt optisch junge Erwachsene oder älter [Q31]. Kein Verbot des Anlasses, aber das Motiv sollte maßvollen Genuss zeigen.

```diff
@@ id: "vatertag"
-      promptNote: "Father's Day outing tradition, friends on a countryside walk with a handcart, relaxed celebration",
+      promptNote: "Father's Day outing tradition, adult friends (clearly in their thirties or older) on a relaxed countryside walk with a picnic, moderate enjoyment with one beer each, no crates or kegs piled on a handcart, no signs of drunkenness",
```

Ebenso prüfen (ohne Diff): Bildszenen mit Brauern, die im Sudhaus oder an Maschinen trinken (Werberat 5: situative Nüchternheit am Arbeitsplatz), und Texte zu Starkbier/Doppelbock, die den Alkoholgehalt als Kaufgrund herausstellen (Werberat 7.1). „Tag des Bieres · 23. April · Reinheitsgebot“ ist fachlich korrekt.

---

## (g) Quellenverzeichnis (alle abgerufen am 09.11.2026)

„Suchauszug“ = Inhalt aus dem Suchergebnis, Seite nicht vollständig gelesen.

- [Q1] Destatis, Pressemitteilung Nr. 037 vom 02.02.2026, „6,0 % weniger Bier im Jahr 2025 abgesetzt“ – https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/02/PD26_037_73.html (gelesen)
- [Q2] Destatis, Zahl der Woche Nr. 32 vom 04.08.2026, „Zahl der Brauereien auf 1 415 im Jahr 2025 gesunken“ – https://www.destatis.de/DE/Presse/Pressemitteilungen/Zahl-der-Woche/2026/PD26_32_p002.html (gelesen)
- [Q3] Deutscher Brauer-Bund, „Deutsche Brauwirtschaft in Zahlen“, Stand 10.04.2024 – https://brauer-bund.de/wp-content/uploads/2024/04/STATIST-2023.pdf (gelesen)
- [Q4] Lebensmittelpraxis (mit dpa), 22.04.2026, „Biermarkt unter Druck – Deutsche Brauer erwarten auch 2026 ein schwieriges Jahr“ – https://lebensmittelpraxis.de/industrie-aktuell/48425-biermarkt-unter-druck-deutsche-brauer-erwarten-auch-2026-ein-schwieriges-jahr.html (gelesen); ergänzend Tageskarte, „Brauer-Bund rechnet mit weiter steigenden Bierpreisen“ – https://www.tageskarte.io/industrie/detail/brauer-bund-rechnet-mit-weiter-steigenden-bierpreisen.html (Suchauszug, nicht verwendet)
- [Q5] Private Brauereien Bayern e. V., Pressestatement Dezember 2025 – https://www.deutscher-hopfen.de/wp-content/uploads/2025/12/Pressestatement-Private-Brauereien-Bayern-e.-V.pdf (Suchauszug)
- [Q6] § 2 BierStG (Steuertarif, Mengenstaffel) – https://www.buzer.de/2_BierStG.htm (gelesen)
- [Q7] § 15 BierStG (Steuererklärung, Fälligkeit) – https://www.buzer.de/15_BierStG.htm (gelesen)
- [Q8] Verordnung (EG) Nr. 178/2002, Art. 18 Rückverfolgbarkeit – https://eur-lex.europa.eu/eli/reg/2002/178/oj (Standardfundstelle, in dieser Sitzung nicht abgerufen)
- [Q9] CIO, „Flensburger Brauerei entscheidet sich gegen SAP“ – https://www.cio.de/article/3659864/flensburger-brauerei-entscheidet-sich-gegen-sap.html; Computerwoche zu Drink-IT – https://www.computerwoche.de/article/2685929/flensburger-brauerei-nutzt-branchenloesung-drink-it-von-amball.html (Suchauszug)
- [Q10] Aptean, Drink-IT / Beverage ERP – https://www.aptean.com/de-DE/solutions/erp/products/aptean-beverage-erp-drink-it; Einbecker-Fallstudie – https://www.aptean.com/de-DE/insights/success-story/drink-it-erp-success-story-discover-the-digital-transformation-of-einbecker (Suchauszug, Herstellerangaben)
- [Q11] SoftGuide, CSB-System ERP-Branchenlösung Getränke – https://www.softguide.de/programm/erp-branchenloesung-getraenke (Suchauszug)
- [Q12] SoftGuide, Ausschreibung „Brauerei sucht Warenwirtschaftssystem (ERP)“ – https://www.softguide.de/ausschreibungen/brauerei-sucht-warenwirtschaftssystem-erp (Suchauszug)
- [Q13] ProLeiT, brewmaxx – https://www.proleit.com/brewmaxx-basic-systems; Wikipedia „Brewmaxx“ – https://en.wikipedia.org/wiki/Brewmaxx; Fallstudie Egger – https://www.proleit.com.br/media-center/file/download/egger-traceability-smoothly-combined-with-output-and-loss-monitoring/?lang=1 (Suchauszug, Herstellerangaben)
- [Q14] Brewfather API-Dokumentation (v2) – https://docs.brewfather.app/api (gelesen); v1 – https://docs.brewfather.app/api/v1 (Suchauszug, abgekündigt)
- [Q15] GetApp, Ekos – https://www.getapp.com/brewery-software/a/ekos-brewmaster; Arryved, Ekos-Integration – https://support.arryved.com/portal/en/kb/articles/ekos (Suchauszug)
- [Q16] Microsoft Learn, „API (v2.0) for Dynamics 365 Business Central“ – https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/api-reference/v2.0/ (gelesen)
- [Q17] about-drinks, „Westerwald-Brauerei schließt sich an das GDSN mit getITEM an“, 15.03.2023 – https://www.about-drinks.com/westerwald-brauerei-schliesst-sich-an-das-gdsn-mit-getitem/ (gelesen); Meininger, „Freier Zugriff auf Artikelstammdaten für den GFGH“ – https://www.meininger.de/alkoholfreie-getraenke/handel/freier-zugriff-auf-artikelstammdaten-fuer-den-gfgh (Suchauszug, Quelle der Zahl „80 Hersteller“)
- [Q18] erp-software.org, ERP für Getränkehandel – https://erp-software.org/branchen/erp-fuer-grosshandel/erp-getraenkehandel/ (Suchauszug)
- [Q19] ORBIS, BeverageONE Onepager – https://orbis.de/fileadmin/dateien/de/downloads/Multipager/2410-SOL-Onepager-BeverageONE.pdf (Suchauszug, Herstellerangaben)
- [Q20] it-daily, Warsteiner digitale Vertriebswege (maiTour) – https://www.it-daily.net/it-management/digitalisierung/warsteiner-digitale-vertriebswege (Suchauszug)
- [Q21] PRWeb, Sennos BrewIQ M3 Sensor Stack – https://www.prweb.com/releases/sennos-unveils-breakthrough-fermentation-intelligence-platform-and-next-gen-sensor-stack-302428938.html (Suchauszug, Herstellerangaben)
- [Q22] IoT Use Case, Gärüberwachung mit Endress+Hauser/Netilion – https://www.iotusecase.com/en/solution-examples/beer-brewers-benefit-from-fermentation-monitoring (Suchauszug)
- [Q23] Campden BRI, Benchmarking energy and water use – https://www.campdenbri.co.uk/research/energy-water-use-brewing.php; ASBC 2012 – https://asbcnet.org/events/archives/2012Proceedings/Pages/213.aspx; Sustainable Brands – https://sustainablebrands.com/read/new-global-brewers-survey-shows-industry-making-notable-reductions-in-water-energy-use (Suchauszug)
- [Q24] BMF Österreich, Findok (Sudhausausbeute in Verfahren) – https://findok.bmf.gv.at/findok/iwg/118/118370/118370.1.pdf, https://findok.bmf.gv.at/findok/iwg/139/139796/139796.1.pdf (Suchauszug)
- [Q25] VLB Berlin, „Auflistung von neutralen Standard(pool)flaschen … mit einheitlicher Leergutartikel-GTIN“, Stand Jan. 2025 – https://www.vlb-berlin.org/sites/default/files/2021-05/Einheitliche-Pfandartikelnummern-Standardpoolflaschen-GTIN-Basis_StandApr2021_0.pdf (gelesen; nur die Zeilen NRW 0,5, Euro 0,5, LGN 0,5, Ale 0,5 verwendet, weil die Spalten der übrigen Zeilen im Textauszug verrutscht sind)
- [Q26] BJCP 2021, 21A American IPA – https://www.bjcp.org/style/2021/21/21A/american-ipa/ (gelesen)
- [Q27] BJCP 2021, 8B Schwarzbier – https://www.bjcp.org/style/2021/8/8B/schwarzbier/ (gelesen)
- [Q28] BJCP 2021, 10C Weizenbock – https://www.bjcp.org/style/2021/10/10C/weizenbock/ (gelesen)
- [Q29] t-online, „Weißbier/Weizenbier: Tradition mit feinporigem Schaum“ – https://www.t-online.de/leben/id_77858860/weissbier-weizenbier-tradition-mit-feinporigem-schaum.html (Suchauszug)
- [Q30] LTO, „BGH: Bier darf nicht als bekömmlich angepriesen werden“ (BGH, Urteil vom 17.05.2018, I ZR 252/16) – https://www.lto.de/recht/hintergruende/h/bgh-izr25216-werbung-bier-bekoemmlich-gesundheitsbezogene-angabe-alkohol (gelesen)
- [Q31] Deutscher Werberat, Code of Conduct alkoholhaltige Getränke, „Valid from January 2026“ (engl. Fassung, Abschnitte 1–10) – https://werberat.de/wp-content/uploads/2026/04/DWR-Verhaltensregeln-alkoholhaltige-Getraenke-ab-Januar-2026-englisch_final.pdf (gelesen per `pdftotext`); Alkoholleitfaden 2026 – https://werberat.de/wp-content/uploads/2026/03/Alkoholleitfaden_DWR_Version_2026_V3.1_Einseitig.pdf und Social-Media-Leitlinien – https://werberat.de/wp-content/uploads/2026/05/Social-Media-Guidelines-alcoholic-beverages_August-2024_final.pdf (Suchauszug; Quelle für die Altersschranke)
- [Q32] Profee, Canva-Pro-Preis Deutschland – https://www.profee.com/de/articles/canva-pro-price-in-germany; Finom, Canva-Kosten – https://finom.co/de-de/blog/canva-kosten/ (Suchauszug; offizielle Preisseite nicht geprüft)
- [Q33] Toolradar, Untappd for Business Pricing – https://toolradar.com/tools/untappd-for-business/pricing; BeerMenus Guide – https://www.beermenus.com/blog/260-guide-to-untappd-for-business (Drittquellen, Suchauszug)
- [Q34] Simplified, AI Beer Ads – https://simplified.com/ai-ads-generator/beer-ads-4fd62; Content-Kalender für Craft-Brauereien – https://simplified.com/ai-content-calendar-generator/craft-brewery-owners (Suchauszug)
- [Q35] PosterMyWall-Blog, Florida-Craft-Brauerei – https://www.postermywall.com/blog/2026/04/01/how-a-florida-craft-brewery-uses-postermywall-to-save-7-hours-a-week-on-marketing/ (Suchauszug, Herstellerblog)
- [Q36] W&V, „Butter entwickelt KI-Kampagne für die Bitburger-Tochter Craftwerk“ – https://www.wuv.de/themen/marke/butter-entwickelt-ki-kampagne-fuer-die-bitburger-tochter-craftwerk; Business Punk zu Beck's – https://www.business-punk.com/tech/chatgpt-und-midjourney-becks-braut-bier-mit-ki-support/ (Suchauszug)
- [Q37] Advantage Austria, Bier in Österreich – Eckdaten 2025 – https://www.advantageaustria.org/gi/zentral/branchen/wein_bier_spirituosen/zahlen-und-fakten/Zahlen_und_Fakten.de.html (Suchauszug; nur die Brauereizahl verwendet)
- [Q38] Premier Systems, BrewMan Germany – https://www.premiersystems.com/brewman-germany (Suchauszug, Herstellerangabe)
- [Q39] Meininger, „Studie: Facebook bei Brauereien am beliebtesten“ (research tools/VICO, 2021) – https://www.meininger.de/bier/brauereien/studie-facebook-bei-brauereien-am-beliebtesten (Suchauszug)
- [Q40] Deutscher Brauer-Bund, Stellungnahme vom 16.06.2026 (Lobbyregister) – https://www.lobbyregister.bundestag.de/media/d4/47/810014/Stellungnahme-Gutachten-SG2607090010.pdf (Suchauszug, Interessenvertretung)
- [Q41] Lightspeed, Erstellung Getränkekarte – https://www.lightspeedhq.com/ch-de/blog/erstellung-getrankekarte/ (Suchauszug; schwache Quelle für „Getränkekarte als Werbemittel“)
- [Q42] Statistisches Bundesamt, Fachserie 14 Reihe 9.2.2 „Brauwirtschaft 2021“, Tabelle 3 „Betriebene Braustätten nach Gesamtjahreserzeugung“ – https://www.statistischebibliothek.de/mir/servlets/MCRFileNodeServlet/DEHeft_derivate_00067370/2140922217004_aktualisiert22032022.pdf (gelesen per `pdftotext`; Spalten im Textauszug verschoben, Zuordnung über die Spaltensummen geprüft: 2017 = 1.500, 2018 = 1.542, 2020 = 1.536, 2021 = 1.512)

Nicht gefunden trotz Suche: Marketingbudgets/-personal kleiner und mittlerer Brauereien, Brauwelt-Umfragen zu Digitalisierung, Größenklassen-Tabelle 2024/2025 mit allen Klassen (nur Statista-Bezahlinhalt), aktuelle Brauereizahl Schweiz, Maße der Vichy- und Steinie-Flasche aus verlässlicher Quelle.

---

## (h) Tatsächliche Arbeitsschritte mit Uhrzeiten (lokale Zeit, per `date` geprüft)

| Uhrzeit | Schritt |
|---|---|
| 20:10 | Start, Arbeitsplan `00-arbeitsplan.md` gelesen, Zuständigkeiten geprüft (nur `docs/strategy/**` und dieser Bericht) |
| 20:10–20:13 | Produkt gelesen: `planCatalog.ts`, `generationTokenCost.ts`, `tokenState.ts`, `sidebar-items.ts`, Routenliste `src/app/api/**`, Dashboard-Seiten |
| 20:10–20:12 | Recherche Runde 1 (parallel): Destatis, Brauer-Bund, ProLeiT, Brewfather, Ekos, Brauerei-ERP, BierStV, Privatbrauereien, KI-Marketing-Wettbewerb |
| 20:12–20:13 | Brauwissen gelesen: `beer-styles.ts`, `beer-appearance.ts`, `brewing-knowledge.ts` |
| 20:12–20:15 | Recherche Runde 2: Biersteuer-Mengenstaffel, Energie-/Wasser-Benchmarks, Untappd, Social-Media-Studien, VLB-Flaschenmaße (PDF lokal mit `pdftotext` ausgewertet), Zitrone im Weißbier, GEDAT/GFGH, Sudhausausbeute/Schwand |
| 20:15–20:16 | Assistent-Policy und Anlass-Vorlagen gelesen; Seedance-Abrechnung nachgerechnet (`seedanceTaskInput.ts`, `generation/submit`, `video-generation-studio.tsx`) |
| 20:16–20:19 | Recherche Runde 3: Destatis Zahl der Woche, § 15 BierStG, Sensorik, Brauerei-KI-Tools, Canva-Preise, Brauer-Bund-Statistik-PDF, Werberat 2026, BGH „bekömmlich“, Business-Central-API, Österreich/Schweiz, Außendienst-Software, BJCP 21A/8B/10C |
| 20:20–20:22 | Konzept `docs/strategy/2026-11-09-produktionsdaten-import-konzept.md` geschrieben; Nutzung von `geometry_profile` im Prompt geprüft |
| 20:22–20:27 | Bericht geschrieben, Tabellen auf Spaltenzahl geprüft, Rechnungen nachgerechnet |
| 20:27–20:31 | Nachprüfung zentraler Suchauszüge durch Volltext: Destatis-PM (Q1), GEDAT (Q17), Brewfather v2 (Q14, Korrektur: 500 statt 150 Aufrufe/Stunde, Schreib-Scopes existieren), Größenklassen 2021 (Q42, neu), BGH (Q30), Werberat-Kodex 2026 (Q31, Volltext), § 2 BierStG (Q6), Brauer-Bund-Lage 2026 (Q4, neu: 40 % „Überleben hat Priorität“) |
| 20:31–20:33 | Anlass-Vorlagen gegen Werberat-Kodex geprüft (Vatertag-Motiv), Änderungswunsch 11 ergänzt |
| 20:33 | Abschluss, Übergabe an den Orchestrator |

Keine Git-Schreiboperationen, keine Builds, keine Tests, keine kostenpflichtigen KI-/API-Aufrufe, keine Secrets gelesen.
