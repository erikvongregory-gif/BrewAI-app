import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, nonceFromRequest, scriptOpenTag } from "@/lib/security/contentSecurityPolicy";

describe("contentSecurityPolicy", () => {
  it("blocks inline scripts in production unless they carry the nonce", () => {
    const policy = contentSecurityPolicy("11111111-1111-4111-8111-111111111111", false);
    expect(policy).toContain("script-src 'self' 'nonce-11111111-1111-4111-8111-111111111111'");
    expect(policy.split(";").find((part) => part.trim().startsWith("script-src"))).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("allows eval only in development", () => {
    expect(contentSecurityPolicy("abcdef12", true)).toContain("'unsafe-eval'");
  });
});

describe("scriptOpenTag", () => {
  it("puts a valid nonce on the script tag", () => {
    expect(scriptOpenTag("abcdef12")).toBe('<script nonce="abcdef12">');
  });

  it("drops a nonce that could break out of the attribute", () => {
    expect(scriptOpenTag('abc"onload="alert(1)')).toBe("<script>");
  });
});

describe("nonceFromRequest", () => {
  it("reads the middleware nonce", () => {
    const request = new Request("https://app.brewai.de", { headers: { "x-nonce": "abcdef12" } });
    expect(nonceFromRequest(request)).toBe("abcdef12");
  });
});
