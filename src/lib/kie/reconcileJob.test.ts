import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ finish: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/billing/generationJobs", () => ({ finishGeneration: mocks.finish }));

import { reconcileKieJob } from "@/lib/kie/reconcileJob";

const NOW = Date.parse("2026-11-09T20:00:00Z");
const HOUR = 60 * 60 * 1000;

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    user_id: "user-1",
    amount: 33,
    status: "reserved",
    result: null,
    provider_task_id: "task-1",
    created_at: new Date(NOW - HOUR).toISOString(),
    ...overrides,
  } as Parameters<typeof reconcileKieJob>[0];
}

function kieResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  process.env.KIE_API_KEY = "test-key";
  mocks.finish.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reconcileKieJob", () => {
  it("charges the full amount when the provider delivered media (unchanged)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => kieResponse({ data: { state: "success", resultJson: JSON.stringify({ resultUrls: ["https://cdn.kie.ai/x.png"] }) } })));
    await reconcileKieJob(job(), NOW);
    expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1" }), 33, expect.objectContaining({ state: "success" }));
  });

  it("releases the reservation for success without media once the grace period is over", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => kieResponse({ data: { state: "success" } })));
    await reconcileKieJob(job(), NOW);
    expect(mocks.finish).toHaveBeenCalledWith(
      expect.anything(),
      0,
      expect.objectContaining({ error: "Anbieter lieferte kein Ergebnis.", phase: "failed" }),
    );
  });

  it("waits during the grace period before treating an empty success as final", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => kieResponse({ data: { state: "success" } })));
    await reconcileKieJob(job({ created_at: new Date(NOW - 5 * 60_000).toISOString() }), NOW);
    expect(mocks.finish).not.toHaveBeenCalled();
  });

  it("keeps waiting for a running task younger than 24 h", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => kieResponse({ data: { state: "generating" } })));
    await reconcileKieJob(job(), NOW);
    expect(mocks.finish).not.toHaveBeenCalled();
  });

  it("releases a task that is still not finished after 24 h", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => kieResponse({ data: { state: "generating" } })));
    await reconcileKieJob(job({ created_at: new Date(NOW - 25 * HOUR).toISOString() }), NOW);
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), 0, expect.objectContaining({ phase: "failed" }));
  });

  it("releases a stale job even when the provider no longer knows the task", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => kieResponse({ msg: "not found" }, 404)));
    await reconcileKieJob(job({ created_at: new Date(NOW - 30 * HOUR).toISOString() }), NOW);
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), 0, expect.objectContaining({ state: "http_404" }));
  });

  it("charges only already delivered studio variants of a stale job", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => kieResponse({ msg: "not found" }, 404)));
    await reconcileKieJob(
      job({
        created_at: new Date(NOW - 30 * HOUR).toISOString(),
        result: { images: [{ imageUrl: "https://cdn.example/1.png" }], perVariantCost: 11 },
      }),
      NOW,
    );
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), 11, expect.objectContaining({ phase: "partial" }));
  });

  it("still throws for a fresh job when the provider status is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => kieResponse({}, 503)));
    await expect(reconcileKieJob(job(), NOW)).rejects.toThrow("Providerstatus derzeit nicht verfügbar.");
    expect(mocks.finish).not.toHaveBeenCalled();
  });
});
