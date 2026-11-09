import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyProviderError } from "@/lib/ai/providerErrors";
import { ProviderError, isRetryAllowed, withProviderRetry } from "@/lib/ai/providerRequest";

function providerError(status: number | null, message = "boom") {
  return new ProviderError(classifyProviderError({ provider: "openai", status, message, code: null, retryAfter: null }));
}

const noSleep = vi.fn(async () => {});

afterEach(() => {
  vi.restoreAllMocks();
  noSleep.mockClear();
});

describe("isRetryAllowed", () => {
  it("paid policy retries only rate limits and explicit 5xx answers", () => {
    const classify = (status: number | null, message = "x") =>
      classifyProviderError({ provider: "openai", status, message, code: null, retryAfter: null });
    expect(isRetryAllowed(classify(429), "paid")).toBe(true);
    expect(isRetryAllowed(classify(500), "paid")).toBe(true);
    expect(isRetryAllowed(classify(503), "paid")).toBe(true);
    expect(isRetryAllowed(classify(504), "paid")).toBe(false);
    expect(isRetryAllowed(classify(null, "The operation was aborted due to timeout"), "paid")).toBe(false);
    expect(isRetryAllowed(classify(null, "fetch failed"), "paid")).toBe(false);
    expect(isRetryAllowed(classify(400), "paid")).toBe(false);
  });

  it("default policy keeps retrying every transient error", () => {
    const timeout = classifyProviderError({ provider: "anthropic", status: null, message: "Request timed out.", code: null, retryAfter: null });
    expect(isRetryAllowed(timeout, "default")).toBe(true);
  });
});

describe("withProviderRetry", () => {
  it("does not repeat a paid call after a timeout (provider may already have billed)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const operation = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    await expect(withProviderRetry("openai", operation, { policy: "paid", sleep: noSleep })).rejects.toMatchObject({
      classified: { code: "provider_timeout" },
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries a paid call after a rate limit and succeeds", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(providerError(429, "Rate limit reached"))
      .mockResolvedValueOnce("ok");
    await expect(withProviderRetry("openai", operation, { policy: "paid", sleep: noSleep })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(noSleep).toHaveBeenCalledTimes(1);
  });

  it("keeps the default behaviour: three attempts on timeouts", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const operation = vi.fn(async () => {
      throw new Error("Request timed out.");
    });
    await expect(withProviderRetry("anthropic", operation, { sleep: noSleep })).rejects.toBeInstanceOf(ProviderError);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("stops retrying when the time budget cannot cover backoff plus another attempt", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let clock = 0;
    const operation = vi.fn(async () => {
      clock += 20_000;
      throw providerError(503, "Service unavailable");
    });
    await expect(
      withProviderRetry("openai", operation, { budgetMs: 25_000, sleep: noSleep, now: () => clock }),
    ).rejects.toMatchObject({ classified: { code: "provider_unavailable" } });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(noSleep).not.toHaveBeenCalled();
  });

  it("hands each attempt an abort signal bounded by the attempt timeout", async () => {
    let received: AbortSignal | undefined;
    await withProviderRetry(
      "openai",
      async (signal) => {
        received = signal;
        return "ok";
      },
      { attemptTimeoutMs: 50 },
    );
    expect(received).toBeInstanceOf(AbortSignal);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(received?.aborted).toBe(true);
  });

  it("does not call the provider at all when the caller already aborted", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const controller = new AbortController();
    controller.abort();
    const operation = vi.fn(async () => "never");
    await expect(withProviderRetry("openai", operation, { signal: controller.signal, sleep: noSleep })).rejects.toBeInstanceOf(
      ProviderError,
    );
    expect(operation).not.toHaveBeenCalled();
  });
});
