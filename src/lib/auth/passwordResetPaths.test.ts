import { describe, expect, it } from "vitest";
import { buildRecoveryConfirmUrl, isPasswordResetPublicPath, PASSWORD_RESET_CONFIRM } from "./passwordResetPaths";

describe("passwordResetPaths", () => {
  it("builds the confirm URL with an encoded token hash", () => {
    expect(buildRecoveryConfirmUrl("https://app.brewai.de", "ab/c+d=")).toBe(
      "https://app.brewai.de/passwort-zuruecksetzen/bestaetigen?token_hash=ab%2Fc%2Bd%3D",
    );
  });

  it("treats the confirm page as public during the waitlist", () => {
    expect(isPasswordResetPublicPath(PASSWORD_RESET_CONFIRM, new URLSearchParams())).toBe(true);
    expect(isPasswordResetPublicPath("/auth/callback", new URLSearchParams("type=recovery"))).toBe(true);
    expect(isPasswordResetPublicPath("/auth/callback", new URLSearchParams("type=signup"))).toBe(false);
  });
});
