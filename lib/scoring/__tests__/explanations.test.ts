import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { explain, says, WHY } from "../explanations";

const route = readFileSync(new URL("../../../app/api/analyze/route.ts", import.meta.url), "utf8");
const signalKeys = [...route.matchAll(/^\s{2}([a-z_]+): \{ weight: \d+, severity:/gm)].map((m) => m[1]);

describe("red-flag explanations", () => {
  it("found the analyzer's signal list", () => {
    expect(signalKeys.length).toBeGreaterThan(20);
  });

  it.each(signalKeys)("%s has a plain-language reason why it matters", (key) => {
    expect(WHY[key]).toMatch(/\w.{40,}\./);
  });

  it("no longer uses the generic \"was triggered\" wording", () => {
    expect(route).not.toMatch(/was triggered/);
    expect(Object.values(WHY).join(" ")).not.toMatch(/was triggered/);
  });

  it("quotes the user's words and then explains", () => {
    const text = explain("urgency_language", says({ phrase: "within 24 hours", quote: "pay Rs 1,999 within 24 hours" }));
    expect(text).toBe(`Your offer says “pay Rs 1,999 within 24 hours”. ${WHY.urgency_language}`);
  });
});
