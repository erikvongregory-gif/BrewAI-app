import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOpenAiImageApiKey,
  LEGACY_OPENAI_KEY_ENV,
  OPENAI_IMAGE_KEY_ENV,
  requireOpenAiImageApiKey,
} from "@/lib/openai/imageApiKey";

/**
 * Hermetisch: Echte Keys aus der lokalen Shell-Umgebung dürfen weder das Ergebnis
 * beeinflussen noch bei einem Fehlschlag in der Testausgabe landen. Deshalb werden
 * beide Variablen vor jedem Test geleert und Werte nie direkt per toBe verglichen
 * (Vitest würde den tatsächlichen Wert im Diff ausgeben).
 */
function expectKey(actual: string | null, expected: string | null) {
  if (actual === expected) return;
  const describeValue = (value: string | null) =>
    value === null ? "null" : `[redacted, ${value.length} Zeichen]`;
  throw new Error(`Unerwarteter Key-Wert: ${describeValue(actual)} statt ${describeValue(expected)}`);
}

describe("imageApiKey", () => {
  beforeEach(() => {
    vi.stubEnv(OPENAI_IMAGE_KEY_ENV, "");
    vi.stubEnv(LEGACY_OPENAI_KEY_ENV, "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bevorzugt OPENAI_IMAGE_API_KEY", () => {
    vi.stubEnv(OPENAI_IMAGE_KEY_ENV, "sk-image-test");
    vi.stubEnv(LEGACY_OPENAI_KEY_ENV, "sk-legacy-test");
    expectKey(getOpenAiImageApiKey(), "sk-image-test");
    expectKey(requireOpenAiImageApiKey(), "sk-image-test");
  });

  it("faellt auf OPENAI_API_KEY zurueck", () => {
    vi.stubEnv(LEGACY_OPENAI_KEY_ENV, "sk-legacy-test");
    expectKey(getOpenAiImageApiKey(), "sk-legacy-test");
  });

  it("ignoriert reine Leerzeichen", () => {
    vi.stubEnv(OPENAI_IMAGE_KEY_ENV, "   ");
    vi.stubEnv(LEGACY_OPENAI_KEY_ENV, " sk-legacy-test ");
    expectKey(getOpenAiImageApiKey(), "sk-legacy-test");
  });

  it("wirft wenn kein Key gesetzt ist, ohne einen Wert zu nennen", () => {
    expectKey(getOpenAiImageApiKey(), null);
    let message = "";
    try {
      requireOpenAiImageApiKey();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/OPENAI_IMAGE_API_KEY fehlt/);
  });

  it("expectKey gibt bei Abweichung nie den Klartext aus", () => {
    let message = "";
    try {
      expectKey("sk-geheim-1234", "sk-anderer-wert");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message.includes("geheim")).toBe(false);
    expect(message.includes("anderer")).toBe(false);
    expect(message).toMatch(/redacted/);
  });
});
