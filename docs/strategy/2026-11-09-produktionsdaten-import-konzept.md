# Technisches Konzept: Produktions- und Absatzdaten-Import mit Auffälligkeitserkennung (read-only)

Stand: 2026-11-09 · Verfasser: Agent 5 (Branchenforschung/Produktstrategie) im Master-Audit · Status: **Konzept, nicht freigegeben, kein Code**

Bezug: Bericht `docs/audit/2026-11-09/05-industry-product.md`, Abschnitte (b) bis (e). Quellen dort im Quellenverzeichnis (Kürzel Q1 ff.).

## 1. Ziel und Nicht-Ziele

**Ziel:** BrewAI liest vorhandene Daten einer Brauerei (zuerst Dateien, später Schnittstellen) und weist auf Auffälligkeiten hin, die ein Mitarbeiter sonst später oder gar nicht bemerkt. Jede Meldung zeigt die Daten, auf denen sie beruht, und lässt sich mit „berechtigt / nicht berechtigt / erledigt“ bewerten. Diese Bewertung ist zugleich die Messgröße für den Nutzen.

**Nicht-Ziele (verbindlich):**

- Keine Steuerung, kein Zurückschreiben in Leitsystem, ERP, Waage oder Abfüllung. Kein OPC-UA-Schreibzugriff, keine Sollwerte, keine Rezeptübertragung.
- Keine Biersteuer-Anmeldung und keine steuerliche Beratung. Höchstens eine Monatsübersicht als Vorbereitung mit Fristhinweis (§ 15 Abs. 1 BierStG: Steuererklärung bis zum 7. Tag des Folgemonats, Fälligkeit am 20., Q7).
- Keine Freigabe von Chargen und keine Aussagen zur Lebensmittelsicherheit. Meldungen sind Hinweise an Fachpersonal, keine Entscheidungen.
- Keine „KI-Diagnose“ ohne sichtbare Datengrundlage.

## 2. Reihenfolge der Datenquellen

| Stufe | Quelle | Beleg | Warum in dieser Reihenfolge |
|---|---|---|---|
| V1 | **CSV-Upload** (Excel „Speichern unter → CSV“), feste Vorlagen plus Spaltenzuordnung | – | Für die verbreiteten DACH-Systeme (CSB-System, Drink-IT, GFGH-Branchenlösungen) ist keine öffentliche, mandantenunabhängige API dokumentiert (Q10, Q11, Q18). Ein Export ist in jedem System oder in Excel möglich. Kein neues npm-Paket nötig (Excel-Parsing würde eine Bibliothek erfordern, Entscheidung des Orchestrators). |
| V1 | **Absatzexporte** (ERP oder GEDAT-Absatzmeldeverfahren, monatlich je Kunde/Artikel) | GFGH-Absatzzahlen gehen monatlich über GEDAT an die Brauerei (Q17) | Absatzdaten liegen in mittleren Brauereien bereits strukturiert vor. Ein Absatzrückgang bei einem Gastro-/GFGH-Kunden ist eine Auffälligkeit mit direktem Geldwert. |
| V2 | **Brewfather-API v2** (read-only, nur Scope `batches.read`, Messwerte je Sud) | dokumentiert; HTTP-Basic-Auth mit Nutzer-ID und API-Schlüssel; 500 Aufrufe/Stunde je Schlüssel, ohne Ankündigung änderbar; Schreib- und Lösch-Scopes existieren, werden nicht angefordert; v1 abgekündigt (Q14) | Kleine Brauereien und Gasthausbrauereien; einfache Schlüsselvergabe durch den Kunden. Änderungen der API einplanen. |
| V2/V3 | **Microsoft Dynamics 365 Business Central API v2.0** (REST, online standardmäßig aktiv) | Q16; Drink-IT basiert auf Business Central (Q10) | Nur mit vom Kunden erteilter App-Registrierung im eigenen Mandanten. Branchenfelder von Drink-IT sind nicht öffentlich dokumentiert, daher pro Kunde prüfen. |
| V3 | **OPC UA** (ProLeiT Brewmaxx ab V9.70 mit OPC-UA-Server, Q13) über ein Gateway im Kundennetz, das nur ausgehend und nur lesend Daten schiebt | Q13 (Herstellerangabe, keine technische Doku öffentlich) | OT-Netz: nur mit Kunden-IT, Sicherheitskonzept und Vertrag. Für ein junges Startup frühestens nach belegtem Nutzen aus V1/V2. |
| später | MCP-Server (read-only) für Kunden, die BrewAI-Daten in eigene KI-Werkzeuge holen wollen | – | Erst wenn ein stabiles Datenmodell existiert. |

## 3. Datenmodell (Supabase/Postgres, Vorschlag)

Alle Tabellen tragen `workspace_id` (Mandant) und laufen unter Row Level Security. Kein Zugriff ohne Mitgliedschaft im Workspace; Service-Role nur in serverseitigen Importjobs.

```text
prod_import_batches   id, workspace_id, source ('csv'|'brewfather'|'bc'|...), template ('sud'|'gaerung'|'abfuellung'|'zaehler'|'absatz'),
                      file_sha256, row_count, mapping_version, status ('staged'|'committed'|'rejected'), created_by, created_at
prod_tanks            id, workspace_id, name, kapazitaet_hl, typ ('gaer'|'lager'|'drucktank')
prod_brews            id, workspace_id, import_batch_id, sud_nr, brau_datum, beer_id (→ Sortiment „Meine Biere“), ausschlag_hl,
                      stammwuerze_plato, schuettung_kg, sudhausausbeute_pct (gemeldet oder berechnet, Feld 'quelle'), notiz (nur Daten)
prod_fermentation     id, workspace_id, brew_id, tank_id, gemessen_am, extrakt_plato | sg, temp_c, ph?, druck_bar?, quelle ('manuell'|'sensor'|'api')
prod_packaging        id, workspace_id, datum, beer_id, gebinde_code (→ FLASCHEN_TYPEN/Fass), menge_hl, charge
prod_utilities        id, workspace_id, periode (Monat), zaehler ('strom'|'waerme'|'wasser'|'abwasser'), wert, einheit
sales_lines           id, workspace_id, periode, kunde_ref (pseudonymisiert/Kundennummer), kanal ('gastro'|'gfgh'|'leh'|'direkt'),
                      artikel_ref, menge_hl, umsatz_eur?
detection_rules       id, workspace_id, rule_key, scope (beer_id|tank|kunde|global), parameter JSONB, aktiv, version
findings              id, workspace_id, rule_key, stufe (1 Regel | 2 Statistik | 3 Hypothese), schwere, betreff (brew/tank/kunde),
                      evidenz JSONB (Messpunkte, Baseline, Schwelle), status ('neu'|'berechtigt'|'nicht_berechtigt'|'erledigt'),
                      bewertet_von, bewertet_am, kommentar
```

Hinweise:

- `beer_id` verbindet Produktion und Absatz mit dem bestehenden Sortiment („Meine Biere“). Das ist der eigentliche Nutzen gegenüber einer Insellösung: eine Auffälligkeit im Absatz einer Sorte kann direkt eine Aktion im Marketing-Teil auslösen (z. B. Gastro-Aktionspaket für diese Sorte).
- `kunde_ref` nur als Kundennummer oder Pseudonym. Gastro-Kunden sind oft Einzelunternehmer, Namen sind personenbezogene Daten (DSGVO). Klarnamen bleiben im Quellsystem.
- Rohdateien nach erfolgreichem Import nur befristet aufbewahren (Vorschlag 30 Tage, mit Agent 4 abstimmen), danach nur strukturierte Daten.

## 4. Import-Pipeline

1. **Upload** über eine authentifizierte Route mit den bestehenden Guards (`requireAuthenticatedUser` o. ä., Origin-Prüfung, Rate-Limit). Größenlimit (Vorschlag 10 MB), nur `text/csv`, Prüfung auf Binärinhalt, SHA-256 gegen Doppelimporte.
2. **Parsen** im Server (Streaming, Zeilenlimit), Trennzeichen- und Dezimalkomma-Erkennung (deutsches Excel exportiert `;` und `,`).
3. **Spaltenzuordnung** mit Vorlagen je Datentyp; Zuordnung wird je Workspace gespeichert (`mapping_version`), damit der Monatsimport ein Klick ist.
4. **Normalisieren:** °P und spezifische Dichte (SG) umrechnen, l/hl, °C. Einheit bleibt als Metadatum erhalten.
5. **Validieren:** Plausibilitätsgrenzen (z. B. Temperatur, Extrakt, negative Mengen), Pflichtfelder, Datumsformate. Fehlerhafte Zeilen werden angezeigt, nicht still verworfen.
6. **Staging → Commit:** Erst nach Bestätigung durch den Nutzer. Rücknahme eines ganzen Imports möglich.
7. **Auswertung:** Regeln (Stufe 1) sofort, Statistik (Stufe 2) nachts oder nach Import. Ergebnis sind `findings` mit Evidenz.
8. **Benachrichtigung:** Dashboard-Karte und optional E-Mail-Zusammenfassung (wöchentlich). Keine Push-Flut.

## 5. Erkennungsstufen

| Stufe | Beispiele | Daten | Validierbarkeit | Fehlalarm-Risiko | Aufwand (Schätzung) |
|---|---|---|---|---|---|
| 1 Regel | Gärung: Extraktabnahme unter Schwelle über 24 h ab Tag 2; Gärtemperatur außerhalb des sortenspezifischen Fensters; Tank länger belegt als geplant; Biersteuer-Frist (7. des Folgemonats) ohne Monatsübersicht; Absatz eines Kunden 3 Monate in Folge unter Vorjahresmonat | Tages-/Messwerte, Monatsabsatz | Hoch: Regel trifft oder nicht; Schwellen legt der Braumeister fest | Niedrig bis mittel, abhängig von Schwellen und Datenqualität | Gering |
| 2 Statistik | Robuste Baselines je Sorte (Median/MAD), Kontrollkarten (EWMA/CUSUM) für Sudhausausbeute, Gärdauer bis Endvergärung, Schwand je Sorte und Monat, Energie und Wasser je hl, Absatztrend je Kunde | Ausreichend viele Sude je Sorte bzw. 12+ Monate Absatz; die Mindestmenge ist im Pilot festzulegen (Annahme: eher 20 als 5 Werte je Sorte) | Mittel: rückwirkend testbar (Backtest), Bewertung durch Fachpersonal | Mittel; branchenweite Richtwerte taugen nicht als Schwelle (Sudhausausbeute in einer österreichischen Abfrage 46,7–67,1 %, Q24; Energie-Benchmarks aus Großbrauereien, Q23) | Mittel |
| 3 KI-Hypothese | Sprachmodell fasst gleichzeitige Abweichungen zusammen und nennt mögliche Ursachen mit Verweis auf die Daten („langsame Gärung bei Sud 412, Anstelltemperatur 1,5 K unter Sortenmittel, gleiche Hefegeneration wie Sud 409“) | Stufe-1/2-Befunde plus Kontext (Rohstoffcharge, Hefeführung) | Niedrig: nur über Bewertung „hilfreich/nicht hilfreich“ | Hoch (plausibel klingende falsche Ursachen). Deshalb immer als Hypothese markiert, nie automatisch handelnd | Mittel bis hoch |
| 4 Prognose | Zeit bis Schlauchreife oder Endvergärungsgrad aus den ersten 48 h Gärkurve; Absatzprognose je Sorte und Monat | Dichte Sensordaten (z. B. In-Tank-Sensorik wie Q21, Q22) über viele Sude bzw. mehrjährige Absatzhistorie | Gut über Backtest (Fehler in Stunden bzw. hl) | Mittel | Hoch; nur mit Pilotdaten sinnvoll |

Regel für Stufe 3: Eingabe an das Sprachmodell nur strukturierte Messwerte und Befunde. Freitextfelder aus Importen (Notizen, Kundennamen) werden nicht als Anweisung behandelt und standardmäßig nicht übergeben (Prompt-Injection über Importdateien, Datenminimierung).

## 6. Sicherheitsgrenzen

- **Nur lesend:** Connectoren erhalten ausschließlich Lese-Berechtigungen (Brewfather `batches.read`; Business Central nur Lese-Endpunkte; OPC-UA-Gateway ohne Schreibrechte, Verbindung nur ausgehend).
- **Mandantentrennung:** `workspace_id` auf jeder Zeile, RLS-Policies je Tabelle, Tests für fremden Workspace-Zugriff (analog zu bestehenden Workspace-Tests). Importjobs laufen mit der Workspace-ID aus der Session, nie aus dem Request-Body.
- **Geheimnisse:** API-Schlüssel der Kunden verschlüsselt, nur serverseitig, nie im Client, nie an das Sprachmodell. Widerruf durch den Kunden jederzeit.
- **Dateien:** Größen- und Typlimits, keine Formel-Auswertung (CSV-Injection beim späteren Export beachten: Zellen mit `=`, `+`, `-`, `@` beim Re-Export escapen).
- **Haftung:** Hinweistext an jeder Meldung („Hinweis aus Daten, keine Prozessfreigabe“). AGB-Anpassung mit Agent 4.
- **Kosten:** Stufe 1 und 2 laufen ohne KI-Aufrufe. Stufe 3 nur auf Anforderung oder mit Tageslimit je Workspace (Kostenschutz von Agent 6 nutzen).

## 7. Messung des Nutzens

- **Präzision:** Anteil der Meldungen, die das Fachpersonal als „berechtigt“ bewertet.
- **Neuigkeitswert:** Anteil berechtigter Meldungen, die laut Nutzer „noch nicht bekannt“ waren (eigene Abfrage in der Bewertung).
- **Vorlauf:** Zeit zwischen Meldung und dem Zeitpunkt, an dem es ohne BrewAI aufgefallen wäre (Interview je Fall).
- **Pflegeaufwand:** Minuten pro Woche für Export und Upload.

Abbruchkriterien und Zielwerte stehen im Bericht unter (e).

## 8. Grobe Aufwandsschätzung (Annahme, nicht validiert)

| Baustein | Schätzung |
|---|---|
| CSV-Upload, Vorlagen, Spaltenzuordnung, Staging (ein Datentyp) | 2–3 Personenwochen |
| Regeln Stufe 1 mit Bewertungs-UI und Wochen-Mail | 1–2 Personenwochen |
| Weitere Datentypen (je Typ) | ca. 1 Personenwoche |
| Statistik Stufe 2 inkl. Backtest | 2–4 Personenwochen, erst mit Pilotdaten |
| Brewfather-Connector | ca. 1 Personenwoche |
| Business-Central-Connector (je Kunde Feldprüfung) | 2–4 Personenwochen |
| OPC-UA-Gateway | nicht schätzbar ohne Kundenprojekt |

## 9. Offene Fragen für die Pilotgespräche

1. Wo liegen Sud-, Gär- und Abfülldaten heute (Papier, Excel, Leitsystem, ERP)? Wer pflegt sie, wie oft?
2. Welche Abweichung hat im letzten Jahr am meisten Geld gekostet, und wann wurde sie bemerkt?
3. Bekommt der Vertrieb GEDAT-Absatzmeldungen oder ERP-Auswertungen je Kunde? Wer schaut sie an?
4. Welche Schwellen nutzt der Braumeister heute im Kopf (Sorte, Temperatur, Extraktabnahme)?
5. Wer darf welche Daten sehen (Braumeister, Geschäftsführung, Vertrieb, Agentur)?
