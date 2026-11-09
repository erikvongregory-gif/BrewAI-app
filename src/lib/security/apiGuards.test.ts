import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Berechtigungsgrenzen der gemeinsamen API-Guards und ausgewählter Routen:
 * fremde Herkunft, fehlende Anmeldung/2FA, Team-Viewer schreibt, fehlendes Abo,
 * kontobezogene Kostenlimits und Mandantentrennung bei Job-IDs.
 */
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  twoFactor: vi.fn(),
  workspace: vi.fn(),
  rate: vi.fn(),
  subscription: vi.fn(),
  eqCalls: [] as Array<[string, unknown]>,
  jobRow: null as Record<string, unknown> | null,
  arkStatus: vi.fn(),
  finish: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true, getSupabaseUrl: () => "https://auth.brewai.de" }));
vi.mock("@/lib/auth/twoFactorSession", () => ({ hasPassedTwoFactor: mocks.twoFactor }));
vi.mock("@/lib/dashboard/workspace", () => ({ workspaceResourceUser: mocks.workspace }));
vi.mock("@/lib/billing/access", () => ({ requireActiveSubscription: mocks.subscription }));
vi.mock("@/lib/security/requestGuards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/requestGuards")>();
  return { ...actual, enforceRateLimitPersistent: mocks.rate };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        mocks.eqCalls.push([column, value]);
        return chain;
      },
      maybeSingle: async () => ({ data: mocks.jobRow, error: null }),
    };
    return { from: () => chain };
  },
}));
vi.mock("@/lib/generation", () => ({
  getModelArkApiKey: () => "ark-test",
  isModelArkRequestId: () => true,
  createModelArkClient: () => ({ status: mocks.arkStatus }),
}));
vi.mock("@/lib/billing/generationJobs", () => ({ finishGeneration: mocks.finish }));
vi.mock("@/lib/dashboard/persistGeneratedMedia", () => ({ persistGeneratedMediaItems: async () => [] }));
vi.mock("@/lib/dashboard/media-store", () => ({
  writeDashboardMedia: vi.fn(),
  readDashboardMedia: vi.fn(),
  readDashboardMediaPage: vi.fn(),
  getDashboardMediaItem: vi.fn(),
  deleteDashboardMedia: vi.fn(),
}));

import {
  costLimitIdentifier,
  requireBillableImageGenerationUser,
  requireImageGenerationUser,
} from "@/app/(dashboard)/inhalte-erstellen/lib/api-guards";
import { POST as generationStatus } from "@/app/api/generation/status/route";
import { POST as mediaPost } from "@/app/api/dashboard/media/route";

const APP = "https://app.brewai.de";
const actor = { id: "member-1", app_metadata: {}, user_metadata: {} };

function post(path: string, init: { origin?: string; ip?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.origin !== undefined) headers.origin = init.origin;
  if (init.ip) headers["x-forwarded-for"] = init.ip;
  return new Request(`${APP}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(init.body ?? {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eqCalls.length = 0;
  mocks.jobRow = null;
  mocks.getUser.mockResolvedValue({ data: { user: actor } });
  mocks.twoFactor.mockResolvedValue(true);
  mocks.rate.mockResolvedValue(null);
  mocks.subscription.mockResolvedValue(null);
  // Teammitglied arbeitet im Workspace des Inhabers.
  mocks.workspace.mockImplementation(async (user: typeof actor) => ({ ...user, id: "owner-1" }));
});

describe("requireImageGenerationUser", () => {
  it("lehnt fremde Herkunft ab, bevor die Session gelesen wird", async () => {
    const result = await requireImageGenerationUser(post("/api/x", { origin: "https://evil.example" }), "t");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
  });

  it("verlangt Anmeldung und 2FA", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    const anonymous = await requireImageGenerationUser(post("/api/x", { origin: APP }), "t");
    expect(!anonymous.ok && anonymous.response.status).toBe(401);

    mocks.twoFactor.mockResolvedValueOnce(false);
    const noTwoFactor = await requireImageGenerationUser(post("/api/x", { origin: APP }), "t");
    expect(!noTwoFactor.ok && noTwoFactor.response.status).toBe(403);
    expect(mocks.workspace).not.toHaveBeenCalled();
  });

  it("zählt Kostenlimits pro Konto – unabhängig von der IP", async () => {
    await requireImageGenerationUser(post("/api/x", { origin: APP, ip: "203.0.113.10" }), "img");
    await requireImageGenerationUser(post("/api/x", { origin: APP, ip: "2001:db8::77" }), "img");
    const identifiers = mocks.rate.mock.calls.map((call) => (call[2] as { identifier?: string }).identifier);
    expect(identifiers).toEqual(Array(4).fill(costLimitIdentifier("member-1")));
    for (const call of mocks.rate.mock.calls) {
      expect((call[2] as { identifierParts?: unknown }).identifierParts).toBeUndefined();
    }
    const prefixes = mocks.rate.mock.calls.map((call) => (call[1] as { keyPrefix: string }).keyPrefix);
    expect(prefixes).toEqual(["img:hour", "img:day", "img:hour", "img:day"]);
  });

  it("verweigert einem Team-Viewer Schreibzugriffe (POST → write=true)", async () => {
    mocks.workspace.mockRejectedValueOnce(new Error("Deine Teamrolle erlaubt nur Lesezugriff."));
    const result = await requireImageGenerationUser(post("/api/x", { origin: APP }), "t");
    expect(!result.ok && result.response.status).toBe(403);
    expect(mocks.workspace).toHaveBeenCalledWith(actor, true);
  });

  it("liefert die Workspace-ID des Inhabers als Ressourcen-ID", async () => {
    const result = await requireImageGenerationUser(post("/api/x", { origin: APP }), "t");
    expect(result.ok && result.userId).toBe("owner-1");
  });
});

describe("requireBillableImageGenerationUser", () => {
  it("gibt 402 zurück, wenn der Workspace weder Abo noch Guthaben hat", async () => {
    const { NextResponse } = await import("next/server");
    mocks.subscription.mockResolvedValueOnce(
      NextResponse.json({ code: "subscription_required" }, { status: 402 }),
    );
    const result = await requireBillableImageGenerationUser(post("/api/x", { origin: APP }), "t");
    expect(!result.ok && result.response.status).toBe(402);
    expect(mocks.subscription).toHaveBeenCalledWith("owner-1");
  });
});

describe("POST /api/generation/status", () => {
  it("lehnt fremde Herkunft ab (Seiteneffekte: Abrechnung, Mediathek)", async () => {
    const response = await generationStatus(
      post("/api/generation/status", { origin: "https://evil.example", body: { requestIds: ["cgt-1"] } }),
    );
    expect(response.status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.arkStatus).not.toHaveBeenCalled();
  });

  it("sucht Jobs nur im eigenen Workspace und fragt fremde Request-IDs nie beim Anbieter ab", async () => {
    mocks.jobRow = null; // Request-ID gehört einem anderen Konto
    const response = await generationStatus(
      post("/api/generation/status", { origin: APP, body: { requestIds: ["cgt-foreign"] } }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: Array<{ error?: string }> };
    expect(body.results[0]?.error).toBe("Auftrag nicht gefunden.");
    expect(mocks.eqCalls).toContainEqual(["user_id", "owner-1"]);
    expect(mocks.eqCalls).toContainEqual(["provider_task_id", "cgt-foreign"]);
    expect(mocks.arkStatus).not.toHaveBeenCalled();
    expect(mocks.finish).not.toHaveBeenCalled();
  });
});

describe("POST /api/dashboard/media", () => {
  const item = {
    id: "m1",
    prompt: "Pils im Biergarten",
    createdAt: new Date().toISOString(),
    aspectRatio: "4:5",
    resolution: "1K",
    outputFormat: "png",
  };

  it("lehnt javascript:- und data:-URLs ab", async () => {
    for (const imageUrl of ["javascript:alert(document.domain)", "data:text/html,<script>alert(1)</script>"]) {
      const response = await mediaPost(post("/api/dashboard/media", { origin: APP, body: { ...item, imageUrl } }));
      expect(response.status, imageUrl).toBe(400);
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("akzeptiert weiterhin https-URLs", async () => {
    const response = await mediaPost(
      post("/api/dashboard/media", {
        origin: APP,
        body: { ...item, imageUrl: "https://auth.brewai.de/storage/v1/object/sign/generated-images/generated/owner-1/a.png?token=x" },
      }),
    );
    expect(response.status).toBe(200);
  });
});
