import { afterEach, describe, expect, it, vi } from "vitest";
import {
  estimateOpenAiImageCostUsd,
  generateOpenAiImage,
  parseOpenAiImageUsage,
  resolveOpenAiImageTimeoutMs,
} from "@/lib/openai/generateImage";

const PNG_BASE64 = Buffer.from("fake-png-bytes").toString("base64");

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const baseArgs = {
  apiKey: "test-key",
  model: "gpt-image-2.5-sunburst",
  prompt: "Ein Helles im Biergarten",
  size: "1024x1536",
  outputFormat: "png" as const,
  quality: "high" as const,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("generateOpenAiImage", () => {
  it("sends an abort signal and logs token usage without the prompt", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        data: [{ b64_json: PNG_BASE64 }],
        usage: { input_tokens: 1200, output_tokens: 5000, input_tokens_details: { image_tokens: 1000, text_tokens: 200 } },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const buffer = await generateOpenAiImage(baseArgs);

    expect(buffer.toString()).toBe("fake-png-bytes");
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const line = String(info.mock.calls[0]?.[0] ?? "");
    expect(line).toContain('"domain":"ai-cost"');
    expect(line).toContain('"outputTokens":5000');
    expect(line).not.toContain("Biergarten");
  });

  it("does not pay twice: no second request after a timeout", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateOpenAiImage(baseArgs)).rejects.toMatchObject({ classified: { code: "provider_timeout" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not repeat a billed 200 response without image data", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateOpenAiImage(baseArgs)).rejects.toMatchObject({ classified: { code: "provider_unknown" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry content rejections", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () =>
      jsonResponse(400, { error: { message: "Your request was rejected as a result of our safety system." } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateOpenAiImage(baseArgs)).rejects.toMatchObject({
      classified: { code: "provider_content_rejected" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("usage and cost helpers", () => {
  it("parses usage and estimates USD from list prices", () => {
    const usage = parseOpenAiImageUsage({
      usage: { input_tokens: 1200, output_tokens: 5000, input_tokens_details: { image_tokens: 1000, text_tokens: 200 } },
    });
    expect(usage).toEqual({ inputTokens: 1200, outputTokens: 5000, imageInputTokens: 1000, textInputTokens: 200 });
    // 200 × 5 $ + 1000 × 8 $ + 5000 × 30 $ je 1 Mio. Tokens = 0,001 + 0,008 + 0,15
    expect(estimateOpenAiImageCostUsd(usage!)).toBeCloseTo(0.159, 4);
  });

  it("returns null when the API sends no usage", () => {
    expect(parseOpenAiImageUsage({ data: [] })).toBeNull();
    expect(estimateOpenAiImageCostUsd({ inputTokens: 10, outputTokens: null, imageInputTokens: null, textInputTokens: null })).toBeNull();
  });

  it("clamps the configurable timeout", () => {
    expect(resolveOpenAiImageTimeoutMs(undefined)).toBe(180_000);
    expect(resolveOpenAiImageTimeoutMs("5000")).toBe(180_000);
    expect(resolveOpenAiImageTimeoutMs("120000")).toBe(120_000);
    expect(resolveOpenAiImageTimeoutMs("900000")).toBe(290_000);
  });
});
