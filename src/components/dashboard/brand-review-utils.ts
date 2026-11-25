import type { BrandReferenceImagePayload, BrandScanSuggestion } from "./BrandProfileSetupModal";

export {
  computeProfileStrength,
  describeFieldEvidence,
  formatConfidenceLabel,
  parseHexSwatches,
  parseRuleSentences,
  parseToneTags,
  type ProfileStrength,
} from "@/lib/brand/brand-profile-display";

export function reviewReferencePreviews(review: BrandScanSuggestion): string[] {
  if (review.referenceImagePayloads?.length) {
    return [...new Set(review.referenceImagePayloads.map((image: BrandReferenceImagePayload) => `data:${image.mime};base64,${image.base64}`))];
  }
  return [...new Set(review.referenceImageUrls.map((url) => url.trim()).filter(Boolean))];
}
