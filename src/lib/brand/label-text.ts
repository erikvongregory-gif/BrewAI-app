import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { createAnthropicMessageWithModelFallback } from "@/lib/anthropic/modelCandidates";
import type { OpenAiReferenceImage } from "@/lib/openai/generateImage";

/**
 * Liest die großen, klar lesbaren Wörter vom Etikett des Sortenfotos (Marke, Sortenname).
 * OpenAI empfiehlt, Text wörtlich in Anführungszeichen in den Prompt zu schreiben —
 * das hält das Etikett beim Neuzeichnen buchstabengetreu. Kleingedrucktes wird bewusst
 * ausgelassen: ein falsch gelesenes Wort im Prompt wäre schlimmer als keins.
 */

const MAX_WORDS = 4;
const cache = new Map<string, string[]>();

/** Antwort des Modells → bereinigte Liste; leer, wenn unsicher oder unbrauchbar. */
export function parseLabelTextResponse(raw: string): string[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const words: string[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") continue;
    const text = item.replace(/\s+/g, " ").replace(/"/g, "").trim();
    if (text.length < 2 || text.length > 40 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    words.push(text);
    if (words.length >= MAX_WORDS) break;
  }
  return words;
}

/** Erwartete Wörter, die im gelesenen Text fehlen (ohne Groß/Klein, Leer- und Satzzeichen). */
export function missingLabelWords(expected: string[], found: string[]): string[] {
  const norm = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const haystack = found.map(norm).join(" ");
  return expected.filter((word) => !haystack.includes(norm(word)));
}

export type LabelCheck = { status: "ok" | "drift" | "unreadable"; missing: string[] };

/**
 * Nachkontrolle am fertigen Bild: stehen die großen Etikett-Wörter der Referenz noch drauf?
 * Ein bezahlter Vision-Aufruf je Bild, deshalb nur per LABEL_FIDELITY_CHECK=log aktiv.
 * shortcut: prüft nur die bis zu vier großen Wörter, weder Kleingedrucktes noch Schriftart;
 * für eine harte Garantie das Original-Etikett aufs Bild montieren statt nachzulesen.
 */
export async function checkGeneratedLabel(
  image: Buffer,
  expected: string[],
  read: typeof readLabelText = readLabelText,
): Promise<LabelCheck> {
  // Claude Vision skaliert ohnehin auf 1568 px; 4K-PNGs lägen über dem Upload-Limit.
  const jpeg = await sharp(image)
    .resize(1568, 1568, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const found = await read({ base64: jpeg.toString("base64"), mime: "image/jpeg" });
  if (!found.length) return { status: "unreadable", missing: expected };
  const missing = missingLabelWords(expected, found);
  return { status: missing.length ? "drift" : "ok", missing };
}

export async function readLabelText(image: OpenAiReferenceImage): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return [];
  const key = createHash("sha256").update(image.base64).digest("hex");
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const response = await createAnthropicMessageWithModelFallback(new Anthropic({ apiKey }), {
      max_tokens: 120,
      temperature: 0,
      system: [
        "You read the printed label of a beverage bottle or can in a product photo.",
        `Return a JSON array with at most ${MAX_WORDS} strings: only the LARGEST, clearly legible words or lines on the front label`,
        "(brand / brewery wordmark, product or style name), copied exactly with original spelling, umlauts and capitalization.",
        "Skip small print, volume, alcohol, addresses, slogans and anything you are not fully sure about.",
        "If nothing is clearly legible, return []. Output only the JSON array.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
                data: image.base64,
              },
            },
            { type: "text", text: "Label words:" },
          ],
        },
      ],
    });
    const block = response.content.find((part) => part.type === "text");
    const words = parseLabelTextResponse(block?.type === "text" ? block.text : "");
    if (cache.size > 200) cache.clear();
    cache.set(key, words);
    return words;
  } catch (error) {
    // Ohne Text geht es trotzdem — das Foto bleibt die Etikett-Referenz.
    console.warn("[label-text] reading label failed:", error);
    return [];
  }
}
