import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rate: vi.fn() }));
vi.mock("@/lib/security/requestGuards", () => ({ enforceRateLimitPersistent: mocks.rate }));
vi.mock("@/lib/supabase/env", () => ({ getAppBaseUrlOrigin: (fallback: string) => fallback }));

import { NextResponse } from "next/server";
import { GET as operatorAccess } from "@/app/auth/operator-access/route";
import { WAITLIST_BYPASS_COOKIE } from "@/lib/auth/waitlistBypass";

const SECRET = "operator-secret-for-tests-123";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LOGIN_WAITLIST_BYPASS_SECRET", SECRET);
  mocks.rate.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /auth/operator-access", () => {
  it("begrenzt Rateversuche, bevor der Token geprüft wird", async () => {
    mocks.rate.mockResolvedValueOnce(NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 }));
    const response = await operatorAccess(new Request(`https://app.brewai.de/auth/operator-access?token=${SECRET}`));
    expect(response.status).toBe(429);
    expect(response.headers.get("set-cookie") ?? "").not.toContain(WAITLIST_BYPASS_COOKIE);
    expect(mocks.rate.mock.calls[0]?.[1]).toMatchObject({ keyPrefix: "auth-operator-access", limit: 10 });
  });

  it("setzt bei falschem Token kein Bypass-Cookie", async () => {
    const response = await operatorAccess(new Request("https://app.brewai.de/auth/operator-access?token=falsch"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("waitlist=1");
    expect(response.headers.get("set-cookie") ?? "").not.toContain(WAITLIST_BYPASS_COOKIE);
  });

  it("setzt bei gültigem Token das Cookie und unterdrückt den Referer", async () => {
    const response = await operatorAccess(new Request(`https://app.brewai.de/auth/operator-access?token=${SECRET}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("set-cookie") ?? "").toContain(WAITLIST_BYPASS_COOKIE);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
