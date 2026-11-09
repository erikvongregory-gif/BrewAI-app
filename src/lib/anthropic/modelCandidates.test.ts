import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anthropicAttemptTimeoutMs,
  createAnthropicMessageWithModelFallback,
  getAnthropicModelCandidates,
} from "./modelCandidates";

describe("getAnthropicModelCandidates", () => {
  const original = process.env.ANTHROPIC_MODEL;

  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = original;
  });

  it("uses active Sonnet/Haiku fallbacks without retired 3.5 models", () => {
    delete process.env.ANTHROPIC_MODEL;
    const models = getAnthropicModelCandidates();
    expect(models[0]).toBe("claude-sonnet-4-6");
    expect(models).toContain("claude-haiku-4-5-20251001");
    expect(models).not.toContain("claude-3-5-haiku-20241022");
    expect(models).not.toContain("claude-3-5-sonnet-20241022");
    expect(models).not.toContain("claude-sonnet-4-20250514");
    expect(models).not.toContain("claude-sonnet-4-5-20250929");
  });

  it("prepends env override before fallbacks", () => {
    process.env.ANTHROPIC_MODEL = "claude-opus-4-6";
    expect(getAnthropicModelCandidates()[0]).toBe("claude-opus-4-6");
  });
});

describe("createAnthropicMessageWithModelFallback", () => {
  it("disables SDK retries and bounds each attempt (no 3x3 retry storm)", async () => {
    delete process.env.ANTHROPIC_MODEL;
    const create = vi.fn(async () => ({ id: "msg", content: [] }));
    const client = { messages: { create } } as unknown as Anthropic;
    await createAnthropicMessageWithModelFallback(client, { max_tokens: 400, messages: [{ role: "user", content: "Hallo" }] });
    expect(create).toHaveBeenCalledTimes(1);
    const [body, requestOptions] = create.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(body).toMatchObject({ model: "claude-sonnet-4-6", stream: false, max_tokens: 400 });
    expect(requestOptions).toMatchObject({ maxRetries: 0, timeout: 45_000 });
    expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls through to the next model on 404 without retrying it", async () => {
    delete process.env.ANTHROPIC_MODEL;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("model: not_found_error"), { status: 404 }))
      .mockResolvedValueOnce({ id: "msg", content: [] });
    const client = { messages: { create } } as unknown as Anthropic;
    await createAnthropicMessageWithModelFallback(client, { max_tokens: 100, messages: [{ role: "user", content: "x" }] });
    expect(create).toHaveBeenCalledTimes(2);
    expect((create.mock.calls[1] as unknown as [Record<string, unknown>])[0].model).toBe("claude-haiku-4-5-20251001");
  });
});

describe("anthropicAttemptTimeoutMs", () => {
  it("scales with max_tokens within 45-150 s", () => {
    expect(anthropicAttemptTimeoutMs(120)).toBe(45_000);
    expect(anthropicAttemptTimeoutMs(3500)).toBe(135_000);
    expect(anthropicAttemptTimeoutMs(5000)).toBe(150_000);
    expect(anthropicAttemptTimeoutMs(undefined)).toBe(60_720);
  });
});
