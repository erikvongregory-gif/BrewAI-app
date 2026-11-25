import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyThrownProviderError } from "@/lib/ai/providerErrors";
import { logProviderFailure, providerErrorResponse } from "@/lib/ai/providerRequest";
import { requireBillableImageGenerationUser } from "@/app/(dashboard)/inhalte-erstellen/lib/api-guards";
import { socialPostZielSchema } from "@/app/(dashboard)/inhalte-erstellen/lib/schemas";
import { buildBrandProfilePromptContext, getBrandProfileFromMetadata } from "@/lib/dashboard/brandProfile";
import { checkAdCompliance } from "@/lib/compliance";

export const runtime = "nodejs";

const bodySchema = z.object({
  postZiel: socialPostZielSchema,
  breweryName: z.string().trim().min(1).max(120),
  beerName: z.string().trim().max(80).optional(),
  userBrief: z.string().trim().max(800).optional(),
});

const ZIEL_LABELS: Record<z.infer<typeof socialPostZielSchema>, string> = {
  produkt_launch: "Produkt-Launch",
  event_ankuendigung: "Event-Ankündigung",
  saisonal: "Saisonale Kampagne",
  behind_the_scenes: "Behind the Scenes",
  rezept_pairing: "Food Pairing",
  community_engagement: "Community / Lifestyle",
  edukativ_bierwissen: "Bierwissen",
  sale_aktion: "Aktion / Sale",
};

function parseCopyJson(raw: string): { headline: string; subline?: string; ctaText?: string } | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as {
      headline?: unknown;
      subline?: unknown;
      ctaText?: unknown;
    };
    const headline = typeof parsed.headline === "string" ? parsed.headline.trim() : "";
    if (!headline) return null;
    return {
      headline: headline.slice(0, 60),
      subline: typeof parsed.subline === "string" ? parsed.subline.trim().slice(0, 120) : undefined,
      ctaText: typeof parsed.ctaText === "string" ? parsed.ctaText.trim().slice(0, 30) : undefined,
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const guard = await requireBillableImageGenerationUser(req, "inhalte-erstellen-suggest-copy");
    if (!guard.ok) return guard.response;

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY fehlt." }, { status: 500 });

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }

    const brandProfile = getBrandProfileFromMetadata(guard.userMetadata);
    const brandContext = buildBrandProfilePromptContext(brandProfile);
    const { postZiel, breweryName, beerName, userBrief } = parsed.data;

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6",
      max_tokens: 350,
      temperature: 0.5,
      messages: [
        {
          role: "user",
          content: [
            `Schreibe deutsche Instagram-Ad-Copy für „${breweryName}“. Post-Ziel: ${ZIEL_LABELS[postZiel]}.`,
            beerName ? `Produkt/Sorte: ${beerName}.` : "",
            userBrief ? `Motiv-Brief des Users: ${userBrief}` : "",
            brandContext ? `\nMarkenkontext:\n${brandContext}` : "",
            "",
            "Antworte NUR als JSON:",
            '{"headline":"max 60 Zeichen","subline":"optional max 120 Zeichen","ctaText":"optional max 30 Zeichen"}',
            "Regeln: natürliches Deutsch, korrekte Umlaute, kein Hashtag-Zeug, Headline prägnant, CTA handlungsorientiert.",
            "Alkoholwerbung (Verhaltensregeln des Deutschen Werberats): keine Gesundheits- oder Wirkungsversprechen (auch nicht „bekömmlich“), keine Aufforderung zu viel oder schnellem Trinken, keine Ansprache Minderjähriger, kein Bezug zu Autofahren, sportlicher Leistung oder sozialem/sexuellem Erfolg, Alkoholgehalt nicht als Kaufgrund.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    const block = message.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const copy = parseCopyJson(text);
    if (!copy) {
      return NextResponse.json({ error: "Copy-Vorschlag konnte nicht gelesen werden." }, { status: 502 });
    }

    // Automatische Hinweise auf riskante Aussagen (keine Freigabe, keine Sperre). Zusätzliches Feld,
    // bestehende Clients lesen weiter nur headline/subline/ctaText.
    const compliance = checkAdCompliance({
      text: [copy.headline, copy.subline, copy.ctaText].filter(Boolean).join("\n"),
      kind: "werbetext",
      beverage: { alcoholFree: /alkoholfrei|alkoholreduziert|0[,.]0\s*%?/i.test(beerName ?? "") },
    });

    return NextResponse.json({ ...copy, compliance });
  } catch (error) {
    const classified = classifyThrownProviderError("anthropic", error);
    logProviderFailure(classified, { label: "inhalte-erstellen-suggest-copy" });
    return providerErrorResponse(classified);
  }
}
