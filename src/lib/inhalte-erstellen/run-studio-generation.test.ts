import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/beverages/beer-appearance-store", async () => {
  const { BEER_PHYSICS } = await import("@/lib/beverages/beer-appearance");
  return { readBeerAppearance: vi.fn(async (style: string) => BEER_PHYSICS[style]) };
});

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  resume: vi.fn(),
  finish: vi.fn(),
  render: vi.fn(),
  persist: vi.fn(),
  automaticLooks: vi.fn(() => { throw new Error("V3 must not load automatic style images"); }),
  labelWords: vi.fn<() => Promise<string[]>>(),
  provenance: vi.fn(async (buffer: Buffer) => buffer),
}));

vi.mock("@/app/(dashboard)/inhalte-erstellen/lib/api-guards", () => ({
  requireImageGenerationUser: async () => ({ ok: true, userId: "user", userMetadata: {} }),
}));
vi.mock("@/lib/billing/access", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/billing/store", () => ({
  ensureBillingRow: async () => {},
  getEffectiveBillingRow: async () => ({ monthly_tokens: 1000, used_tokens: 0 }),
}));
vi.mock("@/lib/billing/generationJobs", () => ({
  resumeGenerationIfPresent: mocks.resume,
  reserveGeneration: mocks.reserve,
  finishGeneration: mocks.finish,
  saveGenerationProgress: vi.fn(),
  buildGenerationBillingSnapshot: vi.fn(() => ({ consumed: 20, remainingTokens: 980, perVariant: 10 })),
  linkProviderTask: vi.fn(),
  getGenerationJobForUser: async () => ({ id: "job", user_id: "user", result: {} }),
}));
vi.mock("@/lib/openai/imageApiKey", () => ({ requireOpenAiImageApiKey: () => "test-key" }));
vi.mock("@/lib/brand/label-text", () => ({ readLabelText: mocks.labelWords }));
vi.mock("@/lib/brand/reference-image-bytes", () => ({
  resolveReferenceImageForVision: async (raw: string) => ({ mime: "image/png", base64: raw.slice(-8) }),
}));
vi.mock("@/lib/openai/bottleShapeReference", () => ({ loadBottleShapeReference: async () => null }));
vi.mock("@/lib/openai/glassShapeReference", () => ({ loadGlassShapeReference: async () => null }));
vi.mock("@/lib/openai/styleLookReferences", () => ({ loadStyleLookReferences: mocks.automaticLooks }));
vi.mock("@/lib/dashboard/brandProfile", () => ({
  getBrandProfileFromMetadata: () => ({
    breweryName: "Test",
    brandLabelReferenceUrl: "https://cdn.example/brand.png",
    brandHeadlineFontName: "",
    brandFontFileUrl: "",
    brandColors: "#112233",
    brandFontWeight: "700",
  }),
  canUseCampaignWithTextProfile: () => true,
  buildBrandProfilePromptContext: () => "brand look",
}));
vi.mock("@/lib/prompts/prompt-compiler", () => ({
  compileBrief: async () => ({
    blocking_issues: [],
    image_prompt: "A beer garden.",
    generation_settings: { aspectRatio: "16:9", quality: "medium" },
    normalized_brief: { scene: "garden", action: "", people: "" },
    missing_information: [],
    reference_roles: [],
  }),
}));
vi.mock("@/lib/openai/generateImage", () => ({
  generateOpenAiImage: mocks.render,
  mapAspectRatioToOpenAiSize: () => "1024x1536",
  cropImageBufferToAspectRatio: async (buffer: Buffer) => buffer,
}));
vi.mock("@/lib/openai/aiWatermark", () => ({
  applyAiWatermark: async (buffer: Buffer) => buffer,
  applyAiProvenanceMetadata: mocks.provenance,
}));
vi.mock("@/lib/supabase/storage", () => ({
  uploadGeneratedImageToStorage: async () => "https://cdn.example/out.png",
  uploadGeneratedImageWithThumb: async () => ({
    imageUrl: "https://cdn.example/out.png",
    thumbUrl: "https://cdn.example/out-thumb.webp",
  }),
}));
vi.mock("@/lib/dashboard/persistGeneratedMedia", () => ({ persistGeneratedMediaItems: mocks.persist }));
vi.mock("@/lib/kie/nanoBananaCharacterGenerate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kie/nanoBananaCharacterGenerate")>();
  return {
    ...actual,
    generateCharacterIdentityImage: mocks.render,
    cropBufferFaceSafe: async (buffer: Buffer) => buffer,
  };
});
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: () => undefined };
});

import { POST as product } from "@/app/api/inhalte-erstellen/create-task/route";
import { POST as social } from "@/app/api/inhalte-erstellen/social-post/route";
import {
  STUDIO_FUNCTION_BUDGET_MS,
  STUDIO_PERSIST_RESERVE_MS,
  remainingVariantBudgetMs,
} from "@/lib/inhalte-erstellen/run-studio-generation";

const characterPayload = {
  etikettBild: "https://cdn.example/beer.png",
  flaschenTyp: "nrw_500",
  bierstil: "helles",
  szene: "biergarten_sommer",
  etikettModus: "marke",
  keepLabel: true,
  characterName: "Marta",
  characterReferenceImages: ["https://cdn.example/marta.jpg"],
  extraReferenceImages: [
    "https://cdn.example/scene.png",
    "https://cdn.example/look.png",
    "https://cdn.example/too-many.png",
  ],
  extraReferenceRoles: ["scene", "look", "scene"],
  aspectRatio: "16:9",
  variantCount: 1,
  quality: "medium",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labelWords.mockResolvedValue([]);
  vi.stubEnv("KIE_API_KEY", "test-kie");
  mocks.resume.mockResolvedValue(null);
  mocks.reserve.mockResolvedValue({ id: "job", user_id: "user" });
  mocks.finish.mockResolvedValue({ ok: true, state: { monthly_tokens: 1000, used_tokens: 20 } });
  mocks.persist.mockResolvedValue([{ id: "gen-job-0" }]);
  mocks.render.mockResolvedValue(Buffer.from("img"));
});

describe("studio generation contract", () => {
  it.each([['high', 'high'], ['ultra', 'xhigh']])("honors %s render quality and reports actual output dimensions", async (quality, expected) => {
    vi.stubEnv("OPENAI_IMAGE_QUALITY", "");
    const response = await product(new Request("https://app.example/api/inhalte-erstellen/create-task", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...characterPayload, characterName: undefined, characterReferenceImages: [], extraReferenceImages: [], quality, aspectRatio: "16:9" }),
    }));
    expect(response.status).toBe(202);
    const request = mocks.render.mock.calls[0][0];
    expect(request.quality).toBe(expected);
    const body = await response.json();
    expect(body.snapshot.outputDimensions).toEqual(body.outputDimensions);
    if (quality === "ultra") expect(body.outputDimensions.width).toBeGreaterThan(3000);
    vi.unstubAllEnvs();
  });
  it("sends a Dunkel liquid swatch and matching prompt for a locked Dunkel label", async () => {
    mocks.labelWords.mockResolvedValue(["ABK", "DUNKEL"]);
    const response = await product(new Request("https://app.example/api/inhalte-erstellen/create-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...characterPayload, characterName: undefined, characterReferenceImages: [], extraReferenceImages: [], photoStyle: "reportage", behaelter: "B", bierstil: "helles", glasTyp: "willibecher", zusatzWunsch: "Zwei Freunde stoßen mit Gläsern an" }),
    }));
    expect(response.status).toBe(202);
    const request = mocks.render.mock.calls[0][0];
    expect(request.prompt).toContain("SELECTED BEER IN EVERY GLASS: dunkel");
    expect(request.prompt).toContain("Image 2: selected beer color swatch only");
    expect(request.prompt).toContain("Candid snapshot photography");
    expect(request.referenceImages).toHaveLength(2);
    expect(request.referenceImages[1].mime).toBe("image/png");
    // Ohne sichtbares KI-Label bekommt jedes Bild trotzdem die maschinenlesbare Kennzeichnung.
    expect(mocks.provenance).toHaveBeenCalled();
  });
  it.each([
    ["product", product, "reportage", "Candid snapshot photography"],
    ["product", product, "premium", "Natural, high-quality editorial photography"],
    ["product", product, "campaign", "Art-directed beverage advertising photography"],
    ["social", social, "reportage", "Candid snapshot photography"],
    ["social", social, "premium", "Natural, high-quality editorial photography"],
    ["social", social, "campaign", "Art-directed beverage advertising photography"],
  ] as const)("uses V3 without automatic looks or cultural wardrobe (%s)", async (_mode, route, style, treatment) => {
    vi.stubEnv("IMAGE_PROMPT_VERSION", "v1");
    const response = await route(new Request("https://app.example/api/inhalte-erstellen/create-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...characterPayload, headline: "Unser Bier", characterName: undefined, characterReferenceImages: [], extraReferenceImages: [], photoStyle: style, zusatzWunsch: "Zwei Freunde in einer Küche", behaelter: "F" }),
    }));
    expect(response.status).toBe(202);
    expect(mocks.automaticLooks).not.toHaveBeenCalled();
    expect(mocks.render).toHaveBeenCalledTimes(1);
    const request = mocks.render.mock.calls[0][0];
    expect(request.prompt).toContain("CUSTOMER SCENE (authoritative): Zwei Freunde in einer Küche");
    expect(request.prompt).toContain(treatment);
    expect(request.prompt).not.toMatch(/tracht|dirndl|lederhosen|bavarian|beer garden/i);
    expect(request.referenceImages).toHaveLength(1);
    vi.unstubAllEnvs();
  });
  it("rejects character plus too many extra refs before reserving tokens", async () => {
    const response = await product(
      new Request("https://app.example/api/inhalte-erstellen/create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(characterPayload),
      }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("extra_refs_overflow");
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("stores the effective character format on the accepted snapshot", async () => {
    const response = await product(
      new Request("https://app.example/api/inhalte-erstellen/create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...characterPayload, extraReferenceImages: ["https://cdn.example/scene.png"] }),
      }),
    );
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.snapshot.aspectRatio).toBe("4:5");
    expect(body.aspectRatio).toBe("4:5");
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
  });

  it("resumes the same job instead of reserving again", async () => {
    mocks.resume.mockResolvedValueOnce(
      new Response(JSON.stringify({ images: [{ imageUrl: "https://cdn.example/done.png" }], jobId: "job" }), {
        status: 200,
      }),
    );
    const response = await product(
      new Request("https://app.example/api/inhalte-erstellen/create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "same-key" },
        body: JSON.stringify({ ...characterPayload, extraReferenceImages: [] }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
});

describe("remainingVariantBudgetMs", () => {
  const deadlineAt = 1_000_000 + STUDIO_FUNCTION_BUDGET_MS;

  it("gives the first variant the remaining budget minus the persist reserve", () => {
    expect(remainingVariantBudgetMs({ deadlineAt, now: 1_000_000, variantIndex: 0 })).toBe(
      STUDIO_FUNCTION_BUDGET_MS - STUDIO_PERSIST_RESERVE_MS,
    );
  });

  it("does not start another paid variant that cannot finish before the function ends", () => {
    expect(remainingVariantBudgetMs({ deadlineAt, now: deadlineAt - 70_000, variantIndex: 1 })).toBeNull();
    expect(remainingVariantBudgetMs({ deadlineAt, now: deadlineAt - 120_000, variantIndex: 2 })).toBe(95_000);
  });

  it("still runs the first variant late, with a minimal budget", () => {
    expect(remainingVariantBudgetMs({ deadlineAt, now: deadlineAt - 10_000, variantIndex: 0 })).toBe(1_000);
  });
});
