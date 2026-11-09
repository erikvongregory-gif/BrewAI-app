import { describe, expect, it } from "vitest";
import {
  HOPFEN_HUGO_GREETING,
  HOPFEN_HUGO_USAGE_POLICY,
  buildHopfenHugoSystemPrompt,
  isLikelyPolicyViolation,
} from "./hopfenHugoPolicy";

describe("Hopfen Hugo policy", () => {
  it("discloses in the greeting that users talk to an AI (Art. 50 Abs. 1 KI-VO)", () => {
    expect(HOPFEN_HUGO_GREETING).toContain("KI-Assistent");
    expect(HOPFEN_HUGO_GREETING).toContain("kein Mensch");
    expect(HOPFEN_HUGO_GREETING).toContain("können Fehler enthalten");
  });

  it("keeps the assistant focused on brewery work and forbids posing as a human", () => {
    const prompt = buildHopfenHugoSystemPrompt();
    expect(prompt).toContain("Themenfremde Anfragen");
    expect(prompt).toContain("Gib dich nie als Mensch aus");
    expect(prompt).not.toContain("fast allen harmlosen Themen");
    expect(HOPFEN_HUGO_USAGE_POLICY.allowedSummary).toContain("Bezug zur Arbeit der Brauerei");
  });

  it("never lets the assistant label texts as legally safe", () => {
    const prompt = buildHopfenHugoSystemPrompt();
    expect(prompt).toContain("nie als „rechtssicher“");
    expect(prompt).toContain("bekömmlich");
  });

  it("flags requests that target minors with alcohol advertising", () => {
    expect(isLikelyPolicyViolation("Texte für Kinder über unser Bier")).toBe(true);
    expect(isLikelyPolicyViolation("Werbung für Jugendliche mit unserem Bier")).toBe(true);
    expect(isLikelyPolicyViolation("Post für Schüler mit Alkohol")).toBe(true);
    expect(isLikelyPolicyViolation("Familienfest mit Kinderprogramm im Biergarten")).toBe(false);
    expect(isLikelyPolicyViolation("Wie bewerbe ich unser Helles im Biergarten?")).toBe(false);
  });
});
