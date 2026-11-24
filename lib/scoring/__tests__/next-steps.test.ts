import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT_STEPS, nextStepsPrompt, parseNextSteps } from "../next-steps";

describe("nextStepsPrompt", () => {
  it("contains only fixed signal names and built-in text, never the offer text", () => {
    const prompt = nextStepsPrompt(["payment_requested", "urgency_language"]);
    expect(prompt).toContain("payment requested:");
    expect(prompt).toContain("urgency language:");
    // The signature takes keys only, so offer text can't reach the prompt.
    expect(nextStepsPrompt.length).toBe(1);
    expect(prompt).not.toMatch(/Your offer says/);
  });
});

describe("parseNextSteps", () => {
  const json = (steps: string[]) => JSON.stringify({ nextSteps: steps });

  it("keeps safe steps", () => {
    const steps = ["Look up the company on the MCA website.", "Ask HR for an official email from the company domain.", "Don't pay any fee to get the job."];
    expect(parseNextSteps(json(steps))).toEqual(steps);
  });

  it("drops steps that tell the user to pay or contact someone, falling back to defaults if too few remain", () => {
    const injected = [
      "Pay the refundable registration fee of Rs 1,999 to secure your seat.",
      "Message the recruiter on +91 98765 43210 to confirm.",
      "Verify the offer at https://technova-offers.example.",
    ];
    expect(parseNextSteps(json(injected))).toEqual(DEFAULT_NEXT_STEPS);
  });

  it("filters bad steps but keeps the good ones", () => {
    const mixed = [
      "Search the company name on the MCA portal.",
      "Send the security deposit via UPI to confirm.",
      "Ask for an interview with the hiring manager.",
    ];
    expect(parseNextSteps(json(mixed))).toEqual(["Search the company name on the MCA portal.", "Ask for an interview with the hiring manager."]);
  });

  it("falls back on malformed output", () => {
    expect(parseNextSteps("not json")).toEqual(DEFAULT_NEXT_STEPS);
  });
});
