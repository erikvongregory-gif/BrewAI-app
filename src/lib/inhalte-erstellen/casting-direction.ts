import { randomInt } from "node:crypto";
import type { ImagePromptV3Args } from "./image-prompt-v3";
import { resolvePhotoStyle } from "@/app/(dashboard)/inhalte-erstellen/lib/prompt-builders/hyperrealism-blocks";

const FEATURES = [
  "a broad oval face with straight eyebrows",
  "an angular face with a pronounced jaw and rounded eyebrows",
  "a round face with a short nose and softly arched eyebrows",
  "a long face with a broad nose and defined cheekbones",
  "a heart-shaped face with a narrow chin and wide-set eyes",
  "a square face with a rounded nose and deep-set eyes",
] as const;

/** Vary anonymous casting on each request, never a deliberately selected character. */
export function buildCastingDirection(args: ImagePromptV3Args): string {
  if (resolvePhotoStyle(args.input) === "premium") return "";
  if (args.references.some((reference) => reference.role === "character") || args.character?.appearanceLock) return "";
  const scene = args.input.zusatzWunsch || "";
  const hasPeople = (args.input.personenModus ?? (args.input.personImBild ? "D" : "A")) !== "A" ||
    /frau|frauen|mann|männer|maenner|paar|freund|people|woman|women|man|men|person|gruppe/i.test(scene);
  if (!hasPeople) return "";
  const first = randomInt(FEATURES.length);
  const second = (first + 1 + randomInt(FEATURES.length - 1)) % FEATURES.length;
  return `New faces, unrelated to style images: where unspecified, ${FEATURES[first]}; another existing person: ${FEATURES[second]}. Keep requested gender, adult age, clothing and appearance; do not add people. ${ADULT_APPEARANCE_GUARD}`;
}

/**
 * Beer advertising: depicted people must be at least 18 and look it (Deutscher Werberat,
 * Verhaltensregeln alkoholhaltige Getränke, Ziff. 2). Requests for younger-looking people
 * are overridden instead of being kept.
 */
export const ADULT_APPEARANCE_GUARD =
  "Everyone shown must clearly look adult, well over 18; never teenage, childlike or school-age features or styling.";
