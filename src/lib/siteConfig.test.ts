import { afterEach, describe, expect, it, vi } from "vitest";
import { getSharedCookieDomain } from "./siteConfig";

describe("getSharedCookieDomain", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is host-only outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getSharedCookieDomain()).toBeUndefined();
  });

  it("defaults to brewai.de in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_COOKIE_DOMAIN", "");
    expect(getSharedCookieDomain()).toBe("brewai.de");
  });

  it("strips a leading dot from the configured domain", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_COOKIE_DOMAIN", ".brewai.de");
    expect(getSharedCookieDomain()).toBe("brewai.de");
  });

  it("is host-only in production when configured as none", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_COOKIE_DOMAIN", "none");
    expect(getSharedCookieDomain()).toBeUndefined();
  });
});
