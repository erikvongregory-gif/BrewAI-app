import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  values: new Map<string, string>(),
  set: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (store.values.has(name) ? { name, value: store.values.get(name)! } : undefined),
    set: store.set,
  }),
}));

import { getValueFromCookie, setValueToCookie } from "@/server/server-actions";

beforeEach(() => {
  vi.clearAllMocks();
  store.values.clear();
  store.values.set("sb-auth-auth-token", "refresh-token-secret");
  store.values.set("evglab_admin_2fa_verified", "signed-2fa");
  store.values.set("theme_mode", "dark");
});

describe("Server Actions für Einstellungs-Cookies", () => {
  it("geben HttpOnly-Sitzungs- und 2FA-Cookies nicht an den Client heraus", async () => {
    expect(await getValueFromCookie("sb-auth-auth-token")).toBeUndefined();
    expect(await getValueFromCookie("evglab_admin_2fa_verified")).toBeUndefined();
    expect(await getValueFromCookie("__proto__")).toBeUndefined();
  });

  it("lesen registrierte Einstellungen weiterhin", async () => {
    expect(await getValueFromCookie("theme_mode")).toBe("dark");
  });

  it("überschreiben keine fremden Cookies", async () => {
    await expect(setValueToCookie("evglab_2fa_device", "forged")).rejects.toThrow();
    await expect(setValueToCookie("sb-auth-auth-token", "attacker-session")).rejects.toThrow();
    expect(store.set).not.toHaveBeenCalled();
  });

  it("speichern nur erlaubte Werte mit Pfad / und begrenzter Laufzeit", async () => {
    await setValueToCookie("theme_mode", "dark", { path: "/admin", maxAge: 10 * 365 * 24 * 3600 });
    const [name, value, options] = store.set.mock.calls[0] as [string, string, { path: string; maxAge: number }];
    expect(name).toBe("theme_mode");
    expect(value).toBe("dark");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBeLessThanOrEqual(365 * 24 * 3600);
  });

  it("ersetzt ungültige Werte durch den Standard", async () => {
    await setValueToCookie("theme_mode", "<script>");
    expect(store.set.mock.calls[0]?.[1]).toBe("light");
  });
});
