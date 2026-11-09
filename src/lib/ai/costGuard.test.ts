import { describe, expect, it } from "vitest";
import {
  type CostGuardQueryClient,
  evaluateCostGuard,
  isCostGuardDisabled,
  loadCostGuardUsage,
  resolveCostGuardLimits,
  summarizeJobsForDay,
} from "@/lib/ai/costGuard";

const NOW = new Date("2026-11-09T20:30:00.000Z");

describe("summarizeJobsForDay", () => {
  it("counts only today's jobs and books charged/reserved/failed correctly", () => {
    const usage = summarizeJobsForDay(
      [
        { status: "completed", amount: 33, charged: 22, created_at: "2026-11-09T08:00:00Z" },
        { status: "reserved", amount: 11, created_at: "2026-11-09T20:00:00Z" },
        { status: "failed", amount: 11, charged: 0, created_at: "2026-11-09T19:00:00Z" },
        { status: "completed", amount: 99, charged: 99, created_at: "2026-11-08T23:59:59Z" },
        { status: "completed", amount: 5, charged: 5, created_at: null },
      ],
      NOW,
    );
    expect(usage).toEqual({ jobs: 3, failedJobs: 1, tokens: 33 });
  });
});

describe("evaluateCostGuard", () => {
  const limits = { maxJobsPerDay: 10, maxFailedJobsPerDay: 3, maxTokensPerDay: 100 };

  it("allows normal usage", () => {
    expect(evaluateCostGuard({ usage: { jobs: 2, failedJobs: 0, tokens: 20 }, requestTokens: 11, limits, now: NOW }).allowed).toBe(true);
  });

  it("blocks loops of failed (refunded) jobs", () => {
    const decision = evaluateCostGuard({ usage: { jobs: 3, failedJobs: 3, tokens: 0 }, requestTokens: 11, limits, now: NOW });
    expect(decision).toMatchObject({ allowed: false, reason: "daily_failed_jobs", retryAt: "2026-11-10T00:00:00.000Z" });
    if (!decision.allowed) expect(decision.retryAfterSeconds).toBe(3.5 * 3600);
  });

  it("blocks when the job count is reached", () => {
    expect(evaluateCostGuard({ usage: { jobs: 10, failedJobs: 0, tokens: 0 }, requestTokens: 0, limits, now: NOW })).toMatchObject({
      allowed: false,
      reason: "daily_jobs",
    });
  });

  it("blocks a request that would exceed the token cap", () => {
    const decision = evaluateCostGuard({ usage: { jobs: 5, failedJobs: 0, tokens: 95 }, requestTokens: 11, limits, now: NOW });
    expect(decision).toMatchObject({ allowed: false, reason: "daily_tokens" });
    if (!decision.allowed) expect(decision.message).toContain("95");
  });
});

describe("resolveCostGuardLimits", () => {
  it("uses plan defaults and lets env override them", () => {
    expect(resolveCostGuardLimits("start", {}).maxTokensPerDay).toBe(480);
    expect(resolveCostGuardLimits("owner", {}).maxTokensPerDay).toBe(Number.POSITIVE_INFINITY);
    expect(resolveCostGuardLimits(null, {}).maxJobsPerDay).toBe(60);
    expect(resolveCostGuardLimits("pro", { AI_COST_GUARD_MAX_JOBS_PER_DAY: "7", AI_COST_GUARD_MAX_TOKENS_PER_DAY: "x" })).toMatchObject({
      maxJobsPerDay: 7,
      maxTokensPerDay: 3000,
    });
  });

  it("reads the kill switch", () => {
    expect(isCostGuardDisabled({ AI_COST_GUARD_DISABLED: "true" })).toBe(true);
    expect(isCostGuardDisabled({})).toBe(false);
  });
});

describe("loadCostGuardUsage", () => {
  function clientReturning(result: { data: unknown; error: unknown }, seen: Record<string, unknown> = {}): CostGuardQueryClient {
    return {
      from(table) {
        seen.table = table;
        return {
          select(columns) {
            seen.columns = columns;
            return {
              eq(column, value) {
                seen.eq = [column, value];
                return {
                  gte(gteColumn, gteValue) {
                    seen.gte = [gteColumn, gteValue];
                    return Promise.resolve(result as never);
                  },
                };
              },
            };
          },
        };
      },
    };
  }

  it("queries today's jobs of one user", async () => {
    const seen: Record<string, unknown> = {};
    const usage = await loadCostGuardUsage(
      clientReturning({ data: [{ status: "reserved", amount: 6, created_at: "2026-11-09T10:00:00Z" }], error: null }, seen),
      "user-1",
      NOW,
    );
    expect(usage).toEqual({ jobs: 1, failedJobs: 0, tokens: 6 });
    expect(seen).toMatchObject({ table: "generation_jobs", eq: ["user_id", "user-1"], gte: ["created_at", "2026-11-09T00:00:00.000Z"] });
  });

  it("returns null on read errors so callers can fail open", async () => {
    expect(await loadCostGuardUsage(clientReturning({ data: null, error: { message: "down" } }), "user-1", NOW)).toBeNull();
  });
});
