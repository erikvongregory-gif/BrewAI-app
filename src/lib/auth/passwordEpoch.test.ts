import { describe, expect, it } from "vitest";
import { readPasswordEpoch } from "@/lib/auth/passwordRecoveryGate";

describe("readPasswordEpoch", () => {
  it("nutzt app_metadata (serverseitig) vor user_metadata (vom Nutzer schreibbar)", () => {
    // Angreifer mit Passwort setzt user_metadata auf einen alten Wert zurück – darf nicht wirken.
    const user = { app_metadata: { password_epoch: 1_800_000_000_000 }, user_metadata: { password_epoch: 1 } };
    expect(readPasswordEpoch(user)).toBe(1_800_000_000_000);
  });

  it("fällt für Altkonten ohne app_metadata-Wert auf user_metadata zurück", () => {
    expect(readPasswordEpoch({ app_metadata: {}, user_metadata: { password_epoch: "1700000000000" } })).toBe(
      1_700_000_000_000,
    );
  });

  it("ignoriert ungültige Werte und liefert sonst 0", () => {
    expect(readPasswordEpoch({ app_metadata: { password_epoch: -5 }, user_metadata: { password_epoch: "abc" } })).toBe(0);
    expect(readPasswordEpoch(null)).toBe(0);
  });
});
