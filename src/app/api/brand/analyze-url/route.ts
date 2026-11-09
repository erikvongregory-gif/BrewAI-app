import { crawlCatalogPages, formatCatalogCrawlNote } from "@/lib/brand/catalog-crawl";
import { workspaceResourceUser } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { analyzeWebsiteBrand, assessBrandAnalysisFields, selectBeerProductImageIndices } from "@/lib/brand/brand-analysis";
import { storeBrandReferenceImagesAsUrls } from "@/lib/brand/persist-reference-urls";
import { createBrandIntakeSession } from "@/lib/brand/browser-intake";
import { looksLikeBlockedGatePage } from "@/lib/brand/consent-gate-dismiss";
import { isInstagramUrl, normalizeWebsiteUrl } from "@/lib/brand/url-intake";
import { extractBeerVarietiesFromIntake, persistSuggestedBeerLabels } from "@/lib/brand/beer-catalog-intake";
import {
  downloadCandidateImages,
  mergeBrandReferenceSelections,
  mergeParsedWebsitePages,
  parseWebsiteHtml,
  pickBrandReferenceImages,
  pickImagesByIndices,
} from "@/lib/brand/website-intake";
import { ingestBrandFontFromHtml } from "@/lib/brand/extract-brand-fonts";
import { crawlProductCatalog } from "@/lib/brand/product-catalog-crawl";
import { annotateBeersWithEvidence, detectCatalogWithAi } from "@/lib/brand/catalog-ai";
import { assessBrandEvidence, extractCssColorEvidence } from "@/lib/brand/brand-evidence";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Sortiments-Crawl + KI inkl. Bild-Nachsuche — bleibt deutlich unter der 300-s-Grenze der Route. */
const CATALOG_AI_TIMEOUT_MS = 150_000;
/** Sortenbilder in den eigenen Storage kopieren (freigestellt) — Rest bleibt Fremd-URL und wird beim Aktivieren nachgeholt. */
const LABEL_PERSIST_BUDGET_MS = 30_000;

/**
 * Fortschritt für den Client (NDJSON-Stream). Schritt-Index passt zur Checkliste im
 * Markenprofil-Fenster: 0 Website · 1 Unterseiten · 2 Sortiment · 3 Marke · 4 Produktbilder · 5 Speichern · 6 Profil.
 */
type ProgressFn = (step: number, label: string) => void;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Zeitlimit ${ms} ms überschritten`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

const bodySchema = z.object({
  websiteUrl: z.string().min(4).max(1200),
});

export async function POST(req: Request) {
  const wantsStream = (req.headers.get("accept") ?? "").includes("application/x-ndjson");
  if (!wantsStream) return analyzeBrandUrl(req, () => undefined);

  // Stream statt einer stummen 1–2-Minuten-Anfrage: Nutzer sieht echten Fortschritt,
  // und Proxys trennen die Verbindung nicht wegen Inaktivität (Ping alle 10 s).
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      const ping = setInterval(() => send({ type: "ping" }), 10_000);
      try {
        const response = await analyzeBrandUrl(req, (step, label) => send({ type: "progress", step, label }));
        const body: unknown = await response.json().catch(() => ({ error: "Ungueltige Server-Antwort." }));
        send({ type: "result", status: response.status, body });
      } catch (error) {
        send({ type: "result", status: 500, body: { error: error instanceof Error ? error.message : "Analyse fehlgeschlagen." } });
      } finally {
        clearInterval(ping);
        closed = true;
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

async function analyzeBrandUrl(req: Request, progress: ProgressFn): Promise<NextResponse> {
  const session = createBrandIntakeSession();
  try {
    const rateError = await enforceRateLimitPersistent(req, {
      keyPrefix: "brand-analyze-url",
      limit: 8,
      windowMs: 60_000,
    });
    if (rateError) return rateError;
    const originError = enforceSameOrigin(req);
    if (originError) return originError;

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
    }

    const supabase = await createClient();
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { try { user = await workspaceResourceUser(user, true); } catch { return NextResponse.json({error:"Teamzugriff nicht erlaubt."},{status:403}); } }
    if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungueltige Website-URL." }, { status: 400 });
    }

    const normalizedUrl = normalizeWebsiteUrl(parsed.data.websiteUrl);
    if (!normalizedUrl) {
      return NextResponse.json({ error: "Bitte eine gueltige Website-URL eingeben (https://…)." }, { status: 400 });
    }

    if (isInstagramUrl(normalizedUrl)) {
      return NextResponse.json(
        {
          error: "Instagram-Links kommen bald. Bitte nutze vorerst die Website deiner Brauerei oder den manuellen Upload.",
          code: "instagram_not_supported_v1",
        },
        { status: 400 },
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY fehlt." }, { status: 500 });
    }

    progress(0, "Website wird geladen…");
    let fetched;
    try {
      fetched = await session.fetchHtml(normalizedUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Website konnte nicht geladen werden.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // Startseite laden; danach Sortiment und Produktdetails in zwei Ebenen erschliessen.
    let homepage = parseWebsiteHtml(fetched.html, fetched.finalUrl);
    if (looksLikeBlockedGatePage(fetched.html, homepage.textExcerpt)) {
      try {
        fetched = await session.fetchWithBrowser(normalizedUrl);
        homepage = parseWebsiteHtml(fetched.html, fetched.finalUrl);
      } catch (retryError) {
        const msg = retryError instanceof Error ? retryError.message : "Alters-/Cookie-Gate konnte nicht umgangen werden.";
        return NextResponse.json({ error: msg, code: "brand_intake_gate_blocked" }, { status: 422 });
      }
      if (looksLikeBlockedGatePage(fetched.html, homepage.textExcerpt)) {
        return NextResponse.json(
          {
            error:
              "Die Website zeigt weiterhin nur Cookie- oder Altersbestätigung — Markeninhalt nicht erreichbar. Bitte Support melden mit der URL.",
            code: "brand_intake_gate_blocked",
          },
          { status: 422 },
        );
      }
    }

    progress(1, "Unterseiten werden gelesen…");
    const { pages: subpages, rawHtmlByUrl, skipped } = await crawlCatalogPages(fetched, (url) => session.fetchHtml(url));

    // Sortiment parallel zur Markenanalyse: gezielter Produktseiten-Crawl + KI-Zuordnung
    // von Sorte, Getränkeart und Produktbild. Fällt bei Fehler/Zeitüberschreitung auf die Regeln zurück.
    const homepageFetch = fetched;
    const catalogPromise = withTimeout(
      (async () => {
        progress(2, "Sortiment wird gesucht…");
        const catalog = await crawlProductCatalog(homepageFetch, rawHtmlByUrl, (url) => session.fetchHtml(url));
        const allHtml = { ...rawHtmlByUrl, ...catalog.rawHtmlByUrl };
        const ai = await detectCatalogWithAi({
          apiKey,
          websiteUrl: homepageFetch.finalUrl,
          rawHtmlByUrl: allHtml,
          fetchPage: (url) => session.fetchHtml(url),
          onProgress: (message) => progress(/Bilder|Sorten erkannt/.test(message) ? 4 : 2, message),
        });
        return { ai, catalogHtml: catalog.rawHtmlByUrl };
      })(),
      CATALOG_AI_TIMEOUT_MS,
    ).catch((error: unknown) => {
      console.warn("[brand/analyze-url] KI-Sortiment fehlgeschlagen, Regel-Erkennung:", error);
      return null;
    });

    progress(3, "Texte, Farben & Bildsprache werden erkannt…");
    const intake = mergeParsedWebsitePages([homepage, ...subpages]);
    const downloadedImages = await downloadCandidateImages(intake.imageCandidates);

    // Referenzbilder = Markenwelt: Szenen mit echtem Hintergrund zuerst, Packshots nur als Notloesung.
    const heuristicReferences = pickBrandReferenceImages(downloadedImages);
    const heuristicSceneCount = heuristicReferences.filter((image) => !image.isPackshot).length;
    const needsVisionFilter = downloadedImages.length > 4 && heuristicSceneCount < 2;

    const visionIndices = needsVisionFilter
      ? await selectBeerProductImageIndices({
          apiKey,
          images: downloadedImages.map((image) => ({
            base64: image.base64,
            mediaType: image.mediaType,
          })),
          imageHints: downloadedImages.map((image) => ({ alt: image.alt, url: image.url })),
        })
      : [];
    const visionReferences =
      visionIndices.length > 0
        ? pickBrandReferenceImages(pickImagesByIndices(downloadedImages, visionIndices))
        : [];

    const { images: referenceImages, method: imageSelection } = mergeBrandReferenceSelections(
      heuristicReferences,
      visionReferences,
    );

    // Die KI-Analyse sieht Szenen (Bildsprache) + bis zu 2 Packshots (nur Farbpalette/Etikett).
    const analysisScenes = referenceImages.filter((image) => !image.isPackshot);
    const analysisPackshots = downloadedImages
      .filter((image) => image.isPackshot)
      .sort((a, b) => b.productScore - a.productScore)
      .slice(0, 2);
    // Bester Packshot = Etikett-Traeger: wird separat gespeichert und dient der
    // Generierung als Etikett-Referenz (die Referenzbilder selbst sind Szenen).
    const brandLabelReferenceUrl = analysisPackshots[0]?.url ?? "";
    const analysisImages = [...analysisScenes, ...analysisPackshots].slice(0, 6);
    const analysisPackshotCount = analysisImages.filter((image) => image.isPackshot).length;
    // Belegte Farben aus Inline-CSS/theme-color — Anker für die KI und Beleg im Prüfschritt.
    const cssColors = extractCssColorEvidence([...new Set([fetched.html, ...Object.values(rawHtmlByUrl)])]);

    let scan;
    try {
      scan = await analyzeWebsiteBrand({
        apiKey,
        websiteUrl: fetched.finalUrl,
        textExcerpt: intake.textExcerpt,
        images: analysisImages.map((image) => ({
          base64: image.base64,
          mediaType: image.mediaType,
        })),
        packshotImageCount: analysisPackshotCount,
        cssColors,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "KI-Analyse fehlgeschlagen.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    let referenceImageUrls: string[] = [];
    if (referenceImages.length > 0) {
      try {
        referenceImageUrls = await storeBrandReferenceImagesAsUrls(
          referenceImages.map((image) => ({
            base64: image.base64,
            mime: image.mime,
            sourceUrl: image.url,
          })),
          { preferSourceUrls: true },
        );
      } catch (persistError) {
        console.warn("[brand/analyze-url] reference URL storage failed:", persistError);
      }
    }

    progress(4, "Sortiment wird fertig geprüft…");
    const catalogResult = await catalogPromise;
    const aiBeers = catalogResult?.ai.beers ?? [];
    const catalogMethod: "ai" | "rules" = aiBeers.length > 0 ? "ai" : "rules";
    const detectedBeers =
      catalogMethod === "ai"
        ? aiBeers
        : annotateBeersWithEvidence(
            extractBeerVarietiesFromIntake({
              pages: [
                homepage,
                ...subpages,
                ...Object.entries(catalogResult?.catalogHtml ?? {}).map(([url, html]) => parseWebsiteHtml(html, url)),
              ],
              downloadedImages,
              imageCandidates: intake.imageCandidates,
              breweryName: scan.breweryName,
              rawHtmlByUrl: { ...rawHtmlByUrl, ...(catalogResult?.catalogHtml ?? {}) },
            }),
            { ...rawHtmlByUrl, ...(catalogResult?.catalogHtml ?? {}) },
          );

    // Sortenbilder sofort freistellen und in den eigenen Storage legen — Fremd-URLs brechen,
    // sobald die Brauerei ihre Website umbaut; 404-Bilder fallen dabei raus statt kaputt angezeigt zu werden.
    progress(5, `${detectedBeers.filter((beer) => beer.etikettUrl).length} Sortenbilder werden gespeichert…`);
    let suggestedBeers = detectedBeers;
    try {
      suggestedBeers = (
        await persistSuggestedBeerLabels(user.id, detectedBeers, { budgetMs: LABEL_PERSIST_BUDGET_MS })
      ).map((beer) => (beer.etikettUrl ? beer : { ...beer, bildStatus: "keins" as const }));
    } catch (persistError) {
      console.warn("[brand/analyze-url] Sortenbilder konnten nicht gespeichert werden:", persistError);
    }
    progress(6, "Markenprofil wird erstellt…");
    const siteKind = catalogResult?.ai.site ?? "hersteller";
    const suggestedUrl = catalogResult?.ai.suggestedUrl ?? "";

    const assessment = assessBrandAnalysisFields({
      scan,
      textExcerpt: intake.textExcerpt,
      imageCount: analysisImages.length,
      sceneCount: analysisScenes.length,
      packshotCount: analysisPackshotCount,
      beersDetected: suggestedBeers.length,
    });
    if (siteKind === "gastro" || siteKind === "handel") {
      assessment.reviewHints.unshift(
        `Das sieht nach der Website ${siteKind === "gastro" ? "eines Wirtshauses/Lokals" : "eines Händlers"} aus${
          suggestedUrl ? ` — für das vollständige Sortiment besser ${suggestedUrl} scannen` : ""
        }.`,
      );
    }
    const imageReviewCount = suggestedBeers.filter((beer) => beer.bildStatus && beer.bildStatus !== "flasche").length;
    if (imageReviewCount > 0) {
      assessment.reviewHints.push(`${imageReviewCount} Sorte${imageReviewCount === 1 ? "" : "n"}: Bild prüfen`);
    }
    const packagingReviewCount = suggestedBeers.filter((beer) => beer.packagingNeedsReview).length;
    if (packagingReviewCount > 0) {
      assessment.reviewHints.push(
        `${packagingReviewCount} Sorte${packagingReviewCount === 1 ? "" : "n"}: Verpackung prüfen`,
      );
    }
    // Belegprüfung: KI-Sortennamen, die nicht im Website-Text stehen, und geratene Bierstile sichtbar machen.
    const unconfirmedBeerCount = suggestedBeers.filter((beer) => beer.nachweis?.status === "unbestaetigt").length;
    if (unconfirmedBeerCount > 0) {
      assessment.reviewHints.unshift(
        `${unconfirmedBeerCount} Sorte${unconfirmedBeerCount === 1 ? "" : "n"}: Name nicht auf der Website gefunden — prüfen oder entfernen`,
      );
    }
    const styleReviewCount = suggestedBeers.filter((beer) => beer.bierstilBelegt === false).length;
    if (styleReviewCount > 0) {
      assessment.reviewHints.push(
        `${styleReviewCount} Sorte${styleReviewCount === 1 ? "" : "n"}: Bierstil nicht angegeben — bitte auswählen`,
      );
    }
    const evidence = assessBrandEvidence({
      scan,
      websiteUrl: fetched.finalUrl,
      textExcerpt: intake.textExcerpt,
      pageTitle: intake.title,
      cssColors,
      sceneCount: analysisScenes.length,
      packshotCount: analysisPackshotCount,
      labelReferenceUrl: brandLabelReferenceUrl,
    });

    let brandHeadlineFontName = "";
    let brandFontFileUrl = "";
    try {
      const font = await ingestBrandFontFromHtml({
        userId: user.id,
        htmlList: Object.values(rawHtmlByUrl),
        pageUrl: fetched.finalUrl,
      });
      if (font) {
        brandHeadlineFontName = font.brandHeadlineFontName;
        brandFontFileUrl = font.brandFontFileUrl;
      }
    } catch (fontError) {
      console.warn("[brand/analyze-url] font intake failed:", fontError);
    }

    const pagesFetched = 1 + subpages.length;
    const crawlNote = formatCatalogCrawlNote(pagesFetched, skipped);

    return NextResponse.json({
      ok: true,
      suggestion: {
        ...scan,
        suggestedBeers,
        referenceImageUrls,
        ...(referenceImageUrls.length === 0
          ? {
              referenceImagePayloads: referenceImages.map((image) => ({
                base64: image.base64,
                mime: image.mime,
              })),
            }
          : {}),
        brandInstagramUrl: "",
        brandWebsiteUrl: fetched.finalUrl,
        brandProfileSource: "url" as const,
        brandLabelReferenceUrl,
        ...(brandHeadlineFontName ? { brandHeadlineFontName } : {}),
        ...(brandFontFileUrl ? { brandFontFileUrl } : {}),
      },
      sourceMeta: {
        pagesFetched,
        pagesSkipped: skipped.length,
        crawlNote,
        skippedPages: skipped.slice(0, 12),
        imagesScanned: downloadedImages.length,
        imagesAnalyzed: analysisImages.length,
        sceneImages: analysisScenes.length,
        packshotImages: analysisPackshotCount,
        textExcerpt: intake.textExcerpt.slice(0, 500),
        confidence: assessment.overall,
        fieldConfidence: assessment.fields,
        reviewHints: assessment.reviewHints,
        pageTitle: intake.title,
        imageSelection,
        beersDetected: suggestedBeers.length,
        beersWithImage: suggestedBeers.filter((beer) => beer.etikettUrl).length,
        beersUnconfirmed: unconfirmedBeerCount,
        evidence,
        catalogMethod,
        siteKind,
        suggestedUrl,
        fontDetected: Boolean(brandHeadlineFontName),
        fontUploaded: Boolean(brandFontFileUrl),
      },
    });
  } catch (e) {
    console.error("[brand/analyze-url]", e);
    const msg = e instanceof Error ? e.message : "Website-Analyse fehlgeschlagen.";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await session.close();
  }
}
