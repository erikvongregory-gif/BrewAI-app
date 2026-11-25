import { afterEach, describe, expect, it, vi } from "vitest";
import { canRetryStatus, fetchWithRetry, parseRetryAfterMs } from "@/lib/http/fetchWithRetry";

const noSleep = vi.fn(async () => {});

afterEach(() => {
  vi.unstubAllGlobals();
  noSleep.mockClear();
});

describe("fetchWithRetry", () => {
  it("does not repeat a POST after a 5xx (the server may already have done the paid work)", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 504 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("/api/brand/analyze-url", { method: "POST", body: "{}" }, { retries: 2, sleep: noSleep });
    expect(res.status).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still retries an idempotent PUT after a 5xx", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("/api/dashboard/settings", { method: "PUT", body: "{}" }, { retries: 2, sleep: noSleep });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows POST retries with an Idempotency-Key", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response("{}", { status: 502 }))
      .mockResolvedValueOnce(new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry(
      "/api/inhalte-erstellen/create-task",
      { method: "POST", headers: { "Idempotency-Key": "abc" }, body: "{}" },
      { retries: 1, sleep: noSleep },
    );
    expect(res.status).toBe(202);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a 429 with a long Retry-After instead of hammering the server", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("/api/dashboard/settings", { method: "GET" }, { retries: 3, sleep: noSleep });
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits for a short Retry-After before retrying", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchWithRetry("/api/x", { method: "GET" }, { retries: 1, sleep: noSleep });
    expect(noSleep).toHaveBeenCalledWith(2000);
  });

  it("retries network failures for any method", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("/api/x", { method: "POST" }, { retries: 1, sleep: noSleep });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("helpers", () => {
  it("classifies methods", () => {
    expect(canRetryStatus({ method: "GET" }, {})).toBe(true);
    expect(canRetryStatus({}, {})).toBe(true);
    expect(canRetryStatus({ method: "post" }, {})).toBe(false);
    expect(canRetryStatus({ method: "POST" }, { idempotent: true })).toBe(true);
  });

  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs("3")).toBe(3000);
    expect(parseRetryAfterMs("Thu, 01 Jan 1970 00:00:10 GMT", 0)).toBe(10_000);
    expect(parseRetryAfterMs("bogus")).toBeNull();
  });
});
