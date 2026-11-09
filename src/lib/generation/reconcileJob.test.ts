import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  finish: vi.fn(async () => ({ ok: true })),
  status: vi.fn(),
  persist: vi.fn(async () => [{ id: "media-1" }]),
}));
vi.mock("@/lib/billing/generationJobs", () => ({ finishGeneration: mocks.finish }));
vi.mock("@/lib/dashboard/persistGeneratedMedia", () => ({ persistGeneratedMediaItems: mocks.persist }));
vi.mock("@/lib/generation", () => ({
  createModelArkClient: () => ({ status: mocks.status }),
  isModelArkRequestId: (id: string) => id.startsWith("cgt-"),
}));

import { reconcileModelArkJob } from "@/lib/generation/reconcileJob";

const NOW = Date.parse("2026-11-09T20:00:00Z");
const HOUR = 60 * 60 * 1000;

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    user_id: "user-1",
    amount: 150,
    status: "reserved",
    result: { tokenCost: 150 },
    provider_task_id: "cgt-123",
    created_at: new Date(NOW - HOUR).toISOString(),
    ...overrides,
  } as Parameters<typeof reconcileModelArkJob>[0];
}

beforeEach(() => {
  mocks.finish.mockClear();
  mocks.status.mockReset();
});

describe("reconcileModelArkJob", () => {
  it("books a completed video (unchanged)", async () => {
    mocks.status.mockResolvedValue({ status: "completed", requestId: "cgt-123", video: { url: "https://cdn.example/v.mp4" } });
    await reconcileModelArkJob(job(), NOW);
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), 150, expect.objectContaining({ phase: "completed" }));
  });

  it("keeps waiting for a running task younger than 24 h", async () => {
    mocks.status.mockResolvedValue({ status: "running", requestId: "cgt-123" });
    await reconcileModelArkJob(job(), NOW);
    expect(mocks.finish).not.toHaveBeenCalled();
  });

  it("releases the reservation of a task still running after 24 h", async () => {
    mocks.status.mockResolvedValue({ status: "running", requestId: "cgt-123" });
    await reconcileModelArkJob(job({ created_at: new Date(NOW - 25 * HOUR).toISOString() }), NOW);
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), 0, expect.objectContaining({ phase: "failed" }));
  });

  it("releases a stale job when the status call fails (expired task)", async () => {
    mocks.status.mockRejectedValue(new Error("404 task not found"));
    await expect(reconcileModelArkJob(job({ created_at: new Date(NOW - 48 * HOUR).toISOString() }), NOW)).resolves.toBeNull();
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), 0, expect.objectContaining({ provider: "modelark" }));
  });

  it("rethrows status errors for fresh jobs", async () => {
    mocks.status.mockRejectedValue(new Error("timeout"));
    await expect(reconcileModelArkJob(job(), NOW)).rejects.toThrow("timeout");
    expect(mocks.finish).not.toHaveBeenCalled();
  });

  it("releases a completed task without video after the grace period", async () => {
    mocks.status.mockResolvedValue({ status: "completed", requestId: "cgt-123" });
    await reconcileModelArkJob(job(), NOW);
    expect(mocks.finish).toHaveBeenCalledWith(expect.anything(), 0, expect.objectContaining({ error: "Anbieter lieferte kein Ergebnis." }));
  });
});
