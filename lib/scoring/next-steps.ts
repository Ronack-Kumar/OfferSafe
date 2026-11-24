import { WHY } from "./explanations";
import { detectPaymentRequest } from "./text-signals";

/**
 * The AI writes only the "what to check next" list.
 *
 * The offer text is written by a possible scammer, so none of it goes into the
 * prompt: only our fixed signal names and their built-in explanations. The model's
 * answer is still treated as untrusted. Any step that asks the user to pay, or that
 * carries a link, email address or phone number, is dropped.
 */

export const DEFAULT_NEXT_STEPS = [
  "Find the company's official website yourself and confirm the job is listed on its careers page.",
  "Don't pay any fee, deposit or purchase amount to get or keep a job offer.",
  "Ask for a formal interview and an offer letter from the company's own email domain.",
];

export function nextStepsPrompt(signalKeys: string[]): string {
  const findings = signalKeys.map((key) => `- ${key.replace(/_/g, " ")}: ${WHY[key] ?? ""}`.trim()).join("\n");
  return `You help job seekers in India check whether a job or internship offer is a scam. These red flags were found in an offer:\n${findings}\n\nWrite a 3-5 item checklist of specific things the person should verify or do next, based on these findings. Plain language, one sentence each. Never tell them to pay, send money or contact anyone through a link, email or phone number. No legal claims, and don't say the company is definitely real or fake. Return JSON: { "nextSteps": [string] }`;
}

const CONTACT_OR_LINK = /(?:https?:\/\/|www\.|\b[\w.+-]+@[\w-]+\.[\w.]+\b|\+?\d[\d\s-]{8,}\d)/i;

export function isSafeStep(step: string): boolean {
  return step.length > 0 && step.length <= 300 && !detectPaymentRequest(step) && !CONTACT_OR_LINK.test(step);
}

export function parseNextSteps(raw: string): string[] {
  for (const candidate of [raw, raw.match(/\{[\s\S]*\}/)?.[0] ?? ""]) {
    try {
      const parsed = JSON.parse(candidate) as { nextSteps?: unknown };
      if (!Array.isArray(parsed.nextSteps)) continue;
      const steps = parsed.nextSteps.map((x) => String(x).trim()).filter(isSafeStep).slice(0, 5);
      // A list trimmed down to almost nothing is less useful than the defaults.
      return steps.length >= 2 ? steps : DEFAULT_NEXT_STEPS;
    } catch {
      // try the next candidate
    }
  }
  return DEFAULT_NEXT_STEPS;
}
