# ENTWURF – Maßnahmenkatalog und Quellenverzeichnis (juristisch zu prüfen)

> **ENTWURF, keine Rechtsberatung.** Stand 2026-11-09, erstellt von einem KI-Agenten im technischen Audit (Agent 4). Befunde mit Datei- und Zeilenangaben: `docs/audit/2026-11-09/04-legal-compliance.md`. Kennzeichnung: [Pflicht] = verbindliche Anforderung mit geprüfter Norm, [Empfehlung], [Offen] = offene Rechtsfrage. BrewAI ist durch dieses Dokument nicht rechtssicher.

## 1. Maßnahmenkatalog für die anwaltliche Prüfung

| Prio | Maßnahme | Grundlage | Verantwortlich |
|---|---|---|---|
| 1 | Zielgruppe festlegen: B2B-only (sichtbar in Registrierung, Checkout, AGB) **oder** Verbraucherpflichten vollständig (Kündigungsschaltfläche nach § 312k BGB, Widerrufsbelehrung/-zustimmung für Dauer-SaaS prüfen, Preisangaben) | § 312k BGB; § 356 BGB [Offen] | Gründer + Anwalt |
| 2 | AVV/DPA und Drittlandgrundlage je Anbieter (Supabase, Vercel, Stripe, OpenAI, Anthropic, KIE inkl. Temp-Hosting, BytePlus, Resend, Google, Meta) prüfen; KIE/BytePlus bis zur Klärung für Personenfotos sperren | Art. 28, 44 ff. DSGVO | Gründer + Anwalt |
| 3 | Rolle nach KI-VO klären (Anbieter/Betreiber), Geltungsbeginn und Übergangsfrist Art. 50 im Amtsblatt prüfen; maschinenlesbare Kennzeichnung für alle Bilder (und Videos) aktivieren | Art. 50 Abs. 2, 4 KI-VO | Orchestrator + Anwalt |
| 4 | Impressum in App-Footer, Login und Registrierung verlinken | § 5 DDG | Agent 2 |
| 5 | Datenschutzerklärung an tatsächliche Verarbeitungen anpassen (Anbieter, KI-Verarbeitung, Speicherungen im Endgerät, Export, Löschung, Speicherdauer) | Art. 13 DSGVO | Anwalt |
| 6 | Löschkonzept mit Fristen (Jobs/Prompts, Warteliste, Logs, Backup-Tabelle, Stripe-Kunde nach Ablauf der Aufbewahrung) | Art. 5 Abs. 1 lit. e, Art. 17 DSGVO | Gründer |
| 7 | Verzeichnis der Verarbeitungstätigkeiten, TOM und Subprozessorliste aus `docs/legal/` finalisieren | Art. 30, 32 DSGVO | Gründer |
| 8 | AGB: Nutzungsrechte an KI-Ergebnissen (Lizenzbedingungen der Modellanbieter prüfen), Verantwortung des Kunden für Freigabe von Werbung, Rechte an Referenzfotos und abgebildeten Personen, Alkoholwerbung | AGB-Recht; Anbieterbedingungen [Offen] | Anwalt |
| 9 | Markenscanner: Bestätigung „eigene Marke“, TDM-Vorbehalt/robots.txt, Löschung von Scan-Kopien | § 44b UrhG [Offen] | Agent 3 + Anwalt |
| 10 | Preisangaben korrigieren (USt-Hinweis dynamisch, Seedance-Token-Hinweis und Videoschätzung, `yearly`-Feld vs. Stripe) | § 5 UWG | Agent 1/2 |
| 11 | Plattformrichtlinien Meta/TikTok/Google Ads für Alkohol prüfen, bevor Kampagnen-/Ads-Funktionen gebaut werden | Plattform-AGB | Gründer |
| 12 | Prüfmodul fachlich gegen aktuelle Werberat-Fassung (PDF 2026) und HCVO-Liste abgleichen lassen; Werberat-Regeln sind Selbstregulierung, keine Gesetze | Werberat, HCVO | Anwalt/Branchenexperte |


## 2. Fragen an die Anwältin bzw. den Anwalt

1. Richtet sich BrewAI ausschließlich an Unternehmer (§ 14 BGB)? Wenn nein: Welche Verbraucherpflichten (Kündigungsschaltfläche, Widerruf bei Dauer-SaaS, Preisangaben) sind wie umzusetzen?
2. Ist BrewAI Anbieter im Sinne der KI-Verordnung, und gilt für die bestehende Bildfunktion eine Übergangsfrist für Art. 50 Abs. 2?
3. Sind fotorealistische Werbebilder mit echten Produkten/Orten „Deepfakes“ im Sinne der KI-Verordnung, sodass Kunden sie nach Art. 50 Abs. 4 offenlegen müssen?
4. Welche Vertrags- und Transfergrundlagen bestehen mit KIE (inkl. Temp-Datei-Hosting) und BytePlus? Dürfen dort Fotos von Personen verarbeitet werden?
5. Wie lange müssen Rechnungs- und Abodaten aufbewahrt werden, und darf das Stripe-Kundenobjekt nach Kontolöschung bestehen bleiben?
6. Ist das automatisierte Scannen der vom Kunden genannten Website (inkl. Wegklicken von Altersabfragen und Kopieren von Bildern) zulässig, wenn der Kunde Rechteinhaber ist, und wie ist ein TDM-Nutzungsvorbehalt zu beachten?
7. Welche Nutzungsrechte erhalten Kunden an KI-Ergebnissen nach den Bedingungen der eingesetzten Modellanbieter, und wie ist das in den AGB abzubilden?
8. Reicht die Kennzeichnung „Hinweis/mögliches Risiko“ des Prüfmoduls aus, um keine Rechtsberatung zu erbringen bzw. keine Haftung für Freigaben zu begründen?

## 3. Quellenverzeichnis (abgerufen am 2026-11-09)

- Deutscher Werberat, Verhaltensregeln für alkoholhaltige Getränke (Fassung Januar 2026): https://werberat.de/leitfaden-zum-werbekodex-des-deutschen-werberats/alkoholhaltige-getraenke/
- Deutscher Werberat, Leitfaden „Kinder und Jugendliche“: https://werberat.de/leitfaden-zum-werbekodex-des-deutschen-werberats/alkoholhaltige-getraenke/kinder-und-jugendliche/
- Deutscher Werberat, PDF Version 2026 (Datei abgerufen, Text maschinell nicht lesbar): https://werberat.de/wp-content/uploads/2026/01/Alkoholleitfaden_DWR_Version_2026_V2.7_Online-Version.pdf
- BGH, Pressemitteilung Nr. 93/18 zu I ZR 252/16 („bekömmlich“, Urteil vom 17.05.2018, Art. 4 Abs. 3 Buchst. a HCVO, gilt auch für Werbung): https://www.bundesgerichtshof.de/SharedDocs/Pressemitteilungen/DE/2018/2018093.html (Volltext des Urteils nicht abgerufen)
- Verordnung (EG) Nr. 1924/2006 (HCVO): https://eur-lex.europa.eu/legal-content/DE/ALL/?uri=CELEX:32006R1924 (Art. 4 Abs. 3 über die BGH-Pressemitteilung bestätigt; EUR-Lex-Abruf lieferte keinen Text)
- Google Ads, Richtlinie zu Alkohol (Plattformregel): https://support.google.com/adspolicy/answer/6012382?hl=de
- KI-Verordnung (EU) 2024/1689, Art. 50 (Inhalt über den AI Act Service Desk der EU-Kommission geprüft): https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50 ; EUR-Lex: https://eur-lex.europa.eu/eli/reg/2024/1689/oj/deu (Abruf lieferte keinen Text)
- Sekundärquellen zum Geltungsbeginn/AI-Omnibus (nicht amtlich, nur als Hinweis): https://www.iubenda.com/en/blog/ai-omnibus-parliament-adoption-june-2026 ; https://cms.law/en/gbr/publication/digital-omnibus-on-ai-adjusted-timelines-and-transitional-provisions-explained
- IPTC Digital Source Type „trainedAlgorithmicMedia“: https://cv.iptc.org/newscodes/digitalsourcetype/
- § 25 TDDDG: https://www.gesetze-im-internet.de/ttdsg/__25.html
- § 5 DDG: https://www.gesetze-im-internet.de/ddg/__5.html
- § 312k BGB: https://www.gesetze-im-internet.de/bgb/__312k.html
- § 5 UWG: https://www.gesetze-im-internet.de/uwg_2004/__5.html
- § 44b UrhG: https://www.gesetze-im-internet.de/urhg/__44b.html
- DSGVO (Art. 5, 13, 15, 17, 20, 25, 28, 30, 32, 44 ff.): https://eur-lex.europa.eu/eli/reg/2016/679/oj/deu (am Audit-Tag nicht erneut abgerufen; Artikelangaben aus Kenntnis der Verordnung, vor Verwendung prüfen)

Nicht abgerufen bzw. nicht lesbar (bewusst offen gelassen): JuSchG/JMStV-Normtexte, Plattformrichtlinien Meta (Seite lieferte keinen Text) und TikTok, Lizenzbedingungen OpenAI/KIE/BytePlus/Anthropic, Stellungnahmen von DSK/EDPB/BfDI.

