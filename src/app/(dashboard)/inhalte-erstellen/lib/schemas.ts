import { z } from "zod";

export const produktKategorieSchema = z.enum(["bier", "limonade", "tafelwasser", "mineralwasser"]);
export const flaschenTypSchema = z.enum([
  // 0,33 l
  "euro_longneck_330",
  "euro_steinie_330",
  "vichy_330",
  "buegel_330",
  // 0,5 l
  "longneck_500",
  "nrw_500",
  "vichy_500",
  "weizen_500",
  "buegel_500",
  // 0,75 l
  "buegel_750",
  "belgien_750",
  // Dosen
  "dose_330",
  "dose_500",
  // AfG / Wasser
  "gastro_250",
  "glas_500",
  "perle_700",
  "brunnen_750",
  "glas_750",
  "glas_1000",
  "pet_500",
  "pet_750",
  "pet_1000",
  "pet_1500",
]);

export const glasTypSchema = z.enum([
  "pils_tulpe",
  "weizen",
  "willibecher",
  "seidel",
  "masskrug",
  "steinkrug",
  "pokal",
  "ipa_teku",
  "schwenker",
  "nonic",
  "stange",
]);

export const bierstilSchema = z.enum([
  "hefeweizen",
  "kristallweizen",
  "pils",
  "helles_lager",
  "helles",
  "ipa",
  "neipa",
  "stout",
  "porter",
  "bock",
  "saison",
  "kellerbier",
  "rauchbier",
]);

export const imageQualitySchema = z.enum(["medium", "high", "ultra"]).default("high");
export const aspectRatioSchema = z
  .enum(["1:1", "4:5", "3:4", "9:16", "4:3", "16:9"])
  .default("4:5");
export const studioAspectRatioSchema = z.enum(["1:1", "2:3"]).default("1:1");

/** Aus Skill SCHRITT 1, Frage 8 — Personen-Modus A–E + Sub-Slots. */
export const personenModusSchema = z.enum(["A", "B", "C", "D", "E"]);
export const gruppenDynamikSchema = z.enum(["E1", "E2", "E3", "E4"]);
export const gruppenAnzahlSchema = z.enum(["2", "3", "4_5"]);
export const gruppenTypSchema = z.enum(["gemischt", "frauen", "maenner", "paerchen"]);
export const personGenderSchema = z.enum(["maennlich", "weiblich", "divers"]);
export const personAlterSchema = z.enum(["jung", "mittel", "aelter"]);
export const personKoerperSchema = z.enum(["kopf_schultern", "halbkoerper", "ganzkoerper"]);
export const personMoodSchema = z.enum(["entspannt", "lachend", "nachdenklich", "aktiv"]);
export const gruppenSettingSchema = z.enum([
  "alpine_huette",
  "biergarten",
  "berge_outdoor",
  "rooftop_urban",
  "strand",
]);

/** Aus Skill SCHRITT 1, Frage 1b — Behälter G/F/B. */
export const behaelterSchema = z.enum(["G", "F", "B"]);

/** Aus Skill — 5 Stimmung-Trends. */
export const stimmungSchema = z.enum([
  "nachhaltig",
  "modern",
  "nostalgie",
  "aktiv",
  "premium",
]);

/** Aus Skill SCHRITT 1, Frage 9 — Shot Type A–H. */
export const shotTypeSchema = z.enum(["A", "B", "C", "D", "E", "F", "G", "H"]);

/** Aus Skill SCHRITT 1, Frage 7 — Etikett-Treue. */
export const etikettModusSchema = z.enum(["marke", "generisch"]);

/** Aus Skill — KI-Plattform-Auswahl. */
export const kiPlattformSchema = z.enum([
  "gpt_image_2",
  "nano_banana_pro",
  "nano_banana_2",
  "midjourney",
]);

/** Aus Skill — Zielgruppe a–d. */
export const zielgruppeSchema = z.enum([
  "entdecker",
  "traditionsbewusst",
  "gesundheitsbewusst",
  "geniesser",
]);

export const hyperrealisticSchema = z.object({
  etikettBild: z.string().url(),
  flaschenTyp: flaschenTypSchema,
  flaschenfarbe: z.enum(["braun", "gruen", "klar"]).default("braun"),
  produktKategorie: produktKategorieSchema.optional().default("bier"),
  bierstil: z.string().trim().min(1),
  glasTyp: glasTypSchema.optional(),
  /** Sorten-Filtrierung: unfiltriert → naturtrüb, filtriert → klar. */
  filtrierung: z.enum(["filtriert", "unfiltriert"]).optional(),
  szene: z.enum([
    "biergarten_sommer",
    "wirtshaus_innen",
    "kueche_zuhause",
    "wiese_picknick",
    "strand_sonnenuntergang",
    "alpenpanorama",
    "stadtbalkon_abend",
    "brauereihof",
    "fussball_public_viewing",
  ]),
  /** Legacy boolean; bevorzugt personenModus verwenden. */
  personImBild: z.boolean().default(false),
  personBeschreibung: z.string().trim().max(180).optional(),
  /** Aus Skill Frage 8 [A–E]. Optional fuer Backwards-Compat — Default im Builder. */
  personenModus: personenModusSchema.optional(),
  personGender: personGenderSchema.optional(),
  personAlter: personAlterSchema.optional(),
  personKoerper: personKoerperSchema.optional(),
  personMood: personMoodSchema.optional(),
  gruppenDynamik: gruppenDynamikSchema.optional(),
  gruppenAnzahl: gruppenAnzahlSchema.optional(),
  gruppenTyp: gruppenTypSchema.optional(),
  gruppenSetting: gruppenSettingSchema.optional(),
  /** Skill Frage 1b [G/F/B]. */
  behaelter: behaelterSchema.optional(),
  tageszeit: z.enum(["tageslicht", "goldene_stunde", "mittag", "abend_warm", "blaue_stunde", "nacht"]).default("tageslicht"),
  /** Trend-Stimmung aus Skill — bevorzugt vor Legacy stimmung-Begriffen. */
  stimmungTrend: stimmungSchema.optional(),
  /** Legacy. */
  stimmung: z.enum(["entspannt", "feierlich", "gesellig", "kontemplativ"]).default("entspannt"),
  /** Shot Type A–H aus Skill Frage 9. */
  shotType: shotTypeSchema.optional(),
  /** Etikett-Treue aus Skill Frage 7. */
  etikettModus: etikettModusSchema.optional(),
  /** Ziel-KI aus Skill Frage 6. */
  kiPlattform: kiPlattformSchema.optional(),
  /** Zielgruppe — optional, kommt sonst aus Markenprofil. */
  zielgruppe: zielgruppeSchema.optional(),
  zusatzWunsch: z.string().trim().max(800).optional(),
  /** Sortenname aus „Meine Biere“ — fuer den 1:1-Etikett-Lock. */
  beerName: z.string().trim().max(80).optional(),
  /** Charaktername aus Markenprofil — Identitaet aus Referenzfotos. */
  characterName: z.string().trim().max(80).optional(),
  /** Rolle des Charakters, z. B. Braumeister. */
  characterRole: z.string().trim().max(60).optional(),
  /** Higgsfield-Style Appearance Lock (Text) — Ergänzung zur Foto-Identität. */
  characterAppearanceLock: z.string().trim().max(600).optional(),
  /**
   * Charakter-Gesichtsfotos (HTTPS oder data:). Bei gesetztem Charakter → Nano Banana Identity-Pfad.
   * Nicht mit extraReferenceImages vermischen.
   */
  characterReferenceImages: z.array(z.string().min(8).max(12_000_000)).max(3).optional(),
  /**
   * Zusaetzliche Kontext-Referenzen (Kiste, Location, Stimmung) — nicht das Sorten-Etikett.
   * data:-URLs oder https. Max. 3.
   */
  extraReferenceImages: z.array(z.string().min(8).max(12_000_000)).max(3).optional(),
  extraReferenceRoles: z.array(z.enum(["scene", "look"])).max(3).optional(),
  /**
   * Produktfoto als Etikett-Anker. Unabhängig von applyBrandLook:
   * aus = Szene frei, Produktidentität nicht erzwungen.
   */
  keepLabel: z.boolean().optional(),
  /** Markenfarben, Licht und Bildsprache aus dem Profil — ändert nicht das Etikett. */
  applyBrandLook: z.boolean().optional(),
  /** Client-Stiltreue: frei=generisches Etikett, normal/hoch=Marken-Lock (hoch strenger). */
  stiltreue: z.enum(["frei", "normal", "hoch"]).optional(),
  /** Content-Tab Framing fuer applyContentPresetPrompt. */
  contentPreset: z.enum(["hyperreal", "campaign_social"]).optional(),
  /** Bewusste fotografische Bildsprache; ueberschreibt die automatische Stilableitung. */
  photoStyle: z.enum(["reportage", "premium", "campaign"]).optional(),
  /** Optionaler UI-Lock fuer besonders realistische Kamera-, Licht- und Materialwirkung. */
  hyperreal: z.boolean().optional(),
  aspectRatio: aspectRatioSchema,
  quality: imageQualitySchema,
  variantCount: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
  /** Sichtbares „AI“-Label (EU AI Act Art. 50 — Transparenz bei synthetischen Bildern). */
});

export const productIsolateSchema = z.object({
  inputBild: z.string().url(),
  hintergrund: z.enum(["transparent", "weiss", "schwarz"]).default("transparent"),
  schattenErhalten: z.boolean().default(true),
  outputFormat: z.enum(["png", "webp"]).default("png"),
});

export const productStudioSchema = z.object({
  referenzBild: z.string().url(),
  bierstil: bierstilSchema,
  hintergrundStil: z.enum([
    "naturholz_warm",
    "marmor_hell",
    "schiefer_dunkel",
    "leinen_rustikal",
    "studio_gradient_warm",
    "studio_gradient_kuehl",
    "outdoor_naturlich",
  ]),
  glasNebenFlasche: z.boolean().default(true),
  glasTyp: glasTypSchema.optional(),
  customProps: z.string().trim().max(240).optional(),
  lichtStimmung: z.enum(["weich_diffuse", "hart_dramatisch", "natuerlich_fensterlicht"]).default("weich_diffuse"),
  aspectRatio: studioAspectRatioSchema,
  quality: imageQualitySchema,
});

export const socialPostZielSchema = z.enum([
  "produkt_launch",
  "event_ankuendigung",
  "saisonal",
  "behind_the_scenes",
  "rezept_pairing",
  "community_engagement",
  "edukativ_bierwissen",
  "sale_aktion",
]);

export const socialPostSchema = hyperrealisticSchema.extend({
  headline: z.string().trim().min(1).max(60),
  subline: z.string().trim().max(120).optional(),
  ctaText: z.string().trim().max(30).optional(),
  postZiel: socialPostZielSchema.default("community_engagement"),
});

export const campaignTextSchema = z.object({
  referenzBilder: z.array(z.string().url()).min(3).max(5),
  postZiel: z.enum([
    "produkt_launch",
    "event_ankuendigung",
    "saisonal",
    "behind_the_scenes",
    "rezept_pairing",
    "community_engagement",
    "edukativ_bierwissen",
    "sale_aktion",
  ]),
  headline: z.string().trim().min(1).max(60),
  subline: z.string().trim().max(120).optional(),
  ctaText: z.string().trim().max(30).optional(),
  brauereiName: z.string().trim().min(1).max(80),
  bierstilOderProdukt: z.string().trim().max(80).optional(),
  zusatzKontext: z.string().trim().max(400).optional(),
  aspectRatio: z.enum(["1:1", "4:5", "3:4", "9:16", "4:3", "16:9"]).default("4:5"),
  quality: imageQualitySchema,
});

/** Parsed output always has produktKategorie; in-memory fixtures may omit it (sanitize → bier). */
export type HyperrealisticInput = Omit<
  z.infer<typeof hyperrealisticSchema>,
  "produktKategorie"
> & {
  produktKategorie?: z.infer<typeof produktKategorieSchema>;
};
export type SocialPostInput = z.infer<typeof socialPostSchema>;
export type ProductIsolateInput = z.infer<typeof productIsolateSchema>;
export type ProductStudioInput = z.infer<typeof productStudioSchema>;
export type CampaignTextInput = z.infer<typeof campaignTextSchema>;
